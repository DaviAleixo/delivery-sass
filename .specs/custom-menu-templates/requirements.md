# Multi-Template Architecture & Custom Menus (Modo A) - Requirements Document

Preparação da base arquitetural e de banco de dados para suportar múltiplos front-ends de cardápio (templates personalizados sob medida) dentro do mesmo ecossistema SaaS, permitindo alternar ou vincular um cliente a um cardápio exclusivo em 1 clique pelo SuperAdmin, sem perder vendas e com fallback automático para o cardápio padrão genérico.

## Core Features

- **Suporte a Template Customizado no Banco de Dados**:
  - A tabela `public.tenants` passa a ter a coluna `custom_template VARCHAR(100) DEFAULT NULL`, indicando a chave do layout customizado ativo da empresa.
  - O plano `custom` ("VIP Personalizado") passa a ser reconhecido nativamente nos fluxos do sistema, RPCs e SuperAdmin com precificação diferenciada.
- **Registro Central de Templates (Registry Pattern)**:
  - Criação de um registro central extensível em `src/custom-menus/registry.js` que indexa todos os templates personalizados criados no código.
  - Caso o lojista não tenha nenhum template definido (`NULL` ou `"default"`), ou caso o template configurado ainda não esteja compilado/cadastrado, o sistema faz fallback imediato e seguro para o cardápio padrão oficial (`Menu.jsx`).
- **Roteamento Dinâmico e Desacoplado no Cardápio (`Menu.jsx`)**:
  - Quando um cliente acessa `/:slug` ou `/:slug/menu`, o componente avalia `tenant.custom_template`.
  - Se houver um componente correspondente registrado, o componente customizado é renderizado recebendo o contexto do tenant, catálogo e configurações.
  - Se não houver, o layout padrão de alta conversão atual é renderizado normalmente.
- **Gerenciamento em 1 Clique no SuperAdmin**:
  - Modal de edição de restaurante permite selecionar o plano `VIP Personalizado` e escolher o template ativo via dropdown alimentado pelo registry.
  - Listagem de restaurantes e Drawer exibem badges exclusivos para lojas VIP com indicação do template ativo.

## User Stories

- **Como Administrador / Dono do SaaS**:
  - Quero vender planos VIP personalizados para clientes de alto padrão onde desenvolvo um front-end sob medida para eles, sem precisar criar repositórios separados nem duplicar backend.
  - Quero que, enquanto o front-end personalizado está sendo desenhado/programado, o cliente utilize o cardápio padrão com vendas funcionando normalmente.
  - Quero vincular o novo front-end ao restaurante em 1 clique no SuperAdmin assim que o código estiver pronto.
- **Como Lojista VIP**:
  - Quero um cardápio com a identidade visual e experiência 100% exclusivas do meu restaurante, consumindo os mesmos produtos, categorias, pedidos e checkout da plataforma.
- **Como Cliente Final do Restaurante**:
  - Quero uma experiência de compra rápida, elegante e sem erros, seja no cardápio padrão ou no cardápio sob medida.

## Acceptance Criteria

- [ ] Coluna `custom_template` adicionada à tabela `public.tenants` no Supabase com valor default `NULL`.
- [ ] RPC `get_master_tenants` atualizada para retornar `custom_template` na lista de empresas do SuperAdmin.
- [ ] RPC `update_tenant_info` atualizada para receber e persistir `p_custom_template`.
- [ ] Módulo `src/custom-menus/registry.js` implementado com funções `getCustomMenuTemplate`, `listAvailableTemplates` e documentação de novos templates.
- [ ] `Menu.jsx` integrado ao registry, renderizando o template VIP se configurado ou o cardápio padrão caso contrário.
- [ ] SuperAdmin com suporte ao plano `custom` ("VIP Personalizado") e dropdown de seleção de template na edição de empresas e no Drawer.
- [ ] Build do projeto (`npm run build`) validado sem erros de tipagem, compilação ou lint.

## Non-functional Requirements

- **Desacoplamento & Manutenibilidade**: O código do cardápio padrão não deve conter ifs específicos de clientes individuais. Cada template VIP deve viver em sua própria pasta e se conectar unicamente via registry.
- **Zero Downtime & Fallback Seguro**: Nenhuma alteração de template pode quebrar o cardápio público; se o identificador for inválido, o cardápio padrão entra em ação instantaneamente.
- **Performance**: Carregamento sob demanda (lazy loading) para não inflar o bundle inicial de clientes normais com código de templates exclusivos.
