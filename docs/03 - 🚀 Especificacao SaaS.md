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

## 2. Estrutura Oficial de Planos (3 Planos)

| Recurso / Benefício          | 1. Plano Vitrine / Salão                         | 2. Plano Normal (Delivery Completo)             | 3. Plano Personalizado (VIP)                             |
| :--------------------------- | :----------------------------------------------- | :---------------------------------------------- | :------------------------------------------------------- |
| **Mensalidade Fixa**         | **R$ 49,00 / mês**                               | **R$ 89,00 / mês**                              | **R$ 249,00 / mês**                                      |
| **Foco de Atendimento**      | QR Code de Mesa & Salão (Visual ou Autoatend.)   | Delivery na Rua, KDS, PDV Balcão e Entregadores | Identidade Visual & Front-End 100% Exclusivo             |
| **Interface do Cardápio**    | Padrão (Sem carrinho no modo visual; ou mesa)    | Layout padrão de alta conversão para delivery   | **Front-End sob medida** (design e animações exclusivas) |
| **Painel do Lojista**        | Limpo (apenas Produtos, Banners e QR Codes)      | Completo (Pedidos, KDS, Entregadores, PDV)      | Completo + Seletor de Template VIP                       |
| **Escolha em Configurações** | Lojista escolhe se quer apenas visual ou pedidos | Salão, Retirada no Balcão e Delivery            | Salão, Retirada e Delivery                               |
| **Comissão por Pedido**      | **R$ 0,00 (ZERO taxa)**                          | **R$ 0,00 (ZERO taxa)**                         | **R$ 0,00 (ZERO taxa)**                                  |

---

## 3. Credenciais de Demonstração & Acessos

| Perfil                        | Usuário              | Senha Inicial        | Destino após Login | O que enxerga                                                  |
| :---------------------------- | :------------------- | :------------------- | :----------------- | :------------------------------------------------------------- |
| **👑 Super Admin (Davi)**     | `davi`               | `davi123`            | `/SuperAdmin`      | Todas as empresas, faturamento MRR, criar lojas, pausar lojas  |
| **🍔 Vruum Burguer (Piloto)** | `vrumm`              | `vrumm123`           | `/vrumm/Dashboard` | Somente a operação da Vruum Burguer (pedidos, lanches, vendas) |
| **✨ Novas Lojas Criadas**     | Definido no cadastro | Definida no cadastro | `/:slug/Dashboard` | **100% Zerada**: loja limpa para cadastro inicial              |

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
