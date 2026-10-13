# Server-Side Payment Security & Tamper Proofing - Requirements Document

Blindagem contra adulteração de preços: validação e recálculo obrigatório de valores no backend (Supabase Edge Function e PostgreSQL), garantindo que valores manipulados no frontend (via DevTools ou requisições HTTP forjadas) sejam completamente ignorados e recalculados com base no catálogo oficial de produtos, complementos e taxas de entrega da loja.

## Core Features

- **Recálculo Autoritativo no Backend (Server-Side Price Authority)**:
  - A Edge Function `mercadopago` deve rejeitar qualquer valor monetário (`amount`) enviado diretamente pelo frontend.
  - O valor a ser cobrado no Mercado Pago deve ser computado exclusivamente pelo servidor a partir do `orderId`, consultando a tabela `orders`, os preços ativos em `products`, complementos em `complement_items`/`product_additionals` e taxa de entrega em `tenants`.
- **Detecção e Bloqueio de Adulteração (Anti-Tampering & Fraud Detection)**:
  - Se um usuário mal-intencionado alterar o valor do pedido no navegador para R$ 0,01, a Edge Function detecta a divergência entre o valor forjado e o valor recalculado dos produtos.
  - O backend atualiza o pedido para o valor real ou rejeita a transação com código de erro 400 (`FRAUD_TAMPERING_DETECTED`), registrando alerta de segurança.
- **Validação de Cupons no Servidor**:
  - Verificação se o cupom aplicado está ativo, dentro da validade, respeita o valor mínimo do pedido e se o limite de uso não foi excedido antes de aplicar qualquer desconto no total do PIX.
- **Validação do Webhook / Polling de Pagamento**:
  - Ao receber a confirmação do pagamento (`approved`), o backend valida se `transaction_amount` retornado pela API do Mercado Pago é igual ou superior ao valor total legítimo do pedido antes de atualizar para `status: "pendente"` e `payment_status: "paid"`.

## User Stories

- **Como Lojista / Dono do Restaurante**:
  - Quero ter a certeza absoluta de que nenhum cliente conseguirá comprar um hambúrguer de R$ 40,00 pagando R$ 0,01 alterando o código no navegador.
  - Quero que o QR Code do PIX gerado no Mercado Pago tenha exatamente o valor da soma dos meus produtos cadastrados no painel, garantindo que meu faturamento não seja defraudado.
- **Como Cliente Legítimo**:
  - Quero que meu pedido seja calculado de forma justa e transparente, gerando o PIX no valor exato dos produtos, adicionais e taxa de entrega que escolhi.
- **Como Administrador do Sistema (SuperAdmin)**:
  - Quero logs de auditoria caso alguma requisição tente enviar valores monetários discrepantes dos itens presentes no banco de dados.

## Acceptance Criteria

- [ ] A Edge Function `mercadopago` não aceita mais `amount` cego do cliente: ela exige `orderId` e calcula o total diretamente no servidor.
- [ ] O cálculo oficial do backend soma: `(Preço oficial dos produtos no banco × quantidade) + (Adicionais oficiais) + (Taxa de entrega oficial da loja) - (Desconto do cupom validado no banco)`.
- [ ] Se o valor recalculado diferir do valor informado no rascunho do pedido por mais de R$ 0,05 (tolerância para arredondamento de centavos), o pedido no Supabase é automaticamente corrigido para o valor oficial antes de gerar a transação no Mercado Pago.
- [ ] Qualquer tentativa de gerar PIX com valor zerado, negativo ou adulterado é bloqueada antes de chamar a API do Mercado Pago.
- [ ] Na confirmação do pagamento (`check_payment_status` ou Webhook), o status do pedido só transiciona para `paid` se o valor pago no Mercado Pago coincidir com o total oficial do pedido.

## Non-functional Requirements

- **Segurança (Security)**:
  - Arquitetura Zero-Trust para entradas de valores financeiros vindas do cliente.
  - Uso de Service Role Key do Supabase ou consulta direta aos dados imutáveis da loja para evitar bypass de regras via RLS.
- **Performance**:
  - O recálculo dos itens e validação dos preços no backend deve levar menos de 150ms na Edge Function para não atrasar a abertura do modal do PIX para o cliente.
- **Compatibilidade (Backward Compatibility)**:
  - Manter compatibilidade com os pedidos existentes e suportar tanto produtos simples quanto produtos com complementos/adicionais e pedidos para entrega, balcão ou salão.
