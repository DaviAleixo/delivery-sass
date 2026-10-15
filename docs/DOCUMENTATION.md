# 🚀 PEDEMULEKE — Documentação Completa da Plataforma SaaS
 
**Plataforma SaaS de pedidos online para restaurantes e estabelecimentos** com cardápio digital para clientes e sistema interno de administração + PDV (Ponto de Venda) para gestão de pedidos.
 
---
 
## 1. Visão Geral
 
O PedeMuleke é dividido em duas frentes:

| Frente                 | Descrição                                                                    | Acesso                                  |
| ---------------------- | ---------------------------------------------------------------------------- | --------------------------------------- |
| **Cardápio (Menu)**    | Site público onde clientes navegam, montam carrinho e fazem pedidos          | Público — **sem login obrigatório**     |
| **Painel Admin + PDV** | Área interna para gestão de produtos, pedidos, relatórios e vendas no balcão | Protegido por login admin (`AdminUser`) |

**Tecnologias:** React + Vite, Tailwind CSS, Supabase (PostgreSQL, Realtime, Auth, Storage).

---

## 2. Módulos do Sistema

### 2.1 Cardápio Público (`/` ou `/Menu`)

- **Configurações dinâmicas**: Nome, logo e informações do restaurante vindos do banco de dados (`settings`).
- **Carrossel de banners**: Exibe apenas banners ativos (`banner_images`), ordenados por `order_index`, com rotação automática a cada 5 segundos e navegação manual.
- **Status da loja (aberto/fechado)**: Calculado a partir do checklist semanal de horários das Configurações (`open_days`). Se o dia/hora atual está fora do horário configurado, a loja aparece como **fechada**: os cards de produto ficam visíveis porém com opacidade reduzida e cliques desabilitados, bloqueando novas adições ao carrinho.
- **Categorias**: Listadas em navegação horizontal com rolagem suave, filtrando produtos por categoria e `order_index`.
- **Card de produto**: Nome, descrição, preço e imagem. Clique abre o detalhe do produto.
- **Detalhe do produto (modal)**: Descrição completa, seleção de **adicionais** (com preço e limite de quantidade por adicional; adicionais obrigatórios exigem escolha), definição de quantidade e observações.
- **Carrinho (drawer lateral)**: Lista itens com controles de `+` / `−` quantidade, remoção de item, cálculo de subtotal, taxa de entrega e total. Botão flutuante exibe o resumo com badge de quantidade.
- **Finalização do pedido (modal de checkout)**:
  - Aba **Entrega (delivery)**: Exige nome, telefone e endereço (CEP, rua, número, complemento, bairro, cidade, UF). Clientes **logados** podem salvar e carregar endereços salvos; **sem login**, o endereço é digitado a cada pedido.
  - Aba **Retirada (pickup)**: Exige nome e telefone (ou mesa para consumo no local).
  - **Forma de pagamento**: Dinheiro, PIX ou Cartão. Se dinheiro, campo para troco.
  - **Cupom de desconto**: Disponível para usuários logados. Valida código, data de validade, valor mínimo do pedido, limite de uso por cliente e se o cupom aplica ao total ou a produtos específicos.
  - Aplica **valor mínimo de pedido** e **taxa de entrega** das Configurações.
  - Ao confirmar, o pedido é criado com status `pendente` e horário de envio, e o carrinho é limpo.

### 2.2 Meus Pedidos (`/MyOrders`)

- Disponível para clientes autenticados.
- Lista o histórico de pedidos do usuário (filtrado pelo email), com status em tempo real, itens e valores.

### 2.3 Login do Admin (`/AdminLogin`)

- Autenticação interna do restaurante via entidade **AdminUser** (usuário/senha próprios, independente do login de clientes).
- Sucesso define flag de sessão (`admin_auth`) no navegador; todas as páginas internas do painel administrativo redirecionam para cá se não houver sessão ativa.
- Clientes sem sessão admin continuam acessando o cardápio normalmente.

---

## 2.4 Painel Administrativo (`/admin/*`)

### 2.4.1 Dashboard (`/Dashboard`)

- Visão geral do negócio: faturamento total, ticket médio, total de pedidos, divisão por status e indicadores em tempo real.

### 2.4.2 Gestão de Pedidos (`/Orders`)

- **Atualização em tempo real** com Supabase Realtime + polling a cada 10 segundos.
- **Abas por status**: Todos, Pendentes, Confirmados, Preparando, Enviados, Entregues, Cancelados com contadores.
- **Card de pedido expansível**: Dados do cliente, telefone (com atalho WhatsApp), endereço, itens com adicionais, cupom, taxa de entrega, total e forma de pagamento.
- **Transição de status**: Ações rápidas de alteração de status e cancelamento.
- **Impressão**: Botão para gerar cupom térmico para cozinha e entregador.

### 2.4.3 Clientes (`/Clients`)

- Agregação de dados: total de pedidos, LTV (valor total gasto), última compra e dados de contato.
- Busca em tempo real por nome, email ou telefone.
- Ação de abrir conversa direta no **WhatsApp** com o cliente.

### 2.4.4 Produtos (`/Products`)

- CRUD completo: Nome, descrição, preço, categoria, imagem e disponibilidade.
- **Gestor de adicionais**: Criação e remoção de complementos por produto.

### 2.4.5 Categorias (`/Categories`)

- CRUD de categorias com ordenação (`order_index`).

### 2.4.6 Cupons (`/Coupons`)

- CRUD de cupons com regras avançadas:
  - Desconto percentual ou valor fixo.
  - Aplicação no total ou em produtos específicos.
  - Pedido mínimo, limite de uso e validade (início e fim).

### 2.4.7 Banners (`/Banners`)

- Gestão do carrossel da home com upload de imagem e ordem de exibição.

### 2.4.8 Relatórios (`/Reports`)

- Faturamento por período, distribuição por forma de pagamento e tipo de pedido (Delivery vs PDV Balcão).

### 2.4.9 Configurações (`/Settings`)

- Dados do restaurante (nome, logo, contato, redes sociais).
- Taxas e valores mínimos.
- **Checklist semanal de funcionamento**: Horário de abertura e fechamento configuráveis individualmente para cada dia da semana (Domingo a Sábado).

### 2.4.10 PDV Balcão (`/PDV`)

- Ponto de venda para atendimento presencial rápido.
- Toque ágil com **bip sonoro** via Web Audio API.
- Modal de pagamento com **cálculo automático de troco** e confirmação via tecla **Enter**.
- Impressão instantânea de cupom.

---

## 3. Estrutura do Banco de Dados (PostgreSQL / Supabase)

| Tabela                   | Descrição                                 |
| ------------------------ | ----------------------------------------- |
| `users`                  | Clientes autenticados na plataforma       |
| `settings`               | Configurações gerais e horários semanais  |
| `admin_users`            | Usuários com acesso ao painel admin / PDV |
| `categories`             | Categorias do cardápio                    |
| `products`               | Produtos e pratos                         |
| `product_additionals`    | Adicionais e complementos por produto     |
| `banner_images`          | Banners do carrossel inicial              |
| `coupons`                | Cupons e regras de desconto               |
| `coupon_usages`          | Histórico de uso de cupons                |
| `orders`                 | Pedidos (Delivery, Retirada e PDV Balcão) |
| `order_items`            | Itens de cada pedido                      |
| `order_item_additionals` | Adicionais de cada item                   |
| `user_addresses`         | Endereços salvos por clientes             |

O script SQL unificado e pronto para execução encontra-se em `supabase/schema.sql`.
