# 🗺️ Roadmap & Backlog Vivo

> **Nota Automática**: Este documento é alimentado e atualizado continuamente durante as nossas conversas de desenvolvimento. Toda nova tarefa, alteração de escopo ou conclusão de funcionalidade é registrada aqui.

---

## 🚀 Em Andamento / Foco Atual
- [ ] 🔥 **PRIORIDADE MÁXIMA: Webhook do Asaas**: Receber notificações de pagamento (`PAYMENT_RECEIVED`, `PAYMENT_OVERDUE`) para pausar ou despausar automaticamente a loja no Supabase (`tenants.is_active`).
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

### 🛎️ Experiência de Pedidos & KDS
- [x] **Ciclo de Vida de Pedidos & KDS**: Botões de "Confirmar", "Avançar Status" e "Cancelar" com persistência no Supabase, RLS ajustado e toasts instantâneos.
- [x] **Sanitização Inteligente em Updates Parciais**: Atualizações de status não zeram campos nem mutam dados de itens/cliente.
- [x] **Alerta Sonoro Inteligente (KDS Cozinha)**: Campainha e repetição contínua ativas exclusivamente no painel do restaurante/lojista. Silenciado 100% no SuperAdmin e com desligamento imediato ao deslogar ou sair da tela.

- [ ] Filtro por tipo de pedido no painel de pedidos (Delivery vs Retirada no Balcão).
- [ ] Impressão rápida do comprovante do pedido (layout otimizado para cupom não fiscal de 80mm/58mm).
- [x] **Fila Inteligente de Impressão & Tolerância a Quedas de Internet (FIFO)**: Migration aplicada no Supabase (`print_status`, `printed_at`, `print_count`), hook `useFifoPrintQueue` com sincronização automática na reconexão (`catch-up sync`), fila sequencial ordenada por `created_at ASC`, controle anti-duplicação, botão Auto-Imprimir no KDS e tarja de comanda para pedidos represados ("⚠️ PEDIDO RETIDO PELA REDE").
- [x] **Idempotência & Reconciliação no KDS e Checkout**: Trava síncrona contra duplicação de pedidos no checkout (`useRef` + UUID determinístico por tentativa), chave de idempotência determinística na Edge Function do Mercado Pago (`ord_pix_${orderId}`) prevenindo duplicidade de QR Codes Pix, e reconciliação automática de pedidos no KDS ao reconectar WebSocket, restaurar conexão de rede (`online`) ou voltar o foco à aba (`visibilitychange`).
- [x] Atualização em tempo real do status do pedido na tela do cliente (`Meus Pedidos`).
- [x] **Rastreamento de Pedido & Pós-Pagamento Resiliente (`MyOrders`)**: Corrigida quebra de renderização (`.toFixed` em string numérica e permissão de notificação), adicionado `ErrorBoundary` global em `App.jsx` contra telas em branco, banner comemorativo de PIX Aprovado, stepper ao vivo (Recebido ➔ Confirmado ➔ A Caminho ➔ Entregue), cronômetro regressivo estimado e botão direto para o WhatsApp do restaurante.

### 🛍️ Cardápio & Vendas
- [x] **Formas de Pagamento Modulares (Dinheiro, Crédito, Débito, Alimentação e PIX Online)**: Painel em Configurações para ativar Dinheiro (com troco), Cartão de Crédito, Débito e Vale Refeição na Maquininha, e PIX Online Mercado Pago com sincronização em tempo real no checkout.
- [x] **Persistência Blindada de Formas de Pagamento**: Resolução dos problemas de RLS com RPC `update_tenant_payment_methods` e `update_tenant_settings`, unificação do alias `vruum-burguer`/`vrumm` e isolamento dos formulários de configurações para nunca perder o estado ao navegar entre abas ou telas.
- [x] **PIX Online Automático Mercado Pago**: Edge Function `mercadopago` no Supabase com geração de QR Code Copia e Cola, polling de 3s e confirmação automática do pedido em tempo real. Sanitização rigorosa de `payer.email` com TLDs públicos válidos e mensagens amigáveis de instrução para cadastro de chave Pix.
- [x] **Proteção de Fila para PIX Online (Sem Pedidos Fantasmas)**: Pedidos com PIX Online entram como `aguardando_pagamento` (invisíveis para a cozinha). Quando o PIX é aprovado, o pedido é atualizado para `status: "pendente"` e `payment_status: "paid"`, caindo diretamente na aba **Pendentes** do painel do restaurante com badge verde `✓ PAGO VIA PIX` e tocando o alarme sonoro para a equipe aceitar. Se o cliente fechar sem pagar, o rascunho é descartado.
- [x] **Blindagem Zero-Trust de Pagamentos (Anti-Tampering no Servidor)**: Desenvolvido via Spec Workflow (`.specs/payment-security`). A Edge Function `mercadopago` (v5) recalcula o valor oficial consultando o catálogo do Supabase (`products`, `product_additionals`, `tenants.delivery_fee` e `coupons`). Qualquer tentativa de forjar `amount` menor via DevTools/Postman é ignorada e corrigida, e o webhook valida o valor pago no Mercado Pago antes de aprovar o pedido.
- [ ] **Resiliência de Checkout PIX (Máquina de Estados: Recusa, Expiração & Recuperação)**: Tratamento visual explícito no modal quando o PIX for recusado pelo banco ou quando o tempo expirar (15 min). Ocultar QR Code vencido, parar polling e dar botões de 1-clique para 'Gerar Novo PIX' ou 'Pagar na Entrega (Cartão/Dinheiro)' sem perder o carrinho ([[02 - 💡 Ideias & Brainstorm]]).
- [x] **Correção de Edição & Atualização de Produtos**: Corrigido mapeamento de coluna (`updated_date` em vez de `updated_at`) no sanitizador de produtos e propagação de erros no Supabase, garantindo que alterações de preço (ex: R$ 0,01) e dados persistam imediatamente no banco.
- [ ] Upsell no Checkout: Sugestão de bebidas e sobremesas antes da confirmação final do pedido.
- [ ] Taxa de entrega calculada por distância/bairro ou valor fixo configurável.

### 💳 Cobrança & Monetização SaaS (Asaas)
- [x] Criar conta/ambiente Sandbox no Asaas e validar chave de API.
- [x] Testar criação programática de Cliente e Assinatura Recorrente via API.
- [x] Adicionar coluna de Mensalidade (Asaas), status e botão de copiar fatura no Painel **SuperAdmin** do Davi.
- [x] **Auto-Onboarding no Asaas**: Criar cliente, assinatura e link da 1ª fatura automaticamente ao cadastrar nova empresa no SuperAdmin.
- [x] **Autoatendimento Fiscal na Loja**: Permitir que o lojista atualize seu e-mail de faturamento, WhatsApp e CPF/CNPJ em Configurações > Minha Assinatura com sincronização direta no Asaas.
- [ ] Implementar webhook do Asaas para alterar automaticamente o status `is_active` da loja no Supabase.
- [ ] Definir régua de cobrança automática (Lembrete via WhatsApp e E-mail 3 dias antes do vencimento).

---

## 🔮 Fase 2: Backend Dedicado & Integrações
- [ ] **Disparador WhatsApp Automático**: Notificar o cliente quando o pedido sair para entrega ou for aprovado.
- [ ] **Validação de Telefone / WhatsApp & Trava Anti-Trote**: Verificação de DDD + nono dígito e envio de código OTP via WhatsApp (Evolution API / Z-API) para primeiros pedidos em dinheiro, evitando pedidos falsos sem gerar custo de SMS.
- [x] **PIX Dinâmico Automático**: Geração de QR Code PIX com confirmação automática de pagamento (Mercado Pago).
- [x] **Ferramental de IA Avançado (MCPs)**: Configuração do **Sentry MCP** e **Spec Workflow MCP** no `mcp_config.json` para observabilidade de produção e metodologia Spec-Driven Development.
- [ ] **Spooler Desktop de Impressão (.exe)**: Aplicativo local em background (Electron/Node Tray) para conectar com múltiplas impressoras térmicas via rede (TCP/IP na porta 9100) e USB, com roteamento de comandas (cozinha/bar/caixa) e impressão silenciosa sem navegador.
- [ ] **Ajuste de Tipografia & Contraste do Cupom Térmico (`PrintOrder.jsx`)**: Substituir tons de cinza por preto puro (#000), aplicar fonte encorpada de alta legibilidade para cabeças térmicas de 80mm e 58mm.

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
