# Server-Side Payment Security & Tamper Proofing - Task List

## Implementation Tasks

- [x] 1. **Implementar Motor de Recálculo Seguro na Edge Function `mercadopago`**
    - [x] 1.1. Configurar cliente Supabase na Edge Function para leitura de dados de pedidos e produtos
        - *Goal*: Permitir que a Edge Function acesse com segurança os dados do pedido e catálogo de produtos no Supabase
        - *Details*: Inicializar `@supabase/supabase-js` com as variáveis de ambiente `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_ANON_KEY`
        - *Requirements*: Requisito 1 (Server-Side Price Authority)
    - [x] 1.2. Criar função de recálculo autoritativo `verifyAndRecalculateOrderTotal`
        - *Goal*: Computar o valor monetário exato e autêntico do pedido consultando o banco de dados
        - *Details*: Obter os itens do pedido, buscar os preços oficiais em `products`, complementos e taxa de entrega da loja em `tenants`. Corrigir eventuais distorções no campo `total_amount` do pedido
        - *Requirements*: Requisitos 1 e 2 (Anti-Tampering)
    - [x] 1.3. Forçar o valor recalculado na chamada para a API do Mercado Pago
        - *Goal*: Garantir que o QR Code do PIX seja gerado estritamente com o valor recalculado pelo backend
        - *Details*: Descartar qualquer campo `amount` enviado pelo cliente no JSON e utilizar o total recalculado pelo servidor
        - *Requirements*: Requisito 1
- [ ] 2. **Blindar Chamadas no Frontend (`PixOnlineModal.jsx` e `mercadopago.js`)**
    - [x] 2.1. Refatorar `createPixPayment` para enviar apenas `orderId`
        - *Goal*: Alinhar o front-end ao padrão de autoridade única do servidor
        - *Details*: Remover a dependência de `amount` local no cliente ao disparar a criação do PIX
        - *Requirements*: Requisito 2
- [x] 3. **Deploy e Validação de Segurança Anti-Fraude**
    - [x] 3.1. Fazer deploy da Edge Function atualizada no Supabase
        - *Goal*: Publicar a nova versão da função `mercadopago` com a validação ativa
        - *Details*: Executar o deploy e verificar logs da função
        - *Requirements*: Requisitos Não Funcionais (Segurança e Performance)
    - [x] 3.2. Executar teste de penetração simulando ataque de alteração de preço
        - *Goal*: Comprovar que tentativas de forjar preço menor são bloqueadas e corrigidas pelo backend
        - *Details*: Disparar requisição com valor forjado e verificar se o Mercado Pago recebe o valor oficial real
        - *Requirements*: Critérios de Aceite
