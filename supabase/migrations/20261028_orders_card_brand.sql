-- Adiciona coluna card_brand para armazenar a bandeira do cartão ou vale-refeição (ex: Visa, Mastercard, Alelo, Sodexo)
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS card_brand TEXT;

