# reports-and-closing-history - Task List

## Implementation Tasks

- [x] 1. **Snapshot de Categoria nos Pedidos**
    - [x] 1.1. Inclusão de `category_name` no `OrderModal.jsx`
        - *Goal*: Garantir que o nome da categoria seja gravado diretamente em cada item do pedido no momento da compra online
        - *Details*: Mapear `category_name` a partir do produto selecionado no carrinho ou mapa de categorias
        - *Requirements*: Requisito 2
    - [x] 1.2. Inclusão de `category_name` no `PDV.jsx`
        - *Goal*: Garantir que vendas lançadas no PDV Balcão também gravem o nome da categoria no snapshot dos itens
        - *Details*: Mapear categoria ativa no momento da inclusão do item no carrinho do PDV
        - *Requirements*: Requisito 2
    - [x] 1.3. Ajuste de Sanitização e Schema em `sanitizers.js` e `orderSchema.js`
        - *Goal*: Aceitar `category_name` como campo opcional válido no array de itens dos pedidos
        - *Details*: Permitir preservação da propriedade durante sanitização
        - *Requirements*: Requisito 2

- [x] 2. **Motor de Análise Pura (`src/utils/reportsAnalytics.js`)**
    - [x] 2.1. Implementação de `aggregateDailySales`
        - *Goal*: Agrupar vendas cronologicamente dia a dia no período selecionado (Fuso Brasília `America/Sao_Paulo`)
        - *Details*: Calcular faturamento bruto, contagem de pedidos entregues/confirmados e ticket médio por dia
        - *Requirements*: Requisito 1
    - [x] 2.2. Implementação de `aggregateCategoryDistribution` com Resolução Histórica
        - *Goal*: Agrupar faturamento por categoria preservando o nome original mesmo se a categoria for excluída
        - *Details*: Resolução em cascata: `item.category_name` > `product.category` > `category.name` > `'Geral'` (zero crash)
        - *Requirements*: Requisito 2
    - [x] 2.3. Implementação de `aggregatePeakHours`
        - *Goal*: Mapear a distribuição de pedidos por hora do dia (00h às 23h BRT) e identificar o horário de pico
        - *Details*: Identificar a faixa horária de maior volume de pedidos e receita gerada
        - *Requirements*: Requisito 3

- [x] 3. **Persistência de Fechamento de Caixa (`shift_closings`)**
    - [x] 3.1. Criação da Tabela `shift_closings` no Supabase
        - *Goal*: Criar a tabela no Supabase com isolamento multi-tenant por `tenant_id` e RLS configurado
        - *Details*: Executar migration SQL com colunas estruturadas para auditoria financeira do caixa
        - *Requirements*: Requisito 4
    - [x] 3.2. Criação da Entidade `ShiftClosing` em `src/entities/ShiftClosing.js` e `storage.js`
        - *Goal*: Permitir CRUD de fechamentos de caixa com fallback local para `localStorage`
        - *Details*: Registrar projeção em `TABLE_COLUMNS` e instanciar `createStorage("shift_closings")`
        - *Requirements*: Requisito 4
    - [x] 3.3. Botão "Salvar Fechamento" em `ShiftClosingModal.jsx`
        - *Goal*: Permitir ao lojista salvar o fechamento do dia/turno diretamente do modal
        - *Details*: Salvar snapshot completo em `shift_closings`, toast de sucesso e atualização de estado
        - *Requirements*: Requisito 4

- [ ] 4. **Componentes Visuais de Relatório**
    - [x] 4.1. Criação do Componente `DailySalesChart.jsx`
        - *Goal*: Gráfico de barras Recharts com faturamento e volume diário ao longo do período
        - *Details*: Formatação monetária em R$, eixos limpos, tooltips informativas com ticket médio
        - *Requirements*: Requisito 1
    - [x] 4.2. Criação do Componente `PeakHoursChart.jsx`
        - *Goal*: Gráfico de barras por hora do dia (00h às 23h) com card de destaque do horário nobre
        - *Details*: Destacar visualmente a barra de pico (âmbar/fogo) e badge com total de pedidos
        - *Requirements*: Requisito 3
    - [x] 4.3. Criação do Componente `ShiftClosingHistoryTable.jsx`
        - *Goal*: Listar fechamentos salvos com ações de visualizar, reimprimir e reenviar no WhatsApp
        - *Details*: Tabela responsiva com badges de status, valores e menu de ações rápidas
        - *Requirements*: Requisito 4

- [ ] 5. **Reformulação da Página de Relatórios (`src/pages/Reports.jsx`)**
    - [x] 5.1. Implementação de Abas (`📊 Vendas & Análise` e `🧾 Histórico de Fechamentos`)
        - *Goal*: Organizar a navegação entre a visão geral analítica e o livro-caixa de fechamentos
        - *Details*: Header com abas elegantes e contador de fechamentos
        - *Requirements*: Requisitos 1, 3, 4
    - [x] 5.2. Substituição dos Gráficos Antigos pelos Novos Módulos
        - *Goal*: Eliminar duplicação de categoria e apresentar Gráfico Diário, Donut de Categorias e Horários de Pico
        - *Details*: Layout em grid responsivo com cartões informativos
        - *Requirements*: Requisitos 1, 2, 3
    - [x] 5.3. Integração com Carregamento de Fechamentos Salvos
        - *Goal*: Carregar histórico de fechamentos da loja ativa e sincronizar em tempo real
        - *Details*: Buscar registros filtrados pelo `tenant_id` e período
        - *Requirements*: Requisito 4

- [ ] 6. **Validação, Testes e Sincronização**
    - [x] 6.1. Validação de Build (`npm run build`)
        - *Goal*: Garantir zero erros de compilação, sintaxe ou empacotamento no Vite
        - *Details*: Executar build de produção local
        - *Requirements*: Requisitos não-funcionais
    - [x] 6.2. Sincronização com Obsidian e Git
        - *Goal*: Atualizar `01 - 🗺️ Roadmap & Backlog.md` e `02 - 💡 Ideias & Brainstorm.md` e commitar no GitHub
        - *Details*: Manter documentação viva alinhada com as diretrizes do projeto
        - *Requirements*: Regras de projeto

---

## Task Dependencies

- Tarefa 1 (Snapshot) e Tarefa 2 (Motor de Análise) podem ser desenvolvidas em paralelo.
- Tarefa 3 (Persistência) é necessária para alimentar a Tarefa 4.3 (Tabela de Histórico).
- Tarefa 5 (Página Reports) integra os componentes das Tarefas 2, 3 e 4.
- Tarefa 6 (Validação e Git) deve ser executada após a conclusão das tarefas anteriores.

---

## Estimated Timeline

- Tarefa 1 (Snapshot de Categoria): 1 hora
- Tarefa 2 (Motor de Análise): 2 horas
- Tarefa 3 (Persistência de Fechamento): 2 horas
- Tarefa 4 (Componentes Visuais): 2 horas
- Tarefa 5 (Página de Relatórios): 2 horas
- Tarefa 6 (Validação e Sincronização): 1 hora
- **Total: ~10 horas de engenharia**
