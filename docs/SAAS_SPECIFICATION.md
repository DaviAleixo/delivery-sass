# 🚀 SAAS DELIVERY & CARDÁPIO DIGITAL — ESPECIFICAÇÃO TÉCNICA E DE NEGÓCIOS

> **Documento Vivo de Arquitetura**: Atualizado continuamente conforme alinhamentos e evolução do projeto.  
> **Status Atual**: Fase 1 — Modelagem Multi-Tenant e Lógicas no Supabase (Frontend + Supabase First).  
> **Data de Criação**: 2026-10-10  

---

## 1. Visão Geral e Proposta de Valor

Plataforma SaaS multi-tenant de cardápio digital, delivery e PDV para restaurantes locais (hamburguerias, pizzarias, sushis, lanchonetes).

### 🎯 O Grande Diferencial Competitivo (Pitch Comercial)
* **ZERO taxa por pedido**: Enquanto o iFood cobra entre **12% e 27%** do faturamento bruto do restaurante, nosso SaaS cobra apenas uma **assinatura mensal fixa**.
* **Retenção de Clientes Fiéis**: O restaurante direciona seus clientes do Instagram, WhatsApp e balcão para seu próprio canal direto, mantendo 100% da margem das vendas.
* **Operação 100% no Painel (Sem dependência de WhatsApp)**: Os pedidos não dependem de envio manual de mensagem de WhatsApp; caem direto no **Painel Administrativo / KDS em tempo real** do restaurante com alerta sonoro e gestão Kanban.

---

## 2. Estrutura de Planos e Monetização

| Recurso / Benefício | Plano Comum (Standard) | Plano Premium (Custom / White-Label) |
| :--- | :--- | :--- |
| **Acesso ao Cardápio** | URL padrão: `app.seusaas.com/:slug` | Subdomínio ou **Domínio Próprio** (`pedir.marca.com.br`) |
| **Interface do Cardápio** | Layout genérico otimizado (rápido, limpo) | **Frontend Personalizado** (layout e UX exclusivos) |
| **Customização de Marca** | Logo, Banner, Nome, Contatos, Horários | Identidade visual 100% sob medida + Assets exclusivos |
| **Cardápio & Produtos** | Categorias, Produtos, Grupos de Complementos | Categorias, Produtos, Grupos de Complementos |
| **Painel de Pedidos (KDS)** | Sim (Tempo Real + Alerta Sonoro + Kanban) | Sim (Tempo Real + Alerta Sonoro + Kanban) |
| **PDV Balcão & Relatórios** | Sim (Dashboard de Vendas e Clientes) | Sim (Dashboard Avançado e Métricas) |
| **Base de Dados** | Compartilhada (`tenant_id` isolado no Supabase) | Mesma base de dados (`tenant_id` isolado) |
| **Comissão por Pedido** | **R$ 0,00 (ZERO taxa)** | **R$ 0,00 (ZERO taxa)** |

---

## 3. Estratégia de Desenvolvimento e Arquitetura

### Fase 1: Supabase First (Validação e Escala Rápida)
* **Objetivo**: Fazer 100% do sistema rodar com performance máxima usando **PostgreSQL + Supabase + React/Vite**, sem introduzir a complexidade de backend separado agora.
* **Tudo no Banco**:
  - Modelagem Multi-Tenant via `tenant_id` em todas as tabelas.
  - Funções SQL (RPCs) para relatórios, fechamento de pedidos e autenticação administrativa por restaurante.
  - Row Level Security (RLS) garantindo que nenhum lojista veja dados de outro.
  - Supabase Realtime escutando apenas os eventos do `tenant_id` logado.
  - Armazenamento de fotos no Supabase Storage organizado por pasta de cada inquilino (`/tenants/:tenant_id/...`).

### Fase 2: Backend Java (Spring Boot 3 + Java 21) — Futuro
* **Objetivo**: Centralizar regras de negócio pesadas, integrações externas (gateways de pagamento, emissão fiscal, filas de impressão térmica) e otimização agressiva de conexões e cache para baratear ainda mais o custo de escala do Supabase.
* **Como será acoplado**: O Spring Boot conectará no mesmo banco PostgreSQL do Supabase através do connection pooler (HikariCP -> PgBouncer na porta 6543), mantendo o frontend e o modelo de dados existentes intactos.

---

## 4. Fluxo Operacional de Pedidos (Painel Centralizado)

```
[Cliente Final] 
       │ Acessa cardápio (/:slug)
       │ Monta carrinho (adicionais, observações)
       │ Preenche entrega/retirada e forma de pagamento
       ▼
[Supabase: INSERT INTO orders (tenant_id, ...)]
       │
       ▼ (Evento Realtime: INSERT filtrado por tenant_id)
[Painel Admin do Restaurante]
       ├── Toca alerta sonoro contínuo 🔔
       ├── Notificação visual no topo da tela
       ├── Card surge na coluna "Pendente" do Kanban
       └── Operador aceita: Status muda para "Confirmado" -> "Em Preparo" -> "Enviado" -> "Entregue"
```

* O cliente acompanha a evolução do pedido na tela do cardápio em tempo real.
* O lojista pode imprimir a comanda diretamente pelo navegador (botão de impressão formatado para impressora térmica 58mm/80mm).

---

## 5. Modelagem de Dados Multi-Tenant (Supabase)

Para transformar a base existente (`20261010_complete_vruum_burguer.sql`) em SaaS, todas as entidades são subordinadas à tabela mestre `tenants`:

### Tabela Mestre: `tenants`
```sql
CREATE TABLE public.tenants (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug                 TEXT NOT NULL UNIQUE,          -- ex: 'vruum-burguer', 'ze-pizzaria'
    name                 TEXT NOT NULL,                 -- Nome fantasia
    plan                 TEXT NOT NULL DEFAULT 'basic', -- 'basic' | 'premium'
    custom_domain        TEXT UNIQUE,                   -- ex: 'pedir.vruumburguer.com.br' (Premium)
    is_active            BOOLEAN NOT NULL DEFAULT TRUE, -- Bloqueio por inadimplência
    
    -- Identidade Visual
    logo_url             TEXT,
    banner_url           TEXT,
    theme_config         JSONB NOT NULL DEFAULT '{
        "primary_color": "#E11D48",
        "secondary_color": "#1F2937",
        "layout_style": "standard"
    }'::jsonb,
    
    -- Informações Operacionais
    phone                TEXT,
    whatsapp             TEXT,
    address              TEXT,
    instagram            TEXT,
    opening_time         TEXT DEFAULT '18:00',
    closing_time         TEXT DEFAULT '23:59',
    open_days            JSONB NOT NULL DEFAULT '[]'::jsonb,
    delivery_fee         NUMERIC(10,2) NOT NULL DEFAULT 5.00,
    min_order_value      NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    delivery_time        TEXT DEFAULT '40-50 min',
    manual_store_open    BOOLEAN DEFAULT NULL,
    manual_override_date TEXT DEFAULT NULL,
    
    created_date         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_date         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### Chave `tenant_id` em todas as tabelas filhas:
* `admin_users`: `tenant_id UUID REFERENCES tenants(id)` (cada admin pertence a 1 restaurante).
* `categories`: `tenant_id UUID REFERENCES tenants(id)`
* `products`: `tenant_id UUID REFERENCES tenants(id)`
* `complement_groups`: `tenant_id UUID REFERENCES tenants(id)`
* `complement_items`: `tenant_id UUID REFERENCES tenants(id)`
* `banners` / `banner_images`: `tenant_id UUID REFERENCES tenants(id)`
* `coupons`: `tenant_id UUID REFERENCES tenants(id)`
* `orders`: `tenant_id UUID REFERENCES tenants(id)`
* `order_items`: `tenant_id UUID REFERENCES tenants(id)`
* `user_addresses`: `tenant_id UUID REFERENCES tenants(id)`

---

## 6. Próximos Passos Imediatos

1. [x] Criação da Especificação Técnica Oficial (`docs/SAAS_SPECIFICATION.md`).
2. [x] Criação do script de migration multi-tenant (`supabase/migrations/20261010_saas_multitenant_core.sql`):
   - Tabela mestre `tenants` com planos (Basic / Premium) e personalização de marca.
   - Coluna `tenant_id` em todas as tabelas com cascata e integridade referencial.
   - Índices compostos de alta performance (otimizados para não onerar o Supabase).
   - RPCs multi-tenant (`verify_admin_login`, `get_sales_metrics`, `get_clients_summary`, `lookup_customer_by_phone`).
   - Seeds idempotentes da Vruum Burguer (Tenant Piloto) e Don Corleone Pizzaria (Tenant Teste).
3. [x] Aplicar/Executar a migration no Supabase: **Executado com sucesso via Supabase MCP**!
   - 16 tabelas criadas com RLS ativo.
   - 2 tenants iniciais inseridos (`vruum-burguer` e `don-corleone-pizza`).
   - RPCs testadas e validadas (`verify_admin_login` funcionando perfeitamente).
4. [x] Criação do Login Inteligente e Painel Master do Davi (`SuperAdmin`):
   - Usuário master supremo criado (`davi` / `davi123`).
   - RPCs de controle global: `get_master_tenants()`, `create_new_tenant()` e `toggle_tenant_status()`.
   - Página `/SuperAdmin` com cards de métricas (MRR, Lojas Ativas, Pedidos na Rede).
   - Tabela de gerenciamento das empresas com link para a Vruum Burguer (Primeiro Cliente!).
   - Botão "Acessar Painel" para entrar na visão de qualquer cliente (Impersonation).
   - Modal para cadastrar novo restaurante em 1 clique.
5. [x] Ajuste da resolução de tenant no Cardápio Público e Painel por Slug (`/:slug`):
   - Cardápio público acessível por `/:slug` (ex: `http://localhost:5173/vrumm` ou `/vrumm/menu`).
   - TenantContext dinâmico que detecta a loja pelo primeiro segmento da URL e busca seus dados no Supabase.
   - Categorias, produtos, banners, adicionais e pedidos filtrados dinamicamente por `tenant_id`.
   - Suporte a rotas com slug para o painel de cada restaurante (ex: `/:slug/dashboard`, `/:slug/orders`, `/:slug/admin`).
6. [ ] Escuta do Realtime isolada por `tenant_id` no painel KDS de cada loja.

---

## 7. Credenciais de Acesso Rápido para Demonstração

| Perfil | Usuário | Senha Inicial | Destino após Login | O que enxerga |
| :--- | :--- | :--- | :--- | :--- |
| **👑 Super Admin (Davi)** | `davi` | `davi123` | `/SuperAdmin` | Todas as empresas, faturamento MRR, criar lojas, pausar lojas |
| **🍔 Vruum Burguer (Piloto)** | `vrumm` | `vrumm123` | `/vrumm/Dashboard` | Somente a operação da Vruum Burguer (pedidos, lanches, vendas) |
| **✨ Novas Lojas Criadas** | Definido no cadastro | Definida no cadastro | `/:slug/Dashboard` | **100% Zerada**: sem logo, sem produtos, sem categorias, sem pedidos. Vai direto para o Dashboard. Usuário e senha visíveis em Configurações. |

> 🔑 **Regra de Onboarding Zerado**: Ao cadastrar uma nova empresa pelo Painel Master do Super Admin, a loja é criada com logo vazio, 0 produtos e 0 categorias. O sistema redireciona imediatamente para o Dashboard da nova loja. A única informação pré-configurada é o usuário administrativo e sua senha cadastrada, visíveis em **Configurações > Usuários de Acesso ao Painel**, permitindo ao cliente alterar a senha a qualquer momento.

