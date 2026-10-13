# reports-and-closing-history - Design Document

## Overview

Este documento especifica a arquitetura e o design técnico para a reformulação da área de **Relatórios de Vendas e Inteligência Financeira** (`Reports.jsx`) e a **Persistência do Histórico de Fechamentos de Caixa**.

O design aborda 4 objetivos centrais:
1. **Gráfico de Barras Cronológico Diário**: Evolução das vendas dia a dia no período selecionado, sem fragmentação de categorias.
2. **Gráfico Donut de Categorias Resiliente com Snapshot Histórico**: Cada item vendido armazena e preserva o nome da sua categoria no momento da venda, garantindo que a exclusão posterior de categorias no cardápio nunca quebre nem adultere os relatórios históricos.
3. **Módulo de Horários de Pico (Peak Hours)**: Agrupamento de pedidos por hora do dia (00h às 23h BRT) para identificar com precisão o horário nobre de vendas e dimensionar cozinha e entregadores.
4. **Histórico Persistido de Fechamentos de Caixa**: Gravação dos fechamentos de turno na tabela `shift_closings` com `tenant_id` e visualização histórica no painel para reabertura, reimpressão térmica (80mm/58mm) e compartilhamento via WhatsApp.

---

## Architecture

A arquitetura segue o padrão **Clean Architecture & Zero-Trust Multi-Tenant**:

```
+---------------------------------------------------------------------------------+
|                                 ReportsPage.jsx                                 |
|                                                                                 |
|  [Filtro de Período: Hoje | 7 Dias | 30 Dias | Este Mês | Este Ano | Custom]     |
|                                                                                 |
|  +---------------------------+  +--------------------------------------------+  |
|  | Tab 1: 📊 Vendas & Análise |  | Tab 2: 🧾 Histórico de Fechamentos de Caixa |  |
|  +---------------------------+  +--------------------------------------------+  |
|               |                                                |                |
|  - 4 KPI Cards (Receita, Pedidos, Ticket, Perdido)             |                |
|  - Gráfico Barras: Vendas Dia a Dia (Recharts)                 |                |
|  - Gráfico Donut: Distribuição por Categoria (Snapshot)        |                |
|  - Gráfico Barras: Horários de Pico (00h-23h BRT)              |                |
|  - Tabela: Detalhamento por Categoria com Snapshot            |                |
|                                                                |                |
|                                                 - Tabela de Fechamentos Salvos  |
|                                                 - Ações: Ver, Reimprimir, Whats |
+---------------------------------------------------------------------------------+
                                      |
       +------------------------------+------------------------------+
       |                                                             |
+---------------------------+                         +---------------------------+
|   Order Analytics Engine  |                         |  ShiftClosing Entity &    |
| (Agregação Diária, Horas) |                         |  ShiftClosingModal        |
+---------------------------+                         +---------------------------+
       |                                                             |
       +------------------------------+------------------------------+
                                      |
                     +---------------------------------+
                     |   Supabase / Storage Fallback   |
                     |   orders, shift_closings        |
                     +---------------------------------+
```

---

## Components and Interfaces

### 1. `src/pages/Reports.jsx`
- Componente principal com abas de navegação:
  - `activeTab === "sales"`: Exibe KPIs, Gráfico Diário de Vendas, Gráfico Donut de Categorias com snapshot, Gráfico de Horários de Pico e Tabela de Categorias.
  - `activeTab === "history"`: Exibe o histórico de fechamentos de caixa salvos no período selecionado.
- Integração com `ShiftClosingModal`: Permite abrir o modal de fechamento a qualquer momento e salva o fechamento ativo.

### 2. `src/utils/reportsAnalytics.js` (Novo Módulo Puro)
Motor desacoplado de agregação com funções puras e testáveis:
- `aggregateDailySales(orders, startDate, endDate)`: Agrupa vendas por data civil em Brasília (`YYYY-MM-DD`), retornando `[{ date: '12/10', fullDate: '2026-10-12', revenue: 450.00, ordersCount: 15, avgTicket: 30.00 }]`.
- `aggregateCategoryDistribution(orders, categoriesList, productsList)`: Resolve o nome da categoria com a seguinte precedência de snapshot:
  1. `item.category_name` (snapshot direto salvo no pedido)
  2. `product.category` ou `category.name` via catálogo
  3. `item.category` (string legada)
  4. `'Geral'` (fallback amigável, nunca `null` ou `undefined`)
- `aggregatePeakHours(orders)`: Agrupa por hora do dia (0 a 23), calculando pedidos e faturamento de cada faixa horária, e destacando o índice de maior movimento (`peakHourInfo`).

### 3. `src/components/admin/reports/DailySalesChart.jsx`
- Gráfico de barras com Recharts exibindo a barra de faturamento e linha/tooltips de quantidade de pedidos e ticket médio.
- Cores dinâmicas e gradiente sóbrio.

### 4. `src/components/admin/reports/PeakHoursChart.jsx`
- Gráfico de barras verticais das 00h às 23h (ou janela de expediente).
- Destaque visual na coluna de pico (cor âmbar/fogo).
- Card no topo com resumo: *"🔥 Horário Nobre: 20h às 21h (42 pedidos • R$ 1.680,00)"*.

### 5. `src/components/admin/reports/ShiftClosingHistoryTable.jsx`
- Tabela com lista dos fechamentos salvos no banco.
- Colunas: Data do Caixa, Turno/Horário, Operador, Faturamento Bruto, Faturamento Líquido, Saldo em Dinheiro, Entregadores, Ações.
- Ações por linha:
  - **👁️ Visualizar**: Reabre o `ShiftClosingModal` em modo somente-leitura com os dados idênticos ao momento do fechamento.
  - **🖨️ Reimprimir**: Dispara a via de impressão térmica não fiscal (80mm/58mm) via `sessionStorage` e `PrintShiftClosing`.
  - **📱 WhatsApp**: Copia o texto formatado para envio direto ao WhatsApp do proprietário.

### 6. Atualização em `OrderModal.jsx` e `PDV.jsx` (Snapshot de Categoria)
Ao submeter qualquer pedido:
```javascript
items: cart.map(item => ({
  product_id: item.id,
  product_name: item.name,
  product_price: item.price,
  category_name: item.category_name || item.category || resolvedCategoryName || 'Geral',
  quantity: item.quantity,
  subtotal: calculateItemSubtotal(item),
  additionals: item.additionals || [],
}))
```

---

## Data Models

### 1. Tabela Supabase: `public.shift_closings`
```sql
CREATE TABLE IF NOT EXISTS public.shift_closings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    shift_date DATE NOT NULL,
    period_mode TEXT NOT NULL DEFAULT 'today',
    period_label TEXT NOT NULL,
    opened_at TIMESTAMPTZ,
    closed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    cashier_name TEXT NOT NULL DEFAULT 'Operador',
    gross_revenue NUMERIC(10,2) NOT NULL DEFAULT 0,
    net_revenue NUMERIC(10,2) NOT NULL DEFAULT 0,
    total_orders INT NOT NULL DEFAULT 0,
    delivery_orders INT NOT NULL DEFAULT 0,
    counter_orders INT NOT NULL DEFAULT 0,
    dine_in_orders INT NOT NULL DEFAULT 0,
    average_ticket NUMERIC(10,2) NOT NULL DEFAULT 0,
    payment_breakdown JSONB NOT NULL DEFAULT '{}'::jsonb,
    cash_drawer JSONB NOT NULL DEFAULT '{}'::jsonb,
    driver_settlements JSONB NOT NULL DEFAULT '[]'::jsonb,
    raw_closing_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shift_closings_tenant_date ON public.shift_closings (tenant_id, shift_date DESC);
```

### 2. Entidade JavaScript: `ShiftClosing` (`src/entities/ShiftClosing.js`)
- Mapeada no `storage.js` para suportar inserção, listagem por data e busca por `tenant_id`, com fallback em `localStorage` (`vrumburguer_db_shift_closings`) se a tabela ainda estiver sendo sincronizada.

---

## Error Handling

1. **Categorias Excluídas**:
   - O agregador de categorias nunca assume que `product.category_id` existe na tabela `categories`.
   - Prioridade de resolução de nome: `item.category_name` (snapshot) > `product.category` > `category.name` > `'Geral'`.
   - Se o nome original for identificado (ex: *"Pizzas Doces"*), ele permanece exibido no Donut e na tabela mesmo que a categoria não exista mais no cardápio.
2. **Dias Sem Movimento**:
   - O gráfico diário preenche dias com zero vendas (ou exibe apenas dias com pedidos conforme a preferência do usuário), evitando arrays vazios no Recharts.
3. **Idempotência no Salvamento de Fechamento**:
   - O sistema detecta se um fechamento para o mesmo turno/período já foi salvo hoje, permitindo sobrescrever/atualizar ou emitir aviso antes de duplicar.
4. **Resiliência Offline / Supabase**:
   - Se a conexão falhar ao buscar dados, o fallback lê os pedidos locais do `localStorage` e exibe os gráficos normalmente.

---

## Testing Strategy

1. **Testes Unitários de Agregação (`reportsAnalytics.test.js`)**:
   - Agrupamento diário de faturamento com fusos de Brasília.
   - Preservação de nomes de categorias com snapshot vs produtos com categoria deletada.
   - Cálculo de horários de pico (0h a 23h) e identificação do pico.
2. **Teste de Persistência do Fechamento**:
   - Criar fechamento via modal, verificar gravação em `shift_closings` com `tenant_id` correto.
   - Carregar no `ShiftClosingHistoryTable` e verificar integridade de reimpressão.
3. **Validação de Build**:
   - Executar `npm run build` garantindo zero erros de tipagem, compilação ou importação.
