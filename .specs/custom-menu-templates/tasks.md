# Multi-Template Architecture & Custom Menus (Modo A) - Tasks Document

- [x] 1. Banco de Dados & Migrations (Supabase)
  - [x] 1.1 Criar migration SQL `supabase/migrations/20261013_custom_menu_templates.sql` com coluna `custom_template` na tabela `tenants`.
  - [x] 1.2 Atualizar RPC `public.get_master_tenants()` para incluir `custom_template text`.
  - [x] 1.3 Atualizar RPC `public.update_tenant_info(...)` para receber e persistir `p_custom_template`.
  - [x] 1.4 Executar migration no Supabase (`execute_sql`) e validar esquema.

- [x] 2. Arquitetura Frontend & Registry
  - [x] 2.1 Criar pasta `src/custom-menus/` e arquivo `src/custom-menus/registry.js`.
  - [x] 2.2 Implementar funções `getCustomMenuTemplate(id)` e `listAvailableTemplates()`.
  - [x] 2.3 Incluir guia e boilerplate comentado no `registry.js` para padronizar criação de novos templates VIP.
  - [x] 2.4 Integrar `Menu.jsx` com `getCustomMenuTemplate`, garantindo fallback seguro para o cardápio padrão quando não houver template customizado.

- [x] 3. Gerenciamento no SuperAdmin
  - [x] 3.1 Adicionar opção de plano `custom` ("VIP Personalizado") nos selects de criação e edição.
  - [x] 3.2 Adicionar campo de seleção de template (`custom_template`) no modal de edição de restaurante.
  - [x] 3.3 Exibir badges e informações de template ativo na listagem de restaurantes e no Drawer lateral.
  - [x] 3.4 Sincronizar salvamento de `custom_template` via RPC `update_tenant_info`.

- [x] 4. Documentação Viva & Validação
  - [x] 4.1 Atualizar `docs/01 - 🗺️ Roadmap & Backlog.md` e `docs/02 - 💡 Ideias & Brainstorm.md`.
  - [x] 4.2 Executar `npm run build` e certificar zero erros de compilação.
