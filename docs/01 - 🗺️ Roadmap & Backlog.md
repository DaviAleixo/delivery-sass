# 🗺️ Roadmap & Backlog Vivo

> **Nota Automática**: Este documento é alimentado e atualizado continuamente durante as nossas conversas de desenvolvimento. Toda nova tarefa, alteração de escopo ou conclusão de funcionalidade é registrada aqui.

---

## 🚀 Em Andamento / Foco Atual

- [x] 🔐 **Redesign da Tela de Login, E-mail Unificado do Lojista & Recuperação de Senha (`AdminLogin.jsx`, `SuperAdmin.jsx`)**:
  - [x] **Login Responsivo Claro (Mobile & Desktop)**: Novo visual com `/imgs/backgroundloginmobile.png`, `/imgs/backgroundlogin.png` e `/imgs/logo-painel.png`, card branco arredondado, coluna institucional no desktop e remoção da menção a `superadmin` do placeholder.
  - [x] **E-mail Unificado na Edição (`update_tenant_info` & `get_master_tenants`)**: Migration `20261110_unified_admin_email_and_recovery.sql` sincronizando `auth.users.email`, `auth.identities` e `tenants.email` ao editar um restaurante no [[SuperAdmin]].
  - [x] **Fluxo "Esqueci minha senha?" (`AdminLogin.jsx`)**: Envio de link de recuperação via Supabase Auth (`resetPasswordForEmail` usando código da loja + usuário ou e-mail) e tela de redefinição de senha no retorno (`PASSWORD_RECOVERY`).

- [x] 🎨 **Padronização Light & Ações de Edição no [[SuperAdmin]] (`SuperAdmin.jsx`)**:
  - [x] Corrigidos contrastes mistos de tema escuro/claro no cabeçalho, abas, tabela, drawer lateral 360° e modais de criação/edição/exclusão.
  - [x] Adicionado botão direto **Editar** na coluna de ações da tabela e campos de contato/cobrança (`email`, `phone`, `cpf_cnpj`, `subscription_status`) no modal de edição.

- [x] 🖨️ **Hardening da Fila de Impressão & Correção de Imports (`useFifoPrintQueue.js`, `VrummMenu.jsx`)**:
  - [x] Polling do Spooler (`127.0.0.1:9100`) e `syncPendingOrders` restritos ao painel administrativo autenticado (eliminando requisições no cardápio público), com janela de 12h para evitar reimpressão de pedidos de dias anteriores.
  - [x] Corrigidos imports ausentes (`useState`, `useEffect`, `Order`) em `VrummMenu.jsx`.

- [x] 🧹 **Remoção de Créditos de Desenvolvedor e Telefone nos Rodapés (`Menu.jsx`, `Footer.jsx`, `Home.jsx`, `VrummMenu.jsx`)**:
  - [x] Removida a linha `"Desenvolvido por Davi Aleixo | 31982607426"` de todos os rodapés do sistema (cardápio público, componente footer padrão, home institucional e cardápio temático).
  - [x] Rodapé centralizado de forma limpa, mantendo apenas o copyright oficial da loja (`© [Ano] [Nome do Restaurante]. Todos os direitos reservados.`).

- [x] 🖼️ **Centralização & Espaçamento Equidistante da Logo PedeMuleke na Sidebar (`Layout.jsx`)**:
  - [x] **Espaçamento Exato em Todos os Lados (`p-4` = 16px)**: O container da logo (`SidebarHeader`) agora possui padding uniforme e idêntico em cima, embaixo e nas laterais (`p-4`), garantindo a mesma quantidade de pixels em todas as bordas.
  - [x] **Alinhamento Centralizado (`mx-auto object-center justify-center`)**: A imagem da logo foi centralizada horizontal e verticalmente, eliminando o alinhamento preso à esquerda (`object-left`) e os vazios assimétricos.

- [x] 📱 **Responsividade & Redesign Elegante do Modal "Meu Perfil" no Mobile (`UserProfileSheet.jsx` & `sheet.jsx`)**:
  - [x] **Largura 100% no Mobile (`w-full sm:max-w-md`)**: Corrigido o `sheetVariants` global e o componente do modal para ocupar a largura total no celular (`w-full`), eliminando o aperto claustrofóbico de 75% (`w-3/4`) que deixava o conteúdo comprimido. Em telas maiores, mantém o formato de gaveta lateral elegante (`sm:max-w-md`).
  - [x] **Card do Cliente Limpo & Simplificado**:
    - Avatar circular perfeito de 48px (`w-12 h-12`) com letra centralizada e sombra suave, sem corte/bug de tamanho.
    - Removido o lápis sobreposto no avatar e o badge de "Conectado".
    - Mantido apenas o botão discreto de edição de nome ao lado do nome do cliente (`davi ✏️`).
    - Telefone com badge suave e sem quebras de linha (`font-mono whitespace-nowrap`).
  - [x] **Card de Cashback da Loja**:
    - Proporção equilibrada entre a taxa ("X% de volta") e a caixa de saldo acumulado ("Saldo acumulado: R$ X,XX").
    - Marca d'água de porcentagem sutil no fundo, tipografia fluida e rodapé com ícone de moedas sem corte de texto.
  - [x] **Lista de Endereços**:
    - Espaçamento confortável para nome do local e endereço completo com linha única (`line-clamp-1`).
    - Botões de ação (editar e excluir) com área de toque confortável (`w-8 h-8 rounded-lg`) e remoção de chevron redundante.
  - [x] **Store Info Sheet**: Ajustado também o modal de Informações da Loja (`StoreInfoSheet.jsx`) para responsividade full-width no celular.

- [x] 🎨 **Redesign do Cardápio Público Mobile Inspirado na Referência Visual (100% Concluído & Integrado)**:
  - [x] **Cards de Destaque 100% Dinâmicos & Auto-Responsivos**:
    - **Visibilidade Condicional Inteligente**: O card de Entrega só é exibido se o restaurante aceitar delivery e tiver taxa/bairros configurados; o card de Cashback só é exibido se o cashback estiver ativado com taxa > 0%.
    - **Grid Flexível (2 vs 1 vs 0 Cards)**:
      - Se ambos estiverem ativos: exibidos lado a lado em 2 colunas (`grid-cols-2`).
      - Se apenas um estiver ativo: o card ativo expande automaticamente ocupando a largura total dos dois (`grid-cols-1 w-full`), mantendo o design preenchido sem buracos.
      - Se nenhum estiver configurado/ativo: o container desaparece completamente sem deixar espaço vazio.
    - **Valores e Percentuais Reais**: A taxa de entrega exibe o frete mínimo real da loja (ou calculado para o endereço do cliente) e o cashback exibe a alíquota exata configurada no painel.
  - [x] **Pílulas de Categorias & Barra de Busca `rounded-full`**:
    - Abas em formato pill suave (`rounded-full`) com categoria ativa em verde escuro (`#046c4e`) e inativas em tom sóbrio `stone-100`.
    - Campo de busca `rounded-full` com ícone de lupa e fundo limpo.
  - [x] **Barra Superior**: Formatação executiva `[ 🛵 Entrega em até 60 - 80 min | 🟢 01:00 - 00:00 ]` com indicador luminoso e horários de funcionamento da loja.
  - [x] **Seção 'Mais Pedidos' (Top 7)**: Adicionado link direto `Ver todos >` no cabeçalho e preservado o carrossel horizontal de cards com foto 4:3 e botão verde circular `+`.
  - [x] **Cards de Produtos por Categoria (`ProductCard.jsx`)**:
    - Reestruturado fielmente à referência: Imagem quadrada com cantos arredondados (`rounded-2xl`) no lado **esquerdo**, nome, descrição e preço no **centro**, e botão circular verde `+` no lado **direito**.
    - Link `Ver todos >` incorporado ao título de cada categoria.
  - [x] **Modal de Detalhes do Produto (`ProductDetailModal.jsx`)**: Removido o botão residual de 3 pontinhos (`MoreVertical`) que ficava sobreposto debaixo do botão circular de fechar `✕`.

- [x] 🎯 **Validação Estrita de Bairro/CEP no Checkout & Gestão Clara de Atendimento (100% Concluído & Integrado)**:
  - [x] **Checkbox de Atendimento Direto no Painel (`DeliveryFeesTab.jsx`)**: O checkbox ao lado de cada bairro agora controla exclusivamente o atendimento (`active: true` vs `active: false`), eliminando a confusão de seleção em lote:
    - ☑️ **Marcado (Verde):** `✓ Entregamos Aqui` — Entrega liberada no checkout com a taxa definida.
    - ⬜ **Desmarcado (Cinza/Rosa):** `✕ Não Entregamos (Bloqueado)` — Entrega bloqueada no checkout com sugestão de Retirada no Balcão.
  - [x] **Persistência Imediata (Salvamento Automático)**: Ao marcar ou desmarcar qualquer bairro, a alteração é gravada imediatamente no banco de dados Supabase via `handleToggleNeighborhood`, exibindo notificação toast de confirmação sem exigir que o lojista procure o botão inferior de salvar.
  - [x] **Ações Rápidas em Lote**: Botões rápidos `[ ✓ Ativar Todos ]` e `[ ✕ Pausar Todos ]` com auto-save imediato, e gaveta retrátil `[ ⚡ Reajustar Valores em Lote ]` para atualizar o preço de todos os bairros filtrados de uma só vez.
  - [x] **Trava Educada & Conversão em Balcão no Checkout (`OrderModal.jsx`)**:
    - Se o cliente digitar um bairro desmarcado/não atendido, o sistema bloqueia o botão de finalizar entrega.
    - Alerta educado tanto logo abaixo do campo de Bairro quanto no resumo total do pedido: *"Bairro fora da rota do motoboy. Que tal retirar no balcão?"*.
    - Botão de 1 toque: `[ 🛍️ Mudar para Retirada no Balcão ]` que converte o pedido na hora, zera a taxa de entrega e libera a finalização sem atrito.

- [x] 📱 **Responsividade do Banner do Cardápio no Mobile (Exibição 100% Completa - Concluído)**:
  - [x] **Enquadramento & Altura Fixada em 170px**: O banner mobile agora mantém sua altura original elegante de `170px` (`h-[170px] sm:h-[195px] md:h-[230px]`) ocupando toda a largura, com enquadramento centralizado (`object-cover object-center`), preservando os cantos superiores arredondados e sem cobrir informações vitais da arte.
  - [x] **Layout Preservado**: Nenhuma outra parte do cardápio foi modificada.

- [x] 🍽️ **Salão & Mesas: Pagamento Parcial & Fechamento de Comanda Fracionado (100% Concluído & Integrado)**:
  - [x] **Pagamento Parcial & Amortização**: Permite registrar recebimentos fracionados na mesa (ex: conta de R$ 80,00 $\rightarrow$ recebe R$ 50,00 no Pix, o modal fecha automaticamente e a mesa **permanece aberta** com saldo devedor de R$ 30,00 até a quitação total).
  - [x] **Fechamento Automático de Modal com Retorno Imediato**: Ao clicar em "Abater R$ X,XX", o modal de recebimento fecha instantaneamente, retornando à comanda e ao salão com o saldo devedor atualizado em tempo real.
  - [x] **Atualização em Tempo Real na Comanda & Salão**:
    - O cabeçalho da comanda substitui o total estático por `Resta a Pagar: R$ X,XX` com subtítulo informativo de consumo total e valores já pagos.
    - O rodapé da comanda discrimina o subtotal de consumo, parcelas pagas e o saldo devedor restante em aberto.
    - No mapa de mesas do salão, o card exibe badge soberbo com `Pago: R$ X,XX • Resta a Pagar: R$ Y,YY`.
  - [x] **Link Visível para Concessão de Desconto**: O botão `+ Conceder desconto / cortesia do restaurante` estilizado em azul clássico (`text-blue-600 underline cursor-pointer`), com destaque visual claro de elemento clicável.
  - [x] **Trava Rigorosa de Liberação de Mesa**: A mesa só pode ser finalizada/desocupada se a conta estiver 100% quitada. O botão rápido de liberação bloqueia o fechamento acidental caso haja saldo devedor pendente, redirecionando o operador para o recebimento.
  - [x] **Múltiplos Meios de Pagamento Combinados**: Suporte nativo a pagamentos mistos na mesma conta (Dinheiro, Pix, Cartão Débito, Cartão Crédito e Vale Refeição) com atalhos de 1 toque para consumo individual por pessoa (`ordersByCustomer`) e cálculo dinâmico de troco.
  - [x] **Histórico Auditável da Sessão**: Tabela auditável em [[Tables]] com registro de cada parcela (horário, método de pagamento, pagador opcional, valor amortizado e botão de estorno/cancelamento de recebimento).
  - [x] **Pré-Conta & WhatsApp Auditados**: A impressão térmica não fiscal (80mm/58mm) e o resumo copiado para WhatsApp discriminam todos os pagamentos parciais recebidos, total amortizado e o saldo restante pendente.
  - [x] **Abertura Ultra Rápida da Mesa (Apenas Nome)**: Removido o campo de telefone/WhatsApp do modal de abertura no salão, deixando exclusivamente o Nome/Identificador opcional (com preenchimento automático de `Mesa X` caso em branco) para abertura instantânea em 1 clique sem atrito.
  - [x] **Máscara Monetária BRL (`CurrencyInput`)**: Aplicada máscara de moeda brasileira em tempo real nos campos do modal (Valor a Receber Agora, Valor em Dinheiro para Troco e Desconto Cortesia), formatando centavos e separadores de milhar automaticamente com foco ágil.
  - [x] **Reconciliação Contábil & Fechamento de Caixa**: Motor `shiftClosingCalculator.js` atualizado para desmembrar pagamentos combinados (`payment_details.payments`), atribuindo receita com exatidão a cada método no fechamento de turno e relatórios financeiros.

- [x] 📊 **Relatórios: Painel Consolidado de Métodos de Pagamento (100% Concluído & Integrado)**:
  - [x] **Painel Financeiro por Meio de Pagamento**: Adicionado em [[Reports]] o componente `PaymentMethodsReport.jsx` integrando gráficos e tabelas analíticas com a distribuição total de faturamento por método (Pix, Cartão de Crédito, Cartão de Débito, Dinheiro, Vale Refeição/Vouchers) por período (Hoje, 7 dias, 30 dias, Mês, Ano e Personalizado).
  - [x] **Indicadores Comparativos**: Cálculo em tempo real da quantidade de transações, ticket médio por método, % de representatividade no faturamento e % do volume de pedidos com totalizador consolidado no rodapé.
  - [x] **Cards de Destaque Executivo**: Indicadores de Canal Líder em Faturamento, Canal Líder em Frequência (volume) e Ticket Médio Geral.
  - [x] **Visualização Dupla (Donut + Barras de Participação)**: Gráfico de rosca Recharts interativo com tooltip executivo e barras horizontais de representatividade relativa.
  - [x] **Desmembramento Fracionado Automático**: Suporte nativo tanto para pedidos de balcão/delivery em método único quanto para comandas/mesas com pagamentos parciais fracionados (`payment_details.payments`).

- [x] 📄 **Central de Emissão de Relatórios Oficiais (PDF A4 & Planilha Excel CSV - 100% Concluído & Integrado)**:
  - [x] **Aba Dedicada em [[Reports]]**: Adicionada a 3ª aba principal "Central de Relatórios (PDF / Excel)", separando completamente o dashboard gráfico da emissão de relatórios formais para contabilidade e auditoria.
  - [x] **3 Modelos Especializados**:
    - _Balanço Financeiro & Contábil_: Faturamento líquido, canais de recebimento, taxas, cancelamentos e conciliação bancária vs dinheiro físico.
    - _Extrato Operacional de Pedidos_: Relação pedido a pedido com código, data/hora, cliente, canal (Mesa/Delivery/Balcão), forma de pagamento e total líquido.
    - _Curva ABC & Ranking de Produtos_: Relação de mix de vendas com ranking de itens mais pedidos, preço médio e representatividade por categoria.
  - [x] **Seleção de Período & Filtros de Precisão**: Atalhos para Hoje, Ontem, Últimos 7 dias, Últimos 30 dias, Este Mês, Mês Anterior, Este Ano e Intervalo Customizado, com checkboxes para incluir/excluir métodos, canais e perdas.
  - [x] **Modal de Prévia em Folha A4 Realista**: Prévia da folha timbrada oficial (proporção 210mm x 297mm) com cabeçalho (CNPJ, endereço, data de emissão), dados tabulados, tipografia monetária `font-mono`, rodapé de autenticidade e espaço para assinatura do responsável.
  - [x] **Motor de Impressão Vetorial A4 (`triggerA4Print`)**: Impressão nativa sem bibliotecas pesadas de rasterização, gerando PDF cristalino com texto selecionável e quebra de página automática.
  - [x] **Exportação para Microsoft Excel (`exportReportToCSV`)**: Geração instantânea de planilha `.csv` em padrão brasileiro (ponto e vírgula e BOM UTF-8 `\uFEFF`) para contadores e conciliação em planilhas.

- [x] 🍳 **KDS (Kitchen Display System): Revamp Visual & Fila Operacional (100% Concluído & Integrado)**:
  - [x] **Background Claro Executivo (`#F7F9F8`)**: Eliminado o dark mode escuro e gradientes pesados, padronizando a tela de cozinha no mesmo padrão visual corporativo e sóbrio do ERP PedeMuleke com cards brancos de alta legibilidade.
  - [x] **Priorização Visual por Urgência (Cronômetro FIFO)**: Fila ordenada cronologicamente (o mais antigo primeiro). Cronômetro inteligente em 3 faixas de tempo com alertas visuais: Normal (< 15 min), Atenção (15 a 25 min) e Urgente (> 25 min com badge pulsante).
  - [x] **Pedidos Prontos Mantidos na Cozinha**: Atendendo à regra operacional, ao marcar um pedido como "Pronto", ele **permanece visível** na coluna de preparo da cozinha com uma faixa verde destacada `✅ PRONTO NA COZINHA • Aguardando Retirada`, além de constar na coluna de expedição, evitando que a cozinha perca a visibilidade dos pratos no balcão de saída.
  - [x] **Leitura Instantânea de Itens & Observações**: Quantidades com tipografia `font-mono` em caixas de alto contraste, adicionais destacados com marcadores verdes e observações do cliente (gerais ou por item) em caixas de atenção âmbar/vermelhas com ícone de alerta para eliminar erros de montagem na chapa.
  - [x] **Ações Rápidas de 1 Toque**: Botões de transição rápida (Iniciar Preparo, Marcar Pronto, Despachar/Concluir e Voltar ao Preparo) e re-impressão manual na fila FIFO.
  - [x] **Modo Kiosk / TV Dedicada para Cozinha (`?kiosk=true`)**: Rota e layout sem barra lateral ou cabeçalho do ERP, preenchendo 100% da tela para Smart TVs e tablets de parede. Inclui relógio digital em tempo real no topo, atalho "📺 Modo TV Cozinha" no painel, botão de tela cheia (F11) e detecção automática para usuários com papel exclusivo de cozinha.

- [x] 🖼️ **Gerenciador de Banners: Ordenação Dinâmica & Gestão Visual (100% Concluído & Integrado)**:
  - [x] **Controle de Posição sem Digitação Manual**: Eliminado o antigo campo confuso de 'ordem: 0'. Cada card agora conta com botões intuitivos de 1 toque `[◀️ Antes]` e `[Depois ▶️]` com troca de posições fluida e persistência imediata no Supabase.
  - [x] **Identificação Clara de Capa Principal**: O 1º banner do carrossel recebe a badge destacada `⭐ 1º Capa Principal` com borda âmbar, além do atalho `[⭐ Virar Capa]` para promover qualquer promoção à primeira posição em 1 clique.
  - [x] **Toggle Rápido de Campanha (No Ar vs. Pausado)**: Switch nos cards com feedback visual em tempo real (badge `🟢 No Ar` vs `⏸️ Pausado` com efeito grayscale/opacidade) e mensagens toast informativas.

- [x] 💳 **Gateway de Cobrança Asaas: Mensalidade Customizável & Trava Ativa de Vencimento (100% Concluído & Integrado)**:
  - [x] **Valor de Mensalidade 100% Livre no SuperAdmin**: Campo numérico aberto `Valor da Mensalidade (R$)` nos modais de criação e edição de empresa, permitindo definir qualquer valor negociado por cliente (independente do plano técnico).
  - [x] **Emissão Automatizada no Asaas**: O valor customizado digitado pelo SuperAdmin é enviado diretamente à API do Asaas para gerar a assinatura recorrente e faturas no Pix/Boleto.
  - [x] **Trava Ativa por Data de Vencimento (`next_due_date`)**: Sistema agora verifica ativamente se a fatura está vencida (com 2 dias de tolerância de cortesia). Se a data expirar sem pagamento confirmado, o painel e o cardápio são bloqueados automaticamente com tela de pagamento do Asaas, sem depender exclusivamente da chegada de webhooks.

- [x] 🧹 **Higienização de Código & Resolução de Problemas no Terminal (Zero Erros no Linter & Typecheck - Concluído)**:
  - [x] **Regra de Hooks do React corrigida**: Eliminado retorno antecipado condicional que violava a ordem de execução de hooks em [`PizzaBuilderModal.jsx`](file:///c:/Users/Davi/Projetos/delivery/src/components/menu/PizzaBuilderModal.jsx).
  - [x] **Limpeza de Imports e Variáveis Não Utilizadas**: Executado `eslint --fix` e higienizadas todas as variáveis obsoletas em componentes e páginas do sistema.
  - [x] **Auditoria Completa do Projeto**: `npm run lint`, `npm run typecheck` e `npm run build` rodando com 0 erros e código 100% limpo na aba Problems do terminal.

- [x] 🎨 **Padronização Visual Executiva & Design Sério (ERP Padrão PedeMuleke - 100% Concluído)**:
  - [x] **SuperAdmin em Fundo Claro Executivo (`#F7F9F8`)**: O Painel Master e seus modais de criação/edição foram padronizados para o mesmo design corporativo limpo do restante do ERP (cards brancos, bordas sutis `stone-200`, tipografia escura e acentos verdes).
- [x] **Logo Oficial do Painel (`logo-painel.png`)**: Substituído o ícone e texto "PedeMuleke" da barra superior da sidebar pelo logotipo oficial em alta resolução (`/imgs/logo-painel.png`), com margens enquadradas e alinhamento visual proporcional.
  - [x] **Gestão de Caixa & PDV (`CashManagement.jsx`)**: Nomenclatura contábil padronizada (Suprimento, Sangria, Despesa), gaveta física sem espaços vazios, 4 KPIs sóbrios em tipografia `font-mono`, faturamento detalhado por método e modais limpos em `rounded-xl`.
  - [x] **Dashboard (`Dashboard.jsx`)**: Cards de KPIs executivos com tipografia monetária limpa `font-mono`, ranking de produtos mais vendidos sem emojis, badges sóbrias de status e eliminação de sombras e gradientes artificiais.
  - [x] **Salão & Mesas (`Tables.jsx`)**: Mapa de mesas corporativo, eliminação total de emojis, status com pontos sólidos de alta legibilidade, comanda limpa e carregador padronizado em `#047857`.
  - [x] **Clientes (`Clients.jsx`)**: Tabela corporativa com histórico de compras, métricas de LTV, ticket médio do cliente, saldo de cashback e busca rápida em `#F7F9F8`.
  - [x] **Relatórios (`Reports.jsx`)**: Painel financeiro analítico de faturamento, vendas dia a dia, evolução de faturamento, horários de pico, histórico de fechamento de turnos e detalhamento de categorias em `font-mono` sem emojis.
  - [x] **Configurações (`Settings.jsx`)**: Abas corporativas limpas em estilo segmented pills, formulários consistentes com `rounded-xl`, cards `border border-stone-200 shadow-2xs bg-white`, substituição de emojis por ícones Lucide vetoriais e feedback executivo.
  - [x] **Feedback de Carregamento Unificado**: Spinner circular padrão em `#047857` com fundo `#F7F9F8` padronizado em todas as telas centrais do sistema.

- [x] 💼 **Revamp da Gestão de Caixa (Design Sério Padrão ERP & Operação Descomplicada - Concluído)**:
  - [x] **Desmistificação & Didática**: Interface pensada para operadores sem experiência contábil prévia, com terminologia amigável (Troco Inicial, Adicionar Troco, Retirar Dinheiro, Pagar Despesa).
  - [x] **Remoção de Elementos 'Cara de IA'**:
    - Eliminados emojis infantis e excesso de cartões com cores saturadas.
    - Removidos gradientes escuros artificiais e efeitos de blur/glow.
    - Padronizados raios de borda (`rounded-xl` e `rounded-lg` discretos em vez de `rounded-3xl`) e tipografia corporativa de alta legibilidade.
  - [x] **Visão Executiva dos Meios de Pagamento**:
    - Tabela/grid consolidado e profissional com faturamento detalhado por canal: Pix, Cartão de Crédito, Cartão de Débito, Dinheiro e Vales, com quantidade de pedidos e % de representatividade das vendas.
  - [x] **Gaveta Física em Destaque**:
    - Separação clara entre dinheiro físico na gaveta da loja vs. dinheiro bancário/adquirente (Pix/Cartões).
    - Botão direto de 1 clique para exportação e envio do fechamento auditado para o WhatsApp do proprietário.
  - [x] **Histórico & Auditoria**: Consulta rápida de fechamentos passados sem poluição visual.

- [x] 🎁 **Módulo de Cashback & Fidelidade Multi-Tenant da Loja (100% Concluído & Integrado)**:
  - [x] **Store Credit Mercantil**: 100% bancado pela margem do restaurante, zero custo financeiro para o dono do SaaS.
  - [x] **Isolamento Multi-Tenant**: Saldo amarrado a `(tenant_id, phone)`. O saldo acumulado na Hamburgueria A só pode ser resgatado na Hamburgueria A.
  - [x] **Experiência 100% Nativa na Web**: Sem custos ou dependência de envio de mensagens pagas por WhatsApp API.
  - [x] **Exclusivo para Clientes Cadastrados**: Apenas clientes com conta verificada acumulam e abatem cashback.
  - [x] **Isca & Propaganda para Clientes Não Cadastrados**: Exibição de tag com valor de cashback nos produtos e banner chamativo de conversão no checkout incentivando o cadastro em 10 segundos.
  - [x] **Travas de Segurança Anti-Prejuízo**: Validade configurável em dias com expiração automática (`cashback_validity_days`), teto máximo de desconto por pedido (`cashback_max_discount_percentage`), e incidência restrita a produtos (nunca sobre taxa de entrega).
  - [x] **Painel de Configurações do Lojista**: Aba Geral em `Settings.jsx` com switch liga/desliga, % de retorno (1% a 30%), dias de validade e % máx de abatimento.
  - [x] **Checkout & Resumo Financeiro**: Abatimento com switch 1-clique em `OrderModal.jsx`, recálculo dinâmico do total e registro automático de transações.
  - [x] **Liberação de Saldo no Status "Entregue" & Regra Segura de Abatimento**:
    - O novo cashback acumulado em um pedido é creditado no saldo disponível da carteira no instante em que o pedido é marcado como **"Entregue"** (concluído).
    - Durante a preparação/entrega, o bônus novo é uma previsão e não pode ser gasto prematuramente.
    - O cliente pode abater livremente o saldo pré-existente legítimo (ex: os R$ 4,00 conquistados em compras anteriores já entregues) mesmo enquanto aguarda um novo pedido.
    - Se a loja cancelar o pedido antes da entrega, o bônus pendente é anulado e o saldo utilizado no pagamento é devolvido via `revert_order_cashback`.
    - **Estorno Obrigatório e Automático de PIX no Cancelamento**: Em pedidos pagos via Pix online, o estorno de 100% é mandatório (sem chave opcional), executado em tempo real com comprovante e modal com barra de rolagem visível e responsiva.
  - [x] **Painel de Pedidos & Impressão Térmica**: `OrderCard.jsx` e `PrintOrder.jsx` detalham desconto de cashback e cashback gerado na comanda da cozinha e entregador.
  - [x] **Banner de Topo no Cardápio (UX Persuasiva & Isca de Cadastro)**: Banner verde exatamente no modelo solicitado exibido entre o topo da loja e os banners carrossel. Mostra 'Cashback de X% ativado' para clientes cadastrados e 'Cashback de X% disponível: Crie sua conta para ganhar...' para visitantes, abrindo com 1 toque o modal de perfil e autenticação.
  - [x] **Saldo de Cashback no Modal 'Meu Perfil' & Botão na Navbar**: Card de saldo de cashback adicionado em `UserProfileSheet.jsx` (mostrando o valor mesmo zerado em R$ 0,00, a taxa % e a validade), acompanhado de botão de acesso rápido a perfil na Navbar do cliente.
  - [x] **Abertura e Fechamento 100% Manual (Sem Relógio Automático)**:
    - Removido qualquer mecanismo de abertura ou fechamento automático por relógio/horários pré-programados (`isStoreOpen`).
    - Excluída a aba obsoleta de "Horários de Funcionamento" em `Settings.jsx`, eliminando configurações desnecessárias de dias da semana e relógios que geravam confusão.
    - Atualizados todos os pontos visuais do cardápio do cliente ([`StoreInfoSheet.jsx`](file:///c:/Users/Davi/Projetos/delivery/src/components/menu/StoreInfoSheet.jsx) e [`Menu.jsx`](file:///c:/Users/Davi/Projetos/delivery/src/pages/Menu.jsx)): o card "Funcionamento Das 01:00 às 00:00" foi substituído pelo indicador ao vivo **Status da Loja: Aberto no momento / Fechado no momento**.
    - O controle de abertura e fechamento fica 100% nas mãos do lojista via botão mestre no painel administrativo (`manual_store_open`).
    - A loja só abre quando o lojista clica em "Abrir Loja", e só fecha quando ele clica em "Fechar Loja", eliminando pedidos surpresa em dias que a loja não abrir e evitando fechamento indesejado no meio de turnos estendidos.
    - O cardápio respeita o estado manual em tempo real exibindo "Aberto agora" ou "Fechado no momento".
  - [x] **Auto-Finalização por Tempo (Fallback Inteligente de 2 Horas)**:
    - Se um pedido for despachado (`status = 'enviado'`) e passar mais de 2 horas sem que o atendente clique em 'Entregue', o sistema o marca automaticamente como `entregue` via RPC `auto_deliver_stale_orders`.
    - O cashback do cliente é liberado de forma 100% segura e automática, garantindo que o cliente nunca perca o benefício caso o restaurante esqueça de atualizar o status.
    - Sincronização executada tanto no painel administrativo (`Orders.jsx`) quanto no cardápio do cliente (`Menu.jsx`).
  - [x] **Consistência de Preços nos "Últimos Pedidos" (RecentOrdersRow)**:
    - O carrossel de repetição rápida de pedidos agora exibe sempre o subtotal real e atualizado dos produtos (itens + complementos), desvinculado de taxas de entrega passadas.
    - O frete é sempre calculado e cobrado em tempo real no checkout com base nas regras ativas da loja (bairro, taxa fixa ou frete grátis), eliminando discrepâncias de preço no cardápio.
  - [x] **Banco de Dados**: Migração SQL executada e validada em Homologação (`staging`) e Produção (`jqwtnzdsaivbjudvjhld`). ([[02 - 💡 Ideias & Brainstorm]])

- [x] 🛡️ **Governança Estrita de Planos & Isolamento de Funcionalidades no Painel (Concluído)**:
  - [x] Separação nítida dos 3 perfis de contratação: **Plano Visual** (`showcase`), **Plano Autoatendimento** (`table`) e **Plano Completo** (`basic`/`custom`).
  - [x] Sincronização automática no Supabase via RPCs `create_new_tenant` e `update_tenant_info`: define `salon_mode`, `accepts_delivery` e `accepts_takeaway` no momento da criação ou edição.
  - [x] No **Plano Visual** (Vitrine / Cardápio Digital sem Pedidos):
    - O painel exibe estritamente **Produtos**, **Categorias**, **Complementos**, **Banners** e **Configurações**.
    - Oculta e barra rotas de Pedidos, KDS, PDV, Caixa, Salão, Entregadores, Clientes, Cupons e Relatórios.
    - Desativação completa do alarme sonoro de campainha e do polling de rede de novos pedidos.
    - Login administrativo e Impersonate do SuperAdmin redirecionam diretamente para a tela de Produtos.
    - Ocultação de abas de frete, bairros e formas de pagamento nas configurações.
  - [x] No **Plano Autoatendimento** (QR Code de Mesas, KDS & Salão):
    - Painel habilitado para Salão & Mesas, KDS Cozinha, Pedidos de Mesa, PDV Balcão e Caixa.
    - Oculta o módulo de Entregadores/motoboys e configurações de frete/raio de entrega.
  - [x] No **Plano Completo**: Todas as funcionalidades liberadas (Delivery, Balcão e Salão).
  - [x] Proteção dura de rotas em `Layout.jsx`: interceptação imediata de tentativas de acesso via URL direta fora do plano contratado com toast informativo. ([[02 - 💡 Ideias & Brainstorm]])

- [x] 🚨 **Ambiente de Homologação & Pipeline Staging ➔ Produção (Concluído & 100% Isolado)**:
  - [x] Branch local e remota `staging` criada e isolada da `main` no GitHub.
  - [x] Documentação e template de variáveis `.env.example` versionado com separação de ambientes (`production` | `staging` | `development`).
  - [x] Badge visual inteligente `StagingBanner.jsx` integrado no frontend (ativo apenas quando o ambiente for staging/preview).
  - [x] Tag de ambiente configurada no Sentry (`environment: staging/production`) para evitar poluição de erros entre ambientes.
  - [x] Deploy Preview automático no Cloudflare Pages (`https://staging.delivery-sass.pages.dev`).
  - [x] Banco de Homologação definido no projeto `delivery` (`zecuwijuiqsaoeafonsv`).
  - [x] Novo banco de Produção `PedeMuleke` (`jqwtnzdsaivbjudvjhld`) provisionado com sucesso: 100% das 23 tabelas, 31 RPCs, triggers, 60 RLS policies e SuperAdmin vinculados. ([[02 - 💡 Ideias & Brainstorm]])
- [x] ☁️ **Armazenamento de Mídia no Cloudflare R2 (Concluído & Ativo)**: Bucket `pedemuleke-media` configurado, Edge Function `r2-upload` criada e deployada no Supabase, credenciais S3 integradas com segurança, pipeline WebP conectado em `Core.js` com CDN global (`r2.dev`) e tráfego ilimitado (zero egress).
- [x] 🛡️ **Backup Diário Automatizado no Cloudflare R2 (Zero Custo no Supabase Free)**: GitHub Actions diário (`.github/workflows/daily-backup.yml`) às 04:00 BRT com dump master PostgreSQL (`pg_dump` compactado em `.sql.gz`), exportação estruturada em JSON por empresa (`scripts/export-data.js` em `backups/por_empresa/<slug>/`) e sincronização direta no Cloudflare R2 com retenção automática de 30 dias.
- [x] 📦 **Hospedagem de Binários Pesados no Cloudflare R2 CDN**: `pedemuleke-spooler.zip` (31 MB) transferido do bundle estático para o Cloudflare R2 CDN (`downloads/pedemuleke-spooler.zip`), resolvendo em definitivo o limite de 25 MiB por arquivo do Cloudflare Pages e acelerando deploys da aplicação.
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
- [x] **Otimização de Log Ingestion & Polling Invisível (Redução de 80% no Supabase)**: Ajuste dos intervalos de polling global no `Layout.jsx` (de 5s para 25s) e no `Tables.jsx` (de 3s para 15s), implementação de detecção de aba inativa via `document.visibilityState` (pausando consultas com aba em segundo plano e reativando no foco com `visibilitychange`), eliminação de recargas redundantes de dados estáticos (produtos/categorias) e resolução definitiva dos erros de SQL que geravam linhas de log no PostgreSQL. ([[02 - 💡 Ideias & Brainstorm]])

### 🛎️ Experiência de Pedidos & KDS

- [x] **Import de getPaymentBrandInfo em OrderCard**: Adicionada a importação de `getPaymentBrandInfo` de `@/constants/paymentBrands` em [[src/components/admin/orders/OrderCard.jsx]], sanando o erro `ReferenceError: getPaymentBrandInfo is not defined` ao exibir pedidos com bandeira de cartão salva.
- [x] **Correção no Checkout do Cliente (isCardOrMeal ReferenceError & isDineIn Temporal Dead Zone)**: Adicionada a declaração prévia de `isDineIn` no topo dos cálculos financeiros e a definição das bandeiras de cartão/vale em [[src/components/menu/OrderModal.jsx]], eliminando completamente os erros de `ReferenceError: Cannot access 'isDineIn' before initialization` e `isCardOrMeal is not defined`.
- [x] **Sincronização em Tempo Real do Badge Lateral de Pedidos**: O badge numérico da barra lateral em [[src/Layout.jsx]] agora reflete fielmente a quantidade de pedidos pendentes mesmo quando o atendente está visualizando a tela de Pedidos, ouvindo o evento global emitido pelo [[src/utils/soundAlert.js]].
- [x] **Diferenciação Visual de Pagamento no Rastreamento (`MyOrders`)**: Corrigido o banner comemorativo em [[src/pages/MyOrders.jsx]] para só exibir "Pagamento PIX" quando o método for de fato PIX; para cartões (crédito/débito) e dinheiro, exibe "🎉 Pedido Confirmado pela Cozinha!" com o badge correspondente da forma de pagamento.
- [x] **Recarga Ativa do Saldo de Cashback no Perfil (`UserProfileSheet`)**: A aba "Meu Perfil" agora reconsulta o saldo no banco a cada abertura do sheet (`[open]`), garantindo exibição em tempo real do cashback creditado.
- [x] **Ciclo de Vida de Pedidos & KDS**: Botões de "Confirmar", "Avançar Status" e "Cancelar" com persistência no Supabase, RLS ajustado e toasts instantâneos.
- [x] **Sanitização Inteligente em Updates Parciais**: Atualizações de status não zeram campos nem mutam dados de itens/cliente.
- [x] **Alerta Sonoro Inteligente & Repetição Contínua (KDS & Pedidos)**: Campainha ativa por padrão. Detecção instantânea de qualquer pedido pendente existente ao carregar ou ao religar o som (mesmo pedidos antigos), liberação de áudio para inspeção de lojas em Modo SuperAdmin, e centralização exclusiva do controle no topo da tela de Pedidos (removido botão duplicado da barra lateral).

- [x] **Canais de Atendimento Flexíveis (Delivery vs Retirada)**: Configuração na aba Geral e no SuperAdmin com persistência no Supabase (`accepts_delivery` e `accepts_takeaway`), permitindo ao lojista desativar entrega ou retirada. No checkout, se for apenas retirada, abre direto sem abas, com taxa zero e ocultando campos de endereço.
- [x] **Redesign Completo da Tela de Pedidos (Identidade Visual Fiel à Referência)**: Barra horizontal de status segmentada e conectada (Pendentes com borda e badge verdes, Confirmados, Preparando, Enviados, Entregues e Cancelados), cabeçalho com cards rápidos de Entrega Média (editável inline), Fechamento de Caixa e QR Code das Mesas, barra de filtros com dropdowns interativos para período (Turno Aberto, Hoje, Ontem, Semana, Histórico), indicador de Turno Ao Vivo, seletor de Canais e busca instantânea, além de Empty State premium com ilustração vetorial 3D isométrica da caixa de papelão aberta e cartões de pedido flutuantes.
- [x] Filtro por tipo de pedido no painel de pedidos (Delivery vs Retirada no Balcão vs Mesa/Salão via seletor de canais).
- [x] **Impressão rápida do comprovante do pedido (layout otimizado para cupom não fiscal de 80mm/58mm)**: Integrada via `PrintOrder.jsx` e Desktop Spooler silencioso.
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
- [x] **Abertura/Fechamento Manual da Loja Blindada (Dropdown na Navbar)**: Corrigido erro PGRST205 (tabela `public.settings` inexistente no Supabase) mapeando transparentemente para a tabela `public.tenants` e atualizando a RPC `update_tenant_settings` para suportar `manual_store_open`, `manual_override_date` e `delivery_time`. Pílula na Top Navbar com Dropdown interativo: permite ao lojista abrir ou fechar a loja manualmente em 1-clique a partir de qualquer tela, restaurar para o horário automático e sincronizar instantaneamente o status com o cardápio dos clientes. ([[02 - 💡 Ideias & Brainstorm]]).
- [x] **Impressão & KDS Dinâmico por Setor de Produção (Cozinha, Bar, Pizzaria, Caixa)**: Tabelas `production_sectors` (`allowed_channels`, `print_on_delivery`) e `print_jobs` no Supabase (`categories.sector_id` + override opcional em `products.sector_id`), triggers `fn_orders_auto_accept_delivery` e `fn_orders_sync_print_jobs`, aba **Setores & Impressão** em `Settings.jsx` (`ProductionSectorsTab.jsx`), chavinha **Aceitar Delivery Sozinho** em `GeneralSettingsTab.jsx`, abas dinâmicas e **links diretos copiáveis por seção** no KDS (`?sector=<slug>&kiosk=true`), impressão fracionada por setor/canal e modo **Senha Curta** (`short_receipt`) via `useFifoPrintQueue.js` + `PrintOrder.jsx`, **Etiqueta / Via do Motoboy** no despacho (`DispatchOrderModal.jsx`), **Etapa 2 do Spooler Autônomo (navegador fechado)** com RPCs `spooler_pair`/`spooler_poll`/`spooler_ack` e pareamento em nuvem em `SpoolerManagerModal.jsx`, autoatendimento/mesa entrando direto em `confirmado`, atalho de despacho direto em `OrderCard.jsx`, e hardening CORS + `pedemuleke-spooler.exe` & `pedemuleke-spooler.zip` recompilados ([[02 - 💡 Ideias & Brainstorm]]).

### 🛍️ Cardápio & Vendas

- [x] **Formas de Pagamento Modulares (Dinheiro, Crédito, Débito, Alimentação e PIX Online)**: Painel em Configurações para ativar Dinheiro (com troco), Cartão de Crédito, Débito e Vale Refeição na Maquininha, e PIX Online Mercado Pago com sincronização em tempo real no checkout.
- [x] **Persistência Blindada de Formas de Pagamento**: Resolução dos problemas de RLS com RPC `update_tenant_payment_methods` e `update_tenant_settings`, unificação do alias `vruum-burguer`/`vrumm` e isolamento dos formulários de configurações para nunca perder o estado ao navegar entre abas ou telas.
- [x] **PIX Online Automático Mercado Pago**: Edge Function `mercadopago` no Supabase com geração de QR Code Copia e Cola, polling de 3s e confirmação automática do pedido em tempo real. Sanitização rigorosa de `payer.email` com TLDs públicos válidos e mensagens amigáveis de instrução para cadastro de chave Pix.
- [x] **Proteção de Fila para PIX Online (Sem Pedidos Fantasmas)**: Pedidos com PIX Online entram como `aguardando_pagamento` (invisíveis para a cozinha). Quando o PIX é aprovado, o pedido é atualizado para `status: "pendente"` e `payment_status: "paid"`, caindo diretamente na aba **Pendentes** do painel do restaurante com badge verde `✓ PAGO VIA PIX` e tocando o alarme sonoro para a equipe aceitar. Se o cliente fechar sem pagar, o rascunho é descartado.
- [x] **Blindagem Zero-Trust de Pagamentos (Anti-Tampering no Servidor)**: Desenvolvido via Spec Workflow (`.specs/payment-security`). A Edge Function `mercadopago` (v5) recalcula o valor oficial consultando o catálogo do Supabase (`products`, `product_additionals`, `tenants.delivery_fee` e `coupons`). Qualquer tentativa de forjar `amount` menor via DevTools/Postman é ignorada e corrigida, e o webhook valida o valor pago no Mercado Pago antes de aprovar o pedido.
- [x] **Resiliência de Checkout PIX (Máquina de Estados: Recusa, Expiração & Recuperação)**: Tratamento visual explícito no modal quando o PIX for recusado pelo banco ou quando o tempo expirar (15 min). Ocultar QR Code vencido, parar polling e dar botões de 1-clique para 'Gerar Novo PIX' ou 'Pagar na Entrega (Cartão/Dinheiro)' sem perder o carrinho ([[02 - 💡 Ideias & Brainstorm]]).
- [x] **Seleção de Bandeiras de Cartão & Vales na Maquininha (Físico / Entrega / Balcão / PDV)**: Catálogo oficial modular de bandeiras (`src/constants/paymentBrands.js`), configuração pelo lojista das bandeiras aceitas em Cartão (Visa, Mastercard, Elo, Hipercard, Amex) e Vales-Refeição/Alimentação (Alelo, Sodexo/Pluxee, Ticket, VR, Caju, Flash, Eva, Swile) em Configurações > Formas de Pagamento com persistência no Supabase (`tenants.payment_methods`), seleção intuitiva no checkout do cliente (`OrderModal.jsx`) para o motoboy levar a maquininha credenciada correta, badge visual no painel de pedidos (`Orders.jsx` / `OrderCard.jsx`), destaque na via de impressão térmica (`PrintOrder.jsx`) e no formatador do Spooler Desktop Local (`ticketFormatter.js`), além de seleção ágil no PDV (`PDVPaymentModal.jsx`). ([[02 - 💡 Ideias & Brainstorm]])
- [x] **Card de Frete Dinâmico no Cardápio (Conforme Referência Visual & Sem Conta)**:
  - [x] **Card Visual Fiel à Referência**: Card verde suave (`#F0FDF4` com borda `#D1E9DF` e tipografia `#046c4e`), posicionado estrategicamente logo abaixo da barra de busca e imediatamente acima de 'Mais Pedidos'.
  - [x] **Comportamento Dinâmico para Visitantes (Sem Conta)**: Em lojas com cobrança por bairros (`delivery_fee_type === 'neighborhood'`), calcula dinamicamente a taxa mínima dos bairros ativos e exibe `Entrega a partir de R$ X,XX` com subtítulo `Valor calculado conforme seu endereço`. Para taxas fixas, exibe `Entrega: R$ X,XX` (ou `Entrega Grátis`).
  - [x] **Comportamento Dinâmico para Clientes com Endereço Salvo**: Reconhece o endereço padrão do cliente (via `currentUser` ou cache local) e cruza o bairro com `delivery_neighborhoods` usando `matchNeighborhood()`. Exibe o valor exato: `Entrega: R$ X,XX • [Bairro]` e `Valor calculado para seu endereço cadastrado`.
  - [x] **Alerta Suave para Bairros Fora do Raio**: Caso o bairro cadastrado não seja atendido e a política da loja seja bloquear, orienta: `Entrega indisponível para seu bairro`.
  - [x] **1-Toque para Gerenciar Endereço**: Ao clicar no card, abre o modal `UserProfileSheet` para o cliente cadastrar ou alterar seu endereço e conectar conta via WhatsApp OTP.
  - [x] **Condições de Exibição Inteligentes**: Oculta automaticamente se o cardápio for acessado por QR Code de mesa (`urlMesa`), se a loja não fizer entregas (`accepts_delivery === false`) ou for plano apenas salão (`table_only`), ou enquanto o usuário digita na busca. ([[02 - 💡 Ideias & Brainstorm]])
- [ ] **Validação Estrita de Bairros por CEP & Frete no Checkout (Estilo iFood/Aiqfome)**: Bloqueio automático e imediato de compra no checkout caso o bairro do CEP não seja atendido pela loja (tanto para novos clientes quanto para clientes com endereço salvo), com orientação para retirada no balcão. ([[02 - 💡 Ideias & Brainstorm]])
- [x] **Cancelamento Profissional de Pedidos com Estorno Automático PIX Mercado Pago & Reversão de Cashback (Concluído)**:
  - [x] **Exclusividade no Painel Administrativo de Pedidos**: O KDS (Cozinha) permanece estritamente para o preparo e despacho pela cozinheira (sem botão de cancelamento). Apenas o operador no painel de Pedidos pode cancelar.
  - [x] **Modal Profissional de Cancelamento (`CancelOrderModal.jsx`)**: Seleção de motivos padronizados (Falta de ingrediente, Cliente solicitou, Endereço fora da rota, etc.) e campo de justificativa para histórico.
  - [x] **Estorno Automático via Pix Mercado Pago (`refund_payment`)**: Endpoint oficial do Mercado Pago integrado na Edge Function. Devolve o dinheiro instantaneamente na conta bancária de origem do cliente com switch e controle de valor.
  - [x] **Reversão Atômica de Cashback (`revert_order_cashback`)**: Devolve o saldo de cashback utilizado pelo cliente de volta à sua carteira (`refund`) e anula/estorna o bônus de cashback que a compra cancelada havia gerado (`reversal`), com proteção contra duplicidade.
  - [x] **Liberação de Cupons de Uso Único**: Desvincula e reativa automaticamente cupons aplicados no pedido cancelado.
  - [x] **Banco de Dados (Staging & Produção)**: Migração `20261029_cancel_order_refund_system.sql` aplicada em ambos os ambientes com colunas de auditoria (`cancel_reason`, `cancelled_at`, `pix_refund_status`, `pix_refund_id`, `pix_refund_amount`). ([[02 - 💡 Ideias & Brainstorm]])
- [ ] **Pagamento Online com Cartão de Crédito (Tokenização PCI-DSS, 3DS 2.0 & Bandeiras Visa/Master/Elo)**: Checkout transparente via SDK seguro do gateway (Mercado Pago ou Pagar.me), validação matemática instantânea com Algoritmo de Luhn e detecção de bandeira por BIN, tokenização client-side sem nunca salvar dados sensíveis de cartão no banco, e proteção anti-chargeback com 3DS 2.0. ([[02 - 💡 Ideias & Brainstorm]])
- [x] **Padronização de Timezone Oficial (Brasília America/Sao_Paulo)**: Garantir que o cálculo de loja aberta/fechada (`isStoreOpen`) e a impressão térmica não dependam do fuso/relógio do dispositivo do cliente, e blindar o turno noturno que ultrapassa a meia-noite ([[02 - 💡 Ideias & Brainstorm]]).
- [x] **Correção de Edição & Atualização de Produtos**: Corrigido mapeamento de coluna (`updated_date` em vez de `updated_at`) no sanitizador de produtos e propagação de erros no Supabase, garantindo que alterações de preço (ex: R$ 0,01) e dados persistam imediatamente no banco.
- [x] **Plano Vitrine & Autoatendimento de Salão / Mesas (Sem Delivery & Sem Motoboys)**:
  - **Plano Vitrine QR Code (R$ 49/mês)**: Cardápio digital informativo (sem carrinho/pedidos). Oculta carrinho, botões de adicionar e abas operacionais de entrega no painel (Pedidos, KDS, Entregadores, PDV, Relatórios, Clientes, Cupons). Permite cadastrar produtos, categorias e grupos de complementos/adicionais normalmente.
  - **Isolamento de Cache de Complementos**: Blindagem rigorosa de `ComplementGroup` e `ProductComplementGroup` no `storage.js`, garantindo que uma nova empresa comece 100% zerada (`[]`) e que grupos como "EXTRA" criados em outra empresa nunca vazem nem temporariamente.
  - **Plano Salão & Mesas (R$ 79/mês)**: Autoatendimento exclusivo via QR Code na mesa (`?mesa=X`), dispensando entregadores, taxas de entrega e endereços de clientes. O pedido cai direto no caixa/KDS com campainha e impressão térmica `PARA MESA (Mesa X)`.
  - **Checkout de Mesa 100% Responsivo no Celular & Zero Atrito (Concluído)**: Eliminação completa da exigência de telefone/WhatsApp, endereço e métodos de pagamento no autoatendimento na mesa. Formulário simplificado e nativo com identificador visual da mesa (ícone `UtensilsCrossed` sem emojis), ocultação automática de abas/seletores de canal (mesa é a única opção), nome/apelido opcional para o garçom, observações para a cozinha, aviso transparente de "Pagamento no Caixa ao finalizar" e envio instantâneo com botão limpo ("Enviar Pedido para a Cozinha", sem emojis).
  - **Experiência Limpa do Cardápio por QR Code da Mesa**: Ocultação da barra superior de horários/aberto-fechado ao entrar pelo QR Code da mesa (`urlMesa`), ocultação de botão de WhatsApp e de banners de rastreamento de entrega (`activeGuestOrder`), e substituição do fluxo de pós-pedido por um modal elegante de "Pedido Confirmado na Mesa" direto na tela com lista de itens, total e lembrete de acerto no caixa, com botão de continuar no cardápio sem transições indesejadas.
  - **Governança de Planos (Removido Seletor Manual do Lojista)**: O seletor manual de modo foi removido de Configurações > Geral da loja; o escopo do cardápio e funcionalidades é governado estritamente pelo plano contratado (`tenant.plan`) gerenciado no SuperAdmin/Asaas, impedindo alterações inconsistentes pelo lojista. ([[02 - 💡 Ideias & Brainstorm]])
- [x] **🍽️ Gestão de Salão & Mesas / Comandas Digitais (Dine-in POS & QR Code)**:
  - **Grid Visual do Salão**: Dashboard em tempo real com cartões inteligentes de status: Livres 🟢, Ocupadas 🟡 e Pré-Conta Solicitada 🔵, com contadores e consumo aberto total em R$.
  - **Sincronização Automática PDV ➔ Salão & Mesas**: Ao selecionar "Mesa / Salão" no PDV e lançar os itens com cliente, a mesa física muda automaticamente para "Ocupada" no banco e em todas as telas abertas em tempo real.
  - **Visualização Detalhada do que Cada Mesa Consumiu**: Ao clicar sobre a mesa ocupada, a Comanda abre com aba dedicada "O que a Mesa Consumiu", consolidando todas as quantidades acumuladas por produto (ex: 2x Burguer, 1x Suco), preços unitários e subtotais, além da aba de histórico cronológico por rodadas.
  - **Prévia de Consumo no Card do Salão**: Os cards de mesas ocupadas no grid exibem instantaneamente os primeiros itens consumidos e o total de produtos sem precisar abrir o modal.
  - **Liberação Rápida & Liquidação de Conta (Desocupação Instantânea 0ms)**: Ao clicar em "Liquidar e Liberar Mesa" ou "Liberar Mesa", a mesa volta imediatamente para Livre 🟢 sem delay (transição de estado otimista), fecha a comanda, invalida os caches de memória (`invalidateCache`), desvincula e marca pedidos como pagos/entregues no Supabase e impede que pedidos já quitados continuem somando como consumo aberto.
  - **Pré-Conta com Detalhamento por Pessoa & Impressão Térmica (80mm/58mm)**: Emissão e conferência de mesa com extrato individual por pessoa (o que cada um pediu com subtotal e 10%), aba de itens consolidados, resumo de pagamento individualizado, botão de cópia formatada para WhatsApp e integração direta com o Spooler Desktop Local ou navegador (sem divisão forçada por número fixo de pessoas).
  - **Displays de Mesa com QR Code em 1 Clique**: Gerador de placas/displays de mesa para impressão com recorte, contendo logotipo, número da mesa e QR Code direto (`?mesa=X`) para autoatendimento.
  - **Geração de Mesas em Lote**: Criação sequencial automática (5, 10, 20 ou 30 mesas) para configuração rápida do restaurante.
  - **Comanda Clean & Separação de Pedidos da Mesa por Pessoa**: Redesign completo do modal de comanda em estética clean (fundo suave, cabeçalho claro e sem blocos escuros pesados), introdução da aba principal **Por Pessoa** discriminando exatamente o que cada cliente individualmente consumiu na mesa, com subtotal individual em R$, avatar estilizado com iniciais, porcentagem do consumo total e valor individual sugerido com 10%, além de campo dedicado no modal de Lançar Itens com pílulas de atalho em 1 toque para pessoas já presentes na mesa.
  - **Cronômetro ao Vivo & Giro de Mesa (Tempo Aberta + Último Pedido)**: Cards das mesas e cabeçalho da comanda com telemetria em tempo real atualizada a cada 30s. Exibe há quanto tempo a mesa está aberta (`⏱️ Aberta há Xm`) e badge inteligente do último pedido com 3 estágios de cor: Verde (`🍽️ Pedido há < 25m`), Âmbar (`⏳ Sem pedir há 25-45m` - oportunidade de novas rodadas/sobremesa) e Vermelho (`⚠️ Parada há > 45m` - pronta para fechar/liberar), além de aviso suave para mesas recém-abertas sem pedidos (`⚡ Aguardando 1º pedido`).
  - **Abertura de Mesa sem Atrito (Sem Trava de Lotação/Pessoas)**: Removida a exigência/seletor de quantidade de pessoas na abertura da mesa. O garçom abre a mesa instantaneamente apenas informando o cliente/identificador opcional, e divisões de conta acontecem organicamente pelas pessoas que de fato pediram itens.
  - **Taxa de Serviço de Mesa Configurável (Ativar/Desativar e % Customizada)**: Na aba Configurações Gerais, o lojista ativa ou desativa com 1 clique a cobrança de taxa de serviço no Salão (`table_service_fee_enabled`) e define o percentual desejado (`table_service_fee_rate`, padrão 10%). Quando desativado, o total da comanda, o cupom térmico impresso, o resumo no WhatsApp e o modal de recebimento liquidam a mesa 100% livre de taxa de serviço.
  - [x] **Gráfico de Valor Acumulado das % de Serviço nos Relatórios (Condicional se Ativo)**: Na tela de Relatórios (`Reports.jsx`), inclusão de card analítico dedicado (`ServiceFeeAccumulatedChart.jsx`) com Recharts (`ComposedChart`) exibindo a curva acumulada (Running Total em R$) e barras diárias/horárias das taxas de serviço retidas. Apresenta 3 mini-KPIs (Total Acumulado de Serviço, Comandas c/ Serviço e Média por Mesa) e badge dinâmico da taxa vigente. Renderizado de forma inteligente: visível quando a taxa de serviço estiver ativa nas configurações ou quando houver receita de serviço registrada no período selecionado.
  - _Nota: App do Garçom (PWA de bolso) e Módulo de Lotação com estatísticas avançadas de permanência média reservados para etapa futura conforme alinhamento do Davi._ ([[02 - 💡 Ideias & Brainstorm]]).

### 💳 Cobrança & Monetização SaaS (Asaas)

- [x] Criar conta/ambiente Sandbox no Asaas e validar chave de API.
- [x] Testar criação programática de Cliente e Assinatura Recorrente via API.
- [x] Adicionar coluna de Mensalidade (Asaas), status e botão de copiar fatura no Painel **SuperAdmin** do Davi.
- [x] **Auto-Onboarding no Asaas**: Criar cliente, assinatura e link da 1ª fatura automaticamente ao cadastrar nova empresa no SuperAdmin.
- [x] **Autoatendimento Fiscal na Loja**: Permitir que o lojista atualize seu e-mail de faturamento, WhatsApp e CPF/CNPJ em Configurações > Minha Assinatura com sincronização direta no Asaas.
- [x] **Webhook do Asaas Ativo**: Altera automaticamente o status `is_active` e `subscription_status` da loja no Supabase em tempo real.
- [ ] Definir régua de cobrança automática (Lembrete via WhatsApp e E-mail 3 dias antes do vencimento).
- [ ] **Módulo Financeiro SaaS no SuperAdmin**: Dashboard executivo com MRR, ARR, inadimplência Asaas e lucro líquido em tempo real ([[02 - 💡 Ideias & Brainstorm]]).

### 💵 Frente de Caixa & Gestão de Caixa (PDV)

- [x] **Layout & Arquitetura da Nova Página 'Gestão de Caixa' (`CashManagement.jsx`)**:
  - **Aba 1: Caixa Atual**: Status em tempo real (Aberto/Fechado), operador, horário, fundo de troco inicial, vendas do turno, sangrias, suprimentos, saídas operacionais e cálculo de dinheiro esperado na gaveta física com extrato do turno.
  - **Aba 2: Fechamento de Caixa Migrado**: Incorporação do fechamento em página inteira com KPIs de faturamento bruto/líquido, pedidos por canal, acerto individual de motoboys, impressão térmica (80mm/58mm), WhatsApp e **Conferência Obrigatória de Gaveta (Contagem Cega & Quebra de Caixa)** com apuração de sobra/falta e justificativa.
  - **Aba 3: Histórico e Auditoria**: Consulta de turnos anteriores encerrados, valores apurados, divergências justificadas e reimpressão de comprovantes.
  - **Modais Operacionais Prontos**: Abertura de Caixa (`OpenCashModal`), Sangria (`CashBleedModal`), Suprimento (`CashSupplyModal`), Saída Operacional de Despesa (`CashExpenseModal`) e Confirmação Irreversível de Fechamento (`CashClosingConfirmModal`).
  - **Navegação Integrada**: Rota registrada em `pages.config.js`, link fixo na barra lateral do `Layout.jsx` e atalhos rápidos em `Orders.jsx` e `Reports.jsx` direcionando para `?tab=closing`. ([[02 - 💡 Ideias & Brainstorm]])
- [ ] **Auditoria Técnica & Modelagem Supabase do Caixa**: Criação das tabelas `cash_shifts` e `cash_movements` com RLS, isolamento por tenant e trava de concorrência contra múltiplos turnos abertos para a mesma gaveta.
- [ ] **Persistência Completa de Sangrias, Suprimentos e Saídas Operacionais no Supabase**: Conectar os modais já aprovados visualmente às RPCs e mutations auditáveis.
- [ ] **Controle de Troco nas Vendas do PDV**: Registro do valor recebido e troco entregue sem duplicar movimentações e sem somar troco no faturamento.
- [ ] **Cancelamentos & Estornos Auditáveis**: Separação de reembolso físico em dinheiro (reduz gaveta) vs estorno eletrônico (Pix/cartão) sem duplicidade.

### 🤖 Automação com IA, Marketing & Recuperação de Vendas

- [ ] **Robô com IA para WhatsApp, Instagram e Facebook**: Atendimento inteligente integrado com IA (transcrição de áudios via Whisper e LLM para tirar pedidos em linguagem natural e esclarecer dúvidas do cardápio 24/7).
- [ ] **Recuperador de Vendas (Carrinho Abandonado no WhatsApp)**: Detecção de desistência no checkout e envio automático de mensagem amigável no WhatsApp após 15 a 30 minutos com cupom de incentivo exclusivo para finalizar a compra.
- [x] **Programa de Cashback do Cliente**: Retenção de % do valor gasto em carteira virtual do cliente para abater nos próximos pedidos (100% concluído e integrado no Checkout, Perfil, Cardápio, KDS e Impressão Térmica).
- [ ] **Agendamento de Pedidos (Entrega & Retirada Programadas)**: Seleção de data e horário futuro no checkout com fila e lembrete automático na cozinha quando chegar o horário de preparo.
- [ ] **Integração com Plataformas de Anúncios (Meta Pixel, Google Tag & TikTok Pixel)**: Campo em Configurações para rastreamento de conversões com eventos nativos (`PageView`, `ViewContent`, `AddToCart`, `InitiateCheckout`, `Purchase` com valor).

### 📑 Emissão Fiscal para Restaurantes (NFC-e / NF-e)

- [ ] **Emissão de NFC-e (Cupom Fiscal Eletrônico do Consumidor)**: Integração com API fiscal homologada (Focus NFe, PlugNotas/TecnoSpeed ou Nuvem Fiscal) com upload de Certificado Digital A1 (.pfx), CSC da SEFAZ estadual e geração de chave de acesso/QR Code impresso na bobina térmica.
- [ ] **Tributação Automatizada com IA**: Assistente inteligente que identifica o produto (hambúrguer, refrigerante, pizza, cerveja) e preenche automaticamente NCM, CFOP, CEST e regras de tributação (Simples Nacional / ICMS ST).

### 📱 Módulos Operacionais Mobile (Garçom & Entregador)

- [ ] **App do Garçom (Comanda Digital Mobile / PWA)**:
  - Interface mobile ágil e adaptada para tela vertical de celular para atendimento no salão.
  - Seleção visual de mesas (livres, ocupadas, aguardando conta).
  - Lançamento rápido de pedidos e adicionais direto na mesa com disparo instantâneo para a cozinha/KDS e impressora.
  - Gestão da comanda da mesa: adicionar novas rodadas, transferir itens de mesa e solicitar pré-conta/conferência.
- [ ] **App do Entregador (Logística & Roteirização Mobile / PWA)**:
  - Área exclusiva do motoboy acessível pelo celular via código ou WhatsApp.
  - Visualização dos pedidos despachados para a sua bag em tempo real.
  - Abertura de rota em 1-clique no **Google Maps** ou **Waze** com o endereço do cliente.
  - Confirmação de entrega em campo com botão "Marcar como Entregue" e trava de segurança (ex: 4 últimos dígitos do telefone do cliente).
  - Painel de acerto de corridas: extrato ao vivo do turno com total de taxas ganhas, viagens realizadas e valor em dinheiro físico recolhido a repassar ao caixa.
- [ ] **Rastreamento GPS do Motoboy em Tempo Real**: Telemetria geográfica ao vivo do entregador plotada no mapa da tela `Meus Pedidos` do cliente.

---

## 🔮 Fase 2: Backend Dedicado & Integrações

- [ ] **Disparador WhatsApp Automático**: Notificar o cliente quando o pedido sair para entrega ou for aprovado.
- [ ] **Configuração e Homologação da Meta Cloud API Oficial**: Criação do App no Meta for Developers, configuração do Phone Number ID, Token Permanente (System User) e aprovação de templates para OTP e status de pedidos.
- [x] **Autenticação por WhatsApp API Oficial (OTP) & Separação de Visitante (Lógica Pronta & Fallback Simulado)**:
  - **Fim do Auto-Cadastro Silencioso**: Pedidos avulsos de visitantes não realizam mais login automático nem criam registros em `customers`/`users` sem consentimento.
  - **Restrição de Benefícios**: Endereços salvos para reuso e cupons de desconto são exclusivos para clientes autenticados. Visitantes recebem aviso amigável e convite para autenticar via WhatsApp no próprio checkout ou gaveta de perfil.
  - **Arquitetura WhatsApp OTP Pronta para Produção**: Tabela `whatsapp_otp_codes` com RLS e RPCs PostgreSQL `request_whatsapp_otp` e `verify_whatsapp_otp` com `SECURITY DEFINER` e expiração de 10 minutos.
  - **Edge Function Meta Cloud API & Modo Simulação**: Edge Function `whatsapp-otp` no Supabase com suporte a `META_WA_PHONE_NUMBER_ID` e `META_WA_ACCESS_TOKEN` da API Oficial da Meta, além de fallback com simulação em tela para desenvolvimento enquanto as credenciais da Meta não forem cadastradas.
  - **Componente WhatsAppAuthModal**: Modal moderno com inserção de telefone com máscara, nome, código OTP de 6 dígitos, reenvio com timer e auto-aplicação de cupom retido pós-autenticação. ([[02 - 💡 Ideias & Brainstorm]]).
- [ ] **Validação de Telefone / WhatsApp & Trava Anti-Trote**: Verificação de DDD + nono dígito e envio de código OTP via WhatsApp para primeiros pedidos em dinheiro, evitando pedidos falsos sem gerar custo de SMS.
- [x] **PIX Dinâmico Automático**: Geração de QR Code PIX com confirmação automática de pagamento (Mercado Pago).
- [x] **Ferramental de IA Avançado (MCPs)**: Configuração do **Sentry MCP** e **Spec Workflow MCP** no `mcp_config.json` para observabilidade de produção e metodologia Spec-Driven Development.
- [x] **Central de Pendências & Observabilidade com Sentry no SuperAdmin**: Painel de alertas consolidado com pedidos com falha, webhooks com erro e exceções capturadas pelo Sentry, cadastro manual de pendências (com status de urgente, título, descrição, rota opcional e seleção de loja) e captura automática via Sentry beforeSend ([[02 - 💡 Ideias & Brainstorm]]).
- [ ] **Módulo Fiscal para Restaurantes (NFC-e / SAT)**: Integração com API especializada (Focus NFe / PlugNotas / Nuvem Fiscal) para emissão de cupom fiscal com certificado A1 (.pfx) ([[02 - 💡 Ideias & Brainstorm]]).
- [x] **Customização Visual & Temas do Cardápio**:
  - [x] Encapsular o layout atual Dark & Red 100% idêntico em `src/custom-menus/vrumm/VrummMenu.jsx` como Template VIP da Vrumm (sem alterar nada).
  - [x] Redesenhar o cardápio padrão (`Menu.jsx`) na estética **Clean Retail SaaS** com a paleta oficial calibrada (`#047857` verde esmeralda nos botões e ações principais, `#D1E9DF` acentos e badges, `#FFFFFF` superfícies e cards, `#F7F9F8` fundo clean e `#171717` tipografia de alto contraste) ([[02 - 💡 Ideias & Brainstorm]]).
  - [x] **Redesign Completo do Cardápio Genérico & Modal de Produto (Fiel à Referência Mobile)**:
    - **Header & Navbar**: Barra verde superior preservada (`#044e3a`), navbar branca sticky com base reta (sem bordas ou sombras na base), logo circular, nome do estabelecimento centralizado verticalmente ao lado da logo (subtítulo removido), sacola com badge verde e botão de informações (`Info`).
    - **Banner Dinâmico & Transições Naturais**: Banner full-width (`w-full`) encostado perfeitamente na base da navbar (sem linhas ou gaps), com curvatura suave nos cantos superiores (`rounded-t-[18px] sm:rounded-t-[20px]`), wrapper com fundo branco puro contínuo com a navbar, e transição inferior sobreposta pela seção de categorias (`rounded-t-[24px] sm:rounded-t-[28px]` com `-mt-6`), preservando a proporção da imagem dinâmica.
    - **Busca & Filtros**: Campo de busca clean com lupa e botão de filtros com ícone de sliders (`SlidersHorizontal`), sem duplicação de lupa na navbar.
    - **Seções 'Mais pedidos' e 'Últimos pedidos'**: Linhas em carrossel horizontal com badges em pílula mint (`Top 4`, `Últimos 5`), remoção do link 'Ver todos' conforme solicitado, cards brancos limpos com foto em 4:3, título do produto, preço e botão circular verde com ícone `+` para adição rápida ao carrinho.
    - **Modal de Detalhes do Produto (Sheet Sobreposto)**: Foto hero no topo com botões flutuantes circulares (voltar e opções) ocupando toda a largura, transição perfeita com a fotografia contínua atrás dos cantos arredondados superiores da seção branca (`rounded-t-[24px]` com sobreposição `-mt-6` / `z-[2]`, eliminando quaisquer gaps ou cantos brancos nas laterais e com container do modal em `flex flex-col gap-0`), título e preço com stepper inline `[-] 1 [+]` ao lado direito, descrição suave, grupo expansível de adicionais com contador em pílula, checkboxes quadradas e seletores de quantidade `[-] 0 [+]`, campo de observações para o preparo e botão inferior fixo em verde escuro ("Adicionar ao Pedido" com valor total dinâmico).
    - **Preservação de Mídia e Dados**: Mantidas as fotos cadastradas dos produtos e banners do banco de dados e compatibilidade total com o sistema multi-tenant e templates VIP.
  - [x] **Unificação da Identidade Visual do Painel Administrativo do Cliente**: Realinhamento completo da paleta de cores de todas as telas administrativas e de gestão do lojista (`Layout.jsx`, `Orders.jsx`, `Products.jsx`, `Categories.jsx`, `Complements.jsx`, `Dashboard.jsx`, `Banners.jsx`, `Coupons.jsx`, `Reports.jsx`, `PDV.jsx`, `PDVOrders.jsx`, `TableQRCodeModal.jsx`, `AdminLogin.jsx`, `MyOrders.jsx`), substituindo o vermelho herdado pelo verde esmeralda (`#047857`), menta suave (`#D1E9DF`), superfícies brancas (`#FFFFFF`), fundo neutro clean (`#F7F9F8`) e preto de alto contraste (`#171717`), preservando botões destrutivos de cancelamento/exclusão em vermelho para segurança de UX.
  - [x] **Redesign Completo da Gaveta "Meu Perfil" (`UserProfileSheet.jsx`)**: Substituído o layout escuro e contrastes quebrados por uma estética **Clean Retail** de alto padrão (card do usuário em gradiente suave com avatar verde esmeralda e anel branco, pílula de WhatsApp conectado, títulos legíveis em cinza elegante, cards de endereços brancos com ícones verde menta e botões de ação discretos, cards de cupom com visual de bilhete pontilhado e botão de copiar verde, e botão de fechar circular minimalista sem anéis vermelhos indesejados).
  - [x] **Barra Superior Dinâmica & Abas de Categoria com Efeito Pincel**: Barra no topo verde (`#064e3b`) com tempo de entrega ou aviso de retirada local, endereço da loja sempre visível com ícone (`| 📍 {endereço}`) no desktop, horário e status de abertura (fica vermelha quando a loja estiver fechada). Responsividade inteligente: endereço exibido somente no desktop (`hidden md:flex`), e no mobile exibição centralizada e limpa contendo apenas o modo/tempo de entrega e as horas separados por pipe (`|`). Efeito de pincelada orgânica autêntica (Brush Stroke SVG) com cerdas secas na categoria selecionada (com opção "Todos" por padrão) e traço sublinhado com divisores verticais (`|`) nos itens inativos, idêntico à referência visual. Horário e status removidos de baixo do nome da loja no cabeçalho.
  - [x] **Redesign Clean Retail da Tela de Pedidos & Navbars (Inspirado na Referência)**: Layout visual Clean Retail idêntico à foto: nova marca oficial **PedeMuleke** no topo da sidebar com sacola verde, navegação lateral com pílulas arredondadas e badges mint sem alterar as rotas atuais, top navbar com pílula de status '● Loja Aberta' e avatar sem ícone de notificação, cabeçalho de Pedidos com cards de ação rápida (Entrega média 60–80 min, Fechamento de Caixa e QR Code das Mesas), abas de status em pílulas horizontais com contadores, barra de filtros com período/turno ao vivo/canais e ilustrador isométrico da caixa de papelão aberta no empty state.
- [x] **Spooler & App Desktop (.exe) para Impressão Automática Silenciosa (Concluído & Integrado)**:
  - **Módulo `desktop-spooler` Standalone**: Servidor HTTP local leve em `http://127.0.0.1:9100` com suporte nativo a Windows PowerShell (`Out-Printer`), listagem dinâmica de impressoras (`Get-CimInstance Win32_Printer`) e formatação térmica avançada de comandas em texto puro (`ticketFormatter.js`) para bobinas de 80mm e 58mm (suportando Delivery, Balcão e Mesas com itens, adicionais, observações e dados de pagamento).
  - **Executável Windows `.exe` Portátil (Node.js SEA)**: Compilado com tecnologia Single Executable Application nativa do Node 22 + esbuild em `pedemuleke-spooler.exe` (executável único e autônomo de 85MB sem necessidade de Node ou npm na máquina do lojista), com scripts de compilação 1-clique (`build-exe.bat`) e inicializador rápido (`iniciar-spooler.bat`).
  - **Integração Inteligente no Frontend (`useFifoPrintQueue.js`)**: Envio automático e silencioso via `POST http://127.0.0.1:9100/print` em menos de 200ms com zero popups. Fallback instantâneo e transparente para impressão via iframe do navegador se o .exe estiver fechado ou se o lojista estiver operando por tablet/celular.
  - **Interface de Gestão & Telemetria Exclusiva na Navbar (`Layout.jsx`)**: Indicador discreto e exclusivo na Top Navbar (ao lado de 'Loja Aberta'), exibido **estritamente quando o spooler está ativo** (`🟢 Impressora Pronta`), mantendo o restante da interface de Pedidos e KDS 100% limpa e sem poluição visual. Quando o executável está fechado, o botão não é exibido. ([[02 - 💡 Ideias & Brainstorm]]).
- [x] **Armazenamento de Mídia no Cloudflare R2**: Upload de fotos de produtos e banners com tráfego ilimitado (zero egress), compressão cliente WebP, Edge Function no Supabase e CDN global ([[02 - 💡 Ideias & Brainstorm]]).
- [x] **Rotina de Backup Diário Automático & Snapshots (GitHub Actions + Cloudflare R2 + Local)**:
  - **GitHub Actions Workflow (`.github/workflows/daily-backup.yml`)**: Execução agendada diária às 04h da manhã BRT (`07:00 UTC`) ou sob demanda (`workflow_dispatch`), gerando dump integral do PostgreSQL (`pg_dump`), compactando em `.sql.gz` e enviando diretamente para o bucket Cloudflare R2 (`/backups/`) com política de retenção de 30 dias (R$ 0,00 de custo e zero egress).
  - **Snapshot Local Sob Demanda (`npm run backup:export`)**: Script Node.js nativo (`scripts/export-data.js`) para exportar instantaneamente todas as tabelas (tenants, produtos, categorias, pedidos, mesas, fechamentos) em formato JSON limpo na pasta `backups/` com `.gitignore` protegido.
- [x] **Hospedagem & Deploy no Cloudflare Pages**: Deploy contínuo (CI/CD) do frontend em produção via Cloudflare Pages com tráfego comercial ilimitado, roteamento SPA (`_redirects`) e CDN global ([[02 - 💡 Ideias & Brainstorm]]).
- [x] **Identificação Obrigatória do Cliente no PDV**: Proibido finalizar pedidos no balcão/PDV sem informar o nome e o WhatsApp/telefone ou puxar um cliente salvo. Validação visual com alerta nos campos, destaque em vermelho ao tentar avançar sem preencher, e validação no modal de pagamento e criação do pedido ([[02 - 💡 Ideias & Brainstorm]]).
- [ ] **Landing Page (LP) de Vendas de Alta Conversão**: Página comercial com calculadora de economia vs iFood e tabela de planos ([[02 - 💡 Ideias & Brainstorm]]).
- [x] **Branding, Naming & Identidade Visual do SaaS**: Definido o nome comercial oficial e definitivo: **PedeMuleke** ("Pede Muleke / Pé de moleque"). Atualizada a nomenclatura em toda a base do projeto, metadados, títulos e documentações ([[02 - 💡 Ideias & Brainstorm]]).
- [x] **Base Arquitetural de Cardápios VIP Personalizados (Modo A - Multi-Template Engine)**: Coluna `custom_template` no banco Supabase (`tenants`), RPCs `get_master_tenants` e `update_tenant_info`, registro central de templates (`src/custom-menus/registry.js`), despacho dinâmico no `Menu.jsx` com fallback transparente para o cardápio padrão genérico e seleção em 1-clique no SuperAdmin com plano VIP Personalizado ([[02 - 💡 Ideias & Brainstorm]]).
  - [x] **Correção no Despacho de Template VIP (`handleAddToCart`)**: Corrigida a passagem de props em [Menu.jsx](file:///c:/Users/Davi/Projetos/delivery/src/pages/Menu.jsx) para templates customizados (`VrummMenu`), repassando `addToCart` corretamente e eliminando o erro de execução `ReferenceError: handleAddToCart is not defined`.
- [x] **Ajuste de Tipografia & Contraste do Cupom Térmico (`PrintOrder.jsx`)**: Substituído tons de cinza por preto puro (#000), aplicada fonte encorpada de alta legibilidade (`font-black`/`font-bold`), margem 0mm, `@media print` calibrado para bobinas térmicas de 80mm e 58mm e corte de 2 vias.
- [ ] **Domínio Próprio para Restaurantes (Cloudflare for SaaS)**: Suporte a domínio/subdomínio personalizado do cliente (ex: `cardapio.pizzaria.com.br`) com SSL HTTPS automático (Cloudflare Custom Hostnames) e resolução direta por hostname no `TenantContext.jsx` ([[02 - 💡 Ideias & Brainstorm]]).
- [ ] ⏸️ **Integração Oficial Aiqfome & Magalu Delivery (API V2 + ID Magalu - Em Standby)**:
  - _Status_: Pausado temporariamente pelo Davi. O cadastro de parceiro de integração no portal do Magalu exige CNPJ ativo. Reservado para a etapa pós-validação comercial quando o CNPJ/MEI for formalizado. ([[02 - 💡 Ideias & Brainstorm]]).
- [x] **Montador de Pizza Fracionada (Abordagem por Tipo de Categoria - Concluído & Integrado)**:
  - **Modelagem no Supabase**: Colunas `type` e `pizza_sizes` em `categories`, `pizza_prices` em `products` e `pizza_pricing_rule` em `tenants`.
  - **Projeção de Colunas & Cache (`storage.js`)**: Incluídas as colunas `type` e `pizza_sizes` em `TABLE_COLUMNS.categories` e `pizza_prices` em `TABLE_COLUMNS.products`, com bump de versão de cache (`delivery_menu_v1_2`) garantindo limpeza instantânea de dados antigos nos navegadores.
  - **Gestão de Categorias em Lista Zebrada com Reordenação Interativa (`Categories.jsx`)**: Substituído o grid de cards por uma lista com linhas em cores alternadas (efeito zebrado: branco e neutro suave), exibição da posição sequencial (`#1`, `#2`, `#3`...) e botões interativos de **Subir** e **Descer** em tempo real com animação fluida (`framer-motion` layout), normalização automática de `order_index` e persistência imediata no Supabase/storage refletindo diretamente na ordem do cardápio dos clientes. Inclusão de seletor visual de Tipo de Categoria ("Produtos Padrão" 🍔 vs "Pizzas & Fracionados" 🍕) com editor dinâmico de tamanhos.
  - **Precificação por Tamanho Exclusiva (`Products.jsx`)**: Produtos de categorias de pizza têm o campo geral "Preço (R$)" ocultado automaticamente no cadastro/edição, exigindo apenas os valores específicos por tamanho (Broto, Média, Grande, Família). O menor valor configurado é salvo como preço de referência ("A partir de R$ XX,XX") no catálogo do cardápio (`ProductCard.jsx`, `PopularProductsRow.jsx` e listagem admin). Categorias convencionais permanecem com o campo de preço único padrão.
  - **Redesign Clean Retail do Montador de Pizza (`PizzaBuilderModal.jsx`)**: Interface refinada e minimalista inspirada em referências de alto padrão: cabeçalho limpo sobre fundo branco com tag superior `MONTADOR DE PIZZA` e navegação rápida (voltar e fechar circulares), cards de tamanho com seleção por rádio e exibição de fatias/sabores/preço de referência, pílulas de divisão de sabores em verde esmeralda (`#047857`), cards de sabores com fotos circulares e ação "Limpar", campo de observações gerais com contador de 200 caracteres, gaveta de busca rápida de sabores e barra inferior fixa com stepper e botão "Adicionar ao Pedido | R$ XX,XX".
  - **Seletor de Precificação de Metades em Configurações (`Settings.jsx` & `GeneralSettingsTab.jsx`)**: Chave seletora com cards explicativos no painel da loja permitindo escolher entre **Cobrar pelo Maior Valor** (`highest_price`, padrão) ou **Cobrar pela Média Proporcional** (`average`), com persistência no Supabase (`tenants.pizza_pricing_rule`), schema Zod validado e badge informativo exibido para o cliente no passo de escolha de sabores do [PizzaBuilderModal.jsx](file:///c:/Users/Davi/Projetos/delivery/src/components/menu/PizzaBuilderModal.jsx).
  - **Arquitetura de Complementos da Pizza (Padrão iFood / Opção A)**: Separação inteligente entre complementos globais da pizza (Passo 5: Bordas Recheadas, Tipos de Massa aplicados à pizza inteira com flag explícita `is_pizza_crust` no painel de Complementos) e adicionais modulares por metade/sabor (Passo 3: sanfona expansível por fração permitindo ao cliente selecionar extras específicos como Bacon Extra ou Queijo Extra para aquela metade), com cálculo integrado no preço unitário, discriminação no carrinho (`Cart.jsx`), no comprovante térmico (`PrintOrder.jsx`) e no spooler de impressão desktop (`ticketFormatter.js`). ([[02 - 💡 Ideias & Brainstorm]]).
  - **Exibição no Carrinho & Spooler de Impressão (`Cart.jsx`, `PrintOrder.jsx`, `ticketFormatter.js`)**: Comanda e carrinho formatados com frações claras `[1/2]` e notas individuais de preparo para o pizzaiolo. ([[02 - 💡 Ideias & Brainstorm]]).

---

## ✅ Concluído (Entregas Realizadas)

- [x] **Cardápio Público**: Visualização de produtos, categorias com rolagem suave e banners rotativos dinâmicos.
- [x] **Carrinho Drawer**: Adição, remoção, cálculo de adicionais e totais em tempo real.
- [x] **Checkout Flexível**: Modais separados para Entrega (com endereço completo) e Retirada.
- [x] **Painel Administrativo Básico**: Dashboard de faturamento, listagem de pedidos e gestão de produtos/categorias.
- [x] **Configurações da Loja**: Horários de funcionamento semanal, taxa de entrega padrão e valor mínimo de pedido.

---

## 🔗 Links Relacionados

- [[00 - 🏠 Inicio]] — Voltar ao painel inicial
- [[02 - 💡 Ideias & Brainstorm]] — Ideias não estruturadas e discussões
- [[03 - 🚀 Especificacao SaaS]] — Visão estratégica e planos de monetização
- [[04 - 🗄️ Modelagem & Supabase]] — Estrutura de tabelas e RLS
