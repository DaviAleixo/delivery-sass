# 🖥️ Módulos do Sistema Delivery

> **Links**: [[00 - 🏠 Inicio]] | [[01 - 🗺️ Roadmap & Backlog]] | [[03 - 🚀 Especificacao SaaS]]

---

## 1. Cardápio Público (`/:slug` ou `/:slug/menu`)
* **Acesso**: Público, sem necessidade de login.
* **Header & Banners**: Logo do restaurante, status aberto/fechado em tempo real e carrossel de fotos promocionais.
* **Categorias Horizontais**: Filtro de produtos por categoria com rolagem fluida.
* **Modal de Produto**: Seleção de opcionais/adicionais obrigatórios e extras pagos, campo de observações e seletor de quantidade.
* **Carrinho Lateral**: Resumo de itens, cálculo de subtotal, taxa de entrega e botão de checkout.
* **Modal de Checkout**:
  * Escolha entre **Entrega** (endereço completo) ou **Retirada**.
  * Formas de pagamento: Dinheiro (com cálculo de troco), PIX ou Cartão no local.
  * Validação de cupom de desconto e valor mínimo.

---

## 2. Painel Administrativo do Restaurante (`/:slug/admin` ou `/:slug/dashboard`)
* **Dashboard**: Faturamento do dia/mês, ticket médio e quantidade de pedidos.
* **KDS / Gestão de Pedidos**: Lista de pedidos em tempo real com colunas de status (Pendente, Em Preparo, Pronto para Entrega, Finalizado).
* **Gestão de Produtos**: Cadastro de lanches/itens, preços, fotos e vinculação de grupos de complementos.
* **Configurações**: Horários de funcionamento semanal, taxa de entrega, tempo estimado e dados da loja.

---

## 3. Painel Master SuperAdmin (`/SuperAdmin`)
* **Acesso Restrito**: Usuário `davi`
* **Visão Macro**: Total de lojas ativas, faturamento da rede e MRR (Receita Recorrente Mensal).
* **Gestão de Lojas**: Criar nova loja em 1 clique (com onboarding zerado) e pausar/reativar lojas.
* **Impersonation**: Entrar no painel de qualquer loja com um clique.
