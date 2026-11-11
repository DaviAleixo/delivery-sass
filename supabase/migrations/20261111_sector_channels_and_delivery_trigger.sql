-- Migration: Canais permitidos por setor (Delivery, Balcão/Retirada, Mesa/Autoatendimento)
-- e gatilho de impressão no Delivery (imediato ao chegar vs somente após aceitar).

ALTER TABLE public.production_sectors
  ADD COLUMN IF NOT EXISTS allowed_channels JSONB NOT NULL DEFAULT '["delivery","pickup","dine_in"]'::jsonb,
  ADD COLUMN IF NOT EXISTS print_on_delivery TEXT NOT NULL DEFAULT 'on_arrival'
    CHECK (print_on_delivery IN ('on_arrival', 'on_accept'));

