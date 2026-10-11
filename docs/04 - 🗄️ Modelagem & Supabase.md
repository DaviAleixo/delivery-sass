# 🗄️ Modelagem de Dados & Otimizações Supabase

> **Links**: [[00 - 🏠 Inicio]] | [[01 - 🗺️ Roadmap & Backlog]] | [[03 - 🚀 Especificacao SaaS]]

---

## 1. Arquitetura Multi-Tenant
Todas as tabelas do sistema possuem a chave estrangeira `tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE`.

### Tabela Mestre: `tenants`
Armazena a configuração de cada restaurante:
* `id` (UUID PK)
* `slug` (ex: `vrumm`, `pizzaria-do-ze`)
* `name` (Nome fantasia)
* `plan` (`basic` ou `premium`)
* `theme_config` (JSON com cores primárias/secundárias)
* `open_days` (JSON com horários de funcionamento por dia da semana)
* `delivery_fee`, `min_order_value`, `delivery_time`

---

## 2. Tabelas Subordinadas
* `admin_users`: Usuários e senhas administrativos de cada restaurante
* `categories`: Categorias do cardápio ordenadas por `order_index`
* `products`: Produtos com preço, foto, descrição e ativação
* `complement_groups` e `complement_items`: Grupos de adicionais (ex: "Escolha o Pão", "Adicionais Pagos")
* `orders` e `order_items`: Pedidos, endereço, itens e status
* `banner_images`: Banners rotativos do topo do cardápio
* `coupons`: Cupons de desconto por valor ou percentual

---

## 3. RPCs (Funções SQL Otimizadas)
Para garantir máxima velocidade e menor custo de infraestrutura no Supabase:
* `verify_admin_login(p_username, p_password, p_tenant_slug)`: Valida login admin retornando permissões e dados do tenant.
* `get_sales_metrics(p_tenant_id, p_start_date, p_end_date)`: Total faturado, ticket médio e pedidos por período em 1 única chamada SQL agregada.
* `get_master_tenants()`: Lista todas as lojas para o Painel do SuperAdmin Davi.
* `create_new_tenant(p_slug, p_name, ...)`: Cria uma loja zerada com tenant e admin inicial.
