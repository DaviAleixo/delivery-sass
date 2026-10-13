import { z } from "zod";

export const orderItemSchema = z.object({
  id: z.string().optional(),
  product_id: z.string().optional(),
  name: z.string().min(1, "Nome do produto é obrigatório"),
  category_name: z.string().optional().nullable(),
  category: z.string().optional().nullable(),
  price: z.coerce.number().min(0, "Preço do produto deve ser maior ou igual a zero"),
  quantity: z.coerce.number().int().min(1, "Quantidade mínima é 1"),
  additionals: z.array(z.any()).optional().default([]),
  complements: z.array(z.any()).optional().default([]),
  notes: z.string().optional().default("")
});

export const orderSchema = z.object({
  customer_name: z.string().min(2, "Nome do cliente deve ter ao menos 2 caracteres"),
  customer_phone: z.string().min(8, "Telefone do cliente é obrigatório"),
  customer_email: z.string().email("E-mail inválido").optional().or(z.literal("")),
  order_type: z.enum(["delivery", "balcao", "mesa"], {
    errorMap: () => ({ message: "Tipo de pedido inválido" })
  }).default("delivery"),
  table_number: z.string().optional().nullable(),
  customer_address: z.string().optional().nullable(),
  delivery_address: z.string().optional().nullable(),
  payment_method: z.string().min(1, "Forma de pagamento é obrigatória"),
  change_for: z.coerce.number().optional().nullable(),
  notes: z.string().optional().nullable().default(""),
  coupon_code: z.string().optional().nullable(),
  discount_amount: z.coerce.number().optional().default(0),
  delivery_fee: z.coerce.number().min(0).default(0),
  subtotal: z.coerce.number().min(0).default(0),
  total_amount: z.coerce.number().min(0).default(0),
  items: z.array(orderItemSchema).min(1, "O pedido precisa de pelo menos 1 item")
}).refine((data) => {
  if (data.order_type === "delivery") {
    return Boolean(data.delivery_address || data.customer_address);
  }
  return true;
}, {
  message: "Endereço de entrega é obrigatório para pedidos de Delivery",
  path: ["delivery_address"]
}).refine((data) => {
  if (data.order_type === "mesa") {
    return Boolean(data.table_number && String(data.table_number).trim().length > 0);
  }
  return true;
}, {
  message: "Número da mesa é obrigatório para pedidos no salão",
  path: ["table_number"]
});
