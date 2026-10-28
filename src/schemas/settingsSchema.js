import { z } from "zod";

export const neighborhoodItemSchema = z.object({
  id: z.string(),
  name: z.string().min(1, "Nome do bairro não pode ser vazio"),
  fee: z.coerce.number().min(0, "Taxa do bairro deve ser maior ou igual a zero"),
  active: z.boolean().default(true)
});

export const dayHoursSchema = z.object({
  day: z.coerce.number(),
  enabled: z.boolean().default(true),
  opening_time: z.string().default("18:00"),
  closing_time: z.string().default("23:00")
});

export const settingsSchema = z.object({
  restaurant_name: z.string().min(2, "Nome do restaurante deve ter pelo menos 2 caracteres"),
  restaurant_logo: z.string().optional().nullable().default(""),
  opening_time: z.string().optional().default("18:00"),
  closing_time: z.string().optional().default("23:00"),
  open_days: z.array(dayHoursSchema).optional().default([]),
  whatsapp: z.string().min(8, "WhatsApp do restaurante deve ser informado"),
  instagram: z.string().optional().nullable().default(""),
  address: z.string().optional().nullable().default(""),
  cep: z.string().optional().nullable().default(""),
  address_street: z.string().optional().nullable().default(""),
  address_number: z.string().optional().nullable().default(""),
  address_neighborhood: z.string().optional().nullable().default(""),
  address_city: z.string().optional().nullable().default(""),
  address_state: z.string().optional().nullable().default(""),
  address_complement: z.string().optional().nullable().default(""),
  delivery_fee_type: z.enum(["fixed", "neighborhood"]).default("fixed"),
  delivery_fee: z.coerce.number().min(0).default(0),
  min_order_value: z.coerce.number().min(0).default(0),
  free_delivery_threshold: z.coerce.number().optional().nullable(),
  delivery_fallback_fee: z.coerce.number().min(0).default(10),
  delivery_unlisted_policy: z.enum(["block", "fallback"]).default("block"),
  delivery_neighborhoods: z.array(neighborhoodItemSchema).optional().default([]),
  accepts_delivery: z.boolean().optional().default(true),
  accepts_takeaway: z.boolean().optional().default(true),
  pizza_pricing_rule: z.enum(["highest_price", "average"]).optional().default("highest_price"),
  salon_mode: z.string().optional().default("full"),
  table_service_fee_enabled: z.boolean().optional().default(false),
  table_service_fee_rate: z.coerce.number().min(0).max(100).optional().default(10)
});

