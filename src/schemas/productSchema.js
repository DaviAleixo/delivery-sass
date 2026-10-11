import { z } from "zod";

export const productSchema = z.object({
  name: z.string().min(2, "Nome do produto deve ter no mínimo 2 letras"),
  description: z.string().optional().default(""),
  price: z.coerce.number().min(0, "O preço deve ser maior ou igual a zero"),
  category: z.string().optional().default(""),
  category_id: z.string().optional().nullable(),
  image_url: z.string().optional().nullable().default(""),
  available: z.boolean().default(true),
  popular: z.boolean().default(false)
});
