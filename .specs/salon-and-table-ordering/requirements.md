# Salon, Table Ordering & Digital Showcase (Plano Vitrine & Autoatendimento) - Requirements Document

Implementação de planos e modos flexíveis de atendimento físico (Salão e Mesas com QR Code), permitindo que lojistas operem como Cardápio 100% Visual (sem carrinho/pedidos) ou como Autoatendimento na Mesa (cliente pede no celular pelo QR Code da mesa e o pedido cai no caixa com impressão térmica da comanda), eliminando completamente a complexidade de entregadores, taxas de frete por bairro e endereços.

## Core Features

- **Novo Modo de Atendimento na Tabela `tenants` (`salon_mode`)**:
  - `showcase`: Cardápio 100% Visual / Informativo (sem carrinho, sem checkout; cliente visualiza itens e pede ao garçom).
  - `table_only`: Autoatendimento exclusivo na Mesa (carrinho ativo apenas com número de mesa via QR Code, comanda impressa no caixa, sem entrega/motoboys).
  - `full`: Modo Completo (Salão + Delivery com frete + Retirada).
- **Novos Planos no SuperAdmin**:
  - `showcase`: Plano Vitrine (R$ 49,00/mês no Asaas).
  - `table`: Plano Salão & Mesas (R$ 79,00/mês no Asaas).
  - Mantidos: `basic` (R$ 89), `premium` (R$ 149) e `custom` (R$ 249).
- **Adaptação do Painel Administrativo (`Layout.jsx`)**:
  - No modo `showcase`: Oculta Pedidos, KDS, PDV, Entregadores, Clientes, Cupons e Relatórios. Mantém Produtos, Categorias, Complementos, Banners, QR Code de Mesas e Configurações.
  - No modo `table_only`: Oculta Entregadores e Clientes de rua. Mantém Pedidos (com campainha e impressão de mesa), KDS, Produtos, Categorias, Complementos, Banners, QR Code e Configurações.
- **Adaptação do Cardápio Público (`Menu.jsx`)**:
  - Se `showcase`: Oculta botão flutuante de carrinho e botões "+ Adicionar" nos cards de produtos. Exibe banner explicativo de atendimento no salão.
  - Se `table_only`: Se houver mesa identificada via QR Code (`?mesa=X`), libera carrinho exclusivo para a mesa, bloqueando campos de entrega e taxa de frete.
- **Controle Flexível em Configurações (`Settings.jsx`)**:
  - Switch/Seletor para o lojista alternar o modo de operação do cardápio a qualquer momento sem precisar abrir chamado.

## User Stories

- **Como Lojista de Salão / Bar / Cafeteria**:
  - Quero que meus clientes acessem o cardápio nas mesas via QR Code sem que eu precise gastar dinheiro reimprimindo folhas de papel quando os preços mudarem.
  - Quero a opção de decidir se o cliente faz o pedido no celular direto para a cozinha/caixa ou se ele apenas lê e chama o garçom.
  - Não quero ver abas inúteis de motoboys, despacho ou taxa de frete se eu não faço delivery.
- **Como Administrador do SaaS (Davi)**:
  - Quero poder vender planos de entrada acessíveis (R$ 49 a R$ 79/mês) para capturar dezenas de estabelecimentos locais com custo de suporte quase zero.
  - Quero uma escada de upgrade clara: o cliente começa na vitrine de R$ 49, ativa mesas por R$ 79 e depois expande para delivery completo por R$ 149.

## Acceptance Criteria

- [ ] Coluna `salon_mode TEXT DEFAULT 'full'` adicionada à tabela `public.tenants` e suportada no RPC `update_tenant_settings`.
- [ ] SuperAdmin com opções de planos `showcase` (R$ 49) e `table` (R$ 79) na criação, edição e badges da listagem.
- [ ] `Layout.jsx` filtrando dinamicamente a barra lateral de acordo com o plano/modo da loja.
- [ ] `Menu.jsx` ocultando carrinho e checkout quando em modo `showcase`, e direcionando para mesa quando em `table_only`.
- [ ] `Settings.jsx` com seletor interativo de Modo de Atendimento da Loja.
- [ ] Build do projeto executado e aprovado com 0 erros.
