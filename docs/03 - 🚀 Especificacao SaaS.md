# 🚀 Especificação do SaaS Delivery & Cardápio Digital

> **Status Atual**: Fase 1 — Multi-Tenant e Supabase First  
> **Links**: [[00 - 🏠 Inicio]] | [[01 - 🗺️ Roadmap & Backlog]] | [[04 - 🗄️ Modelagem & Supabase]]

---

## 1. Visão Geral e Proposta de Valor

Plataforma SaaS multi-tenant de cardápio digital, delivery e PDV para restaurantes locais (hamburguerias, pizzarias, sushis, lanchonetes).

### 🎯 O Grande Diferencial Competitivo (Pitch Comercial)
* **ZERO taxa por pedido**: Enquanto o iFood cobra entre **12% e 27%** do faturamento bruto do restaurante, nosso SaaS cobra apenas uma **assinatura mensal fixa**.
* **Retenção de Clientes Fiéis**: O restaurante direciona seus clientes do Instagram, WhatsApp e balcão para seu próprio canal direto, mantendo 100% da margem das vendas.
* **Operação 100% no Painel (Sem dependência de WhatsApp manual)**: Os pedidos caem direto no **Painel Administrativo / KDS em tempo real** com alerta sonoro e gestão Kanban.

---

## 2. Estrutura de Planos e Monetização

| Recurso / Benefício         | Plano Comum (Standard)                          | Plano Premium (Custom / White-Label)                     |
| :-------------------------- | :---------------------------------------------- | :------------------------------------------------------- |
| **Mensalidade Sugerida**    | **R$ 89,00 a R$ 129,00 / mês**                  | **R$ 199,00 a R$ 249,00 / mês**                          |
| **Taxa de Setup (Opcional)**| R$ 150 (Cadastro completo do cardápio)          | R$ 300 (Design sob medida + Domínio configurado)         |
| **Acesso ao Cardápio**      | URL padrão: `app.seusaas.com/:slug`             | Subdomínio ou **Domínio Próprio** (`pedir.marca.com.br`) |
| **Interface do Cardápio**   | Layout genérico otimizado (rápido, limpo)       | **Frontend Personalizado** (layout e UX exclusivos)      |
| **Customização de Marca**   | Logo, Banner, Nome, Contatos, Horários          | Identidade visual 100% sob medida + Assets exclusivos    |
| **Cardápio & Produtos**     | Categorias, Produtos, Grupos de Complementos    | Categorias, Produtos, Grupos de Complementos             |
| **Painel de Pedidos (KDS)** | Sim (Tempo Real + Alerta Sonoro + Kanban)       | Sim (Tempo Real + Alerta Sonoro + Kanban)                |
| **PDV Balcão & Relatórios** | Sim (Dashboard de Vendas e Clientes)            | Sim (Dashboard Avançado e Métricas)                      |
| **Base de Dados**           | Compartilhada (`tenant_id` isolado no Supabase) | Mesma base de dados (`tenant_id` isolado)                |
| **Comissão por Pedido**     | **R$ 0,00 (ZERO taxa)**                         | **R$ 0,00 (ZERO taxa)**                                  |

---

## 3. Credenciais de Demonstração & Acessos

| Perfil | Usuário | Senha Inicial | Destino após Login | O que enxerga |
| :--- | :--- | :--- | :--- | :--- |
| **👑 Super Admin (Davi)** | `davi` | `davi123` | `/SuperAdmin` | Todas as empresas, faturamento MRR, criar lojas, pausar lojas |
| **🍔 Vruum Burguer (Piloto)** | `vrumm` | `vrumm123` | `/vrumm/Dashboard` | Somente a operação da Vruum Burguer (pedidos, lanches, vendas) |
| **✨ Novas Lojas Criadas** | Definido no cadastro | Definida no cadastro | `/:slug/Dashboard` | **100% Zerada**: loja limpa para cadastro inicial |

---

## 4. Fluxo Operacional de Pedidos
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
