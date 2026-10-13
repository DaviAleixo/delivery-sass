# Server-Side Payment Security & Tamper Proofing - Design Document

## Overview

Este design estabelece a autoridade unilateral do servidor (Server-Side Price Authority) sobre qualquer transação financeira na plataforma de delivery.
Ao gerar uma cobrança PIX via Mercado Pago ou confirmar o recebimento do valor, a Edge Function `mercadopago` no Supabase não consome valores monetários enviados pelo cliente no navegador. Em vez disso, o servidor carrega o registro do pedido pelo `orderId`, lê os itens adquiridos e recalcula o valor legítimo consultando os preços vigentes nas tabelas oficiais do banco de dados (`products`, `product_additionals`, `complement_items`, `tenants` e `coupons`).

## Architecture

O fluxo segue uma arquitetura Zero-Trust dividida em 3 camadas:

```
[ Cliente / Browser ]
        │
        │ 1. POST /functions/v1/mercadopago
        │    { action: "create_pix_payment", orderId: "...", accessToken: "..." }
        ▼
[ Supabase Edge Function: mercadopago ]
        │
        ├─► 2. Busca o pedido na tabela `orders` via Supabase Client
        │
        ├─► 3. Consulta Preços Oficiais no Banco:
        │      • `products`: busca preços reais por product_id
        │      • `product_additionals` / `complement_items`: valida preços dos adicionais
        │      • `tenants`: obtém a taxa de entrega configurada para a loja
        │      • `coupons`: valida regras e desconto legítimo
        │
        ├─► 4. Recalcula Total Autêntico:
        │      totalOficial = Σ(item.price × qty + adicionais) + deliveryFee - discount
        │
        ├─► 5. Validação Anti-Tampering:
        │      Se order.total_amount != totalOficial, atualiza o pedido no banco com o valor correto
        │
        ├─► 6. Chama API Oficial do Mercado Pago:
        │      POST https://api.mercadopago.com/v1/payments
        │      transaction_amount: totalOficial (NUNCA o do front-end)
        │
        ▼
[ Mercado Pago API ] ──► Retorna QR Code PIX com o valor legítimo inviolável
```

## Components and Interfaces

### 1. Edge Function: `mercadopago` (`supabase/functions/mercadopago/index.ts`)
- **Ação `create_pix_payment`**:
  - **Input**:
    ```json
    {
      "action": "create_pix_payment",
      "accessToken": "string",
      "orderId": "uuid",
      "payerEmail": "string",
      "payerName": "string"
    }
    ```
    *Nota: Se o cliente enviar `amount`, esse campo é sumariamente ignorado.*
  - **Função Interna `verifyAndRecalculateOrderTotal(supabase, orderId)`**:
    - Busca o pedido na tabela `orders`.
    - Itera sobre os `order.items`.
    - Para cada item, busca `products.price` pelo `product_id`.
    - Valida adicionais na tabela `product_additionals` ou `complement_items`.
    - Soma a taxa de entrega da loja (`tenants.delivery_fee`).
    - Aplica eventual cupom ativo e válido (`coupons`).
    - Retorna o `officialTotalAmount`.

### 2. Validador de Webhook / Polling (`check_payment_status`)
- Ao consultar o status do pagamento no Mercado Pago:
  - Se `status === "approved"`, verifica se `mpPayment.transaction_amount >= order.total_amount`.
  - Se o valor pago for inferior (ex: tentativa de pagar fatura antiga adulterada), rejeita a aprovação e marca o pedido como `payment_status: "fraud_detected"`.

## Data Models

### Modelo do Item no Pedido (`orders.items` JSONB):
```typescript
interface OrderItem {
  id: string;
  product_id: string;
  name: string;
  quantity: number;
  product_price?: number;
  price?: number;
  additionals?: Array<{
    id?: string;
    name: string;
    price: number;
  }>;
  subtotal?: number;
}
```

### Regra de Recálculo:
$$Total = \left( \sum_{i \in items} \left( ItemPrice_i \times Quantity_i + \sum AddPrice \right) \right) + DeliveryFee - Discount$$

## Error Handling

| Código de Erro | Causa | Resposta HTTP | Ação |
|---|---|---|---|
| `ORDER_NOT_FOUND` | `orderId` inexistente | 404 Not Found | Aborta operação |
| `TAMPERING_DETECTED` | Diferença gritante de itens ou produtos inexistentes | 400 Bad Request | Bloqueia transação |
| `INVALID_ACCESS_TOKEN` | Token do Mercado Pago do lojista ausente ou expirado | 400 Bad Request | Retorna mensagem explicativa |
| `INSUFFICIENT_PAYMENT` | Pagamento aprovado no MP com valor menor que o pedido | 422 Unprocessable | Bloqueia confirmação do pedido |

## Testing Strategy

1. **Teste de Simulação de Ataque**:
   - Criar um pedido com 1 produto de R$ 35,00.
   - Forjar uma requisição HTTP via script/curl enviando `amount: 0.01`.
   - Verificar se o QR Code retornado pela Edge Function tem o valor oficial de R$ 35,00 (+ taxa de entrega), e NÃO R$ 0,01.
2. **Teste de Fluxo Legítimo**:
   - Fazer checkout normal no cardápio e verificar que o valor gerado é exato ao carrinho.
3. **Teste de Cupom e Taxa de Entrega**:
   - Aplicar cupom de desconto e verificar se o recálculo preserva a dedução correta.
