# 🗺️ Roadmap & Backlog Vivo

> **Nota Automática**: Este documento é alimentado e atualizado continuamente durante as nossas conversas de desenvolvimento. Toda nova tarefa, alteração de escopo ou conclusão de funcionalidade é registrada aqui.

---

## 🚀 Em Andamento / Foco Atual
- [x] ☁️ **Armazenamento de Mídia no Cloudflare R2 (Concluído & Ativo)**: Bucket `pedemuleke-media` configurado, Edge Function `r2-upload` criada e deployada no Supabase, credenciais S3 integradas com segurança, pipeline WebP conectado em `Core.js` com CDN global (`r2.dev`) e tráfego ilimitado (zero egress).
- [x] 🔥 **Webhook do Asaas (Deploy Ativo & Automatizado)**: Edge Function deployed (`functions/v1/asaas`) recebendo notificações de pagamento (`PAYMENT_RECEIVED`, `PAYMENT_OVERDUE`, `PAYMENT_RESTORED`, `SUBSCRIPTION_DELETED`) pausando e despausando automaticamente a loja no Supabase (`tenants.is_active` e `subscription_status`).
- [x] **Torre de Controle SuperAdmin de Alto Nível**: Tabela minimalista (Restaurante, Link, Plano, Status, Ações) + Drawer 360° com Raio-X Financeiro Asaas, Métricas de Vendas e Botão de Cobrança 1-Clique no WhatsApp.
- [x] **Mecanismo Real de Pausa / Bloqueio**: Se a loja for pausada, o cardápio público sai do ar imediatamente e o painel do restaurante bloqueia exigindo regularização com botão de reativar na hora.
- [x] **Configuração de Pagamentos (Asaas Sandbox)**: Conta conectada, API key validada e emissão de assinaturas testada.
- [x] **Decisão de Hospedagem**: Definido uso de **Cloudflare Pages** (gratuito, comercial e tráfego ilimitado).


---

## 📋 Backlog Priorizado (Fase 1: Supabase First)

### 🔐 Multi-Tenant & Segurança
- [x] Implementar isolamento completo com `tenant_id` em todas as consultas e mutations.
- [x] Configurar Row Level Security (RLS) definitivo para o schema de dados.
- [x] **Código Numérico da Loja (1, 2, 3...)**: Cada restaurante possui um número simples sequencial para login ultra rápido e sem atrito. Apenas o Davi utiliza o identificador textual 'superadmin'.
- [x] **Criação de Usuários com Supabase Auth Real**: RPCs (`create_store_admin_user`, `update_store_admin_user`, `delete_store_admin_user`) integrando `auth.users`, `auth.identities` e `tenant_admins`.
- [x] **Banner com ID da Loja em Configurações**: Lojista visualiza e copia facilmente o identificador da loja para repassar à equipe.
- [x] **Acesso SuperAdmin Invisível e Seguro**: Removida flag pública de SuperAdmin. O Davi acessa informando 'superadmin' como identificador da loja, mantendo o formulário unificado, limpo e sigiloso.
- [x] **Blindagem e Isolamento Absoluto no Login**: Resolução do email de autenticação estritamente restrita ao slug da loja especificado, impedindo vazamento ou colisão com contas de SuperAdmin.
- [x] **Criptografia Blowfish (bcrypt) & Eliminação de Senhas em Aberto**: Coluna `initial_password` excluída do banco de dados. Todas as senhas na tabela `admin_users` e `auth.users` criptografadas com hash irreversível Blowfish/bcrypt, com exibição de senha estritamente mascarada (`••••••••`) no painel.
- [x] **Isolamento Absoluto de Cache Multi-Tenant & Lojas Zeradas**: Resolução síncrona de tenant pela rota URL (`getRouteTenantSlug`), limpeza imediata de cache em memória (`memoryCache.clear()`) em trocas de loja, pré-inicialização zerada (`[]`) ao cadastrar empresas no SuperAdmin, blindagem do `useTenant()` contra vazamento de `tenant_id` da loja anterior e chaveamento de ciclo de vida (`key={slug}`) garantindo que uma nova empresa nunca mostre produtos ou categorias de outra loja nem por 1 milissegundo.
- [x] **Separação Definitiva de Repositórios Git**: O projeto SaaS da Plataforma de Delivery foi desconectado do repositório da Vruum Burguer e publicado com sucesso no novo repositório oficial (`https://github.com/DaviAleixo/delivery-sass`). O repositório original `DaviAleixo/vruumburguer` foi restaurado para o commit original (`2323ccb`), voltando o site `vruumburguer.vercel.app` para a versão individual da loja.

### 🛎️ Experiência de Pedidos & KDS
- [x] **Ciclo de Vida de Pedidos & KDS**: Botões de "Confirmar", "Avançar Status" e "Cancelar" com persistência no Supabase, RLS ajustado e toasts instantâneos.
- [x] **Sanitização Inteligente em Updates Parciais**: Atualizações de status não zeram campos nem mutam dados de itens/cliente.
- [x] **Alerta Sonoro Inteligente & Repetição Contínua (KDS & Pedidos)**: Campainha ativa por padrão. Detecção instantânea de qualquer pedido pendente existente ao carregar ou ao religar o som (mesmo pedidos antigos), liberação de áudio para inspeção de lojas em Modo SuperAdmin, e centralização exclusiva do controle no topo da tela de Pedidos (removido botão duplicado da barra lateral).

- [x] **Canais de Atendimento Flexíveis (Delivery vs Retirada)**: Configuração na aba Geral e no SuperAdmin com persistência no Supabase (`accepts_delivery` e `accepts_takeaway`), permitindo ao lojista desativar entrega ou retirada. No checkout, se for apenas retirada, abre direto sem abas, com taxa zero e ocultando campos de endereço.
- [x] **Restrição Inteligente da Opção 'Na Mesa'**: 'Na Mesa' foi removida do checkout público de delivery. Só é exibida se o cliente acessar por QR Code físico de mesa (`?mesa=X` / `vrumburguer_table_number`) ou se a loja for do plano exclusivo de mesas (`table_only`).
- [ ] Filtro por tipo de pedido no painel de pedidos (Delivery vs Retirada no Balcão).
- [ ] Impressão rápida do comprovante do pedido (layout otimizado para cupom não fiscal de 80mm/58mm).
- [x] **Fila Inteligente de Impressão & Tolerância a Quedas de Internet (FIFO)**: Migration aplicada no Supabase (`print_status`, `printed_at`, `print_count`), hook `useFifoPrintQueue` com sincronização automática na reconexão (`catch-up sync`), fila sequencial ordenada por `created_at ASC`, controle anti-duplicação, botão Auto-Imprimir no KDS e tarja de comanda para pedidos represados ("⚠️ PEDIDO RETIDO PELA REDE").
- [x] **Idempotência & Reconciliação no KDS e Checkout**: Trava síncrona contra duplicação de pedidos no checkout (`useRef` + UUID determinístico por tentativa), chave de idempotência determinística na Edge Function do Mercado Pago (`ord_pix_${orderId}`) prevenindo duplicidade de QR Codes Pix, e reconciliação automática de pedidos no KDS ao reconectar WebSocket, restaurar conexão de rede (`online`) ou voltar o foco à aba (`visibilitychange`).
- [x] Atualização em tempo real do status do pedido na tela do cliente (`Meus Pedidos`).
- [x] **Rastreamento de Pedido & Pós-Pagamento Resiliente (`MyOrders`)**: Corrigida quebra de renderização (`.toFixed` em string numérica e permissão de notificação), adicionado `ErrorBoundary` global em `App.jsx` contra telas em branco, banner comemorativo de PIX Aprovado, stepper ao vivo (Recebido ➔ Confirmado ➔ A Caminho ➔ Entregue), cronômetro regressivo estimado e botão direto para o WhatsApp do restaurante.
- [x] **Módulo de Entregadores na Barra Lateral & Despacho com Remuneração Flexível**: Tela independente "Entregadores" acessível diretamente pelo menu lateral principal (após PDV Balcão) com cadastro completo da equipe (Nome, WhatsApp, Veículo, Chave Pix) e 3 modelos de remuneração opcionais (Por Comanda, Por Viagem ou Fixo/Diária/Nenhum). Modal rápido de despacho no painel de Pedidos acionado apenas quando há entregadores cadastrados (se não houver, avança direto com 1 clique para não travar a operação), com aviso explícito no cadastro orientando que a vinculação do motoboy e bag é exigida no despacho de saídas.
- [x] **Fechamento de Caixa do Turno & Relatório do Dia em 1-Clique**: Botão fixo no topo da tela de Pedidos e em Relatórios, com cálculo em tempo real de faturamento bruto/líquido, divisão por forma de pagamento (Dinheiro, Pix, Cartão Crédito/Débito, Vale), conferência da gaveta física, modo adaptativo com/sem entregadores (acerto individual de taxas, viagens, comandas e dinheiro em mãos a recolher do motoboy), sugestão inteligente ao fechar a loja (automático ou manual), suporte flexível a turno único (padrão 'Hoje - Dia Todo' cobrindo 100% dos pedidos do dia para lojas só almoço ou só janta), detecção dinâmica de expediente em `open_days` (`☀️ Turno Diurno` vs `🌙 Turno Noturno` com tolerância à madrugada), cópia formatada em 1 clique para WhatsApp e impressão térmica não fiscal de 80mm/58mm via `PrintShiftClosing`.
- [x] **Evolução de Vendas Diárias, Horários de Pico & Histórico de Fechamentos**:
  - Gráfico de barras cronológico com faturamento/lucro diário (eliminando excesso de gráficos de categoria).
  - Gráfico Donut de categorias blindado: preserva o nome original da categoria mesmo se ela for excluída do cardápio futuramente (via snapshot de categoria no pedido).
  - Mapa de Horários de Pico com volume de clientes por hora do dia (00h às 23h BRT) e identificação do pico de movimento.
  - Histórico persistido de Fechamentos de Caixa por Dia/Turno (salvar, consultar dias anteriores, reimprimir e reenviar no WhatsApp).
- [x] **Abertura/Fechamento Manual da Loja Blindada**: Corrigido erro PGRST205 (tabela `public.settings` inexistente no Supabase) mapeando transparentemente para a tabela `public.tenants` e atualizando a RPC `update_tenant_settings` para suportar `manual_store_open`, `manual_override_date` e `delivery_time`, sincronizando instantaneamente o status com o cardápio dos clientes.

### 🛍️ Cardápio & Vendas
- [x] **Formas de Pagamento Modulares (Dinheiro, Crédito, Débito, Alimentação e PIX Online)**: Painel em Configurações para ativar Dinheiro (com troco), Cartão de Crédito, Débito e Vale Refeição na Maquininha, e PIX Online Mercado Pago com sincronização em tempo real no checkout.
- [x] **Persistência Blindada de Formas de Pagamento**: Resolução dos problemas de RLS com RPC `update_tenant_payment_methods` e `update_tenant_settings`, unificação do alias `vruum-burguer`/`vrumm` e isolamento dos formulários de configurações para nunca perder o estado ao navegar entre abas ou telas.
- [x] **PIX Online Automático Mercado Pago**: Edge Function `mercadopago` no Supabase com geração de QR Code Copia e Cola, polling de 3s e confirmação automática do pedido em tempo real. Sanitização rigorosa de `payer.email` com TLDs públicos válidos e mensagens amigáveis de instrução para cadastro de chave Pix.
- [x] **Proteção de Fila para PIX Online (Sem Pedidos Fantasmas)**: Pedidos com PIX Online entram como `aguardando_pagamento` (invisíveis para a cozinha). Quando o PIX é aprovado, o pedido é atualizado para `status: "pendente"` e `payment_status: "paid"`, caindo diretamente na aba **Pendentes** do painel do restaurante com badge verde `✓ PAGO VIA PIX` e tocando o alarme sonoro para a equipe aceitar. Se o cliente fechar sem pagar, o rascunho é descartado.
- [x] **Blindagem Zero-Trust de Pagamentos (Anti-Tampering no Servidor)**: Desenvolvido via Spec Workflow (`.specs/payment-security`). A Edge Function `mercadopago` (v5) recalcula o valor oficial consultando o catálogo do Supabase (`products`, `product_additionals`, `tenants.delivery_fee` e `coupons`). Qualquer tentativa de forjar `amount` menor via DevTools/Postman é ignorada e corrigida, e o webhook valida o valor pago no Mercado Pago antes de aprovar o pedido.
- [x] **Resiliência de Checkout PIX (Máquina de Estados: Recusa, Expiração & Recuperação)**: Tratamento visual explícito no modal quando o PIX for recusado pelo banco ou quando o tempo expirar (15 min). Ocultar QR Code vencido, parar polling e dar botões de 1-clique para 'Gerar Novo PIX' ou 'Pagar na Entrega (Cartão/Dinheiro)' sem perder o carrinho ([[02 - 💡 Ideias & Brainstorm]]).
- [x] **Padronização de Timezone Oficial (Brasília America/Sao_Paulo)**: Garantir que o cálculo de loja aberta/fechada (`isStoreOpen`) e a impressão térmica não dependam do fuso/relógio do dispositivo do cliente, e blindar o turno noturno que ultrapassa a meia-noite ([[02 - 💡 Ideias & Brainstorm]]).
- [x] **Correção de Edição & Atualização de Produtos**: Corrigido mapeamento de coluna (`updated_date` em vez de `updated_at`) no sanitizador de produtos e propagação de erros no Supabase, garantindo que alterações de preço (ex: R$ 0,01) e dados persistam imediatamente no banco.
- [x] **Plano Vitrine & Autoatendimento de Salão / Mesas (Sem Delivery & Sem Motoboys)**:
  - **Plano Vitrine QR Code (R$ 49/mês)**: Cardápio digital informativo (sem carrinho/pedidos). Oculta carrinho, botões de adicionar e abas operacionais de entrega no painel (Pedidos, KDS, Entregadores, PDV, Relatórios, Clientes, Cupons). Permite cadastrar produtos, categorias e grupos de complementos/adicionais normalmente.
  - **Isolamento de Cache de Complementos**: Blindagem rigorosa de `ComplementGroup` e `ProductComplementGroup` no `storage.js`, garantindo que uma nova empresa comece 100% zerada (`[]`) e que grupos como "EXTRA" criados em outra empresa nunca vazem nem temporariamente.
  - **Plano Salão & Mesas (R$ 79/mês)**: Autoatendimento exclusivo via QR Code na mesa (`?mesa=X`), dispensando entregadores, taxas de entrega e endereços de clientes. O pedido cai direto no caixa/KDS com campainha e impressão térmica `PARA MESA (Mesa X)`.
  - **Seletor de Modo no Painel**: Aba Geral de Configurações permite alternar entre Vitrine Informativa, Autoatendimento de Mesas ou Completo com Delivery ([[02 - 💡 Ideias & Brainstorm]]).

### 💳 Cobrança & Monetização SaaS (Asaas)
- [x] Criar conta/ambiente Sandbox no Asaas e validar chave de API.
- [x] Testar criação programática de Cliente e Assinatura Recorrente via API.
- [x] Adicionar coluna de Mensalidade (Asaas), status e botão de copiar fatura no Painel **SuperAdmin** do Davi.
- [x] **Auto-Onboarding no Asaas**: Criar cliente, assinatura e link da 1ª fatura automaticamente ao cadastrar nova empresa no SuperAdmin.
- [x] **Autoatendimento Fiscal na Loja**: Permitir que o lojista atualize seu e-mail de faturamento, WhatsApp e CPF/CNPJ em Configurações > Minha Assinatura com sincronização direta no Asaas.
- [x] **Webhook do Asaas Ativo**: Altera automaticamente o status `is_active` e `subscription_status` da loja no Supabase em tempo real.
- [ ] Definir régua de cobrança automática (Lembrete via WhatsApp e E-mail 3 dias antes do vencimento).
- [ ] **Módulo Financeiro SaaS no SuperAdmin**: Dashboard executivo com MRR, ARR, inadimplência Asaas e lucro líquido em tempo real ([[02 - 💡 Ideias & Brainstorm]]).

---

## 🔮 Fase 2: Backend Dedicado & Integrações
- [ ] **Disparador WhatsApp Automático**: Notificar o cliente quando o pedido sair para entrega ou for aprovado.
- [ ] **Validação de Telefone / WhatsApp & Trava Anti-Trote**: Verificação de DDD + nono dígito e envio de código OTP via WhatsApp (Evolution API / Z-API) para primeiros pedidos em dinheiro, evitando pedidos falsos sem gerar custo de SMS.
- [x] **PIX Dinâmico Automático**: Geração de QR Code PIX com confirmação automática de pagamento (Mercado Pago).
- [x] **Ferramental de IA Avançado (MCPs)**: Configuração do **Sentry MCP** e **Spec Workflow MCP** no `mcp_config.json` para observabilidade de produção e metodologia Spec-Driven Development.
- [x] **Central de Pendências & Observabilidade com Sentry no SuperAdmin**: Painel de alertas consolidado com pedidos com falha, webhooks com erro e exceções capturadas pelo Sentry, cadastro manual de pendências (com status de urgente, título, descrição, rota opcional e seleção de loja) e captura automática via Sentry beforeSend ([[02 - 💡 Ideias & Brainstorm]]).
- [ ] **Módulo Fiscal para Restaurantes (NFC-e / SAT)**: Integração com API especializada (Focus NFe / PlugNotas / Nuvem Fiscal) para emissão de cupom fiscal com certificado A1 (.pfx) ([[02 - 💡 Ideias & Brainstorm]]).
- [x] **Customização Visual & Temas do Cardápio**:
  - [x] Encapsular o layout atual Dark & Red 100% idêntico em `src/custom-menus/vrumm/VrummMenu.jsx` como Template VIP da Vrumm (sem alterar nada).
  - [x] Redesenhar o cardápio padrão (`Menu.jsx`) na estética **Clean Retail SaaS** com a paleta oficial calibrada (`#047857` verde esmeralda nos botões e ações principais, `#D1E9DF` acentos e badges, `#FFFFFF` superfícies e cards, `#F7F9F8` fundo clean e `#171717` tipografia de alto contraste) ([[02 - 💡 Ideias & Brainstorm]]).
  - [x] **Unificação da Identidade Visual do Painel Administrativo do Cliente**: Realinhamento completo da paleta de cores de todas as telas administrativas e de gestão do lojista (`Layout.jsx`, `Orders.jsx`, `Products.jsx`, `Categories.jsx`, `Complements.jsx`, `Dashboard.jsx`, `Banners.jsx`, `Coupons.jsx`, `Reports.jsx`, `PDV.jsx`, `PDVOrders.jsx`, `TableQRCodeModal.jsx`, `AdminLogin.jsx`, `MyOrders.jsx`), substituindo o vermelho herdado pelo verde esmeralda (`#047857`), menta suave (`#D1E9DF`), superfícies brancas (`#FFFFFF`), fundo neutro clean (`#F7F9F8`) e preto de alto contraste (`#171717`), preservando botões destrutivos de cancelamento/exclusão em vermelho para segurança de UX.
  - [x] **Redesign Completo da Gaveta "Meu Perfil" (`UserProfileSheet.jsx`)**: Substituído o layout escuro e contrastes quebrados por uma estética **Clean Retail** de alto padrão (card do usuário em gradiente suave com avatar verde esmeralda e anel branco, pílula de WhatsApp conectado, títulos legíveis em cinza elegante, cards de endereços brancos com ícones verde menta e botões de ação discretos, cards de cupom com visual de bilhete pontilhado e botão de copiar verde, e botão de fechar circular minimalista sem anéis vermelhos indesejados).
  - [x] **Barra Superior Dinâmica & Abas de Categoria com Efeito Pincel**: Barra no topo verde (`#064e3b`) com tempo de entrega ou aviso de retirada local, endereço da loja sempre visível com ícone (`| 📍 {endereço}`) no desktop, horário e status de abertura (fica vermelha quando a loja estiver fechada). Responsividade inteligente: endereço exibido somente no desktop (`hidden md:flex`), e no mobile exibição centralizada e limpa contendo apenas o modo/tempo de entrega e as horas separados por pipe (`|`). Efeito de pincelada orgânica autêntica (Brush Stroke SVG) com cerdas secas na categoria selecionada (com opção "Todos" por padrão) e traço sublinhado com divisores verticais (`|`) nos itens inativos, idêntico à referência visual. Horário e status removidos de baixo do nome da loja no cabeçalho.
- [ ] **Spooler & App Desktop (.exe) do Painel (Tauri / Electron)**: Aplicativo local com inicialização automática no Windows, impressão térmica silenciosa sem navegador e notificações na bandeja ([[02 - 💡 Ideias & Brainstorm]]).
- [x] **Armazenamento de Mídia no Cloudflare R2**: Upload de fotos de produtos e banners com tráfego ilimitado (zero egress), compressão cliente WebP, Edge Function no Supabase e CDN global ([[02 - 💡 Ideias & Brainstorm]]).
- [x] **Hospedagem & Deploy no Cloudflare Pages**: Deploy contínuo (CI/CD) do frontend em produção via Cloudflare Pages com tráfego comercial ilimitado, roteamento SPA (`_redirects`) e CDN global ([[02 - 💡 Ideias & Brainstorm]]).
- [x] **Identificação Obrigatória do Cliente no PDV**: Proibido finalizar pedidos no balcão/PDV sem informar o nome e o WhatsApp/telefone ou puxar um cliente salvo. Validação visual com alerta nos campos, destaque em vermelho ao tentar avançar sem preencher, e validação no modal de pagamento e criação do pedido ([[02 - 💡 Ideias & Brainstorm]]).
- [ ] **Landing Page (LP) de Vendas de Alta Conversão**: Página comercial com calculadora de economia vs iFood e tabela de planos ([[02 - 💡 Ideias & Brainstorm]]).
- [x] **Branding, Naming & Identidade Visual do SaaS**: Definido o nome comercial oficial e definitivo: **PedeMuleke** ("Pede Muleke / Pé de moleque"). Atualizada a nomenclatura em toda a base do projeto, metadados, títulos e documentações ([[02 - 💡 Ideias & Brainstorm]]).
- [x] **Base Arquitetural de Cardápios VIP Personalizados (Modo A - Multi-Template Engine)**: Coluna `custom_template` no banco Supabase (`tenants`), RPCs `get_master_tenants` e `update_tenant_info`, registro central de templates (`src/custom-menus/registry.js`), despacho dinâmico no `Menu.jsx` com fallback transparente para o cardápio padrão genérico e seleção em 1-clique no SuperAdmin com plano VIP Personalizado ([[02 - 💡 Ideias & Brainstorm]]).
  - [x] **Correção no Despacho de Template VIP (`handleAddToCart`)**: Corrigida a passagem de props em [Menu.jsx](file:///c:/Users/Davi/Projetos/delivery/src/pages/Menu.jsx) para templates customizados (`VrummMenu`), repassando `addToCart` corretamente e eliminando o erro de execução `ReferenceError: handleAddToCart is not defined`.
- [x] **Ajuste de Tipografia & Contraste do Cupom Térmico (`PrintOrder.jsx`)**: Substituído tons de cinza por preto puro (#000), aplicada fonte encorpada de alta legibilidade (`font-black`/`font-bold`), margem 0mm, `@media print` calibrado para bobinas térmicas de 80mm e 58mm e corte de 2 vias.
- [ ] **Domínio Próprio para Restaurantes (Cloudflare for SaaS)**: Suporte a domínio/subdomínio personalizado do cliente (ex: `cardapio.pizzaria.com.br`) com SSL HTTPS automático (Cloudflare Custom Hostnames) e resolução direta por hostname no `TenantContext.jsx` ([[02 - 💡 Ideias & Brainstorm]]).

---

## ✅ Concluído (Entregas Realizadas)
- [x] **Cardápio Público**: Visualização de produtos, categorias com rolagem suave e banners rotativos dinâmicos.
- [x] **Carrinho Drawer**: Adição, remoção, cálculo de adicionais e totais em tempo real.
- [x] **Checkout Flexível**: Modais separados para Entrega (com endereço completo) e Retirada.
- [x] **Painel Administrativo Básico**: Dashboard de faturamento, listagem de pedidos e gestão de produtos/categorias.
- [x] **Configurações da Loja**: Horários de funcionamento semanal, taxa de entrega padrão e valor mínimo de pedido.

---

## 🔗 Links Relacionados
* [[00 - 🏠 Inicio]] — Voltar ao painel inicial
* [[02 - 💡 Ideias & Brainstorm]] — Ideias não estruturadas e discussões
* [[03 - 🚀 Especificacao SaaS]] — Visão estratégica e planos de monetização
* [[04 - 🗄️ Modelagem & Supabase]] — Estrutura de tabelas e RLS
