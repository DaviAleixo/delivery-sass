# 💡 Ideias & Brainstorm

> **Nota Automática**: Este arquivo é o repositório de ideias e insights das nossas conversas. Conforme você ou a equipe tiverem ideias de diferenciais, melhorias de UX ou modelos de negócio, elas são salvas aqui para amadurecimento antes de irem para o [[01 - 🗺️ Roadmap & Backlog]].

---

## 💡 Ideias de Recursos e Diferenciais Competitivos

### 🍕 1. Montador de Pizza / Combo em Etapas
* **Ideia**: Criar um assistente visual para montar produtos complexos (ex: "Pizza Meio a Meio", "Monte seu Hambúrguer em 3 passos: Pão -> Carne -> Queijo -> Molho").
* **Benefício**: Reduz atrito de pedido e aumenta o ticket médio do restaurante.

### ⭐ 2. Programa de Fidelidade Integrado
* **Ideia**: A cada X pedidos ou a cada R$ 50 gastos pelo cliente no cardápio, ele ganha selos digitais ou cashback para o próximo pedido.
* **Benefício**: Faz o cliente voltar a comprar direto no cardápio da loja em vez de procurar no iFood.

### 📊 3. Relatório de Horários de Pico & Produtos Mais Vendidos
* **Ideia**: Gráficos analíticos no Dashboard que mostram quais dias e faixas de horário geram mais pedidos (ex: Sexta das 19h às 22h).
* **Benefício**: Ajuda o lojista a planejar estoque e equipe de cozinha.

### 📱 4. PWA (Progressive Web App) Instalável
* **Ideia**: Quando o cliente final abrir o cardápio no celular pelo navegador, exibir banner convidativo: *"Deseja instalar o app do [Nome do Restaurante] na tela inicial?"*.
* **Benefício**: Dá a sensação de um aplicativo nativo próprio do restaurante, sem o custo e burocracia de publicar na Google Play ou App Store.

### 🔔 5. Notificação Sonora Persistente na Cozinha
* **Ideia**: No painel do restaurante (KDS), o alerta sonoro tocar em loop até que o atendente clique em "Aceitar Pedido", garantindo que nenhum pedido passe despercebido em horários de pico barulhentos.

---

## 📝 Anotações Rápidas de Discussões Recentes

### 💳 6. Estratégia de Cobrança Recorrente (Asaas)
* **Decisão de Gateway**: Uso do **Asaas** para gerenciar as assinaturas mensais dos restaurantes (PIX recorrente, Cartão de Crédito e Boleto).
* **Vantagens do Asaas**:
  - Régua de cobrança automática por WhatsApp, SMS e E-mail sem custo extra.
  - Não exige Landing Page pronta para os primeiros clientes: gera link de assinatura direto pelo painel.
* **Cadastro Inicial**:
  - Pode ser iniciado diretamente com **CPF (Pessoa Física)** no Asaas sem precisar de CNPJ no começo.
  - Quando a base de clientes crescer, migra para MEI (abertura gratuita pelo gov.br) para emissão automática de NFS-e.

* **Fluxo Automatizado (Fase Painel/SaaS)**:
  - Botão *"Minha Assinatura"* no Painel Admin da loja.
  - Webhook do Asaas notificando o Supabase para alterar o status `is_active` da tabela `tenants`.
  - Se atrasar > 5 dias, a loja é pausada com tela informativa: *"Sua mensalidade está em aberto. Regularize para reativar o cardápio"*.

### 🌐 7. Análise de Custos de Hospedagem (Vercel vs Cloudflare Pages vs VPS)
* **Mito da Vercel**: A Vercel **NÃO cobra comissão** sobre links de pagamento ou vendas realizadas. Ela cobra apenas por uso de infraestrutura (banda, builds, funções serverless).
* **Termos de Uso Comercial**: O plano Hobby da Vercel é voltado para projetos não comerciais; quando o SaaS começar a faturar alto, o plano Pro custa US$ 20/mês.
* **Alternativa 100% Gratuita e Comercial: Cloudflare Pages**:
  - Tráfego ilimitado e gratuito para uso comercial.
  - Performance global superior para React/Vite.
  - Domínios personalizados gratuitos e sem risco de cobrança surpresa.
* **Alternativa Futura (Fase 2): VPS Própria (Hetzner / Hostinger)**:
  - Servidor dedicado por ~R$ 30 a R$ 40/mês para rodar tanto o frontend quanto o backend Java/Spring Boot quando for lançado.

### 👑 8. Torre de Controle SuperAdmin de Alto Nível ("Estrutura Cabulosa")
* **Tabela Principal Minimalista**:
  - Apenas as colunas essenciais: `Restaurante`, `Link Público`, `Plano` e `Ações`.
  - Zero poluição visual na listagem inicial.
* **Drawer 360° do Cliente (Ao clicar no restaurante)**:
  - Painel lateral deslizante com visão profunda da empresa:
    - **Raio-X Financeiro**: Status Asaas, valor, vencimento, link da fatura.
    - **Métricas de Vendas do Restaurante**: Gráficos de pedidos do mês, faturamento que o restaurante gerou e ticket médio.
    - **Calculadora de Economia vs iFood**: Mostra quantos milhares de reais a loja economizou não pagando taxas de marketplace.
* **Ações em 1-Clique no WhatsApp**:
  - Botão **"Cobrar via WhatsApp"**: Abre o WhatsApp do lojista com mensagem profissional e link de pagamento prontos.
  - Botão **"Suporte / Conversar"**: Abre o WhatsApp com saudação rápida.
* **Alerta de Churn / Retenção (Health Score)**:
  - Sinalizador visual se um restaurante ficar mais de 3 dias sem receber pedidos, alertando o Davi para prestar suporte e reativar o lojista.

### 🤖 9. Onboarding Automático no Asaas & Faturamento Profissional
* **Criação Automática de Cliente + Assinatura**:
  - No modal de cadastro de Nova Empresa no SuperAdmin, ao salvar, o sistema dispara requisições para a API do Asaas (`/v3/customers` e `/v3/subscriptions`).
  - O Asaas cria a assinatura recorrente (R$ 89 ou R$ 149) e já gera o link da primeira fatura (`invoiceUrl`), armazenando-o diretamente no banco da nova empresa.
* **Por que o E-mail e Dados Reais do Cliente são Essenciais**:
  - **Credibilidade**: Na tela da fatura, PIX e boleto, aparece o nome e e-mail real do lojista (não um e-mail aleatório/genérico de teste).
  - **Régua Automática do Asaas**: O Asaas envia a fatura por e-mail com antecedência, aviso de vencimento no dia, e confirmação de pagamento instantânea sem você precisar fazer nada manual.
  - **Dados recomendados no cadastro**: E-mail comercial do lojista, WhatsApp (para lembretes) e CPF/CNPJ (obrigatório pelo Banco Central para emissão de cobranças registradas).
* **Edição de Dados Fiscais pelo Lojista (Autoatendimento)**:
  - O lojista **PODE** atualizar seu E-mail de faturamento, WhatsApp e CPF/CNPJ na aba *Configurações > Minha Assinatura*.
  - Ao salvar, o sistema sincroniza via API com o Asaas (`PUT /v3/customers/{id}`) para que as próximas faturas saiam com o documento e e-mail atualizados.
  - O lojista **NÃO pode** alterar o valor do plano ou a data de vencimento (controle restrito ao SuperAdmin).

### 🍔 10. Métodos de Pagamento dos Restaurantes (Zero Custo & Zero Risco no CPF)
* **Princípio de Ouro**: O Davi vende o **software (SaaS)** e recebe mensalidade fixa. O dinheiro da comida (hambúrguer/pizza) **NUNCA deve passar pela conta ou CPF do Davi**.
* **Abordagem Ideal (Fase 1 - Custo R$ 0,00 e Sem CNPJ)**:
  - **Pagamento na Entrega**:
    - Cartão de Crédito/Débito na maquininha do motoboy (o restaurante usa a máquina que já possui: Stone, PagBank, Cielo, etc.).
    - Dinheiro com campo de troco automático no checkout.
  - **PIX Direto do Restaurante**:
    - O lojista cadastra sua própria chave PIX (CPF/CNPJ/Telefone/Email) em *Configurações > Pagamentos*.
    - Ao finalizar o pedido, o cardápio exibe o botão *"Copiar Chave PIX da Loja"* e o cliente anexa o comprovante ou manda no WhatsApp.
  - **Benefícios**:
    - R$ 0,00 de custo para o Davi e para o restaurante.
    - Zero burocracia bancária.
    - Zero risco com a Receita Federal ou chargeback de cartão de terceiros.
* **Abordagem Futura (Fase 2 - Pagamento Online Automatizado no Cardápio)**:
  - **Como funciona sem o Davi ter CNPJ**: Cada restaurante cria sua conta gratuita no **Mercado Pago** (ou Asaas) usando seu próprio CPF ou CNPJ.
  - No painel da loja (*Configurações > Pagamentos*), o restaurante insere o seu `Access Token` pessoal do Mercado Pago.
  - Ao comprar o lanche, a API gera o Pix ou processa o cartão caindo **100% direto na conta do restaurante**.
  - O Davi não precisa de CNPJ, não paga nenhuma taxa e não tem vínculo com o pagamento da comida.
  - **Por que Mercado Pago é melhor para comida e Asaas para SaaS**: O Mercado Pago cobra apenas 0,99% no Pix de varejo (centavos por lanche) com aprovação em 2 segundos, enquanto o Asaas cobra taxa fixa (~R$ 0,99) ideal para mensalidades maiores (R$ 89/149).

### ⚖️ 11. Comparativo de Gateway & Estratégia Tributária (MEI vs ME)
* **Asaas vs Mercado Pago para SaaS**:
  - **Vencedor para o Davi**: **Asaas** (criado exclusivamente para faturamento B2B, gestão de assinaturas, régua automática via WhatsApp/email e emissão de notas).
  - **Onde o Mercado Pago é bom**: Para o *restaurante* receber vendas avulsas de lanche no checkout ou na máquina Point física.
* **MEI para Software vs ME**:
  - Pela lei estrita, o CNAE de "Desenvolvimento de Software" (6201-5/01) não entra no MEI oficial.
  - **Estratégia Prática de Lançamento (Sem custos pesados de largada)**:
    - **Fase 1 (Validação e Primeiros Clientes)**: Operar via **CPF no Asaas** (totalmente legal e aceito) OU abrir **MEI gratuito** com atividade correlata de apoio/serviço (ex: Suporte técnico, digitador ou promotor de vendas) pagando apenas ~R$ 75/mês de DAS sem gastar com contador.
### 🏆 12. Benchmark Anota AI: Como os Gigantes Estruturam os Pagamentos
* **Como funciona no Anota AI**:
  - O Anota AI **NÃO obriga** pagamento online. Ele divide em 3 blocos:
    1. **Pagamento na Entrega**: Dinheiro (com troco), Maquininha Cartão (Crédito/Débito) e Vale Refeição (Alelo, VR, Sodexo).
    2. **PIX Manual Gratuito**: O restaurante cadastra a chave e o cliente envia o comprovante (zero taxa para a loja).
    3. **Pagamento Online Automático**: Integração com **Mercado Pago** (ou módulo AnotaPay) para gerar QR Code PIX com aprovação instantânea em 2 segundos sem precisar de comprovante.
* **Por que ter somente pagamento online é um tiro no pé**:
  - No Brasil, entre 60% e 75% dos pedidos de delivery à noite são pagos na maquininha do motoboy ou em dinheiro. Se forçar apenas pagamento online no site, a loja perde clientes.
* **Estrutura Ideal para o Nosso SaaS**:
  - Uma aba intuitiva **"Formas de Pagamento"** onde o lojista simplesmente marca caixas de seleção do que aceita (Dinheiro, Cartão na Entrega, PIX da Loja) e, se quiser, ativa o switch *"Aceitar Pagamento Online (Mercado Pago)"*.
  - **Por que ter APENAS o Mercado Pago como gateway online é excelente**:
    - **Padrão da Indústria**: Plataformas consagradas como InstaDelivery (10k+ lojas) e Cardápio Web usam **exclusivamente o Mercado Pago** como gateway online.
    - **Zero atrito**: O lojista não precisa de burocracia bancária; com a conta dele do Mercado Livre/Mercado Pago ele gera o Access Token em 1 minuto.
    - **Alta conversão**: QR Code PIX dinâmico com expiração de 15 minutos e aprovação em 2 segundos sem precisar anexar comprovante.
  - **Arquitetura Técnica de Implementação (Concluída & Ativa)**:
    - **Banco de Dados**: Coluna `payment_methods` na tabela `tenants`, e `payment_status`, `mp_payment_id`, `change_for` na tabela `orders`.
    - **Backend (Supabase Edge Function)**: Endpoint `mercadopago` rodando na nuvem com bypass de CORS, suportando `test_credentials`, `create_pix_payment` e `check_payment_status`.
    - **Painel Administrativo da Loja**: Aba *Configurações > Formas de Pagamento* com teste instantâneo de credencial do Mercado Pago e chave PIX própria.
    - **Experiência do Cliente no Checkout**: Modal de PIX Online dinâmico com QR Code, botão de Copia e Cola, contador de 15 minutos e detecção automática de pagamento a cada 3 segundos, aprovando o pedido na hora.


## 🔗 Links Relacionados
* [[00 - 🏠 Inicio]] — Menu Principal
* [[01 - 🗺️ Roadmap & Backlog]] — Tarefas aprovadas e em andamento
* [[03 - 🚀 Especificacao SaaS]] — Modelo de negócio e planos
