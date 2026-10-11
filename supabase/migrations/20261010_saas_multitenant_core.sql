-- =====================================================================
-- 🚀 SAAS MULTI-TENANT DELIVERY — SCHEMA DEFINITIVO E MIGRATION CORE
-- SGBD: PostgreSQL 14+ / Supabase
-- Arquivo: supabase/migrations/20261010_saas_multitenant_core.sql
-- 
-- Recursos:
--   ✓ Arquitetura Multi-Tenant com isolamento total via `tenant_id`
--   ✓ Tabela mestre `tenants` com suporte a planos (Basic / Premium)
--   ✓ Customização de marca (cores, banners, logos, horários, taxas)
--   ✓ Índices otimizados por `tenant_id` (baixíssimo consumo no Supabase)
--   ✓ Triggers automáticos de timestamp `updated_date`
--   ✓ Supabase Realtime preparado para escutar pedidos por tenant
--   ✓ RPCs multi-tenant (login administrativo, métricas e clientes)
--   ✓ Configuração do Supabase Storage (`restaurant-images`)
--   ✓ Seed idempotente da loja piloto (Vruum Burguer) e loja teste
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. EXTENSÕES
-- ---------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------
-- 2. TIPOS ENUMERADOS (DOMÍNIOS)
-- ---------------------------------------------------------------------
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tenant_plan') THEN
        CREATE TYPE tenant_plan AS ENUM ('basic', 'premium');
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'order_status') THEN
        CREATE TYPE order_status AS ENUM (
            'pendente',      -- Pedido recebido, aguardando confirmação no painel
            'confirmado',    -- Pedido aceito pelo restaurante
            'preparando',    -- Em produção na cozinha
            'enviado',       -- Saiu para entrega (delivery)
            'entregue',      -- Entregue ao cliente / retirado
            'cancelado'      -- Cancelado
        );
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_method') THEN
        CREATE TYPE payment_method AS ENUM (
            'dinheiro',
            'pix',
            'cartao',
            'cartao_credito',
            'cartao_debito'
        );
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'order_type') THEN
        CREATE TYPE order_type AS ENUM (
            'delivery',      -- Entrega no endereço do cliente
            'pickup',        -- Retirada no balcão
            'balcao',        -- PDV Balcão
            'dine_in',       -- Consumo na mesa / local
            'takeaway'
        );
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'coupon_discount_type') THEN
        CREATE TYPE coupon_discount_type AS ENUM (
            'percentage',
            'fixed_amount',
            'fixed'
        );
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'coupon_apply_to') THEN
        CREATE TYPE coupon_apply_to AS ENUM (
            'order_total',
            'specific_products'
        );
    END IF;
END $$;

-- ---------------------------------------------------------------------
-- 3. TABELA MESTRE: TENANTS (INQUILINOS / RESTAURANTES)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tenants (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug                 TEXT NOT NULL UNIQUE,          -- ex: 'vruum-burguer' -> /vruum-burguer
    name                 TEXT NOT NULL,                 -- Nome fantasia
    plan                 TEXT NOT NULL DEFAULT 'basic', -- 'basic' | 'premium'
    custom_domain        TEXT UNIQUE,                   -- ex: 'pedir.restaurante.com.br' (Premium)
    is_active            BOOLEAN NOT NULL DEFAULT TRUE, -- Controle de assinatura ativa
    
    -- Identidade Visual e Layout
    logo_url             TEXT,
    banner_url           TEXT,
    theme_config         JSONB NOT NULL DEFAULT '{
        "primary_color": "#E11D48",
        "secondary_color": "#111827",
        "font_family": "Inter",
        "layout_style": "standard"
    }'::jsonb,
    
    -- Dados de Contato e Localização
    phone                TEXT DEFAULT '(11) 99999-9999',
    whatsapp             TEXT DEFAULT '11999999999',
    address              TEXT DEFAULT 'Av. Principal, 100 - Centro',
    instagram            TEXT DEFAULT '',
    
    -- Regras Operacionais e Taxas
    delivery_fee         NUMERIC(10,2) NOT NULL DEFAULT 5.00,
    min_order_value      NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    delivery_time        TEXT DEFAULT '40-50 min',
    opening_time         TEXT DEFAULT '18:00',
    closing_time         TEXT DEFAULT '23:59',
    open_days            JSONB NOT NULL DEFAULT '["segunda","terca","quarta","quinta","sexta","sabado","domingo"]'::jsonb,
    manual_store_open    BOOLEAN DEFAULT NULL,
    manual_override_date TEXT DEFAULT NULL,

    created_date         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_date         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------
-- 4. TABELAS FILHAS DO SAAS (TODAS COM tenant_id)
-- ---------------------------------------------------------------------

-- ========================= ADMIN_USERS ===============================
-- Usuários do painel de cada restaurante
CREATE TABLE IF NOT EXISTS public.admin_users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    username        TEXT NOT NULL,
    password        TEXT NOT NULL,
    role            TEXT NOT NULL DEFAULT 'admin',
    permissions     JSONB NOT NULL DEFAULT '["*"]'::jsonb,
    active          BOOLEAN NOT NULL DEFAULT TRUE,
    created_date    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_date    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_tenant_admin_user UNIQUE (tenant_id, username)
);

-- ========================== CATEGORIES ===============================
-- Categorias do cardápio por restaurante
CREATE TABLE IF NOT EXISTS public.categories (
    id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    order_index     NUMERIC NOT NULL DEFAULT 0,
    is_combo        BOOLEAN NOT NULL DEFAULT FALSE,
    created_date    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_date    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =========================== PRODUCTS ================================
-- Produtos do cardápio
CREATE TABLE IF NOT EXISTS public.products (
    id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    description     TEXT,
    price           NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    category        TEXT REFERENCES public.categories(id) ON DELETE SET NULL,
    category_id     TEXT REFERENCES public.categories(id) ON DELETE SET NULL,
    image_url       TEXT,
    available       BOOLEAN NOT NULL DEFAULT TRUE,
    popular         BOOLEAN NOT NULL DEFAULT FALSE,
    created_date    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_date    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ======================= PRODUCT_ADDITIONALS (LEGACY) ==================
CREATE TABLE IF NOT EXISTS public.product_additionals (
    id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    product_id      TEXT NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    price           NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    required        BOOLEAN NOT NULL DEFAULT FALSE,
    max_quantity    NUMERIC NOT NULL DEFAULT 1,
    active          BOOLEAN NOT NULL DEFAULT TRUE,
    created_date    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_date    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ======================= COMPLEMENT_GROUPS ============================
-- Grupos de adicionais (ex: Ponto da Carne, Bebidas, Molhos)
CREATE TABLE IF NOT EXISTS public.complement_groups (
    id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    description     TEXT,
    min_quantity    INTEGER NOT NULL DEFAULT 0,
    max_quantity    INTEGER NOT NULL DEFAULT 1,
    required        BOOLEAN NOT NULL DEFAULT FALSE,
    active          BOOLEAN NOT NULL DEFAULT TRUE,
    order_index     INTEGER NOT NULL DEFAULT 0,
    created_date    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_date    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ======================= COMPLEMENT_ITEMS =============================
CREATE TABLE IF NOT EXISTS public.complement_items (
    id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    group_id        TEXT NOT NULL REFERENCES public.complement_groups(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    description     TEXT,
    price           NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    max_quantity    INTEGER NOT NULL DEFAULT 1,
    image_url       TEXT,
    active          BOOLEAN NOT NULL DEFAULT TRUE,
    order_index     INTEGER NOT NULL DEFAULT 0,
    created_date    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_date    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =================== PRODUCT_COMPLEMENT_GROUPS ========================
CREATE TABLE IF NOT EXISTS public.product_complement_groups (
    id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    product_id      TEXT NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    group_id        TEXT NOT NULL REFERENCES public.complement_groups(id) ON DELETE CASCADE,
    order_index     INTEGER NOT NULL DEFAULT 0,
    created_date    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_tenant_product_group UNIQUE (tenant_id, product_id, group_id)
);

-- ========================== BANNER_IMAGES ============================
CREATE TABLE IF NOT EXISTS public.banner_images (
    id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    title           TEXT,
    image_url       TEXT NOT NULL,
    order_index     NUMERIC NOT NULL DEFAULT 0,
    active          BOOLEAN NOT NULL DEFAULT TRUE,
    created_date    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_date    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tabela espelho banners para compatibilidade
CREATE TABLE IF NOT EXISTS public.banners (
    id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    title           TEXT,
    image_url       TEXT NOT NULL,
    order_index     NUMERIC NOT NULL DEFAULT 0,
    active          BOOLEAN NOT NULL DEFAULT TRUE,
    created_date    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_date    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================ COUPONS ================================
CREATE TABLE IF NOT EXISTS public.coupons (
    id                  TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id           UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    code                TEXT NOT NULL,
    name                TEXT NOT NULL,
    description         TEXT,
    discount_type       TEXT NOT NULL DEFAULT 'percentage',
    discount_value      NUMERIC(10,2) NOT NULL,
    apply_to            TEXT NOT NULL DEFAULT 'order_total',
    applicable_products JSONB NOT NULL DEFAULT '[]'::jsonb,
    min_order_value     NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    usage_limit         NUMERIC,
    start_date          TIMESTAMPTZ,
    end_date            TIMESTAMPTZ,
    active              BOOLEAN NOT NULL DEFAULT TRUE,
    created_date        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_date        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_tenant_coupon_code UNIQUE (tenant_id, code)
);

-- ========================== COUPON_USAGES =============================
CREATE TABLE IF NOT EXISTS public.coupon_usages (
    id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    coupon_id       TEXT NOT NULL REFERENCES public.coupons(id) ON DELETE CASCADE,
    user_email      TEXT NOT NULL,
    order_id        TEXT,
    created_date    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_date    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================= ORDERS ================================
-- Pedidos (Gestão do KDS / Kanban)
CREATE TABLE IF NOT EXISTS public.orders (
    id                  TEXT PRIMARY KEY DEFAULT ('order_' || gen_random_uuid()::text),
    tenant_id           UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    order_number        SERIAL,
    customer_name       TEXT NOT NULL,
    customer_phone      TEXT NOT NULL,
    customer_email      TEXT,
    customer_address    TEXT,
    delivery_address    TEXT,
    total_amount        NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    total               NUMERIC(10,2) DEFAULT 0.00,
    subtotal            NUMERIC(10,2) DEFAULT 0.00,
    delivery_fee        NUMERIC(10,2) DEFAULT 0.00,
    status              TEXT NOT NULL DEFAULT 'pendente',
    payment_method      TEXT,
    order_type          TEXT NOT NULL DEFAULT 'delivery',
    table_number        TEXT,
    notes               TEXT,
    coupon_code         TEXT,
    discount_amount     NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    discount            NUMERIC(10,2) DEFAULT 0.00,
    user_email          TEXT,
    items               JSONB NOT NULL DEFAULT '[]'::jsonb,
    sent_at             TIMESTAMPTZ DEFAULT NOW(),
    created_date        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_date        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =========================== ORDER_ITEMS =============================
CREATE TABLE IF NOT EXISTS public.order_items (
    id                  TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id           UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    order_id            TEXT NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    product_id          TEXT,
    product_name        TEXT NOT NULL,
    product_price       NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    quantity            NUMERIC NOT NULL DEFAULT 1,
    subtotal            NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    created_date        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_date        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ======================= ORDER_ITEM_ADDITIONALS ======================
CREATE TABLE IF NOT EXISTS public.order_item_additionals (
    id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    order_item_id   TEXT NOT NULL REFERENCES public.order_items(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    price           NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    created_date    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_date    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ========================== USER_ADDRESSES ===========================
CREATE TABLE IF NOT EXISTS public.user_addresses (
    id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id       UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
    user_email      TEXT,
    user_phone      TEXT,
    name            TEXT NOT NULL DEFAULT 'Casa',
    cep             TEXT,
    zip_code        TEXT,
    street          TEXT NOT NULL,
    number          TEXT NOT NULL,
    complement      TEXT,
    neighborhood    TEXT NOT NULL,
    city            TEXT NOT NULL DEFAULT 'Contagem',
    state           TEXT NOT NULL DEFAULT 'MG',
    reference       TEXT,
    is_default      BOOLEAN NOT NULL DEFAULT FALSE,
    created_date    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_date    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------
-- 5. ÍNDICES DE ALTA PERFORMANCE (MULTI-TENANCY OTIMIZADO)
-- ---------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_tenants_slug ON public.tenants(slug);
CREATE INDEX IF NOT EXISTS idx_tenants_custom_domain ON public.tenants(custom_domain) WHERE custom_domain IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_admin_users_lookup ON public.admin_users(tenant_id, username, active);

CREATE INDEX IF NOT EXISTS idx_categories_tenant_order ON public.categories(tenant_id, order_index ASC);
CREATE INDEX IF NOT EXISTS idx_products_tenant_cat ON public.products(tenant_id, category_id, available);
CREATE INDEX IF NOT EXISTS idx_products_tenant_popular ON public.products(tenant_id, popular) WHERE popular = TRUE;

CREATE INDEX IF NOT EXISTS idx_complement_groups_tenant ON public.complement_groups(tenant_id, order_index ASC);
CREATE INDEX IF NOT EXISTS idx_complement_items_tenant_group ON public.complement_items(tenant_id, group_id, order_index ASC);
CREATE INDEX IF NOT EXISTS idx_product_comp_groups_tenant ON public.product_complement_groups(tenant_id, product_id);

CREATE INDEX IF NOT EXISTS idx_banners_tenant ON public.banners(tenant_id, active, order_index ASC);
CREATE INDEX IF NOT EXISTS idx_coupons_tenant_code ON public.coupons(tenant_id, code, active);

-- Índices de Pedidos (Crítico para KDS / Realtime e Painel de Gestão)
CREATE INDEX IF NOT EXISTS idx_orders_tenant_status ON public.orders(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_tenant_date ON public.orders(tenant_id, created_date DESC);
CREATE INDEX IF NOT EXISTS idx_orders_tenant_phone ON public.orders(tenant_id, customer_phone);

-- ---------------------------------------------------------------------
-- 6. FUNÇÃO E TRIGGERS DE UPDATED_DATE AUTOMÁTICO
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_updated_date()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_date = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
    tbl TEXT;
    tables TEXT[] := ARRAY[
        'tenants', 'admin_users', 'categories', 'products', 'product_additionals',
        'complement_groups', 'complement_items', 'banner_images', 'banners',
        'coupons', 'coupon_usages', 'orders', 'order_items', 'order_item_additionals', 'user_addresses'
    ];
BEGIN
    FOREACH tbl IN ARRAY tables LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS trg_update_date_%I ON public.%I;', tbl, tbl);
        EXECUTE format('
            CREATE TRIGGER trg_update_date_%I
            BEFORE UPDATE ON public.%I
            FOR EACH ROW
            EXECUTE FUNCTION public.handle_updated_date();
        ', tbl, tbl);
    END LOOP;
END $$;

-- ---------------------------------------------------------------------
-- 7. ROW LEVEL SECURITY (RLS) MULTI-TENANT
-- ---------------------------------------------------------------------
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_additionals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.complement_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.complement_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_complement_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.banner_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.banners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupon_usages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_item_additionals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_addresses ENABLE ROW LEVEL SECURITY;

-- Políticas de Leitura Pública para o Cardápio (anon e authenticated)
CREATE POLICY "Public read active tenants" ON public.tenants FOR SELECT USING (is_active = TRUE);
CREATE POLICY "Public read categories" ON public.categories FOR SELECT USING (TRUE);
CREATE POLICY "Public read products" ON public.products FOR SELECT USING (available = TRUE);
CREATE POLICY "Public read complement_groups" ON public.complement_groups FOR SELECT USING (active = TRUE);
CREATE POLICY "Public read complement_items" ON public.complement_items FOR SELECT USING (active = TRUE);
CREATE POLICY "Public read product_complement_groups" ON public.product_complement_groups FOR SELECT USING (TRUE);
CREATE POLICY "Public read banners" ON public.banners FOR SELECT USING (active = TRUE);
CREATE POLICY "Public read banner_images" ON public.banner_images FOR SELECT USING (active = TRUE);
CREATE POLICY "Public read coupons" ON public.coupons FOR SELECT USING (active = TRUE);

-- Pedidos: Clientes podem criar pedidos (INSERT) e ler seus pedidos
CREATE POLICY "Public insert orders" ON public.orders FOR INSERT WITH CHECK (TRUE);
CREATE POLICY "Public read own orders" ON public.orders FOR SELECT USING (TRUE);
CREATE POLICY "Public insert order_items" ON public.order_items FOR INSERT WITH CHECK (TRUE);
CREATE POLICY "Public read order_items" ON public.order_items FOR SELECT USING (TRUE);

-- Operações Administrativas (Bypass via Service Role ou autenticação de sessão)
CREATE POLICY "Service role full access tenants" ON public.tenants FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access admin_users" ON public.admin_users FOR ALL USING (TRUE);
CREATE POLICY "Allow admin manage categories" ON public.categories FOR ALL USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "Allow admin manage products" ON public.products FOR ALL USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "Allow admin manage groups" ON public.complement_groups FOR ALL USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "Allow admin manage items" ON public.complement_items FOR ALL USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "Allow admin manage prod_groups" ON public.product_complement_groups FOR ALL USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "Allow admin manage banners" ON public.banners FOR ALL USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "Allow admin manage banner_images" ON public.banner_images FOR ALL USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "Allow admin manage coupons" ON public.coupons FOR ALL USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "Allow admin update orders" ON public.orders FOR UPDATE USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "Allow manage addresses" ON public.user_addresses FOR ALL USING (TRUE) WITH CHECK (TRUE);

-- ---------------------------------------------------------------------
-- 8. SUPABASE STORAGE (BUCKET restaurant-images)
-- ---------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'restaurant-images',
    'restaurant-images',
    TRUE,
    5242880, -- 5MB por arquivo
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml']
)
ON CONFLICT (id) DO UPDATE SET
    public = TRUE,
    file_size_limit = 5242880;

DROP POLICY IF EXISTS "Public can view restaurant-images" ON storage.objects;
CREATE POLICY "Public can view restaurant-images"
ON storage.objects FOR SELECT
USING (bucket_id = 'restaurant-images');

DROP POLICY IF EXISTS "Anyone can upload to restaurant-images" ON storage.objects;
CREATE POLICY "Anyone can upload to restaurant-images"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'restaurant-images');

DROP POLICY IF EXISTS "Anyone can update restaurant-images" ON storage.objects;
CREATE POLICY "Anyone can update restaurant-images"
ON storage.objects FOR UPDATE
USING (bucket_id = 'restaurant-images');

DROP POLICY IF EXISTS "Anyone can delete restaurant-images" ON storage.objects;
CREATE POLICY "Anyone can delete restaurant-images"
ON storage.objects FOR DELETE
USING (bucket_id = 'restaurant-images');

-- ---------------------------------------------------------------------
-- 9. SUPABASE REALTIME (DISPARO INSTANTÂNEO DE PEDIDOS)
-- ---------------------------------------------------------------------
ALTER TABLE public.orders REPLICA IDENTITY FULL;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' 
          AND schemaname = 'public' 
          AND tablename = 'orders'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;

-- ---------------------------------------------------------------------
-- 10. RPCS MULTI-TENANT (FUNÇÕES SQL SEGURAS)
-- ---------------------------------------------------------------------

-- 10.1 Login Administrativo Multi-Tenant
CREATE OR REPLACE FUNCTION public.verify_admin_login(
    p_username    TEXT,
    p_password    TEXT,
    p_tenant_slug TEXT DEFAULT NULL
)
RETURNS TABLE (
    success       BOOLEAN,
    user_id       UUID,
    tenant_id     UUID,
    tenant_slug   TEXT,
    tenant_name   TEXT,
    username      TEXT,
    role          TEXT,
    permissions   JSONB,
    message       TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user RECORD;
BEGIN
    -- Busca o usuário, opcionalmente filtrando pelo tenant_slug
    SELECT 
        u.id,
        u.tenant_id,
        t.slug AS tenant_slug,
        t.name AS tenant_name,
        u.username,
        u.password,
        u.role,
        u.permissions,
        u.active,
        t.is_active AS tenant_active
    INTO v_user
    FROM public.admin_users u
    JOIN public.tenants t ON t.id = u.tenant_id
    WHERE u.username = TRIM(p_username)
      AND (p_tenant_slug IS NULL OR t.slug = TRIM(p_tenant_slug))
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::JSONB, 'Usuário não encontrado.'::TEXT;
        RETURN;
    END IF;

    IF NOT v_user.tenant_active THEN
        RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::JSONB, 'Restaurante inativo. Contate o suporte.'::TEXT;
        RETURN;
    END IF;

    IF NOT v_user.active THEN
        RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::JSONB, 'Conta administrativa desativada.'::TEXT;
        RETURN;
    END IF;

    -- Validação por bcrypt ou plain-text de transição
    IF v_user.password = crypt(p_password, v_user.password) OR v_user.password = p_password THEN
        RETURN QUERY SELECT 
            TRUE,
            v_user.id,
            v_user.tenant_id,
            v_user.tenant_slug,
            v_user.tenant_name,
            v_user.username,
            v_user.role,
            v_user.permissions,
            'Login realizado com sucesso.'::TEXT;
    ELSE
        RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::JSONB, 'Senha incorreta.'::TEXT;
    END IF;
END;
$$;

-- 10.2 Métricas de Vendas por Tenant
CREATE OR REPLACE FUNCTION public.get_sales_metrics(
    p_tenant_id  UUID,
    p_start_date TIMESTAMPTZ DEFAULT NULL,
    p_end_date   TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_start TIMESTAMPTZ := COALESCE(p_start_date, (NOW() AT TIME ZONE 'UTC' - INTERVAL '30 days'));
    v_end   TIMESTAMPTZ := COALESCE(p_end_date, NOW() AT TIME ZONE 'UTC');
    v_total_revenue NUMERIC(10,2) := 0;
    v_total_orders  INT := 0;
    v_avg_ticket    NUMERIC(10,2) := 0;
    v_pending       INT := 0;
    v_confirmed     INT := 0;
    v_preparing     INT := 0;
    v_sent          INT := 0;
    v_delivered     INT := 0;
    v_cancelled     INT := 0;
BEGIN
    SELECT 
        COALESCE(SUM(COALESCE(total, total_amount, 0)), 0),
        COUNT(*),
        CASE WHEN COUNT(*) > 0 THEN COALESCE(SUM(COALESCE(total, total_amount, 0)), 0) / COUNT(*) ELSE 0 END,
        COUNT(*) FILTER (WHERE status = 'pendente'),
        COUNT(*) FILTER (WHERE status = 'confirmado'),
        COUNT(*) FILTER (WHERE status = 'preparando'),
        COUNT(*) FILTER (WHERE status = 'enviado'),
        COUNT(*) FILTER (WHERE status = 'entregue'),
        COUNT(*) FILTER (WHERE status = 'cancelado')
    INTO 
        v_total_revenue, v_total_orders, v_avg_ticket,
        v_pending, v_confirmed, v_preparing, v_sent, v_delivered, v_cancelled
    FROM public.orders
    WHERE tenant_id = p_tenant_id
      AND created_date >= v_start
      AND created_date <= v_end;

    RETURN jsonb_build_object(
        'period_start',   v_start,
        'period_end',     v_end,
        'total_revenue',  v_total_revenue,
        'total_orders',   v_total_orders,
        'average_ticket', ROUND(v_avg_ticket, 2),
        'by_status', jsonb_build_object(
            'pendente',   v_pending,
            'confirmado', v_confirmed,
            'preparando', v_preparing,
            'enviado',    v_sent,
            'entregue',   v_delivered,
            'cancelado',  v_cancelled
        )
    );
END;
$$;

-- 10.3 Resumo de Clientes por Tenant
CREATE OR REPLACE FUNCTION public.get_clients_summary(p_tenant_id UUID)
RETURNS TABLE (
    customer_phone TEXT,
    customer_name  TEXT,
    customer_email TEXT,
    last_address   TEXT,
    total_orders   BIGINT,
    total_spent    NUMERIC,
    first_order_at TIMESTAMPTZ,
    last_order_at  TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        o.customer_phone,
        (ARRAY_AGG(o.customer_name ORDER BY o.created_date DESC))[1] AS customer_name,
        (ARRAY_AGG(o.customer_email ORDER BY o.created_date DESC) FILTER (WHERE o.customer_email IS NOT NULL AND o.customer_email <> ''))[1] AS customer_email,
        (ARRAY_AGG(COALESCE(o.delivery_address, o.customer_address) ORDER BY o.created_date DESC) FILTER (WHERE COALESCE(o.delivery_address, o.customer_address) IS NOT NULL))[1] AS last_address,
        COUNT(*)::BIGINT AS total_orders,
        COALESCE(SUM(COALESCE(o.total, o.total_amount, 0)), 0)::NUMERIC AS total_spent,
        MIN(o.created_date) AS first_order_at,
        MAX(o.created_date) AS last_order_at
    FROM public.orders o
    WHERE o.tenant_id = p_tenant_id
      AND o.customer_phone IS NOT NULL 
      AND TRIM(o.customer_phone) <> ''
    GROUP BY o.customer_phone
    ORDER BY MAX(o.created_date) DESC;
END;
$$;

-- 10.4 Busca de Cliente por Telefone dentro do Tenant
CREATE OR REPLACE FUNCTION public.lookup_customer_by_phone(
    p_phone     TEXT,
    p_tenant_id UUID
)
RETURNS TABLE (
    customer_name  TEXT,
    customer_phone TEXT,
    last_address   TEXT,
    total_orders   BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        (ARRAY_AGG(o.customer_name ORDER BY o.created_date DESC))[1] AS customer_name,
        o.customer_phone,
        (ARRAY_AGG(COALESCE(o.delivery_address, o.customer_address) ORDER BY o.created_date DESC))[1] AS last_address,
        COUNT(*)::BIGINT AS total_orders
    FROM public.orders o
    WHERE o.tenant_id = p_tenant_id
      AND o.customer_phone = TRIM(p_phone)
    GROUP BY o.customer_phone
    LIMIT 1;
END;
$$;

-- ---------------------------------------------------------------------
-- 11. SEEDS INICIAIS (IDEMPOTENTES)
-- ---------------------------------------------------------------------

-- 11.1 Tenant Piloto: VRUUM BURGUER
INSERT INTO public.tenants (
    id, slug, name, plan, logo_url, banner_url,
    phone, whatsapp, address, instagram,
    delivery_fee, min_order_value, delivery_time,
    theme_config
)
VALUES (
    'a0000000-0000-0000-0000-000000000001',
    'vruum-burguer',
    'Vruum Burguer',
    'basic',
    'https://images.unsplash.com/photo-1550547660-d9450f859349?w=300&h=300&fit=crop',
    'https://images.unsplash.com/photo-1586190848861-99aa4a171e90?w=1200&h=400&fit=crop',
    '(11) 99999-9999',
    '11999999999',
    'Av. Brasil, 1500 - Centro',
    '@vruumburguer',
    6.50,
    20.00,
    '40-50 min',
    '{
        "primary_color": "#E11D48",
        "secondary_color": "#111827",
        "font_family": "Inter",
        "layout_style": "standard"
    }'::jsonb
)
ON CONFLICT (id) DO UPDATE SET
    slug = EXCLUDED.slug,
    name = EXCLUDED.name,
    theme_config = EXCLUDED.theme_config;

-- 11.2 Admin do Tenant Piloto (Vruum Burguer)
-- Usuário: admin / Senha criptografada: admin123
INSERT INTO public.admin_users (
    id, tenant_id, username, password, role, permissions, active
)
VALUES (
    'b0000000-0000-0000-0000-000000000001',
    'a0000000-0000-0000-0000-000000000001',
    'admin',
    crypt('admin123', gen_salt('bf', 8)),
    'admin',
    '["*"]'::jsonb,
    TRUE
)
ON CONFLICT (tenant_id, username) DO UPDATE SET
    password = EXCLUDED.password,
    active = TRUE;

-- 11.3 Categorias Iniciais da Vruum Burguer
INSERT INTO public.categories (id, tenant_id, name, order_index, is_combo) VALUES
    ('cat-burgers-vruum', 'a0000000-0000-0000-0000-000000000001', 'Burgers Artesanais', 1, FALSE),
    ('cat-combos-vruum',  'a0000000-0000-0000-0000-000000000001', 'Combos Especiais',  2, TRUE),
    ('cat-porcoes-vruum', 'a0000000-0000-0000-0000-000000000001', 'Porções & Acompanhamentos', 3, FALSE),
    ('cat-bebidas-vruum', 'a0000000-0000-0000-0000-000000000001', 'Bebidas & Sucos',   4, FALSE),
    ('cat-sobrem-vruum',  'a0000000-0000-0000-0000-000000000001', 'Sobremesas',        5, FALSE)
ON CONFLICT (id) DO UPDATE SET
    tenant_id = EXCLUDED.tenant_id,
    name = EXCLUDED.name;

-- 11.4 Produtos da Vruum Burguer
INSERT INTO public.products (id, tenant_id, name, description, price, category_id, image_url, available, popular) VALUES
    ('prod-vruum-classic', 'a0000000-0000-0000-0000-000000000001', 'Vruum Classic Burger', 'Pão brioche tostado na manteiga, burger 160g de fraldinha, queijo cheddar inglês derretido, maionese artesanal da casa e picles crocante.', 32.90, 'cat-burgers-vruum', 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=600&fit=crop', TRUE, TRUE),
    ('prod-vruum-bacon',   'a0000000-0000-0000-0000-000000000001', 'Vruum Bacon Blast',   'Pão brioche, blend 180g bovino, fatias generosas de bacon caramelizado, dobro de queijo prato e molho barbecue rústico.', 37.90, 'cat-burgers-vruum', 'https://images.unsplash.com/photo-1553979459-d2229ba7433b?w=600&fit=crop', TRUE, TRUE),
    ('prod-combo-turbo',   'a0000000-0000-0000-0000-000000000001', 'Combo Turbo Vruum',   '1x Vruum Classic Burger + 1x Batata Rústica Crinkle individual crocante + 1x Refrigerante Lata 350ml à sua escolha.', 46.90, 'cat-combos-vruum', 'https://images.unsplash.com/photo-1594212699903-ec8a3eca50f5?w=600&fit=crop', TRUE, TRUE),
    ('prod-batata-rustica','a0000000-0000-0000-0000-000000000001', 'Batata Crinkle com Alecrim', '250g de batatas crinkle douradas e sequinhas, temperadas com sal fino marinho e alecrim fresco.', 18.90, 'cat-porcoes-vruum', 'https://images.unsplash.com/photo-1573080496219-bb080dd4f877?w=600&fit=crop', TRUE, FALSE),
    ('prod-coca-lata',     'a0000000-0000-0000-0000-000000000001', 'Coca-Cola Original 350ml', 'Lata de 350ml trincando de gelada.', 6.50, 'cat-bebidas-vruum', 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?w=600&fit=crop', TRUE, FALSE)
ON CONFLICT (id) DO UPDATE SET
    tenant_id = EXCLUDED.tenant_id,
    name = EXCLUDED.name,
    price = EXCLUDED.price;

-- 11.5 Banners da Vruum Burguer
INSERT INTO public.banners (id, tenant_id, title, image_url, order_index, active) VALUES
    ('banner-vruum-1', 'a0000000-0000-0000-0000-000000000001', 'Festival de Bacon Vruum', 'https://images.unsplash.com/photo-1586190848861-99aa4a171e90?w=1200&h=400&fit=crop', 1, TRUE),
    ('banner-vruum-2', 'a0000000-0000-0000-0000-000000000001', 'Combo Turbo com Desconto', 'https://images.unsplash.com/photo-1550547660-d9450f859349?w=1200&h=400&fit=crop', 2, TRUE)
ON CONFLICT (id) DO UPDATE SET
    tenant_id = EXCLUDED.tenant_id,
    image_url = EXCLUDED.image_url;

-- 11.6 Cupom de Boas-Vindas da Vruum Burguer
INSERT INTO public.coupons (id, tenant_id, code, name, description, discount_type, discount_value, min_order_value, active) VALUES
    ('cupom-vruum-10', 'a0000000-0000-0000-0000-000000000001', 'VRUUM10', '10% de Boas-Vindas', 'Ganhe 10% de desconto no seu primeiro pedido!', 'percentage', 10.00, 30.00, TRUE)
ON CONFLICT (id) DO UPDATE SET
    tenant_id = EXCLUDED.tenant_id,
    code = EXCLUDED.code;

-- 11.7 Segundo Tenant de Demonstração (Pizzaria Don Corleone) para comprovar isolamento multi-tenant
INSERT INTO public.tenants (
    id, slug, name, plan, logo_url, banner_url,
    phone, whatsapp, address, instagram,
    delivery_fee, min_order_value, delivery_time,
    theme_config
)
VALUES (
    'a0000000-0000-0000-0000-000000000002',
    'don-corleone-pizza',
    'Don Corleone Pizzaria',
    'premium',
    'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=300&h=300&fit=crop',
    'https://images.unsplash.com/photo-1579751626657-72bc17010498?w=1200&h=400&fit=crop',
    '(11) 98888-8888',
    '11988888888',
    'Rua das Palmeiras, 450 - Jardins',
    '@doncorleonepizza',
    8.00,
    35.00,
    '30-45 min',
    '{
        "primary_color": "#16A34A",
        "secondary_color": "#18181B",
        "font_family": "Inter",
        "layout_style": "premium"
    }'::jsonb
)
ON CONFLICT (id) DO UPDATE SET
    slug = EXCLUDED.slug,
    name = EXCLUDED.name;

INSERT INTO public.admin_users (
    id, tenant_id, username, password, role, permissions, active
)
VALUES (
    'b0000000-0000-0000-0000-000000000002',
    'a0000000-0000-0000-0000-000000000002',
    'admin',
    crypt('pizza123', gen_salt('bf', 8)),
    'admin',
    '["*"]'::jsonb,
    TRUE
)
ON CONFLICT (tenant_id, username) DO UPDATE SET
    password = EXCLUDED.password;

COMMIT;

-- =====================================================================
-- FIM DA MIGRATION SAAS MULTI-TENANT CORE
-- =====================================================================
