# Salon, Table Ordering & Digital Showcase (Plano Vitrine & Autoatendimento) - Tasks Document

- [x] 1. Banco de Dados & RPCs (Supabase)
  - [x] 1.1 Criar migration SQL `supabase/migrations/20261013_tenant_salon_mode.sql` adicionando coluna `salon_mode TEXT DEFAULT 'full'` na tabela `tenants`.
  - [x] 1.2 Atualizar RPC `public.update_tenant_settings` para sincronizar `salon_mode`.
  - [x] 1.3 Executar migration via `execute_sql` no Supabase e validar esquema.

- [x] 2. Planos no SuperAdmin (`SuperAdmin.jsx`)
  - [x] 2.1 Adicionar planos `showcase` (R$ 49) e `table` (R$ 79) nos selects de criação e edição.
  - [x] 2.2 Atualizar cálculo de MRR e integração com Asaas para os novos planos.
  - [x] 2.3 Exibir badges específicos na listagem (`📱 Vitrine / QR Code` e `🍽️ Salão & Mesas`).

- [x] 3. Adaptação do Painel do Lojista (`Layout.jsx`)
  - [x] 3.1 Identificar plano ou modo ativo da loja (`salon_mode` / `plan`).
  - [x] 3.2 Ocultar abas desnecessárias no modo visual (Pedidos, KDS, Entregadores, PDV, Relatórios, Clientes, Cupons).
  - [x] 3.3 Ocultar entregadores e clientes no modo autoatendimento na mesa.

- [x] 4. Adaptação do Cardápio Público (`Menu.jsx`)
  - [x] 4.1 Ocultar carrinho, botão flutuante e checkout no modo visual.
  - [x] 4.2 Exibir banner explicativo no cardápio de acordo com o modo.
  - [x] 4.3 Garantir que modo autoatendimento na mesa trave o pedido em `dine_in` com mesa pré-preenchida.

- [x] 5. Configurações da Loja (`Settings.jsx`)
  - [x] 5.1 Adicionar seletor do Modo de Atendimento (Visual vs Autoatendimento na Mesa vs Completo).
  - [x] 5.2 Salvar e sincronizar em tempo real com `tenants.salon_mode`.

- [x] 6. Validação & Build
  - [x] 6.1 Rodar `npm run build` e certificar zero erros.
  - [x] 6.2 Atualizar documentação viva no Obsidian.
