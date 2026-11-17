-- ==============================================================================
-- 🚀 PEDEMULEKE — SINCRONIZAÇÃO COMPLETA E OFICIAL DE PRODUÇÃO
-- Projeto Alvo: jqwtnzdsaivbjudvjhld (PedeMuleke Prod)
-- Data: 17/11/2026
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ------------------------------------------------------------------------------
-- 1. ADICIONAR COLUNAS CRÍTICAS NA TABELA tenants (SE NÃO EXISTIREM)
-- ------------------------------------------------------------------------------
ALTER TABLE public.tenants
ADD COLUMN IF NOT EXISTS kanban_show_dine_in BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS kanban_show_pos BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS kds_show_dine_in BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS business_day_cutoff_time TEXT DEFAULT '04:00',
ADD COLUMN IF NOT EXISTS blind_cash_closing BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS spooler_station_token TEXT,
ADD COLUMN IF NOT EXISTS spooler_pairing_code TEXT,
ADD COLUMN IF NOT EXISTS spooler_last_seen_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS auto_accept_delivery BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS cashback_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS cashback_rate NUMERIC DEFAULT 5.0,
ADD COLUMN IF NOT EXISTS cashback_validity_days INTEGER DEFAULT 15,
ADD COLUMN IF NOT EXISTS cashback_max_discount_percentage NUMERIC DEFAULT 50.0,
ADD COLUMN IF NOT EXISTS table_service_fee_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS table_service_fee_rate NUMERIC DEFAULT 10.0,
ADD COLUMN IF NOT EXISTS pizza_pricing_rule TEXT DEFAULT 'highest_price',
ADD COLUMN IF NOT EXISTS accepts_delivery BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS accepts_takeaway BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS accepts_dine_in BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS salon_mode TEXT DEFAULT 'full',
ADD COLUMN IF NOT EXISTS delivery_fee_type TEXT DEFAULT 'fixed',
ADD COLUMN IF NOT EXISTS delivery_neighborhoods JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS delivery_unlisted_policy TEXT DEFAULT 'block',
ADD COLUMN IF NOT EXISTS delivery_fallback_fee NUMERIC DEFAULT 10.0,
ADD COLUMN IF NOT EXISTS free_delivery_threshold NUMERIC,
ADD COLUMN IF NOT EXISTS cep TEXT,
ADD COLUMN IF NOT EXISTS address_number TEXT,
ADD COLUMN IF NOT EXISTS address_street TEXT,
ADD COLUMN IF NOT EXISTS address_neighborhood TEXT,
ADD COLUMN IF NOT EXISTS address_city TEXT,
ADD COLUMN IF NOT EXISTS address_state TEXT,
ADD COLUMN IF NOT EXISTS address_complement TEXT,
ADD COLUMN IF NOT EXISTS payment_methods JSONB DEFAULT '{"accept_cash": true, "accept_card_credit": true, "accept_card_debit": true, "accept_online_mp": false}'::jsonb;

-- ------------------------------------------------------------------------------
-- 2. RECRIAR A VIEW tenants_public (ESSENCIAL PARA O CARDÁPIO PÚBLICO)
-- ------------------------------------------------------------------------------
DROP VIEW IF EXISTS public.tenants_public;
CREATE VIEW public.tenants_public AS
SELECT 
    t.id,
    t.slug,
    t.name,
    t.plan,
    t.custom_domain,
    t.is_active,
    t.logo_url,
    t.banner_url,
    t.theme_config,
    t.phone,
    t.whatsapp,
    t.address,
    t.instagram,
    t.delivery_fee,
    t.min_order_value,
    t.delivery_time,
    t.opening_time,
    t.closing_time,
    t.open_days,
    t.manual_store_open,
    t.manual_override_date,
    t.created_date,
    t.updated_date,
    t.cep,
    t.address_number,
    t.address_street,
    t.address_neighborhood,
    t.address_city,
    t.address_state,
    t.address_complement,
    t.delivery_fee_type,
    t.delivery_neighborhoods,
    t.delivery_unlisted_policy,
    t.delivery_fallback_fee,
    t.free_delivery_threshold,
    t.subscription_status,
    t.payment_methods,
    t.salon_mode,
    t.accepts_delivery,
    t.accepts_takeaway,
    t.accepts_dine_in,
    t.pizza_pricing_rule,
    t.table_service_fee_enabled,
    t.table_service_fee_rate,
    t.cashback_enabled,
    t.cashback_rate,
    t.cashback_validity_days,
    t.cashback_max_discount_percentage,
    t.kanban_show_dine_in,
    t.kanban_show_pos,
    t.kds_show_dine_in,
    t.business_day_cutoff_time
FROM public.tenants t
WHERE t.is_active = true;

GRANT SELECT ON public.tenants_public TO anon, authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 3. INSERIR TENANT OFICIAL PEDEMULEKE (SLUG 'teste' E ID '5489690b-a8dd-4f5e-bd75-de339521ac47')
-- ------------------------------------------------------------------------------
INSERT INTO public.tenants (
    id, slug, name, plan, is_active, 
    logo_url, phone, whatsapp, address, instagram, 
    delivery_fee, min_order_value, delivery_time, opening_time, closing_time, 
    open_days, manual_store_open, cep, address_number, address_street, 
    address_neighborhood, address_city, address_state, delivery_fee_type, 
    delivery_neighborhoods, delivery_unlisted_policy, delivery_fallback_fee, 
    payment_methods, salon_mode, accepts_delivery, accepts_takeaway, accepts_dine_in, 
    cashback_enabled, cashback_rate, cashback_validity_days, cashback_max_discount_percentage
) VALUES (
    '5489690b-a8dd-4f5e-bd75-de339521ac47'::uuid,
    'teste',
    'PedeMuleke',
    'premium',
    true,
    'https://pub-90fee729d11445a3b3a6aa0958f66fc8.r2.dev/tenants/5489690b-a8dd-4f5e-bd75-de3395/uploads/1792544062550_rltxdf_Mascote_de_Snack_em_Entre.webp',
    '(31) 98260-7426',
    '(31) 98260-7426',
    'Alameda Dois de Novembro, nº 44, Queluz, Conselheiro Lafaiete - MG',
    'davialeixo_nogueira',
    0.00,
    0.00,
    '40-50 min',
    '18:00',
    '23:59',
    '[{"day":0,"enabled":true,"opening_time":"18:00","closing_time":"23:59"},{"day":1,"enabled":true,"opening_time":"18:00","closing_time":"23:59"},{"day":2,"enabled":true,"opening_time":"18:00","closing_time":"23:59"},{"day":3,"enabled":true,"opening_time":"18:00","closing_time":"23:59"},{"day":4,"enabled":true,"opening_time":"18:00","closing_time":"23:59"},{"day":5,"enabled":true,"opening_time":"18:00","closing_time":"23:59"},{"day":6,"enabled":true,"opening_time":"18:00","closing_time":"23:59"}]'::jsonb,
    true,
    '36405-030',
    '44',
    'Alameda Dois de Novembro',
    'Queluz',
    'Conselheiro Lafaiete',
    'MG',
    'fixed',
    '[]'::jsonb,
    'allow',
    5.00,
    '{"accept_cash": true, "accept_online_mp": true, "accept_card_debit": true, "accept_card_credit": true, "accept_card_delivery": true, "accepted_card_brands": ["visa", "elo", "hipercard", "amex", "mastercard"], "accepted_meal_brands": ["alelo", "sodexo", "ticket", "vr", "caju", "flash", "eva", "swile"]}'::jsonb,
    'full',
    true,
    true,
    true,
    true,
    5.0,
    15,
    50.0
) ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    slug = EXCLUDED.slug,
    is_active = true,
    logo_url = COALESCE(EXCLUDED.logo_url, public.tenants.logo_url),
    payment_methods = EXCLUDED.payment_methods;

-- ------------------------------------------------------------------------------
-- 4. INSERIR TENANT MODELO VRUUM BURGUER ('a0000000-0000-0000-0000-000000000001')
-- ------------------------------------------------------------------------------
INSERT INTO public.tenants (
    id, slug, name, plan, is_active, 
    phone, whatsapp, address, 
    delivery_fee, min_order_value, delivery_time, opening_time, closing_time, 
    open_days, manual_store_open, salon_mode, accepts_delivery, accepts_takeaway, accepts_dine_in
) VALUES (
    'a0000000-0000-0000-0000-000000000001'::uuid,
    'vruum-burguer',
    'Vruum Burguer',
    'premium',
    true,
    '(11) 99999-9999',
    '11999999999',
    'Av. Principal, 100 - Centro',
    5.00,
    20.00,
    '40-50 min',
    '18:00',
    '23:59',
    '["segunda", "terca", "quarta", "quinta", "sexta", "sabado", "domingo"]'::jsonb,
    true,
    'full',
    true,
    true,
    true
) ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    slug = EXCLUDED.slug,
    is_active = true;

-- ------------------------------------------------------------------------------
-- 5. USUÁRIOS ADMINISTRATIVOS (LOGIN 'davi' E 'admin')
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_users (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
    username text NOT NULL,
    password text NOT NULL,
    role text DEFAULT 'admin'::text NOT NULL,
    permissions jsonb DEFAULT '["*"]'::jsonb,
    active boolean DEFAULT true NOT NULL,
    created_date timestamp with time zone DEFAULT now() NOT NULL,
    updated_date timestamp with time zone DEFAULT now() NOT NULL
);

INSERT INTO public.admin_users (
    tenant_id, username, password, role, permissions, active
) VALUES (
    '5489690b-a8dd-4f5e-bd75-de339521ac47'::uuid,
    'davi',
    '$2a$10$c83RW36CM77keh0lqyFRfOLLMxal3r77Lpve6Udo0abX7AthHdL1.',
    'admin',
    '["*"]'::jsonb,
    true
) ON CONFLICT DO NOTHING;

INSERT INTO public.admin_users (
    tenant_id, username, password, role, permissions, active
) VALUES (
    'a0000000-0000-0000-0000-000000000001'::uuid,
    'admin',
    '$2a$10$c83RW36CM77keh0lqyFRfOLLMxal3r77Lpve6Udo0abX7AthHdL1.',
    'admin',
    '["*"]'::jsonb,
    true
) ON CONFLICT DO NOTHING;

-- ------------------------------------------------------------------------------
-- 6. SETORES DE PRODUÇÃO (COZINHA, BAR)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.production_sectors (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    color text DEFAULT '#10b981',
    printer_name text,
    auto_print boolean DEFAULT false,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

INSERT INTO public.production_sectors (tenant_id, name, slug, color, auto_print, active)
VALUES 
    ('5489690b-a8dd-4f5e-bd75-de339521ac47'::uuid, 'Cozinha', 'cozinha', '#10b981', false, true),
    ('5489690b-a8dd-4f5e-bd75-de339521ac47'::uuid, 'Bar / Bebidas', 'bar', '#3b82f6', false, true)
ON CONFLICT DO NOTHING;

-- ------------------------------------------------------------------------------
-- 7. CATEGORIAS DE PRODUTOS
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.categories (
    id text NOT NULL PRIMARY KEY,
    tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
    name text NOT NULL,
    order_index text DEFAULT '0',
    is_combo boolean DEFAULT false,
    type text DEFAULT 'standard',
    pizza_sizes jsonb,
    sector_id uuid,
    created_date timestamp with time zone DEFAULT now() NOT NULL,
    updated_date timestamp with time zone DEFAULT now() NOT NULL
);

INSERT INTO public.categories (id, tenant_id, name, order_index, is_combo, type)
VALUES
    ('cat_burguers', '5489690b-a8dd-4f5e-bd75-de339521ac47'::uuid, 'Hambúrgueres Artesanais', '1', false, 'standard'),
    ('cat_pizzas', '5489690b-a8dd-4f5e-bd75-de339521ac47'::uuid, 'Pizzas Especiais', '2', false, 'pizza'),
    ('cat_bebidas', '5489690b-a8dd-4f5e-bd75-de339521ac47'::uuid, 'Bebidas & Refrigerantes', '3', false, 'standard')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

-- ------------------------------------------------------------------------------
-- 8. PRODUTOS OFICIAIS DO CARDÁPIO
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.products (
    id text NOT NULL PRIMARY KEY,
    tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
    name text NOT NULL,
    description text,
    price numeric NOT NULL,
    category text,
    category_id text,
    image_url text,
    available boolean DEFAULT true NOT NULL,
    popular boolean DEFAULT false NOT NULL,
    pizza_prices jsonb DEFAULT '{}'::jsonb,
    sector_id uuid,
    created_date timestamp with time zone DEFAULT now() NOT NULL,
    updated_date timestamp with time zone DEFAULT now() NOT NULL
);

INSERT INTO public.products (
    id, tenant_id, category_id, name, description, price, available, popular, image_url, pizza_prices
) VALUES 
    ('prod_muleke_duplo', '5489690b-a8dd-4f5e-bd75-de339521ac47'::uuid, 'cat_burguers', 'PedeMuleke Smash Duplo', 'Dois blends smash de 90g, queijo cheddar derretido, cebola caramelizada e molho da casa no pão brioche tostado na manteiga.', 32.90, true, true, 'https://pub-90fee729d11445a3b3a6aa0958f66fc8.r2.dev/tenants/5489690b-a8dd-4f5e-bd75-de3395/uploads/1792043955509_ie1pmo_flex_jpeg.webp', '{}'::jsonb),
    ('prod_muleke_bacon', '5489690b-a8dd-4f5e-bd75-de339521ac47'::uuid, 'cat_burguers', 'PedeMuleke Bacon Crispy', 'Blend bovino 160g, fatias crocantes de bacon artesanal, queijo prato, maionese verde e alface americana.', 35.90, true, true, 'https://pub-90fee729d11445a3b3a6aa0958f66fc8.r2.dev/tenants/teste/uploads/1792293294306_aj4dkg_smashcaramelizado_jpeg.webp', '{}'::jsonb),
    ('prod_pizza_calabresa', '5489690b-a8dd-4f5e-bd75-de339521ac47'::uuid, 'cat_pizzas', 'Pizza Calabresa Especial', 'Molho de tomate pelado italiano, mussarela especial, calabresa fatiada fina, cebola roxa e orégano.', 45.00, true, false, 'https://pub-90fee729d11445a3b3a6aa0958f66fc8.r2.dev/tenants/teste/uploads/1792293457506_6zuftp_Mesa_de_Madeira_com_Rio_E.webp', '{"broto": 25.00, "media": 38.00, "grande": 48.00, "familia": 58.00}'::jsonb),
    ('prod_coca_cola_lata', '5489690b-a8dd-4f5e-bd75-de339521ac47'::uuid, 'cat_bebidas', 'Coca-Cola Original 350ml', 'Lata bem gelada.', 6.50, true, true, null, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name, 
    price = EXCLUDED.price, 
    available = EXCLUDED.available;

-- ------------------------------------------------------------------------------
-- 9. POLÍTICAS DE RLS PÚBLICAS PARA CARDÁPIO (PERMITIR ACESSO ANÔNIMO LEITURA)
-- ------------------------------------------------------------------------------
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view active tenants" ON public.tenants;
CREATE POLICY "Public can view active tenants" ON public.tenants 
FOR SELECT USING (is_active = true);

DROP POLICY IF EXISTS "Public can view categories" ON public.categories;
CREATE POLICY "Public can view categories" ON public.categories 
FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public can view available products" ON public.products;
CREATE POLICY "Public can view available products" ON public.products 
FOR SELECT USING (available = true);

-- ------------------------------------------------------------------------------
-- 10. TABELA DE CÓDIGOS WHATSAPP OTP
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.whatsapp_otp_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
    phone TEXT NOT NULL,
    code TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    verified BOOLEAN NOT NULL DEFAULT FALSE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.whatsapp_otp_codes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full otp" ON public.whatsapp_otp_codes;
CREATE POLICY "Service role full otp" ON public.whatsapp_otp_codes 
FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Notificação de Conclusão
SELECT 'Sincronização de Produção Concluída com Sucesso! Lojas e Usuários Prontos.' as status;
