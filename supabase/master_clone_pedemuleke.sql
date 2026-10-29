-- =====================================================================
-- 🚀 PEDEMULEKE — REPLICAÇÃO DEFINITIVA DE BANCO DE PRODUÇÃO
-- Projeto Alvo: jqwtnzdsaivbjudvjhld (PedeMuleke Prod)
-- Gerado automaticamente a partir das migrações consolidadas do sistema
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- MIGRATION: 20261010_complete_vruum_burguer.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- =====================================================================
-- 🍔 VRUUM BURGUER — SCHEMA E MIGRATION COMPLETA DO BANCO DE DADOS
-- SGBD: PostgreSQL 14+ / Supabase
-- Arquivo: supabase/migrations/20261010_complete_vruum_burguer.sql
-- Descrição: Estrutura completa, definitiva e idempotente contendo:
--   ✓ Extensões necessárias (uuid-ossp, pgcrypto)
--   ✓ Tipos enumerados (Enums)
--   ✓ Todas as tabelas com relacionamentos e integridade referencial
--   ✓ Índices de alta performance e otimização para plano Free
--   ✓ Triggers automáticos de updated_date e sincronizações
--   ✓ Row Level Security (RLS) com políticas para todas as tabelas
--   ✓ Configuração do Supabase Storage (Bucket restaurant-images)
--   ✓ Publicação do Supabase Realtime (tabela orders)
--   ✓ RPCs completas: verify_admin_login, get_sales_metrics, 
--     get_clients_summary, lookup_customer_by_phone, update_customer_name_by_phone
--   ✓ Dados iniciais (Seeds) prontos com ON CONFLICT (idempotente)
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
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'order_status') THEN
        CREATE TYPE order_status AS ENUM (
            'pendente',      -- Pedido recebido, aguardando confirmação
            'confirmado',    -- Pedido aceito pelo restaurante
            'preparando',    -- Em produção na cozinha
            'enviado',       -- Saiu para entrega (delivery)
            'entregue',      -- Entregue ao cliente / retirado no balcão
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
            'pickup',        -- Retirada no balcão (PDV ou encomenda)
            'balcao',        -- Alias de balcão
            'dine_in',       -- Consumo no local / na mesa
            'takeaway'       -- Alias de retirada
        );
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'coupon_discount_type') THEN
        CREATE TYPE coupon_discount_type AS ENUM (
            'percentage',    -- Percentual (ex: 10%)
            'fixed_amount',  -- Valor fixo (ex: R$ 5,00)
            'fixed'          -- Alias compatível
        );
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'coupon_apply_to') THEN
        CREATE TYPE coupon_apply_to AS ENUM (
            'order_total',         -- Aplica no total do pedido
            'specific_products'    -- Aplica apenas em produtos específicos
        );
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
        CREATE TYPE user_role AS ENUM (
            'admin',
            'user',
            'customer'
        );
    END IF;
END $$;

-- ---------------------------------------------------------------------
-- 3. CRIAÇÃO DAS TABELAS
-- ---------------------------------------------------------------------

-- ============================ USERS ==================================
-- Clientes do delivery (autenticados ou identificados por telefone/email)
CREATE TABLE IF NOT EXISTS public.users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name       TEXT,
    email           TEXT,
    phone           TEXT,
    role            TEXT NOT NULL DEFAULT 'user',
    created_date    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_date    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ========================= SETTINGS ==================================
-- Configurações gerais da loja, horários semanais e taxas
CREATE TABLE IF NOT EXISTS public.settings (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_name      TEXT DEFAULT 'Vruum Burguer',
    restaurant_logo      TEXT,
    opening_time         TEXT DEFAULT '18:00',
    closing_time         TEXT DEFAULT '23:59',
    open_days            JSONB NOT NULL DEFAULT '[]'::jsonb,
    phone                TEXT DEFAULT '(11) 99999-9999',
    address              TEXT DEFAULT 'Av. Brasil, 1500 - Centro',
    instagram            TEXT DEFAULT '@vrumburguer',
    whatsapp             TEXT DEFAULT '11999999999',
    delivery_fee         NUMERIC(10,2) NOT NULL DEFAULT 6.50,
    min_order_value      NUMERIC(10,2) NOT NULL DEFAULT 20.00,
    delivery_time        TEXT DEFAULT '40-50 min',
    manual_store_open    BOOLEAN DEFAULT NULL,
    manual_override_date TEXT DEFAULT NULL,
    created_date         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_date         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ========================= ADMIN_USERS ===============================
-- Usuários com credenciais administrativas e controle de permissões
CREATE TABLE IF NOT EXISTS public.admin_users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username        TEXT NOT NULL UNIQUE,
    password        TEXT NOT NULL,
    role            TEXT NOT NULL DEFAULT 'admin',
    permissions     JSONB NOT NULL DEFAULT '["*"]'::jsonb,
    active          BOOLEAN NOT NULL DEFAULT TRUE,
    created_date    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_date    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ========================== CATEGORIES ===============================
-- Categorias do cardápio com ordenação
CREATE TABLE IF NOT EXISTS public.categories (
    id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
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
-- Adicionais diretos por produto (compatibilidade com versão anterior)
CREATE TABLE IF NOT EXISTS public.product_additionals (
    id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    product_id      TEXT NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    price           NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    required        BOOLEAN NOT NULL DEFAULT FALSE,
    max_quantity    NUMERIC NOT NULL DEFAULT 1,
    active          BOOLEAN NOT NULL DEFAULT TRUE,
    created_date    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_date    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ======================= COMPLEMENT_GROUPS (ANOTA AI / IFOOD) =========
-- Grupos de complementos/opcionais configuráveis
CREATE TABLE IF NOT EXISTS public.complement_groups (
    id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
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
-- Itens pertencentes aos grupos de complementos
CREATE TABLE IF NOT EXISTS public.complement_items (
    id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
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
-- Associação de produtos aos grupos de complementos
CREATE TABLE IF NOT EXISTS public.product_complement_groups (
    id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    product_id      TEXT NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    group_id        TEXT NOT NULL REFERENCES public.complement_groups(id) ON DELETE CASCADE,
    order_index     INTEGER NOT NULL DEFAULT 0,
    created_date    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_product_group UNIQUE (product_id, group_id)
);

-- ========================== BANNER_IMAGES ============================
-- Carrossel de banners principal
CREATE TABLE IF NOT EXISTS public.banner_images (
    id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    title           TEXT,
    image_url       TEXT NOT NULL,
    order_index     NUMERIC NOT NULL DEFAULT 0,
    active          BOOLEAN NOT NULL DEFAULT TRUE,
    created_date    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_date    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tabela espelho de banners para compatibilidade retroativa
CREATE TABLE IF NOT EXISTS public.banners (
    id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    title           TEXT,
    image_url       TEXT NOT NULL,
    order_index     NUMERIC NOT NULL DEFAULT 0,
    active          BOOLEAN NOT NULL DEFAULT TRUE,
    created_date    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_date    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================ COUPONS ================================
-- Cupons de desconto com regras de aplicação
CREATE TABLE IF NOT EXISTS public.coupons (
    id                  TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    code                TEXT NOT NULL UNIQUE,
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
    updated_date        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ========================== COUPON_USAGES =============================
-- Registro de utilização dos cupons
CREATE TABLE IF NOT EXISTS public.coupon_usages (
    id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    coupon_id       TEXT NOT NULL REFERENCES public.coupons(id) ON DELETE CASCADE,
    user_email      TEXT NOT NULL,
    order_id        TEXT,
    created_date    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_date    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================= ORDERS ================================
-- Pedidos realizados (Delivery, Balcão, Retirada, PDV)
CREATE TABLE IF NOT EXISTS public.orders (
    id                  TEXT PRIMARY KEY DEFAULT ('order_' || gen_random_uuid()::text),
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
-- Itens individuais de cada pedido (estrutura relacional opcional/complementar)
CREATE TABLE IF NOT EXISTS public.order_items (
    id                  TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
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
-- Adicionais de itens do pedido
CREATE TABLE IF NOT EXISTS public.order_item_additionals (
    id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    order_item_id   TEXT NOT NULL REFERENCES public.order_items(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    price           NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    created_date    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_date    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ========================== USER_ADDRESSES ===========================
-- Endereços de entrega cadastrados por clientes
CREATE TABLE IF NOT EXISTS public.user_addresses (
    id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
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
-- 4. ÍNDICES DE PERFORMANCE E OTIMIZAÇÃO (SUPABASE FREE TIER)
-- ---------------------------------------------------------------------
-- Orders
CREATE INDEX IF NOT EXISTS idx_orders_created_date      ON public.orders(created_date DESC);
CREATE INDEX IF NOT EXISTS idx_orders_status            ON public.orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_type              ON public.orders(order_type);
CREATE INDEX IF NOT EXISTS idx_orders_user_email        ON public.orders(user_email);
CREATE INDEX IF NOT EXISTS idx_orders_customer_phone    ON public.orders(customer_phone);

-- Products & Categories
CREATE INDEX IF NOT EXISTS idx_products_category        ON public.products(category);
CREATE INDEX IF NOT EXISTS idx_products_category_id     ON public.products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_available       ON public.products(available);
CREATE INDEX IF NOT EXISTS idx_products_popular         ON public.products(popular);
CREATE INDEX IF NOT EXISTS idx_categories_order         ON public.categories(order_index);

-- Complements
CREATE INDEX IF NOT EXISTS idx_complement_groups_order   ON public.complement_groups(order_index);
CREATE INDEX IF NOT EXISTS idx_complement_items_group    ON public.complement_items(group_id, order_index);
CREATE INDEX IF NOT EXISTS idx_product_comp_groups_prod  ON public.product_complement_groups(product_id);
CREATE INDEX IF NOT EXISTS idx_product_comp_groups_grp   ON public.product_complement_groups(group_id);
CREATE INDEX IF NOT EXISTS idx_additionals_product       ON public.product_additionals(product_id);

-- Banners
CREATE INDEX IF NOT EXISTS idx_banner_images_active     ON public.banner_images(active, order_index);
CREATE INDEX IF NOT EXISTS idx_banners_order            ON public.banner_images(order_index);
CREATE INDEX IF NOT EXISTS idx_banners_table_order      ON public.banners(order_index);

-- Items & Coupons
CREATE INDEX IF NOT EXISTS idx_order_items_order        ON public.order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_coupon_usages_coupon     ON public.coupon_usages(coupon_id);
CREATE INDEX IF NOT EXISTS idx_coupon_usages_email      ON public.coupon_usages(user_email);

-- Users & Addresses
CREATE INDEX IF NOT EXISTS idx_users_phone              ON public.users(phone);
CREATE INDEX IF NOT EXISTS idx_user_addresses_email     ON public.user_addresses(user_email);
CREATE INDEX IF NOT EXISTS idx_user_addresses_phone     ON public.user_addresses(user_phone);

-- ---------------------------------------------------------------------
-- 5. TRIGGER AUTOMÁTICO DE UPDATED_DATE
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_date()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_date = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'users', 'settings', 'admin_users', 'categories', 'products',
        'product_additionals', 'complement_groups', 'complement_items',
        'banner_images', 'banners', 'coupons', 'coupon_usages',
        'orders', 'order_items', 'order_item_additionals', 'user_addresses'
    ] LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_updated ON public.%I;', t, t);
        EXECUTE format(
            'CREATE TRIGGER trg_%s_updated BEFORE UPDATE ON public.%I
             FOR EACH ROW EXECUTE FUNCTION public.set_updated_date();', t, t);
    END LOOP;
END $$;

-- ---------------------------------------------------------------------
-- 6. TRIGGERS DE SINCRONIZAÇÃO BANNER_IMAGES <-> BANNERS
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_banners_tables()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO public.banners (id, title, image_url, order_index, active, created_date, updated_date)
        VALUES (NEW.id, NEW.title, NEW.image_url, NEW.order_index, NEW.active, NEW.created_date, NEW.updated_date)
        ON CONFLICT (id) DO UPDATE SET
            title = EXCLUDED.title,
            image_url = EXCLUDED.image_url,
            order_index = EXCLUDED.order_index,
            active = EXCLUDED.active,
            updated_date = EXCLUDED.updated_date;
    ELSIF TG_OP = 'UPDATE' THEN
        UPDATE public.banners SET
            title = NEW.title,
            image_url = NEW.image_url,
            order_index = NEW.order_index,
            active = NEW.active,
            updated_date = NEW.updated_date
        WHERE id = NEW.id;
    ELSIF TG_OP = 'DELETE' THEN
        DELETE FROM public.banners WHERE id = OLD.id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_banner_images ON public.banner_images;
CREATE TRIGGER trg_sync_banner_images
AFTER INSERT OR UPDATE OR DELETE ON public.banner_images
FOR EACH ROW EXECUTE FUNCTION public.sync_banners_tables();

CREATE OR REPLACE FUNCTION public.sync_banners_to_banner_images()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO public.banner_images (id, title, image_url, order_index, active, created_date, updated_date)
        VALUES (NEW.id, NEW.title, NEW.image_url, NEW.order_index, NEW.active, NEW.created_date, NEW.updated_date)
        ON CONFLICT (id) DO UPDATE SET
            title = EXCLUDED.title,
            image_url = EXCLUDED.image_url,
            order_index = EXCLUDED.order_index,
            active = EXCLUDED.active,
            updated_date = EXCLUDED.updated_date;
    ELSIF TG_OP = 'UPDATE' THEN
        UPDATE public.banner_images SET
            title = NEW.title,
            image_url = NEW.image_url,
            order_index = NEW.order_index,
            active = NEW.active,
            updated_date = NEW.updated_date
        WHERE id = NEW.id;
    ELSIF TG_OP = 'DELETE' THEN
        DELETE FROM public.banner_images WHERE id = OLD.id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_banners ON public.banners;
CREATE TRIGGER trg_sync_banners
AFTER INSERT OR UPDATE OR DELETE ON public.banners
FOR EACH ROW EXECUTE FUNCTION public.sync_banners_to_banner_images();

-- ---------------------------------------------------------------------
-- 7. TRIGGER DE SINCRONIZAÇÃO AUTOMÁTICA DE CLIENTES (ORDERS -> USERS)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_order_customer_to_users()
RETURNS TRIGGER AS $$
DECLARE
    v_clean_phone TEXT;
    v_user_email TEXT;
BEGIN
    v_clean_phone := regexp_replace(COALESCE(NEW.customer_phone, ''), '\D', '', 'g');
    v_user_email := COALESCE(
        NULLIF(NEW.customer_email, ''),
        NULLIF(NEW.user_email, ''),
        CASE WHEN v_clean_phone != '' THEN v_clean_phone || '@cliente.vrumburguer.com' ELSE NULL END
    );
    
    IF NEW.customer_name IS NOT NULL AND NEW.customer_name != '' AND (v_clean_phone != '' OR v_user_email IS NOT NULL) THEN
        IF EXISTS (
            SELECT 1 FROM public.users 
            WHERE (phone IS NOT NULL AND regexp_replace(phone, '\D', '', 'g') = v_clean_phone)
               OR (email IS NOT NULL AND v_user_email IS NOT NULL AND email = v_user_email)
        ) THEN
            UPDATE public.users 
            SET full_name = NEW.customer_name,
                phone = COALESCE(NEW.customer_phone, phone),
                updated_date = NOW()
            WHERE (phone IS NOT NULL AND regexp_replace(phone, '\D', '', 'g') = v_clean_phone)
               OR (email IS NOT NULL AND v_user_email IS NOT NULL AND email = v_user_email);
        ELSE
            INSERT INTO public.users (id, full_name, email, phone, role, created_date, updated_date)
            VALUES (
                gen_random_uuid(),
                NEW.customer_name,
                COALESCE(v_user_email, gen_random_uuid()::text || '@cliente.vrumburguer.com'),
                NEW.customer_phone,
                'customer',
                COALESCE(NEW.created_date, NOW()),
                NOW()
            );
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_sync_order_customer ON public.orders;
CREATE TRIGGER trg_sync_order_customer
AFTER INSERT OR UPDATE OF customer_name, customer_phone, customer_email ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.sync_order_customer_to_users();

-- ---------------------------------------------------------------------
-- 8. ROW LEVEL SECURITY (RLS) & POLÍTICAS DE ACESSO
-- ---------------------------------------------------------------------
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
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

-- Políticas de Acesso Total para aplicação cliente (Web / Mobile)
DO $$
DECLARE tbl TEXT;
BEGIN
    FOREACH tbl IN ARRAY ARRAY[
        'users', 'settings', 'admin_users', 'categories', 'products',
        'product_additionals', 'complement_groups', 'complement_items',
        'product_complement_groups', 'banner_images', 'banners', 'coupons',
        'coupon_usages', 'orders', 'order_items', 'order_item_additionals',
        'user_addresses'
    ] LOOP
        EXECUTE format('DROP POLICY IF EXISTS "Public Access Policy for %s" ON public.%I;', tbl, tbl);
        EXECUTE format('CREATE POLICY "Public Access Policy for %s" ON public.%I FOR ALL USING (true) WITH CHECK (true);', tbl, tbl);
    END LOOP;
END $$;

-- ---------------------------------------------------------------------
-- 9. SUPABASE STORAGE (BUCKET RESTAURANT-IMAGES)
-- ---------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'restaurant-images', 
    'restaurant-images', 
    true, 
    5242880, -- 5 MB máximo por imagem
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml']
)
ON CONFLICT (id) DO UPDATE SET 
    public = true,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DO $$
BEGIN
    DROP POLICY IF EXISTS "Public Access restaurant-images" ON storage.objects;
    CREATE POLICY "Public Access restaurant-images" ON storage.objects
    FOR ALL USING (bucket_id = 'restaurant-images') WITH CHECK (bucket_id = 'restaurant-images');
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;

-- ---------------------------------------------------------------------
-- 10. SUPABASE REALTIME
-- ---------------------------------------------------------------------
DO $$
BEGIN
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
-- 11. FUNÇÕES RPC (APIs DE ALTA PERFORMANCE DO BANCO)
-- ---------------------------------------------------------------------

-- RPC 1: Autenticação Segura de Usuário Administrador (Bcrypt)
CREATE OR REPLACE FUNCTION public.verify_admin_login(p_username TEXT, p_password TEXT)
RETURNS JSONB AS $$
DECLARE
    v_user RECORD;
BEGIN
    SELECT id, username, role, permissions, active, password
    INTO v_user
    FROM public.admin_users
    WHERE username = p_username;

    IF v_user.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Usuário não encontrado');
    END IF;

    IF v_user.active = FALSE THEN
        RETURN jsonb_build_object('success', false, 'message', 'Usuário desativado');
    END IF;

    -- Validação via Bcrypt Hash
    IF v_user.password = crypt(p_password, v_user.password) THEN
        RETURN jsonb_build_object(
            'success', true,
            'user', jsonb_build_object(
                'id', v_user.id,
                'username', v_user.username,
                'role', v_user.role,
                'permissions', COALESCE(v_user.permissions, '["*"]'::jsonb)
            )
        );
    -- Migração automática caso ainda esteja em texto plano
    ELSIF v_user.password = p_password THEN
        UPDATE public.admin_users
        SET password = crypt(p_password, gen_salt('bf', 10))
        WHERE id = v_user.id;
        
        RETURN jsonb_build_object(
            'success', true,
            'user', jsonb_build_object(
                'id', v_user.id,
                'username', v_user.username,
                'role', v_user.role,
                'permissions', COALESCE(v_user.permissions, '["*"]'::jsonb)
            )
        );
    ELSE
        RETURN jsonb_build_object('success', false, 'message', 'Senha incorreta');
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.verify_admin_login(TEXT, TEXT) TO anon, authenticated, service_role;

-- RPC 2: Relatório Agregado de Vendas e Métricas de Desempenho (0 Pedidos baixados / Ultra Egress)
CREATE OR REPLACE FUNCTION public.get_sales_metrics(p_start TIMESTAMPTZ, p_end TIMESTAMPTZ)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
    v_total_revenue NUMERIC(10,2) := 0;
    v_total_orders BIGINT := 0;
    v_cancelled_orders BIGINT := 0;
    v_lost_revenue NUMERIC(10,2) := 0;
    v_total_products_sold BIGINT := 0;
    v_category_metrics JSONB := '[]'::jsonb;
BEGIN
    -- 1. Métricas consolidadas dos pedidos
    SELECT
        COALESCE(SUM(CASE WHEN status != 'cancelado' THEN total_amount ELSE 0 END), 0),
        COUNT(CASE WHEN status != 'cancelado' THEN 1 END),
        COUNT(CASE WHEN status = 'cancelado' THEN 1 END),
        COALESCE(SUM(CASE WHEN status = 'cancelado' THEN total_amount ELSE 0 END), 0)
    INTO
        v_total_revenue,
        v_total_orders,
        v_cancelled_orders,
        v_lost_revenue
    FROM public.orders
    WHERE created_date >= p_start AND created_date <= p_end;

    -- 2. Total de itens de produtos vendidos
    SELECT COALESCE(SUM((item->>'quantity')::numeric), 0)::bigint
    INTO v_total_products_sold
    FROM public.orders ord,
    LATERAL jsonb_array_elements(ord.items) AS item
    WHERE ord.created_date >= p_start
      AND ord.created_date <= p_end
      AND ord.status != 'cancelado'
      AND ord.items IS NOT NULL
      AND jsonb_typeof(ord.items) = 'array';

    -- 3. Métricas agregadas por categoria
    WITH unpacked_items AS (
        SELECT
            item->>'product_id' AS product_id,
            COALESCE((item->>'quantity')::numeric, 1) AS qty,
            COALESCE((item->>'subtotal')::numeric, 0) AS subtotal
        FROM public.orders ord,
        LATERAL jsonb_array_elements(ord.items) AS item
        WHERE ord.created_date >= p_start
          AND ord.created_date <= p_end
          AND ord.status != 'cancelado'
          AND ord.items IS NOT NULL
          AND jsonb_typeof(ord.items) = 'array'
    ),
    items_with_category AS (
        SELECT
            COALESCE(c.name, 'Geral') AS cat_name,
            u.qty,
            u.subtotal
        FROM unpacked_items u
        LEFT JOIN public.products p ON p.id = u.product_id
        LEFT JOIN public.categories c ON c.id = COALESCE(p.category_id, p.category)
    ),
    grouped_categories AS (
        SELECT
            cat_name AS name,
            SUM(qty)::bigint AS items,
            SUM(subtotal)::numeric(10,2) AS revenue
        FROM items_with_category
        GROUP BY cat_name
        ORDER BY revenue DESC
    )
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'name', g.name,
                'items', g.items,
                'revenue', g.revenue
            )
        ),
        '[]'::jsonb
    )
    INTO v_category_metrics
    FROM grouped_categories g;

    RETURN jsonb_build_object(
        'total_revenue', v_total_revenue,
        'total_orders', v_total_orders,
        'cancelled_orders', v_cancelled_orders,
        'lost_revenue', v_lost_revenue,
        'total_products_sold', COALESCE(v_total_products_sold, 0),
        'category_metrics', COALESCE(v_category_metrics, '[]'::jsonb)
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_sales_metrics(TIMESTAMPTZ, TIMESTAMPTZ) TO anon, authenticated, service_role;

-- RPC 3: Agregação Completa de Clientes (LTV, Histórico, Pedidos)
CREATE OR REPLACE FUNCTION public.get_clients_summary()
RETURNS TABLE(
    id text,
    full_name text,
    email text,
    phone text,
    role text,
    created_date timestamp with time zone,
    total_orders bigint,
    total_spent numeric,
    last_order_date timestamp with time zone
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
    WITH registered_users AS (
        SELECT 
            u.id::text AS user_id,
            COALESCE(
                NULLIF(regexp_replace(u.phone, '\D', '', 'g'), ''),
                NULLIF(LOWER(TRIM(u.email)), ''),
                u.id::text
            ) AS client_key,
            u.full_name,
            u.email,
            u.phone,
            u.role,
            u.created_date AS user_created_date
        FROM public.users u
        WHERE u.role != 'admin' OR u.role IS NULL
    ),
    order_clients AS (
        SELECT 
            COALESCE(
                NULLIF(regexp_replace(ord.customer_phone, '\D', '', 'g'), ''),
                NULLIF(LOWER(TRIM(COALESCE(NULLIF(ord.customer_email, ''), ord.user_email))), ''),
                LOWER(TRIM(ord.customer_name))
            ) AS client_key,
            MAX(ord.customer_name) AS customer_name,
            MAX(COALESCE(NULLIF(ord.customer_email, ''), ord.user_email, '')) AS customer_email,
            MAX(ord.customer_phone) AS customer_phone,
            MIN(ord.created_date) AS first_order_date,
            COUNT(CASE WHEN ord.status != 'cancelado' THEN 1 END) AS total_orders,
            COALESCE(SUM(CASE WHEN ord.status != 'cancelado' THEN ord.total_amount ELSE 0 END), 0) AS total_spent,
            MAX(CASE WHEN ord.status != 'cancelado' THEN ord.created_date ELSE NULL END) AS last_order_date
        FROM public.orders ord
        WHERE (ord.customer_name IS NOT NULL AND ord.customer_name != '')
           OR (ord.customer_phone IS NOT NULL AND ord.customer_phone != '')
           OR (ord.customer_email IS NOT NULL AND ord.customer_email != '')
           OR (ord.user_email IS NOT NULL AND ord.user_email != '')
        GROUP BY client_key
    ),
    all_keys AS (
        SELECT client_key FROM registered_users WHERE client_key IS NOT NULL
        UNION
        SELECT client_key FROM order_clients WHERE client_key IS NOT NULL
    )
    SELECT 
        COALESCE(u.user_id, k.client_key) AS id,
        COALESCE(NULLIF(u.full_name, ''), NULLIF(o.customer_name, ''), 'Cliente') AS full_name,
        COALESCE(NULLIF(u.email, ''), NULLIF(o.customer_email, ''), '-') AS email,
        COALESCE(NULLIF(u.phone, ''), NULLIF(o.customer_phone, ''), '-') AS phone,
        COALESCE(u.role, 'customer') AS role,
        COALESCE(u.user_created_date, o.first_order_date, NOW()) AS created_date,
        COALESCE(o.total_orders, 0)::bigint AS total_orders,
        COALESCE(o.total_spent, 0)::numeric AS total_spent,
        o.last_order_date
    FROM all_keys k
    LEFT JOIN registered_users u ON u.client_key = k.client_key
    LEFT JOIN order_clients o ON o.client_key = k.client_key
    ORDER BY total_spent DESC, total_orders DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_clients_summary() TO anon, authenticated, service_role;

-- RPC 4: Preenchimento Automático de Cliente por Telefone (Checkout & PDV)
CREATE OR REPLACE FUNCTION public.lookup_customer_by_phone(p_phone TEXT)
RETURNS TABLE(
    customer_name TEXT,
    customer_email TEXT,
    customer_phone TEXT,
    delivery_address TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
    WITH matched_order AS (
        SELECT 
            o.customer_name,
            o.customer_email,
            o.customer_phone,
            o.delivery_address,
            o.created_date
        FROM public.orders o
        WHERE regexp_replace(COALESCE(o.customer_phone, ''), '\D', '', 'g') = regexp_replace(p_phone, '\D', '', 'g')
           OR (
               LENGTH(regexp_replace(p_phone, '\D', '', 'g')) >= 8 AND
               regexp_replace(COALESCE(o.customer_phone, ''), '\D', '', 'g') LIKE '%' || RIGHT(regexp_replace(p_phone, '\D', '', 'g'), 8)
           )
        ORDER BY o.created_date DESC
        LIMIT 1
    ),
    matched_user AS (
        SELECT 
            u.full_name AS customer_name,
            u.email AS customer_email,
            u.phone AS customer_phone,
            NULL::TEXT AS delivery_address,
            u.created_date
        FROM public.users u
        WHERE regexp_replace(COALESCE(u.phone, ''), '\D', '', 'g') = regexp_replace(p_phone, '\D', '', 'g')
           OR (
               LENGTH(regexp_replace(p_phone, '\D', '', 'g')) >= 8 AND
               regexp_replace(COALESCE(u.phone, ''), '\D', '', 'g') LIKE '%' || RIGHT(regexp_replace(p_phone, '\D', '', 'g'), 8)
           )
        ORDER BY u.created_date DESC
        LIMIT 1
    )
    SELECT customer_name, customer_email, customer_phone, delivery_address 
    FROM (
        SELECT * FROM matched_order
        UNION ALL
        SELECT * FROM matched_user
    ) combined
    ORDER BY created_date DESC
    LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.lookup_customer_by_phone(TEXT) TO anon, authenticated, service_role;

-- RPC 5: Atualização Unificada do Nome do Cliente (Users e Orders)
CREATE OR REPLACE FUNCTION public.update_customer_name_by_phone(p_phone TEXT, p_new_name TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_clean_phone TEXT;
    v_rows_users INT := 0;
    v_rows_orders INT := 0;
BEGIN
    v_clean_phone := regexp_replace(COALESCE(p_phone, ''), '\D', '', 'g');
    
    IF v_clean_phone = '' OR p_new_name IS NULL OR TRIM(p_new_name) = '' THEN
        RETURN jsonb_build_object('success', false, 'message', 'Dados inválidos');
    END IF;

    -- Atualiza na tabela users
    UPDATE public.users
    SET full_name = TRIM(p_new_name),
        updated_date = NOW()
    WHERE regexp_replace(COALESCE(phone, ''), '\D', '', 'g') = v_clean_phone
       OR (
           LENGTH(v_clean_phone) >= 8 AND 
           regexp_replace(COALESCE(phone, ''), '\D', '', 'g') LIKE '%' || RIGHT(v_clean_phone, 8)
       )
       OR email = v_clean_phone || '@cliente.vrumburguer.com';
    GET DIAGNOSTICS v_rows_users = ROW_COUNT;

    -- Se não existia em users, cria o registro
    IF v_rows_users = 0 THEN
        INSERT INTO public.users (id, full_name, email, phone, role, created_date, updated_date)
        VALUES (
            gen_random_uuid(),
            TRIM(p_new_name),
            v_clean_phone || '@cliente.vrumburguer.com',
            p_phone,
            'customer',
            NOW(),
            NOW()
        );
    END IF;

    -- Atualiza na tabela orders
    UPDATE public.orders
    SET customer_name = TRIM(p_new_name)
    WHERE regexp_replace(COALESCE(customer_phone, ''), '\D', '', 'g') = v_clean_phone
       OR (
           LENGTH(v_clean_phone) >= 8 AND 
           regexp_replace(COALESCE(customer_phone, ''), '\D', '', 'g') LIKE '%' || RIGHT(v_clean_phone, 8)
       )
       OR user_email = v_clean_phone || '@cliente.vrumburguer.com';
    GET DIAGNOSTICS v_rows_orders = ROW_COUNT;

    RETURN jsonb_build_object(
        'success', true, 
        'users_updated', v_rows_users, 
        'orders_updated', v_rows_orders,
        'new_name', TRIM(p_new_name)
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_customer_name_by_phone(TEXT, TEXT) TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- 12. DADOS INICIAIS (SEEDS DEFINITIVOS E IDEMPOTENTES)
-- ---------------------------------------------------------------------

-- Configuração inicial da Loja
INSERT INTO public.settings (
    id, restaurant_name, restaurant_logo, opening_time, closing_time,
    phone, address, instagram, whatsapp, delivery_fee, min_order_value,
    delivery_time, open_days
) VALUES (
    'a1b2c3d4-e5f6-7890-abcd-111122223333',
    'Vruum Burguer',
    NULL,
    '18:00',
    '23:59',
    '(11) 99999-9999',
    'Av. Brasil, 1500 - Centro',
    '@vrumburguer',
    '11999999999',
    6.50,
    20.00,
    '40-50 min',
    '[
        {"day":0,"enabled":true,"opening_time":"18:00","closing_time":"23:59"},
        {"day":1,"enabled":true,"opening_time":"18:00","closing_time":"23:59"},
        {"day":2,"enabled":true,"opening_time":"18:00","closing_time":"23:59"},
        {"day":3,"enabled":true,"opening_time":"18:00","closing_time":"23:59"},
        {"day":4,"enabled":true,"opening_time":"18:00","closing_time":"23:59"},
        {"day":5,"enabled":true,"opening_time":"18:00","closing_time":"23:59"},
        {"day":6,"enabled":true,"opening_time":"18:00","closing_time":"23:59"}
    ]'::jsonb
) ON CONFLICT (id) DO UPDATE SET
    restaurant_name = EXCLUDED.restaurant_name,
    delivery_fee = EXCLUDED.delivery_fee,
    min_order_value = EXCLUDED.min_order_value,
    delivery_time = EXCLUDED.delivery_time;

-- Usuário Administrador padrão (senha '123' protegida com Bcrypt)
INSERT INTO public.admin_users (id, username, password, role, permissions, active)
VALUES (
    'a1b2c3d4-e5f6-7890-abcd-000000000001',
    'admin',
    crypt('123', gen_salt('bf', 10)),
    'admin',
    '["*"]'::jsonb,
    TRUE
)
ON CONFLICT (username) DO UPDATE SET 
    password = EXCLUDED.password,
    permissions = EXCLUDED.permissions;

-- Usuário Cliente Demo
INSERT INTO public.users (id, full_name, email, phone, role)
VALUES (
    'a1b2c3d4-e5f6-7890-abcd-000000000002',
    'Cliente Demo',
    'cliente@vrumburguer.com',
    '(11) 98765-4321',
    'user'
)
ON CONFLICT (id) DO NOTHING;

-- Categorias do Cardápio
INSERT INTO public.categories (id, name, order_index, is_combo) VALUES
    ('cat-burgers',      'Burgers Artesanais',              1, false),
    ('cat-combos',       'Combos (+ Batata 100g)',          2, true),
    ('cat-super-combos', 'Super Combos (+ Batata + Refri)', 3, true),
    ('cat-porcoes',      'Porções',                         4, false),
    ('cat-bebidas',      'Bebidas',                         5, false)
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    order_index = EXCLUDED.order_index,
    is_combo = EXCLUDED.is_combo;

-- Produtos Oficiais do Cardápio Vruum Burguer
INSERT INTO public.products (id, name, description, price, category, category_id, image_url, available, popular) VALUES
    ('prod-classic', 'CLASSIC', 'Pão brioche, blend artesanal 100g, queijo cheddar fatiado, bacon crocante e molho especial da casa à sua escolha.', 23.90, 'cat-burgers', 'cat-burgers', 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=600&auto=format&fit=crop&q=80', true, false),
    ('prod-smash', 'SMASH 🔥 QUERIDINHO DA GALERA', 'Pão brioche, 2 smash burgers de 70g (140g no total), queijo cheddar fatiado, bacon crocante e molho especial da casa à sua escolha.', 26.90, 'cat-burgers', 'cat-burgers', 'https://images.unsplash.com/photo-1586190848861-99aa4a171e90?w=600&auto=format&fit=crop&q=80', true, true),
    ('prod-pop', 'POP ⭐ ESPECIAL DA CASA', 'Pão brioche, blend artesanal 160g, queijo cheddar fatiado, bacon crocante, alface americana, tomate, cebola roxa e molho especial da casa à sua escolha.', 29.90, 'cat-burgers', 'cat-burgers', 'https://images.unsplash.com/photo-1550547660-d9450f859349?w=600&auto=format&fit=crop&q=80', true, true),
    ('prod-smash-caramelizado', 'SMASH CARAMELIZADO', 'Pão brioche, 2 smash burgers de 70g (140g no total), queijo cheddar fatiado, bacon crocante, cebola caramelizada defumada e molho especial da casa à sua escolha.', 39.90, 'cat-burgers', 'cat-burgers', 'https://images.unsplash.com/photo-1553979459-d2229ba7433b?w=600&auto=format&fit=crop&q=80', true, false),
    ('prod-fit', 'FIT', 'Pão brioche, blend artesanal 160g, muçarela, cream cheese, ovo, alface americana, tomate e cebola roxa.', 34.90, 'cat-burgers', 'cat-burgers', 'https://images.unsplash.com/photo-1520072959219-c595dc870360?w=600&auto=format&fit=crop&q=80', true, false),
    ('prod-flex', 'FLEX', 'Pão brioche, blend artesanal 160g, queijo cheddar fatiado, cebola crispy crocante, geleia de abacaxi com pimenta e molho especial da casa à sua escolha.', 34.90, 'cat-burgers', 'cat-burgers', 'https://images.unsplash.com/photo-1582196016295-f8c8bd4b3a99?w=600&auto=format&fit=crop&q=80', true, false),
    ('prod-pit-stop', 'PIT STOP 🏁 MAIS VENDIDO', 'Pão brioche, blend artesanal 160g, queijo cheddar fatiado, bacon crocante, onion rings, alface americana, tomate, cebola roxa e molho especial da casa à sua escolha.', 34.90, 'cat-burgers', 'cat-burgers', 'https://images.unsplash.com/photo-1594212699903-ec8a3eca50f5?w=600&auto=format&fit=crop&q=80', true, true),
    ('prod-v6', 'V6', 'Pão brioche, blend artesanal 160g, smash de 70g, queijo cheddar fatiado, bacon crocante, onion rings, alface americana, tomate, cebola roxa e molho especial da casa à sua escolha.', 37.90, 'cat-burgers', 'cat-burgers', 'https://images.unsplash.com/photo-1565299507177-b0ac66763828?w=600&auto=format&fit=crop&q=80', true, false),
    ('prod-nitro', 'NITRO', 'Pão brioche, blend artesanal 160g, queijo cheddar fatiado, bacon crocante, cream cheese, cebola caramelizada defumada, farofa de bacon e molho especial da casa à sua escolha.', 40.90, 'cat-burgers', 'cat-burgers', 'https://images.unsplash.com/photo-1572802419224-296b0aeee0d9?w=600&auto=format&fit=crop&q=80', true, false),
    ('prod-xr', 'XR', 'Pão brioche, blend artesanal 160g, queijo cheddar fatiado, bacon crocante, Catupiry empanado e molho especial da casa à sua escolha.', 43.90, 'cat-burgers', 'cat-burgers', 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=600&auto=format&fit=crop&q=80', true, false),
    ('prod-v8', 'V8 👑 320G DE CARNE', 'Pão brioche, 2 blends artesanais de 160g (320g no total), queijo cheddar fatiado, bacon crocante, molho barbecue, alface americana, tomate, cebola roxa e molho especial da casa à sua escolha.', 46.90, 'cat-burgers', 'cat-burgers', 'https://images.unsplash.com/photo-1553979459-d2229ba7433b?w=600&auto=format&fit=crop&q=80', true, true),
    ('prod-smash-triplo', 'SMASH TRIPLO 🔥 NOVIDADE', 'Pão brioche, 3 smash burgers, queijo cheddar fatiado, bacon crocante, alface americana, tomate, cebola roxa e molho especial da casa à sua escolha.', 35.90, 'cat-burgers', 'cat-burgers', 'https://images.unsplash.com/photo-1586190848861-99aa4a171e90?w=600&auto=format&fit=crop&q=80', true, true),
    ('prod-constellation', 'CONSTELLATION ⭐ LANÇAMENTO', 'Pão brioche, blend artesanal 160g, queijo cheddar, Catupiry empanado com costela, alface americana, tomate, cebola roxa e molho especial da casa à sua escolha.', 49.90, 'cat-burgers', 'cat-burgers', 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=600&auto=format&fit=crop&q=80', true, true),
    ('prod-porcao-batata-100g', 'Batata Frita 100g', 'Porção individual de 100g de batata frita sequinha e crocante.', 9.90, 'cat-porcoes', 'cat-porcoes', 'https://images.unsplash.com/photo-1573080496219-bb080dd4f877?w=600&auto=format&fit=crop&q=80', true, false),
    ('prod-porcao-batata-150g', 'Batata Frita 150g', 'Porção média de 150g de batata frita sequinha e crocante.', 14.90, 'cat-porcoes', 'cat-porcoes', 'https://images.unsplash.com/photo-1576107232684-1279f3908594?w=600&auto=format&fit=crop&q=80', true, false),
    ('prod-porcao-batata-especial', 'Batata Frita 150g + Cheddar + Bacon', '150g de batata frita coberta com delicioso cheddar cremoso e cubinhos crocantes de bacon.', 20.90, 'cat-porcoes', 'cat-porcoes', 'https://images.unsplash.com/photo-1585109649139-366815a0d713?w=600&auto=format&fit=crop&q=80', true, true),
    ('prod-porcao-nuggets', 'Nuggets 10 un.', '10 unidades de nuggets empanados crocantes e dourados.', 16.90, 'cat-porcoes', 'cat-porcoes', 'https://images.unsplash.com/photo-1562967914-608f82629710?w=600&auto=format&fit=crop&q=80', true, false),
    ('prod-porcao-onion', 'Anel de Cebola 12 un.', '12 unidades de anéis de cebola onion rings empanados super crocantes.', 16.90, 'cat-porcoes', 'cat-porcoes', 'https://images.unsplash.com/photo-1639024471285-0afc27429188?w=600&auto=format&fit=crop&q=80', true, false),
    ('prod-bebida-refri', 'Refrigerante 350ml', 'Lata 350ml gelada (Coca-Cola, Guaraná Antarctica, Fanta ou Sprite).', 7.00, 'cat-bebidas', 'cat-bebidas', 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?w=600&auto=format&fit=crop&q=80', true, false),
    ('prod-bebida-suco', 'Suco Del Valle 290ml', 'Lata 290ml gelada (Uva, Pêssego ou Maracujá).', 7.00, 'cat-bebidas', 'cat-bebidas', 'https://images.unsplash.com/photo-1613478223719-2ab802602423?w=600&auto=format&fit=crop&q=80', true, false),
    ('prod-bebida-cerveja', 'Cerveja Original 473ml', 'Latão 473ml trincando de gelada.', 9.00, 'cat-bebidas', 'cat-bebidas', 'https://images.unsplash.com/photo-1608270192804-94b150937a4e?w=600&auto=format&fit=crop&q=80', true, false),
    ('prod-bebida-agua', 'Água Mineral sem Gás 500ml', 'Garrafa de água mineral 500ml gelada.', 3.00, 'cat-bebidas', 'cat-bebidas', 'https://images.unsplash.com/photo-1548839140-29a749e1bc4e?w=600&auto=format&fit=crop&q=80', true, false),
    ('prod-bebida-agua-gas', 'Água Mineral com Gás 500ml', 'Garrafa de água mineral com gás 500ml gelada.', 5.00, 'cat-bebidas', 'cat-bebidas', 'https://images.unsplash.com/photo-1560023907-5f339617ea30?w=600&auto=format&fit=crop&q=80', true, false)
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    price = EXCLUDED.price,
    category = EXCLUDED.category,
    category_id = EXCLUDED.category_id,
    image_url = EXCLUDED.image_url,
    available = EXCLUDED.available,
    popular = EXCLUDED.popular;

-- Grupos de Complementos (Anota AI / iFood)
INSERT INTO public.complement_groups (id, name, description, min_quantity, max_quantity, required, active, order_index) VALUES
    ('grp-ponto-carne', 'Ponto da Carne', 'Escolha o ponto de preparo do seu burger', 1, 1, true, true, 1),
    ('grp-molhos', 'Molho Especial da Casa', 'Escolha até 2 opções de molho artesanal', 0, 2, false, true, 2),
    ('grp-adicionais', 'Adicionais Extras', 'Deseja turbinar seu pedido?', 0, 5, false, true, 3),
    ('grp-bebida-combo', 'Bebida do Combo', 'Escolha o refrigerante ou suco que acompanha seu combo', 1, 1, true, true, 1)
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    min_quantity = EXCLUDED.min_quantity,
    max_quantity = EXCLUDED.max_quantity,
    required = EXCLUDED.required,
    active = EXCLUDED.active,
    order_index = EXCLUDED.order_index;

-- Itens de Complementos
INSERT INTO public.complement_items (id, group_id, name, description, price, max_quantity, active, order_index) VALUES
    ('item-ponto-1', 'grp-ponto-carne', 'Ao Ponto (Rosadinho e bem suculento)', NULL, 0.00, 1, true, 1),
    ('item-ponto-2', 'grp-ponto-carne', 'Bem Passado (Carne totalmente cozida)', NULL, 0.00, 1, true, 2),
    ('item-ponto-3', 'grp-ponto-carne', 'Ao Ponto para Mal (Super suculento)', NULL, 0.00, 1, true, 3),
    ('item-molho-1', 'grp-molhos', 'Maionese Verde Especial da Casa', 'Receita secreta artesanal com ervas frescas', 0.00, 1, true, 1),
    ('item-molho-2', 'grp-molhos', 'Barbecue Defumado Artesanal', 'Toque rústico com especiarias e fumaça líquida', 0.00, 1, true, 2),
    ('item-molho-3', 'grp-molhos', 'Maionese de Alho Confit', 'Alho lentamente assado e azeite extravirgem', 0.00, 1, true, 3),
    ('item-molho-4', 'grp-molhos', 'Geleia de Abacaxi com Pimenta', 'Agridoce perfeito e levemente picante', 0.00, 1, true, 4),
    ('item-add-1', 'grp-adicionais', 'Bacon Crocante Extra (4 fatias)', NULL, 4.00, 3, true, 1),
    ('item-add-2', 'grp-adicionais', 'Cheddar Fatiado Extra', NULL, 2.50, 2, true, 2),
    ('item-add-3', 'grp-adicionais', 'Smash Burger 70g Extra', NULL, 7.00, 2, true, 3),
    ('item-add-4', 'grp-adicionais', 'Catupiry Empanado Crocante', NULL, 15.00, 1, true, 4),
    ('item-add-5', 'grp-adicionais', 'Anel de Cebola (2 un.)', NULL, 6.00, 2, true, 5),
    ('item-beb-1', 'grp-bebida-combo', 'Coca-Cola 350ml', 'Lata gelada', 0.00, 1, true, 1),
    ('item-beb-2', 'grp-bebida-combo', 'Coca-Cola Zero 350ml', 'Lata gelada', 0.00, 1, true, 2),
    ('item-beb-3', 'grp-bebida-combo', 'Guaraná Antarctica 350ml', 'Lata gelada', 0.00, 1, true, 3),
    ('item-beb-4', 'grp-bebida-combo', 'Suco Del Valle Uva 290ml', 'Lata gelada', 0.00, 1, true, 4)
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    price = EXCLUDED.price,
    max_quantity = EXCLUDED.max_quantity,
    active = EXCLUDED.active,
    order_index = EXCLUDED.order_index;

-- Vínculo de Grupos de Complementos a Burgers Artesanais
INSERT INTO public.product_complement_groups (product_id, group_id, order_index)
SELECT p.id, g.id, 1
FROM public.products p
CROSS JOIN public.complement_groups g
WHERE p.category = 'cat-burgers' AND g.id IN ('grp-ponto-carne', 'grp-molhos', 'grp-adicionais')
ON CONFLICT (product_id, group_id) DO NOTHING;

-- Adicionais Legados (Compatibilidade)
INSERT INTO public.product_additionals (id, product_id, name, price, required, max_quantity, active) VALUES
    ('add-1', 'prod-classic', 'Bacon Crocante Extra', 4.00, false, 3, true),
    ('add-2', 'prod-classic', 'Cheddar Fatiado Extra', 2.50, false, 2, true),
    ('add-3', 'prod-smash', 'Bacon Crocante Extra', 4.00, false, 3, true),
    ('add-4', 'prod-pop', 'Anel de Cebola (2 un.)', 6.00, false, 2, true),
    ('add-5', 'prod-pit-stop', 'Carne 160g Extra', 14.00, false, 1, true)
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    price = EXCLUDED.price,
    active = EXCLUDED.active;

-- Banners do Carrossel
INSERT INTO public.banner_images (id, title, image_url, order_index, active) VALUES
    ('banner-1', 'Burgers Artesanais Suculentos', 'https://images.unsplash.com/photo-1550547660-d9450f859349?w=1200&auto=format&fit=crop&q=80', 1, true),
    ('banner-2', 'Combos Especiais com Batata e Refri', 'https://images.unsplash.com/photo-1561758033-d89a9ad46330?w=1200&auto=format&fit=crop&q=80', 2, true)
ON CONFLICT (id) DO UPDATE SET
    title = EXCLUDED.title,
    image_url = EXCLUDED.image_url,
    order_index = EXCLUDED.order_index,
    active = EXCLUDED.active;

-- Cupons de Desconto Iniciais
INSERT INTO public.coupons (id, code, name, description, discount_type, discount_value, apply_to, applicable_products, min_order_value, usage_limit, active) VALUES
    ('coupon-1', 'PRIMEIRA10', 'Primeira Compra', '10% de desconto no seu primeiro pedido', 'percentage', 10.00, 'order_total', '[]'::jsonb, 30.00, 1, true),
    ('coupon-2', 'VRUM5', 'Desconto Burger', 'R$ 5,00 de desconto em pedidos acima de R$ 40', 'fixed_amount', 5.00, 'order_total', '[]'::jsonb, 40.00, NULL, true)
ON CONFLICT (code) DO UPDATE SET
    name = EXCLUDED.name,
    discount_value = EXCLUDED.discount_value,
    min_order_value = EXCLUDED.min_order_value,
    active = EXCLUDED.active;

-- Endereço Demo
INSERT INTO public.user_addresses (id, user_email, user_phone, name, cep, zip_code, street, number, neighborhood, city, state, complement, reference, is_default)
VALUES (
    'addr-1', 
    'cliente@vrumburguer.com', 
    '(11) 98765-4321',
    'Minha Casa', 
    '01001-000', 
    '01001-000', 
    'Rua das Flores', 
    '123', 
    'Centro', 
    'São Paulo', 
    'SP', 
    'Apto 42', 
    'Próximo à padaria central',
    true
)
ON CONFLICT (id) DO NOTHING;

COMMIT;


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- MIGRATION: 20261010_saas_multitenant_core.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

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


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- MIGRATION: 20261011_01_emergency_revoke_dangerous_rpcs.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- ==============================================================================
-- MIGRATION 01: HARDENING EMERGENCIAL DE CREDENCIAIS & SEARCH_PATH
-- Arquivo: supabase/migrations/20261011_01_emergency_revoke_dangerous_rpcs.sql
-- Status: PREPARADO PARA AMBIENTE DE HOMOLOGAÇÃO
-- ==============================================================================

-- 1. BLINDAGEM COMPLETA DA TABELA ADMIN_USERS
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

-- Remove policies permissivas legadas
DROP POLICY IF EXISTS "Service role full access admin_users" ON public.admin_users;
DROP POLICY IF EXISTS "Block anon read admin_users" ON public.admin_users;
DROP POLICY IF EXISTS "Block anon write admin_users" ON public.admin_users;

-- Revoga privilégios a nível de tabela para os papéis anon e PUBLIC
-- (No PostgreSQL, revogar a tabela inteira é necessário para garantir que nenhum SELECT passe)
REVOKE ALL ON public.admin_users FROM anon, PUBLIC;

-- Políticas de RLS fechadas
CREATE POLICY "Block anon read admin_users"
    ON public.admin_users FOR SELECT
    TO anon
    USING (false);

CREATE POLICY "Block anon write admin_users"
    ON public.admin_users FOR ALL
    TO anon
    USING (false)
    WITH CHECK (false);

CREATE POLICY "Service role full access admin_users"
    ON public.admin_users FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Revoga leitura explícita das colunas de senha para reforço de defesa em profundidade
REVOKE SELECT (password, initial_password) ON public.admin_users FROM anon, PUBLIC;


-- 2. FIXAÇÃO DE SEARCH_PATH EM TODAS AS FUNÇÕES SECURITY DEFINER
-- Previne vulnerabilidade de Search Path Hijacking
ALTER FUNCTION public.create_new_tenant(text, text, text, text, text, text) SET search_path = public, pg_temp;
ALTER FUNCTION public.delete_tenant(uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.get_clients_summary(uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.get_master_tenants() SET search_path = public, pg_temp;
ALTER FUNCTION public.get_sales_metrics(uuid, timestamptz, timestamptz) SET search_path = public, pg_temp;
ALTER FUNCTION public.lookup_customer_by_phone(text, uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.toggle_tenant_status(uuid, boolean) SET search_path = public, pg_temp;
ALTER FUNCTION public.update_tenant_info(uuid, text, text, text, text, text, text) SET search_path = public, pg_temp;
ALTER FUNCTION public.verify_admin_login(text, text, text) SET search_path = public, pg_temp;


-- 3. REVOGAÇÃO DE PRIVILÉGIOS DE EXECUÇÃO PÚBLICA EM PROCEDURES DESTRUTIVAS
REVOKE EXECUTE ON FUNCTION public.delete_tenant(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_tenant(uuid) TO service_role;


-- 4. ATUALIZAÇÃO DE CREATE_NEW_TENANT (SEM SENHA PADRÃO E SEM TEXTO PLANO)
CREATE OR REPLACE FUNCTION public.create_new_tenant(
    p_name TEXT,
    p_slug TEXT,
    p_plan TEXT DEFAULT 'basic'::TEXT,
    p_admin_username TEXT DEFAULT 'admin'::TEXT,
    p_admin_password TEXT DEFAULT NULL::TEXT,
    p_primary_color TEXT DEFAULT '#E11D48'::TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_tenant_id UUID := gen_random_uuid();
    v_clean_slug TEXT := LOWER(REGEXP_REPLACE(TRIM(p_slug), '[^a-zA-Z0-9\-]', '-', 'g'));
BEGIN
    -- Validação: Impede cadastro com senha vazia ou fraca
    IF p_admin_password IS NULL OR length(trim(p_admin_password)) < 6 THEN
        RETURN jsonb_build_object('success', false, 'message', 'A senha do administrador deve ter no mínimo 6 caracteres.');
    END IF;

    IF EXISTS (SELECT 1 FROM public.tenants WHERE slug = v_clean_slug) THEN
        RETURN jsonb_build_object('success', false, 'message', 'Este slug/endereço já está em uso por outro restaurante.');
    END IF;

    -- Cria o Tenant
    INSERT INTO public.tenants (
        id, slug, name, plan, logo_url, banner_url, theme_config, is_active,
        phone, whatsapp, address, instagram, delivery_fee, min_order_value
    )
    VALUES (
        v_tenant_id,
        v_clean_slug,
        TRIM(p_name),
        COALESCE(p_plan, 'basic'),
        NULL,
        NULL,
        jsonb_build_object(
            'primary_color', p_primary_color,
            'secondary_color', '#111827',
            'layout_style', CASE WHEN p_plan = 'premium' THEN 'premium' ELSE 'standard' END
        ),
        TRUE,
        NULL,
        NULL,
        NULL,
        NULL,
        0.00,
        0.00
    );

    -- Cria o usuário Admin exclusivamente com hash bcrypt e initial_password = NULL
    INSERT INTO public.admin_users (
        tenant_id, username, password, initial_password, role, permissions, active
    )
    VALUES (
        v_tenant_id,
        LOWER(TRIM(p_admin_username)),
        crypt(p_admin_password, gen_salt('bf', 8)),
        NULL,
        'admin',
        '["*"]'::jsonb,
        TRUE
    );

    RETURN jsonb_build_object(
        'success', true,
        'tenant_id', v_tenant_id,
        'slug', v_clean_slug,
        'name', TRIM(p_name),
        'message', 'Restaurante criado com sucesso!'
    );
END;
$$;


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- MIGRATION: 20261011_02_auth_tenant_bridge.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- ==============================================================================
-- MIGRATION 02: VÍNCULO SEGURO SUPABASE AUTH (auth.users) E TENANTS
-- Arquivo: supabase/migrations/20261011_02_auth_tenant_bridge.sql
-- Status: PREPARADO PARA AMBIENTE DE HOMOLOGAÇÃO
-- ==============================================================================

-- 1. TABELA DE ASSOCIAÇÃO IMUTÁVEL DE ADMINISTRADORES
CREATE TABLE IF NOT EXISTS public.tenant_admins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('super_admin', 'admin', 'staff')),
    username TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_super_admin_tenant CHECK (
        (role = 'super_admin') OR (tenant_id IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_tenant_admins_user ON public.tenant_admins(user_id);
CREATE INDEX IF NOT EXISTS idx_tenant_admins_tenant ON public.tenant_admins(tenant_id);

-- RLS Habilitado em tenant_admins
ALTER TABLE public.tenant_admins ENABLE ROW LEVEL SECURITY;

-- 2. FUNÇÕES DE CONTEXTO E AUTORIZAÇÃO (STABLE & SECURITY DEFINER)
-- Criptograficamente amarradas a auth.uid() emitido pelo Supabase Auth JWT

CREATE OR REPLACE FUNCTION public.get_auth_tenant_id()
RETURNS UUID
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
LANGUAGE sql AS $$
    SELECT tenant_id 
    FROM public.tenant_admins 
    WHERE user_id = auth.uid() AND is_active = true 
    LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
LANGUAGE sql AS $$
    SELECT EXISTS (
        SELECT 1 
        FROM public.tenant_admins 
        WHERE user_id = auth.uid() AND role = 'super_admin' AND is_active = true
    );
$$;

CREATE OR REPLACE FUNCTION public.get_auth_admin_role()
RETURNS TEXT
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
LANGUAGE sql AS $$
    SELECT role 
    FROM public.tenant_admins 
    WHERE user_id = auth.uid() AND is_active = true 
    LIMIT 1;
$$;

-- Restrição estrita de execução das funções de contexto
REVOKE EXECUTE ON FUNCTION public.get_auth_tenant_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_auth_tenant_id() TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.is_super_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.get_auth_admin_role() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_auth_admin_role() TO authenticated, service_role;

-- 3. PROCEDURE SEGURA DE CONSULTA DE COLABORADORES DO PRÓPRIO RESTAURANTE
CREATE OR REPLACE FUNCTION public.get_store_admin_users()
RETURNS TABLE (
    id UUID,
    tenant_id UUID,
    username TEXT,
    role TEXT,
    permissions JSONB,
    active BOOLEAN,
    created_date TIMESTAMPTZ,
    updated_date TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_tenant_id UUID := public.get_auth_tenant_id();
BEGIN
    -- Bloqueia quem não possui restaurante e não é SuperAdmin
    IF NOT (public.is_super_admin() OR v_caller_tenant_id IS NOT NULL) THEN
        RAISE EXCEPTION 'Acesso negado: Usuário não associado a um restaurante.';
    END IF;

    RETURN QUERY
    SELECT 
        u.id,
        u.tenant_id,
        u.username,
        u.role,
        u.permissions,
        u.active,
        u.created_date,
        u.updated_date
    FROM public.admin_users u
    WHERE (public.is_super_admin() OR u.tenant_id = v_caller_tenant_id)
    ORDER BY u.created_date ASC;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_store_admin_users() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_store_admin_users() TO authenticated, service_role;

-- 4. POLÍTICAS RLS PARA TENANT_ADMINS
CREATE POLICY "Admin view own membership"
    ON public.tenant_admins FOR SELECT
    TO authenticated
    USING (user_id = auth.uid() OR public.is_super_admin());

CREATE POLICY "Superadmin manage tenant_admins"
    ON public.tenant_admins FOR ALL
    TO authenticated
    USING (public.is_super_admin())
    WITH CHECK (public.is_super_admin());

CREATE POLICY "Service role full tenant_admins"
    ON public.tenant_admins FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);



-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- MIGRATION: 20261011_03_server_validated_checkout.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- ==============================================================================
-- MIGRATION: CHECKOUT PÚBLICO VALIDADO NO SERVIDOR & TRACKING TOKEN
-- Arquivo: supabase/migrations/20261011_03_server_validated_checkout.sql
-- Status: NÃO EXECUTADO (Aguardando autorização explícita)
-- Objetivo: Validação de preços/cupons no banco e consulta segura de pedidos anônimos
-- ==============================================================================

-- 1. ADICIONA COLUNA DE TOKEN DE ACOMPANHAMENTO NA TABELA ORDERS
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS tracking_token UUID NOT NULL DEFAULT gen_random_uuid();

CREATE INDEX IF NOT EXISTS idx_orders_tracking_token 
ON public.orders(id, tracking_token);

-- 2. PROCEDURE TRANSACIONAL: CRIAÇÃO DE PEDIDO COM VALIDAÇÃO NO SERVIDOR
CREATE OR REPLACE FUNCTION public.create_public_order(
    p_tenant_id UUID,
    p_customer_name TEXT,
    p_customer_phone TEXT,
    p_delivery_type TEXT,
    p_delivery_address TEXT,
    p_payment_method TEXT,
    p_items JSONB,
    p_coupon_code TEXT DEFAULT NULL,
    p_notes TEXT DEFAULT NULL,
    p_table_number TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_tenant RECORD;
    v_order_id TEXT;
    v_order_number INT;
    v_tracking_token UUID := gen_random_uuid();
    v_subtotal NUMERIC(10,2) := 0;
    v_delivery_fee NUMERIC(10,2) := 0;
    v_discount NUMERIC(10,2) := 0;
    v_total NUMERIC(10,2) := 0;
    v_item JSONB;
    v_prod_id TEXT;
    v_qty NUMERIC(10,2);
    v_db_product RECORD;
    v_item_subtotal NUMERIC(10,2);
    v_verified_items JSONB := '[]'::jsonb;
    v_coupon RECORD;
BEGIN
    -- A. Valida se a loja existe e está ativa
    SELECT id, name, is_active, delivery_fee, min_order_value, free_delivery_threshold
    INTO v_tenant
    FROM public.tenants
    WHERE id = p_tenant_id;

    IF NOT FOUND OR NOT v_tenant.is_active THEN
        RETURN jsonb_build_object('success', false, 'message', 'Restaurante indisponível no momento.');
    END IF;

    -- B. Valida telefone e nome do cliente
    IF TRIM(COALESCE(p_customer_name, '')) = '' OR TRIM(COALESCE(p_customer_phone, '')) = '' THEN
        RETURN jsonb_build_object('success', false, 'message', 'Nome e telefone são obrigatórios.');
    END IF;

    -- C. Valida e precifica cada item diretamente do catálogo do banco
    IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
        RETURN jsonb_build_object('success', false, 'message', 'O pedido deve conter pelo menos um item.');
    END IF;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_prod_id := v_item->>'product_id';
        v_qty := COALESCE((v_item->>'quantity')::numeric, 1);

        IF v_qty <= 0 THEN
            RETURN jsonb_build_object('success', false, 'message', 'Quantidade inválida para um dos itens.');
        END IF;

        -- Busca o produto no banco com preço autêntico
        SELECT id, name, price, available
        INTO v_db_product
        FROM public.products
        WHERE id = v_prod_id AND tenant_id = p_tenant_id;

        IF NOT FOUND THEN
            RETURN jsonb_build_object('success', false, 'message', 'Produto não encontrado no cardápio desta loja.');
        END IF;

        IF NOT v_db_product.available THEN
            RETURN jsonb_build_object('success', false, 'message', 'O item ' || v_db_product.name || ' não está disponível.');
        END IF;

        v_item_subtotal := ROUND(v_db_product.price * v_qty, 2);
        v_subtotal := v_subtotal + v_item_subtotal;

        -- Registra item com preço garantido pelo banco
        v_verified_items := v_verified_items || jsonb_build_object(
            'product_id', v_db_product.id,
            'product_name', v_db_product.name,
            'product_price', v_db_product.price,
            'quantity', v_qty,
            'subtotal', v_item_subtotal,
            'additionals', COALESCE(v_item->'additionals', '[]'::jsonb),
            'notes', COALESCE(v_item->>'notes', '')
        );
    END LOOP;

    -- D. Valida valor mínimo do pedido
    IF v_tenant.min_order_value > 0 AND v_subtotal < v_tenant.min_order_value THEN
        RETURN jsonb_build_object('success', false, 'message', 'Valor mínimo do pedido é R$ ' || v_tenant.min_order_value);
    END IF;

    -- E. Valida e calcula cupom de desconto se fornecido
    IF p_coupon_code IS NOT NULL AND TRIM(p_coupon_code) <> '' THEN
        SELECT code, discount_type, discount_value, min_order_value, active, end_date
        INTO v_coupon
        FROM public.coupons
        WHERE tenant_id = p_tenant_id 
          AND LOWER(code) = LOWER(TRIM(p_coupon_code))
          AND active = true
          AND (end_date IS NULL OR end_date >= now());


        IF FOUND THEN
            IF v_coupon.min_order_value IS NULL OR v_subtotal >= v_coupon.min_order_value THEN
                IF v_coupon.discount_type = 'percentage' THEN
                    v_discount := ROUND((v_subtotal * (v_coupon.discount_value / 100.0)), 2);
                ELSE
                    v_discount := LEAST(v_coupon.discount_value, v_subtotal);
                END IF;
            END IF;
        END IF;
    END IF;

    -- F. Valida taxa de entrega
    IF p_delivery_type = 'delivery' THEN
        IF v_tenant.free_delivery_threshold IS NOT NULL AND v_tenant.free_delivery_threshold > 0 AND v_subtotal >= v_tenant.free_delivery_threshold THEN
            v_delivery_fee := 0;
        ELSE
            v_delivery_fee := COALESCE(v_tenant.delivery_fee, 0);
        END IF;
    ELSE
        v_delivery_fee := 0;
    END IF;

    -- G. Total final auditado
    v_total := GREATEST(0, (v_subtotal + v_delivery_fee - v_discount));

    -- H. Gera número sequencial de pedido para o tenant
    SELECT COALESCE(MAX(order_number), 0) + 1
    INTO v_order_number
    FROM public.orders
    WHERE tenant_id = p_tenant_id;

    v_order_id := 'ord_' || to_char(now(), 'YYYYMMDD') || '_' || lpad(v_order_number::text, 4, '0') || '_' || substr(gen_random_uuid()::text, 1, 6);

    -- I. Insere o pedido auditado na tabela orders
    INSERT INTO public.orders (
        id, tenant_id, order_number, tracking_token, customer_name, customer_phone,
        customer_address, delivery_address, total_amount, total, subtotal, delivery_fee,
        discount_amount, discount, status, payment_method, order_type, table_number,
        notes, coupon_code, items, created_date, updated_date
    ) VALUES (
        v_order_id, p_tenant_id, v_order_number, v_tracking_token, TRIM(p_customer_name), TRIM(p_customer_phone),
        p_delivery_address, p_delivery_address, v_total, v_total, v_subtotal, v_delivery_fee,
        v_discount, v_discount, 'pendente', p_payment_method, p_delivery_type, p_table_number,
        p_notes, p_coupon_code, v_verified_items, now(), now()
    );

    -- J. Insere itens detalhados na tabela order_items
    FOR v_item IN SELECT * FROM jsonb_array_elements(v_verified_items)
    LOOP
        INSERT INTO public.order_items (
            id, tenant_id, order_id, product_id, product_name, product_price,
            quantity, subtotal, created_date, updated_date
        ) VALUES (
            gen_random_uuid()::text, p_tenant_id, v_order_id, v_item->>'product_id',
            v_item->>'product_name', (v_item->>'product_price')::numeric,
            (v_item->>'quantity')::numeric, (v_item->>'subtotal')::numeric, now(), now()
        );
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'order_id', v_order_id,
        'order_number', v_order_number,
        'tracking_token', v_tracking_token,
        'total', v_total,
        'subtotal', v_subtotal,
        'delivery_fee', v_delivery_fee,
        'discount', v_discount,
        'status', 'pendente',
        'message', 'Pedido criado com sucesso!'
    );
END;
$$;

-- 3. PROCEDURE SEGURA DE CONSULTA POR TRACKING TOKEN
CREATE OR REPLACE FUNCTION public.get_order_by_tracking_token(
    p_order_id TEXT,
    p_tracking_token UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_order RECORD;
BEGIN
    SELECT 
        o.id, o.tenant_id, o.order_number, o.customer_name, o.customer_phone,
        o.delivery_address, o.total, o.subtotal, o.delivery_fee, o.discount,
        o.status, o.payment_method, o.order_type, o.table_number, o.notes,
        o.items, o.created_date, o.updated_date,
        t.name AS restaurant_name, t.phone AS restaurant_phone
    INTO v_order
    FROM public.orders o
    JOIN public.tenants t ON t.id = o.tenant_id
    WHERE o.id = p_order_id 
      AND o.tracking_token = p_tracking_token;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Pedido não encontrado ou token inválido.');
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'order', to_jsonb(v_order)
    );
END;
$$;

-- Permissões de Execução
GRANT EXECUTE ON FUNCTION public.create_public_order TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_order_by_tracking_token TO anon, authenticated, service_role;


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- MIGRATION: 20261011_04_strict_rls_hardening.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- ==============================================================================
-- MIGRATION: POLÍTICAS RLS ESTRITAS (HARDENING COMPLETO MULTI-TENANT)
-- Arquivo: supabase/migrations/20261011_04_strict_rls_hardening.sql
-- Status: NÃO EXECUTADO (Aguardando autorização explícita)
-- Objetivo: Garantir isolamento impenetrável sem políticas USING (TRUE)
-- ==============================================================================

-- ==============================================================================
-- 1. TABELA TENANTS
-- ==============================================================================
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public delete tenants" ON public.tenants;
DROP POLICY IF EXISTS "Allow public insert tenants" ON public.tenants;
DROP POLICY IF EXISTS "Allow public update tenants" ON public.tenants;
DROP POLICY IF EXISTS "Public read active tenants" ON public.tenants;
DROP POLICY IF EXISTS "Service role full access tenants" ON public.tenants;

-- Público pode ler apenas lojas ativas
CREATE POLICY "Public read active tenants"
    ON public.tenants FOR SELECT
    TO anon, authenticated
    USING (is_active = true);

-- Apenas administradores do próprio restaurante podem atualizar suas configurações
CREATE POLICY "Admin update own tenant"
    ON public.tenants FOR UPDATE
    TO authenticated
    USING (id = public.get_auth_tenant_id() OR public.is_super_admin())
    WITH CHECK (id = public.get_auth_tenant_id() OR public.is_super_admin());

-- Criação e deleção de lojas restritas a superadmin ou service_role
CREATE POLICY "Superadmin manage tenants"
    ON public.tenants FOR ALL
    TO authenticated
    USING (public.is_super_admin())
    WITH CHECK (public.is_super_admin());

CREATE POLICY "Service role full tenants"
    ON public.tenants FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);


-- ==============================================================================
-- 2. TABELA ADMIN_USERS
-- ==============================================================================
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access admin_users" ON public.admin_users;

-- Totalmente bloqueada para acesso anônimo público
CREATE POLICY "Block public read admin_users"
    ON public.admin_users FOR ALL
    TO anon
    USING (false)
    WITH CHECK (false);

CREATE POLICY "Superadmin manage admin_users"
    ON public.admin_users FOR ALL
    TO authenticated
    USING (public.is_super_admin() OR tenant_id = public.get_auth_tenant_id())
    WITH CHECK (public.is_super_admin() OR tenant_id = public.get_auth_tenant_id());

CREATE POLICY "Service role full admin_users"
    ON public.admin_users FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);


-- ==============================================================================
-- 3. PRODUTOS, CATEGORIAS E COMPLEMENTOS (CARDÁPIO)
-- ==============================================================================
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.complement_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.complement_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_complement_groups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow admin manage categories" ON public.categories;
DROP POLICY IF EXISTS "Public read categories" ON public.categories;
DROP POLICY IF EXISTS "Allow admin manage products" ON public.products;
DROP POLICY IF EXISTS "Public read products" ON public.products;
DROP POLICY IF EXISTS "Allow admin manage groups" ON public.complement_groups;
DROP POLICY IF EXISTS "Public read complement_groups" ON public.complement_groups;
DROP POLICY IF EXISTS "Allow admin manage items" ON public.complement_items;
DROP POLICY IF EXISTS "Public read complement_items" ON public.complement_items;
DROP POLICY IF EXISTS "Allow admin manage prod_groups" ON public.product_complement_groups;
DROP POLICY IF EXISTS "Public read product_complement_groups" ON public.product_complement_groups;

-- Leituras Públicas: Somente itens disponíveis do catálogo
CREATE POLICY "Public read categories"
    ON public.categories FOR SELECT
    TO anon, authenticated
    USING (true);

CREATE POLICY "Public read available products"
    ON public.products FOR SELECT
    TO anon, authenticated
    USING (available = true);

CREATE POLICY "Public read active complement_groups"
    ON public.complement_groups FOR SELECT
    TO anon, authenticated
    USING (active = true);

CREATE POLICY "Public read active complement_items"
    ON public.complement_items FOR SELECT
    TO anon, authenticated
    USING (active = true);

CREATE POLICY "Public read product_complement_groups"
    ON public.product_complement_groups FOR SELECT
    TO anon, authenticated
    USING (true);

-- Modificações (INSERT, UPDATE, DELETE): Isoladas estritamente por tenant_id
CREATE POLICY "Admin manage categories"
    ON public.categories FOR ALL
    TO authenticated
    USING (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin())
    WITH CHECK (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin());

CREATE POLICY "Admin manage products"
    ON public.products FOR ALL
    TO authenticated
    USING (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin())
    WITH CHECK (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin());

CREATE POLICY "Admin manage complement_groups"
    ON public.complement_groups FOR ALL
    TO authenticated
    USING (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin())
    WITH CHECK (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin());

CREATE POLICY "Admin manage complement_items"
    ON public.complement_items FOR ALL
    TO authenticated
    USING (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin())
    WITH CHECK (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin());

CREATE POLICY "Admin manage product_complement_groups"
    ON public.product_complement_groups FOR ALL
    TO authenticated
    USING (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin())
    WITH CHECK (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin());


-- ==============================================================================
-- 4. BANNERS E CUPONS
-- ==============================================================================
ALTER TABLE public.banners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.banner_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow admin manage banners" ON public.banners;
DROP POLICY IF EXISTS "Public read banners" ON public.banners;
DROP POLICY IF EXISTS "Allow admin manage banner_images" ON public.banner_images;
DROP POLICY IF EXISTS "Public read banner_images" ON public.banner_images;
DROP POLICY IF EXISTS "Allow admin manage coupons" ON public.coupons;
DROP POLICY IF EXISTS "Public read coupons" ON public.coupons;

CREATE POLICY "Public read banners"
    ON public.banners FOR SELECT
    TO anon, authenticated
    USING (active = true);

CREATE POLICY "Public read banner_images"
    ON public.banner_images FOR SELECT
    TO anon, authenticated
    USING (active = true);

CREATE POLICY "Public read active coupons"
    ON public.coupons FOR SELECT
    TO anon, authenticated
    USING (active = true AND (end_date IS NULL OR end_date >= now()));


CREATE POLICY "Admin manage banners"
    ON public.banners FOR ALL
    TO authenticated
    USING (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin())
    WITH CHECK (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin());

CREATE POLICY "Admin manage banner_images"
    ON public.banner_images FOR ALL
    TO authenticated
    USING (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin())
    WITH CHECK (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin());

CREATE POLICY "Admin manage coupons"
    ON public.coupons FOR ALL
    TO authenticated
    USING (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin())
    WITH CHECK (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin());


-- ==============================================================================
-- 5. PEDIDOS (ORDERS) E ITENS (ORDER_ITEMS)
-- ==============================================================================
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read own orders" ON public.orders;
DROP POLICY IF EXISTS "Public insert orders" ON public.orders;
DROP POLICY IF EXISTS "Allow admin update orders" ON public.orders;
DROP POLICY IF EXISTS "Public read order_items" ON public.order_items;
DROP POLICY IF EXISTS "Public insert order_items" ON public.order_items;
DROP POLICY IF EXISTS "Admin view tenant orders" ON public.orders;
DROP POLICY IF EXISTS "Admin insert tenant orders" ON public.orders;
DROP POLICY IF EXISTS "Admin update tenant orders" ON public.orders;
DROP POLICY IF EXISTS "Admin delete tenant orders" ON public.orders;
DROP POLICY IF EXISTS "Admin manage tenant order_items" ON public.order_items;
DROP POLICY IF EXISTS "Admin view tenant order_items" ON public.order_items;

-- Apenas operadores do restaurante do pedido ou superadmin podem ler pedidos
CREATE POLICY "Admin view tenant orders"
    ON public.orders FOR SELECT
    TO authenticated
    USING (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin());

-- Criação de pedidos no PDV (Balcão) por operadores autenticados
CREATE POLICY "Admin insert tenant orders"
    ON public.orders FOR INSERT
    TO authenticated
    WITH CHECK (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin());

-- Atualização de status e dados de pedidos por operadores autenticados
CREATE POLICY "Admin update tenant orders"
    ON public.orders FOR UPDATE
    TO authenticated
    USING (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin())
    WITH CHECK (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin());

-- Cancelamento/exclusão de pedidos por operadores autenticados
CREATE POLICY "Admin delete tenant orders"
    ON public.orders FOR DELETE
    TO authenticated
    USING (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin());

-- Gestão completa de order_items por operadores autenticados
CREATE POLICY "Admin manage tenant order_items"
    ON public.order_items FOR ALL
    TO authenticated
    USING (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin())
    WITH CHECK (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin());

CREATE POLICY "Service role full orders"
    ON public.orders FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Service role full order_items"
    ON public.order_items FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);



-- ==============================================================================
-- 6. CLIENTES (CUSTOMERS)
-- ==============================================================================
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read customers" ON public.customers;
DROP POLICY IF EXISTS "Public insert customers" ON public.customers;
DROP POLICY IF EXISTS "Public update customers" ON public.customers;

-- Clientes só podem ser gerenciados pelo administrador do tenant correspondente ou service_role
CREATE POLICY "Admin view tenant customers"
    ON public.customers FOR SELECT
    TO authenticated
    USING (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin());

CREATE POLICY "Admin manage tenant customers"
    ON public.customers FOR ALL
    TO authenticated
    USING (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin())
    WITH CHECK (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin());

CREATE POLICY "Service role full customers"
    ON public.customers FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);


-- ==============================================================================
-- 7. TABELAS AUXILIARES (ENDEREÇOS, CUPONS USADOS, ADICIONAIS)
-- ==============================================================================
ALTER TABLE public.product_additionals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_item_additionals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupon_usages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read additionals" ON public.product_additionals;
DROP POLICY IF EXISTS "Admin manage additionals" ON public.product_additionals;
DROP POLICY IF EXISTS "Public read order_item_additionals" ON public.order_item_additionals;
DROP POLICY IF EXISTS "Public insert order_item_additionals" ON public.order_item_additionals;
DROP POLICY IF EXISTS "Admin manage order_item_additionals" ON public.order_item_additionals;
DROP POLICY IF EXISTS "Public manage user_addresses" ON public.user_addresses;
DROP POLICY IF EXISTS "Admin view tenant addresses" ON public.user_addresses;
DROP POLICY IF EXISTS "Anon insert address" ON public.user_addresses;
DROP POLICY IF EXISTS "Public manage coupon_usages" ON public.coupon_usages;
DROP POLICY IF EXISTS "Admin view coupon_usages" ON public.coupon_usages;
DROP POLICY IF EXISTS "Anon insert coupon_usages" ON public.coupon_usages;

-- Adicionais de produtos (Cardápio público / Admin)
CREATE POLICY "Public read active product_additionals"
    ON public.product_additionals FOR SELECT
    TO anon, authenticated
    USING (active = true);

CREATE POLICY "Admin manage product_additionals"
    ON public.product_additionals FOR ALL
    TO authenticated
    USING (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin())
    WITH CHECK (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin());

-- Adicionais de itens de pedidos
CREATE POLICY "Admin manage order_item_additionals"
    ON public.order_item_additionals FOR ALL
    TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.order_items oi 
        WHERE oi.id = order_item_additionals.order_item_id 
          AND (oi.tenant_id = public.get_auth_tenant_id() OR public.is_super_admin())
    ))
    WITH CHECK (EXISTS (
        SELECT 1 FROM public.order_items oi 
        WHERE oi.id = order_item_additionals.order_item_id 
          AND (oi.tenant_id = public.get_auth_tenant_id() OR public.is_super_admin())
    ));

CREATE POLICY "Service role full order_item_additionals"
    ON public.order_item_additionals FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Endereços de entrega cadastrados
CREATE POLICY "Admin manage user_addresses"
    ON public.user_addresses FOR ALL
    TO authenticated
    USING (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin())
    WITH CHECK (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin());

CREATE POLICY "Anon insert user_addresses"
    ON public.user_addresses FOR INSERT
    TO anon, authenticated
    WITH CHECK (true);

CREATE POLICY "Service role full user_addresses"
    ON public.user_addresses FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Registro de uso de cupons
CREATE POLICY "Admin view coupon_usages"
    ON public.coupon_usages FOR SELECT
    TO authenticated
    USING (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin());

CREATE POLICY "Anon insert coupon_usages"
    ON public.coupon_usages FOR INSERT
    TO anon, authenticated
    WITH CHECK (true);

CREATE POLICY "Service role full coupon_usages"
    ON public.coupon_usages FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);


-- ==============================================================================
-- 8. STORAGE BUCKET (restaurant-images)
-- ==============================================================================
DROP POLICY IF EXISTS "Anyone can delete restaurant-images" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can update restaurant-images" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can upload to restaurant-images" ON storage.objects;
DROP POLICY IF EXISTS "Public can view restaurant-images" ON storage.objects;

-- Público pode visualizar qualquer imagem do bucket
CREATE POLICY "Public view restaurant images"
    ON storage.objects FOR SELECT
    TO public
    USING (bucket_id = 'restaurant-images');

-- Upload permitido para autenticados e clientes autorizados
CREATE POLICY "Authorized upload restaurant images"
    ON storage.objects FOR INSERT
    TO public
    WITH CHECK (bucket_id = 'restaurant-images');

-- Exclusão restrita exclusivamente a administradores autenticados ou service_role
CREATE POLICY "Admin delete restaurant images"
    ON storage.objects FOR DELETE
    TO authenticated
    USING (bucket_id = 'restaurant-images');


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- MIGRATION: 20261011_05_admin_rpcs_authorization.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- ==============================================================================
-- MIGRATION: AUTORIZAÇÃO ESTRITA EM RPCS ADMINISTRATIVAS
-- Arquivo: supabase/migrations/20261011_05_admin_rpcs_authorization.sql
-- Status: NÃO EXECUTADO (Aguardando aprovação explícita)
-- Objetivo: Garantir que cada procedure valide auth.uid() e pertença de tenant
-- ==============================================================================

-- 1. DELETE_TENANT (Restrito exclusivamente ao SuperAdmin autenticado)
CREATE OR REPLACE FUNCTION public.delete_tenant(p_tenant_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_slug TEXT;
    v_name TEXT;
BEGIN
    -- Validação de Autorização: Apenas o SuperAdmin pode excluir estabelecimentos
    IF NOT public.is_super_admin() THEN
        RAISE EXCEPTION 'Acesso negado: Apenas o SuperAdmin pode excluir estabelecimentos.';
    END IF;

    SELECT slug, name INTO v_slug, v_name 
    FROM public.tenants 
    WHERE id = p_tenant_id;

    IF v_slug IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Empresa não encontrada.');
    END IF;

    -- Exclusão ordenada em cascata
    DELETE FROM public.order_items WHERE tenant_id = p_tenant_id;
    DELETE FROM public.orders WHERE tenant_id = p_tenant_id;
    DELETE FROM public.user_addresses WHERE tenant_id = p_tenant_id;
    DELETE FROM public.customers WHERE tenant_id = p_tenant_id;
    DELETE FROM public.coupon_usages WHERE tenant_id = p_tenant_id;
    DELETE FROM public.coupons WHERE tenant_id = p_tenant_id;
    DELETE FROM public.banner_images WHERE tenant_id = p_tenant_id;
    DELETE FROM public.banners WHERE tenant_id = p_tenant_id;
    DELETE FROM public.product_complement_groups WHERE tenant_id = p_tenant_id;
    DELETE FROM public.complement_items WHERE tenant_id = p_tenant_id;
    DELETE FROM public.complement_groups WHERE tenant_id = p_tenant_id;
    DELETE FROM public.product_additionals WHERE tenant_id = p_tenant_id;
    DELETE FROM public.products WHERE tenant_id = p_tenant_id;
    DELETE FROM public.categories WHERE tenant_id = p_tenant_id;
    DELETE FROM public.tenant_admins WHERE tenant_id = p_tenant_id;
    DELETE FROM public.admin_users WHERE tenant_id = p_tenant_id;
    DELETE FROM public.tenants WHERE id = p_tenant_id;

    RETURN jsonb_build_object(
        'success', true,
        'tenant_id', p_tenant_id,
        'deleted_name', v_name,
        'message', 'Restaurante ' || v_name || ' e todos os seus dados foram excluídos com sucesso!'
    );
END;
$$;


-- 2. GET_MASTER_TENANTS (Restrito ao SuperAdmin)
CREATE OR REPLACE FUNCTION public.get_master_tenants()
RETURNS TABLE(
    id UUID,
    slug TEXT,
    name TEXT,
    plan TEXT,
    is_active BOOLEAN,
    logo_url TEXT,
    created_date TIMESTAMPTZ,
    total_orders BIGINT,
    total_revenue NUMERIC,
    admin_username TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NOT public.is_super_admin() THEN
        RAISE EXCEPTION 'Acesso negado: Visualização restrita ao SuperAdmin.';
    END IF;

    RETURN QUERY
    SELECT 
        t.id,
        t.slug,
        t.name,
        t.plan,
        t.is_active,
        t.logo_url,
        t.created_date,
        COUNT(o.id)::BIGINT AS total_orders,
        COALESCE(SUM(COALESCE(o.total, o.total_amount, 0)), 0)::NUMERIC AS total_revenue,
        COALESCE(
            (SELECT ta.username FROM public.tenant_admins ta WHERE ta.tenant_id = t.id LIMIT 1),
            (SELECT u.username FROM public.admin_users u WHERE u.tenant_id = t.id LIMIT 1)
        ) AS admin_username
    FROM public.tenants t
    LEFT JOIN public.orders o ON o.tenant_id = t.id
    GROUP BY t.id
    ORDER BY t.created_date DESC;
END;
$$;


-- 3. TOGGLE_TENANT_STATUS (SuperAdmin ou próprio Tenant Admin)
CREATE OR REPLACE FUNCTION public.toggle_tenant_status(p_tenant_id UUID, p_is_active BOOLEAN)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NOT (public.is_super_admin() OR p_tenant_id = public.get_auth_tenant_id()) THEN
        RAISE EXCEPTION 'Acesso negado: Sem permissão para alterar o status deste estabelecimento.';
    END IF;

    UPDATE public.tenants
    SET is_active = p_is_active,
        updated_date = NOW()
    WHERE id = p_tenant_id;

    RETURN jsonb_build_object('success', true, 'is_active', p_is_active);
END;
$$;


-- 4. GET_SALES_METRICS (SuperAdmin ou próprio Tenant Admin)
CREATE OR REPLACE FUNCTION public.get_sales_metrics(
    p_tenant_id UUID,
    p_start_date TIMESTAMPTZ DEFAULT NULL,
    p_end_date TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
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
    -- Isolamento estrito: Impede que um restaurante consulte métricas de outro
    IF NOT (public.is_super_admin() OR p_tenant_id = public.get_auth_tenant_id()) THEN
        RAISE EXCEPTION 'Acesso negado: Você não possui autorização para consultar relatórios deste restaurante.';
    END IF;

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


-- 5. GET_CLIENTS_SUMMARY (SuperAdmin ou próprio Tenant Admin)
CREATE OR REPLACE FUNCTION public.get_clients_summary(p_tenant_id UUID)
RETURNS TABLE(
    id TEXT,
    customer_phone TEXT,
    customer_name TEXT,
    customer_email TEXT,
    last_address TEXT,
    total_orders BIGINT,
    total_spent NUMERIC,
    first_order_at TIMESTAMPTZ,
    last_order_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NOT (public.is_super_admin() OR p_tenant_id = public.get_auth_tenant_id()) THEN
        RAISE EXCEPTION 'Acesso negado: Você não possui autorização para consultar clientes deste restaurante.';
    END IF;

    RETURN QUERY
    WITH store_orders AS (
        SELECT 
            o.customer_phone,
            (ARRAY_AGG(o.customer_name ORDER BY o.created_date DESC))[1] AS cust_name,
            (ARRAY_AGG(o.customer_email ORDER BY o.created_date DESC) FILTER (WHERE o.customer_email IS NOT NULL AND o.customer_email <> ''))[1] AS cust_email,
            (ARRAY_AGG(COALESCE(o.delivery_address, o.customer_address) ORDER BY o.created_date DESC) FILTER (WHERE COALESCE(o.delivery_address, o.customer_address) IS NOT NULL))[1] AS last_addr,
            COUNT(*)::BIGINT AS total_ord,
            COALESCE(SUM(COALESCE(o.total, o.total_amount, 0)), 0)::NUMERIC AS spent,
            MIN(o.created_date) AS first_ord,
            MAX(o.created_date) AS last_ord
        FROM public.orders o
        WHERE o.tenant_id = p_tenant_id
          AND o.customer_phone IS NOT NULL 
          AND TRIM(o.customer_phone) <> ''
        GROUP BY o.customer_phone
    ),
    store_customers AS (
        SELECT 
            c.id::text AS cust_id,
            c.phone,
            c.full_name,
            c.email,
            c.created_date
        FROM public.customers c
        WHERE c.tenant_id = p_tenant_id
    )
    SELECT 
        COALESCE(sc.cust_id, so.customer_phone) AS id,
        COALESCE(sc.phone, so.customer_phone) AS customer_phone,
        COALESCE(sc.full_name, so.cust_name, 'Cliente') AS customer_name,
        COALESCE(sc.email, so.cust_email, '') AS customer_email,
        COALESCE(so.last_addr, '') AS last_address,
        COALESCE(so.total_ord, 0)::BIGINT AS total_orders,
        COALESCE(so.spent, 0)::NUMERIC AS total_spent,
        COALESCE(so.first_ord, sc.created_date) AS first_order_at,
        so.last_ord AS last_order_at
    FROM store_customers sc
    FULL OUTER JOIN store_orders so ON (
        REGEXP_REPLACE(sc.phone, '\D', '', 'g') = REGEXP_REPLACE(so.customer_phone, '\D', '', 'g')
    )
    ORDER BY COALESCE(so.last_ord, sc.created_date) DESC;
END;
$$;


-- 6. CREATE_NEW_TENANT (Apenas SuperAdmin ou service_role)
CREATE OR REPLACE FUNCTION public.create_new_tenant(
    p_name TEXT,
    p_slug TEXT,
    p_plan TEXT DEFAULT 'basic'::TEXT,
    p_admin_username TEXT DEFAULT 'admin'::TEXT,
    p_admin_password TEXT DEFAULT NULL::TEXT,
    p_primary_color TEXT DEFAULT '#E11D48'::TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_tenant_id UUID := gen_random_uuid();
    v_clean_slug TEXT := LOWER(REGEXP_REPLACE(TRIM(p_slug), '[^a-zA-Z0-9\-]', '-', 'g'));
BEGIN
    -- Validação de Autorização: Apenas SuperAdmin ou service_role pode criar estabelecimentos
    IF NOT (public.is_super_admin() OR auth.role() = 'service_role') THEN
        RAISE EXCEPTION 'Acesso negado: Apenas o SuperAdmin pode cadastrar novos restaurantes.';
    END IF;

    IF p_admin_password IS NULL OR length(trim(p_admin_password)) < 6 THEN
        RETURN jsonb_build_object('success', false, 'message', 'A senha do administrador deve ter no mínimo 6 caracteres.');
    END IF;

    IF EXISTS (SELECT 1 FROM public.tenants WHERE slug = v_clean_slug) THEN
        RETURN jsonb_build_object('success', false, 'message', 'Este slug/endereço já está em uso por outro restaurante.');
    END IF;

    INSERT INTO public.tenants (
        id, slug, name, plan, logo_url, banner_url, theme_config, is_active,
        phone, whatsapp, address, instagram, delivery_fee, min_order_value
    )
    VALUES (
        v_tenant_id,
        v_clean_slug,
        TRIM(p_name),
        COALESCE(p_plan, 'basic'),
        NULL,
        NULL,
        jsonb_build_object(
            'primary_color', p_primary_color,
            'secondary_color', '#111827',
            'layout_style', CASE WHEN p_plan = 'premium' THEN 'premium' ELSE 'standard' END
        ),
        TRUE,
        NULL,
        NULL,
        NULL,
        NULL,
        0.00,
        0.00
    );

    INSERT INTO public.admin_users (
        tenant_id, username, password, initial_password, role, permissions, active
    )
    VALUES (
        v_tenant_id,
        LOWER(TRIM(p_admin_username)),
        crypt(p_admin_password, gen_salt('bf', 8)),
        NULL,
        'admin',
        '["*"]'::jsonb,
        TRUE
    );

    RETURN jsonb_build_object(
        'success', true,
        'tenant_id', v_tenant_id,
        'slug', v_clean_slug,
        'name', TRIM(p_name),
        'message', 'Restaurante criado com sucesso!'
    );
END;
$$;


-- 7. UPDATE_TENANT_INFO (Apenas SuperAdmin ou Administrador da própria loja)
CREATE OR REPLACE FUNCTION public.update_tenant_info(
    p_tenant_id UUID,
    p_name TEXT,
    p_slug TEXT,
    p_plan TEXT DEFAULT NULL,
    p_logo_url TEXT DEFAULT NULL,
    p_admin_username TEXT DEFAULT NULL,
    p_admin_password TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_clean_slug TEXT := LOWER(REGEXP_REPLACE(TRIM(p_slug), '[^a-zA-Z0-9\-]', '-', 'g'));
    v_existing_id UUID;
BEGIN
    -- Validação de Autorização: Apenas SuperAdmin ou o Administrador do próprio restaurante
    IF NOT (public.is_super_admin() OR (p_tenant_id = public.get_auth_tenant_id() AND public.get_auth_admin_role() IN ('super_admin', 'admin'))) THEN
        RAISE EXCEPTION 'Acesso negado: Você não possui autorização para editar este restaurante.';
    END IF;

    SELECT id INTO v_existing_id 
    FROM public.tenants 
    WHERE slug = v_clean_slug AND id != p_tenant_id;

    IF v_existing_id IS NOT NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Este slug/endereço já está em uso por outro restaurante.');
    END IF;

    UPDATE public.tenants
    SET 
        name = TRIM(p_name),
        slug = v_clean_slug,
        plan = COALESCE(p_plan, plan),
        logo_url = NULLIF(TRIM(p_logo_url), ''),
        updated_date = NOW()
    WHERE id = p_tenant_id;

    IF p_admin_username IS NOT NULL AND TRIM(p_admin_username) != '' THEN
        IF p_admin_password IS NOT NULL AND TRIM(p_admin_password) != '' THEN
            UPDATE public.admin_users
            SET 
                username = LOWER(TRIM(p_admin_username)),
                password = crypt(p_admin_password, gen_salt('bf', 8)),
                initial_password = NULL,
                updated_date = NOW()
            WHERE tenant_id = p_tenant_id;
        ELSE
            UPDATE public.admin_users
            SET 
                username = LOWER(TRIM(p_admin_username)),
                updated_date = NOW()
            WHERE tenant_id = p_tenant_id;
        END IF;
    ELSIF p_admin_password IS NOT NULL AND TRIM(p_admin_password) != '' THEN
        UPDATE public.admin_users
        SET 
            password = crypt(p_admin_password, gen_salt('bf', 8)),
            initial_password = NULL,
            updated_date = NOW()
        WHERE tenant_id = p_tenant_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'tenant_id', p_tenant_id,
        'slug', v_clean_slug,
        'name', TRIM(p_name),
        'message', 'Restaurante atualizado com sucesso!'
    );
END;
$$;


-- 8. LOOKUP_CUSTOMER_BY_PHONE (Seguro contra vazamento de endereço)
DROP FUNCTION IF EXISTS public.lookup_customer_by_phone(text, uuid);
CREATE OR REPLACE FUNCTION public.lookup_customer_by_phone(
    p_phone TEXT,
    p_tenant_id UUID DEFAULT NULL
)
RETURNS TABLE (
    customer_name TEXT,
    customer_phone TEXT,
    customer_email TEXT,
    last_address TEXT,
    total_orders BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_effective_tenant_id UUID;
    v_is_admin BOOLEAN := false;
BEGIN
    -- Se autenticado como admin/staff, utiliza seu próprio tenant_id
    IF public.get_auth_tenant_id() IS NOT NULL OR public.is_super_admin() THEN
        v_effective_tenant_id := COALESCE(p_tenant_id, public.get_auth_tenant_id());
        v_is_admin := true;
    ELSE
        -- Usuário anônimo no cardápio: deve fornecer o tenant_id da loja ativa
        v_effective_tenant_id := p_tenant_id;
        IF v_effective_tenant_id IS NULL THEN
            RETURN;
        END IF;
    END IF;

    RETURN QUERY
    SELECT 
        (ARRAY_AGG(o.customer_name ORDER BY o.created_date DESC))[1] AS customer_name,
        o.customer_phone,
        (ARRAY_AGG(o.customer_email ORDER BY o.created_date DESC) FILTER (WHERE o.customer_email IS NOT NULL AND o.customer_email <> ''))[1] AS customer_email,
        CASE WHEN v_is_admin THEN (ARRAY_AGG(COALESCE(o.delivery_address, o.customer_address) ORDER BY o.created_date DESC) FILTER (WHERE COALESCE(o.delivery_address, o.customer_address) IS NOT NULL))[1] ELSE NULL END AS last_address,
        COUNT(*)::BIGINT AS total_orders
    FROM public.orders o
    WHERE o.tenant_id = v_effective_tenant_id
      AND REGEXP_REPLACE(o.customer_phone, '\D', '', 'g') = REGEXP_REPLACE(p_phone, '\D', '', 'g')
    GROUP BY o.customer_phone
    LIMIT 1;
END;
$$;


-- 9. ELIMINAÇÃO DEFINITIVA DE ASSINATURAS LEGADAS INSEGURAS
DROP FUNCTION IF EXISTS public.get_sales_metrics(timestamptz, timestamptz);
DROP FUNCTION IF EXISTS public.get_clients_summary();
DROP FUNCTION IF EXISTS public.lookup_customer_by_phone(text);
DROP FUNCTION IF EXISTS public.update_customer_name_by_phone(text, text);
DROP FUNCTION IF EXISTS public.verify_admin_login(text, text);
DROP FUNCTION IF EXISTS public.verify_admin_login(text, text, text);



-- 10. CONTROLE ESTRITO DE PRIVILÉGIOS (REVOKE / GRANT)
REVOKE EXECUTE ON FUNCTION public.delete_tenant(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_master_tenants() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.toggle_tenant_status(UUID, BOOLEAN) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_sales_metrics(UUID, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_clients_summary(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.create_new_tenant(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.update_tenant_info(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;

-- Concede execução exclusivamente a usuários autenticados e service_role
GRANT EXECUTE ON FUNCTION public.delete_tenant(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_master_tenants() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.toggle_tenant_status(UUID, BOOLEAN) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_sales_metrics(UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_clients_summary(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_new_tenant(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_tenant_info(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.lookup_customer_by_phone(TEXT, UUID) TO anon, authenticated, service_role;



-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- MIGRATION: 20261011_06_tenant_auth_provisioning.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- ==============================================================================
-- MIGRATION: PROVISIONAMENTO AUTOMÁTICO DE LOJISTAS NO SUPABASE AUTH
-- Arquivo: supabase/migrations/20261011_06_tenant_auth_provisioning.sql
-- Objetivo: Vincular nativamente novos lojistas em auth.users, auth.identities e tenant_admins
-- ==============================================================================

-- 1. RESOLVER EMAIL DO ADMINISTRADOR (com suporte opcional a slug de loja)
DROP FUNCTION IF EXISTS public.resolve_admin_login_email(text);
DROP FUNCTION IF EXISTS public.resolve_admin_login_email(text, text);

CREATE OR REPLACE FUNCTION public.resolve_admin_login_email(
    p_username TEXT,
    p_tenant_slug TEXT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
    SELECT u.email::TEXT
    FROM auth.users u
    JOIN public.tenant_admins ta ON ta.user_id = u.id
    LEFT JOIN public.tenants t ON t.id = ta.tenant_id
    WHERE LOWER(ta.username) = LOWER(TRIM(p_username))
      AND ta.is_active = true
      AND (
          p_tenant_slug IS NULL 
          OR ta.tenant_id IS NULL 
          OR LOWER(t.slug) = LOWER(TRIM(p_tenant_slug))
      )
    ORDER BY ta.tenant_id NULLS FIRST -- super_admin tem precedência se username coincidir
    LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_admin_login_email(TEXT, TEXT) TO anon, authenticated, service_role;


-- 2. CADASTRO DE NOVO RESTAURANTE COM PROVISIONAMENTO NATIVO NO SUPABASE AUTH
CREATE OR REPLACE FUNCTION public.create_new_tenant(
    p_name TEXT,
    p_slug TEXT,
    p_plan TEXT DEFAULT 'basic'::TEXT,
    p_admin_username TEXT DEFAULT 'admin'::TEXT,
    p_admin_password TEXT DEFAULT NULL::TEXT,
    p_primary_color TEXT DEFAULT '#E11D48'::TEXT,
    p_admin_email TEXT DEFAULT NULL::TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions, pg_temp
AS $$
DECLARE
    v_tenant_id UUID := gen_random_uuid();
    v_clean_slug TEXT := LOWER(REGEXP_REPLACE(TRIM(p_slug), '[^a-zA-Z0-9\-]', '-', 'g'));
    v_auth_user_id UUID := gen_random_uuid();
    v_admin_email TEXT;
    v_hashed_password TEXT;
BEGIN
    -- Restrito a SuperAdmin ou service_role
    IF NOT (public.is_super_admin() OR auth.role() = 'service_role') THEN
        RAISE EXCEPTION 'Acesso negado: Apenas o SuperAdmin pode cadastrar novos restaurantes.';
    END IF;

    IF p_admin_password IS NULL OR length(trim(p_admin_password)) < 6 THEN
        RETURN jsonb_build_object('success', false, 'message', 'A senha do administrador deve ter no mínimo 6 caracteres.');
    END IF;

    IF EXISTS (SELECT 1 FROM public.tenants WHERE slug = v_clean_slug) THEN
        RETURN jsonb_build_object('success', false, 'message', 'Este slug/endereço já está em uso por outro restaurante.');
    END IF;

    -- Gera e-mail corporativo interno do restaurante se nenhum e-mail externo for informado
    v_admin_email := COALESCE(
        NULLIF(LOWER(TRIM(p_admin_email)), ''),
        LOWER(TRIM(p_admin_username)) || '@' || v_clean_slug || '.delivery.internal'
    );

    IF EXISTS (SELECT 1 FROM auth.users WHERE email = v_admin_email) THEN
        RETURN jsonb_build_object('success', false, 'message', 'O e-mail ' || v_admin_email || ' já está em uso no sistema de autenticação.');
    END IF;

    -- 1. Cria o registro da empresa na tabela tenants
    INSERT INTO public.tenants (
        id, slug, name, plan, logo_url, banner_url, theme_config, is_active,
        phone, whatsapp, address, instagram, delivery_fee, min_order_value
    )
    VALUES (
        v_tenant_id,
        v_clean_slug,
        TRIM(p_name),
        COALESCE(p_plan, 'basic'),
        NULL,
        NULL,
        jsonb_build_object(
            'primary_color', p_primary_color,
            'secondary_color', '#111827',
            'layout_style', CASE WHEN p_plan = 'premium' THEN 'premium' ELSE 'standard' END
        ),
        TRUE,
        NULL,
        NULL,
        NULL,
        NULL,
        0.00,
        0.00
    );

    -- 2. Criação direta no Supabase Auth (auth.users) com hash Bcrypt
    v_hashed_password := extensions.crypt(p_admin_password, extensions.gen_salt('bf', 10));

    INSERT INTO auth.users (
        id,
        instance_id,
        aud,
        role,
        email,
        encrypted_password,
        email_confirmed_at,
        raw_app_meta_data,
        raw_user_meta_data,
        created_at,
        updated_at
    )
    VALUES (
        v_auth_user_id,
        '00000000-0000-0000-0000-000000000000',
        'authenticated',
        'authenticated',
        v_admin_email,
        v_hashed_password,
        NOW(),
        '{"provider": "email", "providers": ["email"]}'::jsonb,
        jsonb_build_object(
            'username', LOWER(TRIM(p_admin_username)),
            'tenant_id', v_tenant_id,
            'tenant_slug', v_clean_slug
        ),
        NOW(),
        NOW()
    );

    -- 3. Identidade de login por e-mail no GoTrue
    INSERT INTO auth.identities (
        id,
        provider_id,
        user_id,
        identity_data,
        provider,
        last_sign_in_at,
        created_at,
        updated_at
    )
    VALUES (
        gen_random_uuid(),
        v_auth_user_id::text,
        v_auth_user_id,
        jsonb_build_object('sub', v_auth_user_id::text, 'email', v_admin_email),
        'email',
        NOW(),
        NOW(),
        NOW()
    );

    -- 4. Associação de segurança na tabela tenant_admins
    INSERT INTO public.tenant_admins (
        tenant_id,
        user_id,
        username,
        role,
        is_active
    )
    VALUES (
        v_tenant_id,
        v_auth_user_id,
        LOWER(TRIM(p_admin_username)),
        'admin',
        TRUE
    );

    -- 5. Sincronização retrocompatível em admin_users
    INSERT INTO public.admin_users (
        tenant_id, username, password, initial_password, role, permissions, active
    )
    VALUES (
        v_tenant_id,
        LOWER(TRIM(p_admin_username)),
        v_hashed_password,
        NULL,
        'admin',
        '["*"]'::jsonb,
        TRUE
    );

    RETURN jsonb_build_object(
        'success', true,
        'tenant_id', v_tenant_id,
        'slug', v_clean_slug,
        'name', TRIM(p_name),
        'admin_username', LOWER(TRIM(p_admin_username)),
        'admin_email', v_admin_email,
        'message', 'Restaurante criado com conta Supabase Auth ativa com sucesso!'
    );
END;
$$;


-- 3. EXCLUSÃO DE RESTAURANTE COM LIMPEZA DE CONTAS AUTH EM CASCATA
CREATE OR REPLACE FUNCTION public.delete_tenant(p_tenant_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_slug TEXT;
    v_name TEXT;
    v_auth_user_ids UUID[];
BEGIN
    IF NOT (public.is_super_admin() OR auth.role() = 'service_role') THEN
        RAISE EXCEPTION 'Acesso negado: Apenas o SuperAdmin pode excluir estabelecimentos.';
    END IF;

    SELECT slug, name INTO v_slug, v_name 
    FROM public.tenants 
    WHERE id = p_tenant_id;

    IF v_slug IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Empresa não encontrada.');
    END IF;

    -- Coleta os IDs de usuários no Supabase Auth pertencentes a este tenant
    SELECT ARRAY_AGG(user_id) INTO v_auth_user_ids
    FROM public.tenant_admins
    WHERE tenant_id = p_tenant_id AND user_id IS NOT NULL;

    -- Exclusão ordenada em cascata das tabelas do SaaS
    DELETE FROM public.order_items WHERE tenant_id = p_tenant_id;
    DELETE FROM public.orders WHERE tenant_id = p_tenant_id;
    DELETE FROM public.user_addresses WHERE tenant_id = p_tenant_id;
    DELETE FROM public.customers WHERE tenant_id = p_tenant_id;
    DELETE FROM public.coupon_usages WHERE tenant_id = p_tenant_id;
    DELETE FROM public.coupons WHERE tenant_id = p_tenant_id;
    DELETE FROM public.banner_images WHERE tenant_id = p_tenant_id;
    DELETE FROM public.banners WHERE tenant_id = p_tenant_id;
    DELETE FROM public.product_complement_groups WHERE tenant_id = p_tenant_id;
    DELETE FROM public.complement_items WHERE tenant_id = p_tenant_id;
    DELETE FROM public.complement_groups WHERE tenant_id = p_tenant_id;
    DELETE FROM public.product_additionals WHERE tenant_id = p_tenant_id;
    DELETE FROM public.products WHERE tenant_id = p_tenant_id;
    DELETE FROM public.categories WHERE tenant_id = p_tenant_id;
    DELETE FROM public.tenant_admins WHERE tenant_id = p_tenant_id;
    DELETE FROM public.admin_users WHERE tenant_id = p_tenant_id;
    DELETE FROM public.tenants WHERE id = p_tenant_id;

    -- Exclusão das contas do Supabase Auth associadas
    IF v_auth_user_ids IS NOT NULL AND array_length(v_auth_user_ids, 1) > 0 THEN
        DELETE FROM auth.identities WHERE user_id = ANY(v_auth_user_ids);
        DELETE FROM auth.users WHERE id = ANY(v_auth_user_ids);
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'tenant_id', p_tenant_id,
        'deleted_name', v_name,
        'message', 'Restaurante ' || v_name || ' e todas as suas contas de acesso foram removidos com sucesso!'
    );
END;
$$;


-- 4. ATUALIZAÇÃO DE INFORMAÇÕES E REDEFINIÇÃO DE SENHA NATIVAMENTE NO AUTH
CREATE OR REPLACE FUNCTION public.update_tenant_info(
    p_tenant_id UUID,
    p_name TEXT,
    p_slug TEXT,
    p_plan TEXT DEFAULT NULL,
    p_logo_url TEXT DEFAULT NULL,
    p_admin_username TEXT DEFAULT NULL,
    p_admin_password TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions, pg_temp
AS $$
DECLARE
    v_clean_slug TEXT := LOWER(REGEXP_REPLACE(TRIM(p_slug), '[^a-zA-Z0-9\-]', '-', 'g'));
    v_existing_id UUID;
    v_hashed_password TEXT;
BEGIN
    IF NOT (public.is_super_admin() OR (p_tenant_id = public.get_auth_tenant_id() AND public.get_auth_admin_role() IN ('super_admin', 'admin'))) THEN
        RAISE EXCEPTION 'Acesso negado: Você não possui autorização para editar este restaurante.';
    END IF;

    SELECT id INTO v_existing_id 
    FROM public.tenants 
    WHERE slug = v_clean_slug AND id != p_tenant_id;

    IF v_existing_id IS NOT NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Este slug/endereço já está em uso por outro restaurante.');
    END IF;

    UPDATE public.tenants
    SET 
        name = TRIM(p_name),
        slug = v_clean_slug,
        plan = COALESCE(p_plan, plan),
        logo_url = NULLIF(TRIM(p_logo_url), ''),
        updated_date = NOW()
    WHERE id = p_tenant_id;

    -- Se nova senha foi informada, atualiza em auth.users e nas tabelas locais
    IF p_admin_password IS NOT NULL AND TRIM(p_admin_password) != '' THEN
        v_hashed_password := extensions.crypt(p_admin_password, extensions.gen_salt('bf', 10));

        -- Atualiza no Supabase Auth
        UPDATE auth.users
        SET encrypted_password = v_hashed_password,
            updated_at = NOW()
        WHERE id IN (SELECT user_id FROM public.tenant_admins WHERE tenant_id = p_tenant_id);

        -- Atualiza em tenant_admins e admin_users
        IF p_admin_username IS NOT NULL AND TRIM(p_admin_username) != '' THEN
            UPDATE public.tenant_admins
            SET username = LOWER(TRIM(p_admin_username)),
                updated_at = NOW()
            WHERE tenant_id = p_tenant_id;

            UPDATE public.admin_users
            SET username = LOWER(TRIM(p_admin_username)),
                password = v_hashed_password,
                initial_password = NULL,
                updated_date = NOW()
            WHERE tenant_id = p_tenant_id;
        ELSE
            UPDATE public.admin_users
            SET password = v_hashed_password,
                initial_password = NULL,
                updated_date = NOW()
            WHERE tenant_id = p_tenant_id;
        END IF;
    ELSIF p_admin_username IS NOT NULL AND TRIM(p_admin_username) != '' THEN
        UPDATE public.tenant_admins
        SET username = LOWER(TRIM(p_admin_username)),
            updated_at = NOW()
        WHERE tenant_id = p_tenant_id;

        UPDATE public.admin_users
        SET username = LOWER(TRIM(p_admin_username)),
            updated_date = NOW()
        WHERE tenant_id = p_tenant_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'tenant_id', p_tenant_id,
        'slug', v_clean_slug,
        'name', TRIM(p_name),
        'message', 'Restaurante e credenciais atualizados com sucesso!'
    );
END;
$$;


-- 5. PERMISSÕES E PRIVILÉGIOS (REVOKE / GRANT)
REVOKE EXECUTE ON FUNCTION public.create_new_tenant(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.delete_tenant(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.update_tenant_info(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.create_new_tenant(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_tenant(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_tenant_info(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated, service_role;


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- MIGRATION: 20261012_07_orders_fifo_print_queue.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- ==============================================================================
-- Migration: 20261012_07_orders_fifo_print_queue.sql
-- Descrição: Adiciona controle de fila FIFO de impressão, status e carimbo de impressão
-- para garantir ordenação e tolerância a quedas de internet.
-- ==============================================================================

-- 1. Adicionar colunas de controle de impressão na tabela orders
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS print_status TEXT NOT NULL DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS printed_at TIMESTAMPTZ DEFAULT NULL,
ADD COLUMN IF NOT EXISTS print_count INTEGER NOT NULL DEFAULT 0;

-- 2. Restrição de valores válidos para print_status
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'orders_print_status_check'
    ) THEN
        ALTER TABLE public.orders 
        ADD CONSTRAINT orders_print_status_check 
        CHECK (print_status IN ('pending', 'printing', 'printed', 'failed'));
    END IF;
END $$;

-- 3. Atualizar pedidos já existentes antigos para 'printed' para não tentar imprimir histórico antigo
UPDATE public.orders 
SET print_status = 'printed', 
    printed_at = COALESCE(created_date, NOW()) 
WHERE print_status = 'pending' AND created_date < (NOW() - INTERVAL '6 hours');

-- 4. Índice de alto desempenho para consulta de fila FIFO (tenant_id, print_status, created_date ASC)
CREATE INDEX IF NOT EXISTS idx_orders_fifo_print_queue 
ON public.orders (tenant_id, print_status, created_date ASC);

COMMENT ON COLUMN public.orders.print_status IS 'Status da impressão da comanda: pending, printing, printed, failed';
COMMENT ON COLUMN public.orders.printed_at IS 'Data/hora exata em que o cupom foi impresso fisicamente';
COMMENT ON COLUMN public.orders.print_count IS 'Número de vezes que o cupom deste pedido foi impresso';


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- MIGRATION: 20261012_08_catalog_rls_fix.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- ==============================================================================
-- Migration: 20261012_08_catalog_rls_fix.sql
-- Descrição: Ajusta permissões de RLS para produtos, categorias e complementos,
-- garantindo que atualizações de preços, fotos e visibilidade persistam sem bloqueio.
-- ==============================================================================

-- 1. Produtos
DROP POLICY IF EXISTS "Admin manage products" ON public.products;
DROP POLICY IF EXISTS "Public read available products" ON public.products;
DROP POLICY IF EXISTS "Public and admin select products" ON public.products;

CREATE POLICY "Public and admin select products"
    ON public.products FOR SELECT
    TO anon, authenticated
    USING (TRUE);

CREATE POLICY "Admin manage products"
    ON public.products FOR ALL
    TO anon, authenticated
    USING (TRUE)
    WITH CHECK (TRUE);

-- 2. Categorias
DROP POLICY IF EXISTS "Admin manage categories" ON public.categories;
DROP POLICY IF EXISTS "Public read categories" ON public.categories;
DROP POLICY IF EXISTS "Public and admin manage categories" ON public.categories;

CREATE POLICY "Public and admin manage categories"
    ON public.categories FOR ALL
    TO anon, authenticated
    USING (TRUE)
    WITH CHECK (TRUE);

-- 3. Grupos de complementos
DROP POLICY IF EXISTS "Admin manage complement_groups" ON public.complement_groups;
DROP POLICY IF EXISTS "Public and admin manage complement_groups" ON public.complement_groups;

CREATE POLICY "Public and admin manage complement_groups"
    ON public.complement_groups FOR ALL
    TO anon, authenticated
    USING (TRUE)
    WITH CHECK (TRUE);

-- 4. Itens de complementos
DROP POLICY IF EXISTS "Admin manage complement_items" ON public.complement_items;
DROP POLICY IF EXISTS "Public and admin manage complement_items" ON public.complement_items;

CREATE POLICY "Public and admin manage complement_items"
    ON public.complement_items FOR ALL
    TO anon, authenticated
    USING (TRUE)
    WITH CHECK (TRUE);

-- 5. Adicionais de produtos
DROP POLICY IF EXISTS "Allow public read product additionals" ON public.product_additionals;
DROP POLICY IF EXISTS "Allow admin manage product additionals" ON public.product_additionals;

CREATE POLICY "Public and admin manage product additionals"
    ON public.product_additionals FOR ALL
    TO anon, authenticated
    USING (TRUE)
    WITH CHECK (TRUE);


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- MIGRATION: 20261013_custom_menu_templates.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- ==============================================================================
-- MIGRATION: 20261013_custom_menu_templates.sql
-- OBJETIVO: Base arquitetural para Cardápios Personalizados (VIP Multi-Template Engine)
-- ==============================================================================

-- 1. ADICIONAR COLUNA custom_template NA TABELA tenants
ALTER TABLE public.tenants 
ADD COLUMN IF NOT EXISTS custom_template TEXT DEFAULT NULL;

COMMENT ON COLUMN public.tenants.custom_template IS 
'Identificador do template de cardápio personalizado exclusivo (ex: texas-burger, sushi-vip). Se NULL ou default, renderiza o Menu.jsx padrão.';

-- 2. ATUALIZAR RPC get_master_tenants (Para listar custom_template no SuperAdmin)
DROP FUNCTION IF EXISTS public.get_master_tenants();

CREATE OR REPLACE FUNCTION public.get_master_tenants()
RETURNS TABLE(
    id UUID,
    code INTEGER,
    slug TEXT,
    name TEXT,
    plan TEXT,
    is_active BOOLEAN,
    logo_url TEXT,
    created_date TIMESTAMPTZ,
    total_orders BIGINT,
    total_revenue NUMERIC,
    admin_username TEXT,
    subscription_status TEXT,
    monthly_price NUMERIC,
    payment_link TEXT,
    next_due_date DATE,
    phone TEXT,
    email TEXT,
    cpf_cnpj TEXT,
    asaas_customer_id TEXT,
    asaas_subscription_id TEXT,
    custom_template TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NOT public.is_super_admin() THEN
        RAISE EXCEPTION 'Acesso negado: Visualização restrita ao SuperAdmin.';
    END IF;

    RETURN QUERY
    SELECT 
        t.id,
        t.code,
        t.slug,
        t.name,
        t.plan,
        t.is_active,
        t.logo_url,
        t.created_date,
        COUNT(o.id)::BIGINT AS total_orders,
        COALESCE(SUM(COALESCE(o.total, o.total_amount, 0)), 0)::NUMERIC AS total_revenue,
        COALESCE(
            (SELECT ta.username FROM public.tenant_admins ta WHERE ta.tenant_id = t.id LIMIT 1),
            (SELECT u.username FROM public.admin_users u WHERE u.tenant_id = t.id LIMIT 1)
        ) AS admin_username,
        COALESCE(t.subscription_status, 'pending') AS subscription_status,
        COALESCE(t.monthly_price, 149.00) AS monthly_price,
        t.payment_link,
        t.next_due_date,
        COALESCE(t.phone, t.whatsapp) AS phone,
        t.email,
        t.cpf_cnpj,
        t.asaas_customer_id,
        t.asaas_subscription_id,
        t.custom_template
    FROM public.tenants t
    LEFT JOIN public.orders o ON o.tenant_id = t.id
    GROUP BY t.id, t.code
    ORDER BY t.code ASC;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_master_tenants() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_master_tenants() TO authenticated, service_role;

-- 3. ATUALIZAR RPC update_tenant_info (Para permitir salvar custom_template)
-- Drop da versão anterior com 7 parâmetros para evitar ambiguidade de assinatura
DROP FUNCTION IF EXISTS public.update_tenant_info(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.update_tenant_info(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.update_tenant_info(
    p_tenant_id UUID,
    p_name TEXT,
    p_slug TEXT,
    p_plan TEXT DEFAULT NULL,
    p_logo_url TEXT DEFAULT NULL,
    p_admin_username TEXT DEFAULT NULL,
    p_admin_password TEXT DEFAULT NULL,
    p_custom_template TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions, pg_temp
AS $$
DECLARE
    v_clean_slug TEXT := LOWER(REGEXP_REPLACE(TRIM(p_slug), '[^a-zA-Z0-9\-]', '-', 'g'));
    v_existing_id UUID;
    v_hashed_password TEXT;
BEGIN
    IF NOT (public.is_super_admin() OR (p_tenant_id = public.get_auth_tenant_id() AND public.get_auth_admin_role() IN ('super_admin', 'admin'))) THEN
        RAISE EXCEPTION 'Acesso negado: Você não possui autorização para editar este restaurante.';
    END IF;

    SELECT id INTO v_existing_id 
    FROM public.tenants 
    WHERE slug = v_clean_slug AND id != p_tenant_id;

    IF v_existing_id IS NOT NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Este slug/endereço já está em uso por outro restaurante.');
    END IF;

    UPDATE public.tenants
    SET 
        name = TRIM(p_name),
        slug = v_clean_slug,
        plan = COALESCE(p_plan, plan),
        logo_url = NULLIF(TRIM(p_logo_url), ''),
        custom_template = NULLIF(TRIM(p_custom_template), ''),
        updated_date = NOW()
    WHERE id = p_tenant_id;

    -- Se nova senha foi informada, atualiza em auth.users e nas tabelas locais
    IF p_admin_password IS NOT NULL AND TRIM(p_admin_password) != '' THEN
        v_hashed_password := extensions.crypt(p_admin_password, extensions.gen_salt('bf', 10));

        -- Atualiza no Supabase Auth
        UPDATE auth.users
        SET encrypted_password = v_hashed_password,
            updated_at = NOW()
        WHERE id IN (SELECT user_id FROM public.tenant_admins WHERE tenant_id = p_tenant_id);

        -- Atualiza em tenant_admins e admin_users
        IF p_admin_username IS NOT NULL AND TRIM(p_admin_username) != '' THEN
            UPDATE public.tenant_admins
            SET username = LOWER(TRIM(p_admin_username)),
                updated_at = NOW()
            WHERE tenant_id = p_tenant_id;

            UPDATE public.admin_users
            SET username = LOWER(TRIM(p_admin_username)),
                password = v_hashed_password,
                initial_password = NULL,
                updated_date = NOW()
            WHERE tenant_id = p_tenant_id;
        ELSE
            UPDATE public.admin_users
            SET password = v_hashed_password,
                initial_password = NULL,
                updated_date = NOW()
            WHERE tenant_id = p_tenant_id;
        END IF;
    ELSIF p_admin_username IS NOT NULL AND TRIM(p_admin_username) != '' THEN
        UPDATE public.tenant_admins
        SET username = LOWER(TRIM(p_admin_username)),
            updated_at = NOW()
        WHERE tenant_id = p_tenant_id;

        UPDATE public.admin_users
        SET username = LOWER(TRIM(p_admin_username)),
            updated_date = NOW()
        WHERE tenant_id = p_tenant_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'tenant_id', p_tenant_id,
        'slug', v_clean_slug,
        'name', TRIM(p_name),
        'custom_template', NULLIF(TRIM(p_custom_template), ''),
        'message', 'Restaurante e template atualizados com sucesso!'
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.update_tenant_info(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_tenant_info(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated, service_role;


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- MIGRATION: 20261013_shift_closings_table.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- Migration: Criação da tabela de fechamentos de caixa (shift_closings)
CREATE TABLE IF NOT EXISTS public.shift_closings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    shift_date DATE NOT NULL,
    period_mode TEXT NOT NULL DEFAULT 'today',
    period_label TEXT NOT NULL,
    opened_at TIMESTAMPTZ,
    closed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    cashier_name TEXT NOT NULL DEFAULT 'Operador',
    gross_revenue NUMERIC(10,2) NOT NULL DEFAULT 0,
    net_revenue NUMERIC(10,2) NOT NULL DEFAULT 0,
    total_orders INT NOT NULL DEFAULT 0,
    delivery_orders INT NOT NULL DEFAULT 0,
    counter_orders INT NOT NULL DEFAULT 0,
    dine_in_orders INT NOT NULL DEFAULT 0,
    average_ticket NUMERIC(10,2) NOT NULL DEFAULT 0,
    payment_breakdown JSONB NOT NULL DEFAULT '{}'::jsonb,
    cash_drawer JSONB NOT NULL DEFAULT '{}'::jsonb,
    driver_settlements JSONB NOT NULL DEFAULT '[]'::jsonb,
    raw_closing_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shift_closings_tenant_date ON public.shift_closings (tenant_id, shift_date DESC);

ALTER TABLE public.shift_closings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_all_shift_closings_authenticated" ON public.shift_closings;

CREATE POLICY "allow_all_shift_closings_authenticated"
    ON public.shift_closings
    FOR ALL
    TO anon, authenticated, service_role
    USING (true)
    WITH CHECK (true);


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- MIGRATION: 20261013_system_issues_table.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- Migration: Create system_issues table and RPC functions for SuperAdmin Central de Pendências & Sentry
CREATE TABLE IF NOT EXISTS public.system_issues (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title               TEXT NOT NULL,
    description         TEXT,
    severity            TEXT NOT NULL DEFAULT 'urgent', -- 'urgent', 'warning', 'info'
    status              TEXT NOT NULL DEFAULT 'open',   -- 'open', 'in_progress', 'resolved'
    source              TEXT NOT NULL DEFAULT 'manual', -- 'manual', 'sentry', 'checkout', 'webhook', 'printer'
    path                TEXT,                           -- caminho / rota / endpoint opcional
    tenant_id           UUID REFERENCES public.tenants(id) ON DELETE SET NULL,
    tenant_name         TEXT,
    sentry_event_id     TEXT,
    metadata            JSONB DEFAULT '{}'::jsonb,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at         TIMESTAMPTZ,
    resolved_by         TEXT
);

CREATE INDEX IF NOT EXISTS idx_system_issues_status ON public.system_issues(status);
CREATE INDEX IF NOT EXISTS idx_system_issues_severity ON public.system_issues(severity);
CREATE INDEX IF NOT EXISTS idx_system_issues_created_at ON public.system_issues(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_system_issues_tenant_id ON public.system_issues(tenant_id);

-- RLS
ALTER TABLE public.system_issues ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can report issues" ON public.system_issues;
CREATE POLICY "Public can report issues"
ON public.system_issues
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

DROP POLICY IF EXISTS "Anyone can read issues" ON public.system_issues;
CREATE POLICY "Anyone can read issues"
ON public.system_issues
FOR SELECT
TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS "Anyone can update issues" ON public.system_issues;
CREATE POLICY "Anyone can update issues"
ON public.system_issues
FOR UPDATE
TO anon, authenticated
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "Anyone can delete issues" ON public.system_issues;
CREATE POLICY "Anyone can delete issues"
ON public.system_issues
FOR DELETE
TO anon, authenticated
USING (true);

-- RPC para cadastrar issue de forma padronizada
CREATE OR REPLACE FUNCTION public.report_system_issue(
    p_title TEXT,
    p_description TEXT DEFAULT NULL,
    p_severity TEXT DEFAULT 'urgent',
    p_source TEXT DEFAULT 'manual',
    p_path TEXT DEFAULT NULL,
    p_tenant_id UUID DEFAULT NULL,
    p_tenant_name TEXT DEFAULT NULL,
    p_sentry_event_id TEXT DEFAULT NULL,
    p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_issue JSONB;
BEGIN
    INSERT INTO public.system_issues (
        title,
        description,
        severity,
        status,
        source,
        path,
        tenant_id,
        tenant_name,
        sentry_event_id,
        metadata
    ) VALUES (
        p_title,
        p_description,
        COALESCE(p_severity, 'urgent'),
        'open',
        COALESCE(p_source, 'manual'),
        p_path,
        p_tenant_id,
        p_tenant_name,
        p_sentry_event_id,
        COALESCE(p_metadata, '{}'::jsonb)
    )
    RETURNING to_jsonb(system_issues.*) INTO v_issue;

    RETURN v_issue;
END;
$$;

-- RPC para marcar pendência como resolvida
CREATE OR REPLACE FUNCTION public.resolve_system_issue(
    p_issue_id UUID,
    p_resolved_by TEXT DEFAULT 'SuperAdmin'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_updated JSONB;
BEGIN
    UPDATE public.system_issues
    SET 
        status = 'resolved',
        resolved_at = NOW(),
        resolved_by = COALESCE(p_resolved_by, 'SuperAdmin')
    WHERE id = p_issue_id
    RETURNING to_jsonb(system_issues.*) INTO v_updated;

    RETURN v_updated;
END;
$$;

-- RPC para reabrir pendência
CREATE OR REPLACE FUNCTION public.reopen_system_issue(
    p_issue_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_updated JSONB;
BEGIN
    UPDATE public.system_issues
    SET 
        status = 'open',
        resolved_at = NULL,
        resolved_by = NULL
    WHERE id = p_issue_id
    RETURNING to_jsonb(system_issues.*) INTO v_updated;

    RETURN v_updated;
END;
$$;


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- MIGRATION: 20261013_tenant_salon_mode.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- ==============================================================================
-- MIGRATION: 20261013_tenant_salon_mode.sql
-- OBJETIVO: Suporte a Modos de Salão (Cardápio Visual vs Autoatendimento em Mesas vs Completo)
-- ==============================================================================

-- 1. ADICIONAR COLUNA salon_mode NA TABELA tenants
ALTER TABLE public.tenants 
ADD COLUMN IF NOT EXISTS salon_mode TEXT DEFAULT 'full';

COMMENT ON COLUMN public.tenants.salon_mode IS 
'Modo de atendimento do cardápio: full (mesas + delivery), table_only (apenas autoatendimento em mesas com QR code), showcase (apenas cardápio visual informativo sem carrinho)';

-- 2. ATUALIZAR RPC update_tenant_settings
CREATE OR REPLACE FUNCTION public.update_tenant_settings(p_tenant_id UUID, p_data JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_updated_tenant JSONB;
BEGIN
    UPDATE public.tenants
    SET 
        name = COALESCE(p_data->>'name', name),
        logo_url = CASE WHEN p_data ? 'logo_url' THEN p_data->>'logo_url' ELSE logo_url END,
        opening_time = COALESCE(p_data->>'opening_time', opening_time),
        closing_time = COALESCE(p_data->>'closing_time', closing_time),
        open_days = CASE WHEN p_data ? 'open_days' THEN p_data->'open_days' ELSE open_days END,
        delivery_time = CASE WHEN p_data ? 'delivery_time' THEN p_data->>'delivery_time' ELSE delivery_time END,
        salon_mode = CASE WHEN p_data ? 'salon_mode' THEN p_data->>'salon_mode' ELSE salon_mode END,
        manual_store_open = CASE 
            WHEN p_data ? 'manual_store_open' THEN 
                CASE 
                    WHEN (p_data->>'manual_store_open') IS NULL THEN NULL
                    ELSE (p_data->>'manual_store_open')::boolean 
                END
            ELSE manual_store_open 
        END,
        manual_override_date = CASE 
            WHEN p_data ? 'manual_override_date' THEN 
                CASE 
                    WHEN (p_data->>'manual_override_date') IS NULL THEN NULL
                    ELSE p_data->>'manual_override_date' 
                END
            ELSE manual_override_date 
        END,
        address = COALESCE(p_data->>'address', address),
        cep = CASE WHEN p_data ? 'cep' THEN p_data->>'cep' ELSE cep END,
        address_street = CASE WHEN p_data ? 'address_street' THEN p_data->>'address_street' ELSE address_street END,
        address_number = CASE WHEN p_data ? 'address_number' THEN p_data->>'address_number' ELSE address_number END,
        address_neighborhood = CASE WHEN p_data ? 'address_neighborhood' THEN p_data->>'address_neighborhood' ELSE address_neighborhood END,
        address_city = CASE WHEN p_data ? 'address_city' THEN p_data->>'address_city' ELSE address_city END,
        address_state = CASE WHEN p_data ? 'address_state' THEN p_data->>'address_state' ELSE address_state END,
        address_complement = CASE WHEN p_data ? 'address_complement' THEN p_data->>'address_complement' ELSE address_complement END,
        instagram = CASE WHEN p_data ? 'instagram' THEN p_data->>'instagram' ELSE instagram END,
        whatsapp = CASE WHEN p_data ? 'whatsapp' THEN p_data->>'whatsapp' ELSE whatsapp END,
        delivery_fee = CASE WHEN p_data ? 'delivery_fee' THEN (p_data->>'delivery_fee')::numeric ELSE delivery_fee END,
        min_order_value = CASE WHEN p_data ? 'min_order_value' THEN (p_data->>'min_order_value')::numeric ELSE min_order_value END,
        delivery_fee_type = COALESCE(p_data->>'delivery_fee_type', delivery_fee_type),
        delivery_neighborhoods = CASE WHEN p_data ? 'delivery_neighborhoods' THEN p_data->'delivery_neighborhoods' ELSE delivery_neighborhoods END,
        delivery_unlisted_policy = COALESCE(p_data->>'delivery_unlisted_policy', delivery_unlisted_policy),
        delivery_fallback_fee = CASE WHEN p_data ? 'delivery_fallback_fee' THEN (p_data->>'delivery_fallback_fee')::numeric ELSE delivery_fallback_fee END,
        free_delivery_threshold = CASE WHEN p_data ? 'free_delivery_threshold' AND (p_data->>'free_delivery_threshold') IS NOT NULL AND (p_data->>'free_delivery_threshold') != '' THEN (p_data->>'free_delivery_threshold')::numeric ELSE free_delivery_threshold END,
        payment_methods = CASE WHEN p_data ? 'payment_methods' THEN p_data->'payment_methods' ELSE payment_methods END,
        updated_date = NOW()
    WHERE id = p_tenant_id;

    SELECT to_jsonb(t.*) INTO v_updated_tenant
    FROM public.tenants t
    WHERE t.id = p_tenant_id;

    RETURN v_updated_tenant;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_tenant_settings(UUID, JSONB) TO authenticated, service_role, anon;

-- 3. ATUALIZAR get_master_tenants PARA ENTREGAR salon_mode AO SUPERADMIN
DROP FUNCTION IF EXISTS public.get_master_tenants();

CREATE OR REPLACE FUNCTION public.get_master_tenants()
RETURNS TABLE(
    id UUID,
    code INTEGER,
    slug TEXT,
    name TEXT,
    plan TEXT,
    is_active BOOLEAN,
    logo_url TEXT,
    created_date TIMESTAMPTZ,
    total_orders BIGINT,
    total_revenue NUMERIC,
    admin_username TEXT,
    subscription_status TEXT,
    monthly_price NUMERIC,
    payment_link TEXT,
    next_due_date DATE,
    phone TEXT,
    email TEXT,
    cpf_cnpj TEXT,
    asaas_customer_id TEXT,
    asaas_subscription_id TEXT,
    custom_template TEXT,
    salon_mode TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NOT public.is_super_admin() THEN
        RAISE EXCEPTION 'Acesso negado: Visualização restrita ao SuperAdmin.';
    END IF;

    RETURN QUERY
    SELECT 
        t.id,
        t.code,
        t.slug,
        t.name,
        t.plan,
        t.is_active,
        t.logo_url,
        t.created_date,
        COUNT(o.id)::BIGINT AS total_orders,
        COALESCE(SUM(COALESCE(o.total, o.total_amount, 0)), 0)::NUMERIC AS total_revenue,
        COALESCE(
            (SELECT ta.username FROM public.tenant_admins ta WHERE ta.tenant_id = t.id LIMIT 1),
            (SELECT u.username FROM public.admin_users u WHERE u.tenant_id = t.id LIMIT 1)
        ) AS admin_username,
        COALESCE(t.subscription_status, 'pending') AS subscription_status,
        COALESCE(t.monthly_price, 149.00) AS monthly_price,
        t.payment_link,
        t.next_due_date,
        COALESCE(t.phone, t.whatsapp) AS phone,
        t.email,
        t.cpf_cnpj,
        t.asaas_customer_id,
        t.asaas_subscription_id,
        t.custom_template,
        COALESCE(t.salon_mode, 'full') AS salon_mode
    FROM public.tenants t
    LEFT JOIN public.orders o ON o.tenant_id = t.id
    GROUP BY t.id, t.code
    ORDER BY t.code ASC;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_master_tenants() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_master_tenants() TO authenticated, service_role;


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- MIGRATION: 20261013_update_tenant_settings_status.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- Migration: Support manual_store_open, manual_override_date and delivery_time in update_tenant_settings RPC
CREATE OR REPLACE FUNCTION public.update_tenant_settings(p_tenant_id uuid, p_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_updated_tenant JSONB;
BEGIN
    UPDATE public.tenants
    SET 
        name = COALESCE(p_data->>'name', name),
        logo_url = CASE WHEN p_data ? 'logo_url' THEN p_data->>'logo_url' ELSE logo_url END,
        opening_time = COALESCE(p_data->>'opening_time', opening_time),
        closing_time = COALESCE(p_data->>'closing_time', closing_time),
        open_days = CASE WHEN p_data ? 'open_days' THEN p_data->'open_days' ELSE open_days END,
        delivery_time = CASE WHEN p_data ? 'delivery_time' THEN p_data->>'delivery_time' ELSE delivery_time END,
        manual_store_open = CASE 
            WHEN p_data ? 'manual_store_open' THEN 
                CASE 
                    WHEN (p_data->>'manual_store_open') IS NULL THEN NULL
                    ELSE (p_data->>'manual_store_open')::boolean 
                END
            ELSE manual_store_open 
        END,
        manual_override_date = CASE 
            WHEN p_data ? 'manual_override_date' THEN 
                CASE 
                    WHEN (p_data->>'manual_override_date') IS NULL THEN NULL
                    ELSE p_data->>'manual_override_date' 
                END
            ELSE manual_override_date 
        END,
        address = COALESCE(p_data->>'address', address),
        cep = CASE WHEN p_data ? 'cep' THEN p_data->>'cep' ELSE cep END,
        address_street = CASE WHEN p_data ? 'address_street' THEN p_data->>'address_street' ELSE address_street END,
        address_number = CASE WHEN p_data ? 'address_number' THEN p_data->>'address_number' ELSE address_number END,
        address_neighborhood = CASE WHEN p_data ? 'address_neighborhood' THEN p_data->>'address_neighborhood' ELSE address_neighborhood END,
        address_city = CASE WHEN p_data ? 'address_city' THEN p_data->>'address_city' ELSE address_city END,
        address_state = CASE WHEN p_data ? 'address_state' THEN p_data->>'address_state' ELSE address_state END,
        address_complement = CASE WHEN p_data ? 'address_complement' THEN p_data->>'address_complement' ELSE address_complement END,
        instagram = CASE WHEN p_data ? 'instagram' THEN p_data->>'instagram' ELSE instagram END,
        whatsapp = CASE WHEN p_data ? 'whatsapp' THEN p_data->>'whatsapp' ELSE whatsapp END,
        delivery_fee = CASE WHEN p_data ? 'delivery_fee' THEN (p_data->>'delivery_fee')::numeric ELSE delivery_fee END,
        min_order_value = CASE WHEN p_data ? 'min_order_value' THEN (p_data->>'min_order_value')::numeric ELSE min_order_value END,
        delivery_fee_type = COALESCE(p_data->>'delivery_fee_type', delivery_fee_type),
        delivery_neighborhoods = CASE WHEN p_data ? 'delivery_neighborhoods' THEN p_data->'delivery_neighborhoods' ELSE delivery_neighborhoods END,
        delivery_unlisted_policy = COALESCE(p_data->>'delivery_unlisted_policy', delivery_unlisted_policy),
        delivery_fallback_fee = CASE WHEN p_data ? 'delivery_fallback_fee' THEN (p_data->>'delivery_fallback_fee')::numeric ELSE delivery_fallback_fee END,
        free_delivery_threshold = CASE WHEN p_data ? 'free_delivery_threshold' AND (p_data->>'free_delivery_threshold') IS NOT NULL AND (p_data->>'free_delivery_threshold') != '' THEN (p_data->>'free_delivery_threshold')::numeric ELSE free_delivery_threshold END,
        payment_methods = CASE WHEN p_data ? 'payment_methods' THEN p_data->'payment_methods' ELSE payment_methods END,
        updated_date = NOW()
    WHERE id = p_tenant_id;

    SELECT to_jsonb(t.*) INTO v_updated_tenant
    FROM public.tenants t
    WHERE t.id = p_tenant_id;

    RETURN v_updated_tenant;
END;
$function$;


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- MIGRATION: 20261014_fulfillment_channels.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- ==============================================================================
-- MIGRATION: 20261014_fulfillment_channels.sql
-- OBJETIVO: Suporte a Canais de Atendimento Customizáveis (Delivery vs Retirada no Balcão)
-- ==============================================================================

-- 1. Colunas de canais de atendimento na tabela tenants
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS accepts_delivery BOOLEAN DEFAULT true;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS accepts_takeaway BOOLEAN DEFAULT true;
UPDATE public.tenants SET accepts_delivery = true WHERE accepts_delivery IS NULL;
UPDATE public.tenants SET accepts_takeaway = true WHERE accepts_takeaway IS NULL;

-- 2. Atualizar update_tenant_settings
CREATE OR REPLACE FUNCTION public.update_tenant_settings(p_tenant_id uuid, p_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_updated_tenant JSONB;
BEGIN
    UPDATE public.tenants
    SET 
        name = COALESCE(p_data->>'name', name),
        logo_url = CASE WHEN p_data ? 'logo_url' THEN p_data->>'logo_url' ELSE logo_url END,
        opening_time = COALESCE(p_data->>'opening_time', opening_time),
        closing_time = COALESCE(p_data->>'closing_time', closing_time),
        open_days = CASE WHEN p_data ? 'open_days' THEN p_data->'open_days' ELSE open_days END,
        delivery_time = CASE WHEN p_data ? 'delivery_time' THEN p_data->>'delivery_time' ELSE delivery_time END,
        salon_mode = CASE WHEN p_data ? 'salon_mode' THEN p_data->>'salon_mode' ELSE salon_mode END,
        accepts_delivery = CASE 
            WHEN p_data ? 'accepts_delivery' THEN (p_data->>'accepts_delivery')::boolean 
            ELSE accepts_delivery 
        END,
        accepts_takeaway = CASE 
            WHEN p_data ? 'accepts_takeaway' THEN (p_data->>'accepts_takeaway')::boolean 
            ELSE accepts_takeaway 
        END,
        manual_store_open = CASE 
            WHEN p_data ? 'manual_store_open' THEN 
                CASE 
                    WHEN (p_data->>'manual_store_open') IS NULL THEN NULL
                    ELSE (p_data->>'manual_store_open')::boolean 
                END
            ELSE manual_store_open 
        END,
        manual_override_date = CASE 
            WHEN p_data ? 'manual_override_date' THEN 
                CASE 
                    WHEN (p_data->>'manual_override_date') IS NULL THEN NULL
                    ELSE p_data->>'manual_override_date' 
                END
            ELSE manual_override_date 
        END,
        address = COALESCE(p_data->>'address', address),
        cep = CASE WHEN p_data ? 'cep' THEN p_data->>'cep' ELSE cep END,
        address_street = CASE WHEN p_data ? 'address_street' THEN p_data->>'address_street' ELSE address_street END,
        address_number = CASE WHEN p_data ? 'address_number' THEN p_data->>'address_number' ELSE address_number END,
        address_neighborhood = CASE WHEN p_data ? 'address_neighborhood' THEN p_data->>'address_neighborhood' ELSE address_neighborhood END,
        address_city = CASE WHEN p_data ? 'address_city' THEN p_data->>'address_city' ELSE address_city END,
        address_state = CASE WHEN p_data ? 'address_state' THEN p_data->>'address_state' ELSE address_state END,
        address_complement = CASE WHEN p_data ? 'address_complement' THEN p_data->>'address_complement' ELSE address_complement END,
        instagram = CASE WHEN p_data ? 'instagram' THEN p_data->>'instagram' ELSE instagram END,
        whatsapp = CASE WHEN p_data ? 'whatsapp' THEN p_data->>'whatsapp' ELSE whatsapp END,
        delivery_fee = CASE WHEN p_data ? 'delivery_fee' THEN (p_data->>'delivery_fee')::numeric ELSE delivery_fee END,
        min_order_value = CASE WHEN p_data ? 'min_order_value' THEN (p_data->>'min_order_value')::numeric ELSE min_order_value END,
        delivery_fee_type = COALESCE(p_data->>'delivery_fee_type', delivery_fee_type),
        delivery_neighborhoods = CASE WHEN p_data ? 'delivery_neighborhoods' THEN p_data->'delivery_neighborhoods' ELSE delivery_neighborhoods END,
        delivery_unlisted_policy = COALESCE(p_data->>'delivery_unlisted_policy', delivery_unlisted_policy),
        delivery_fallback_fee = CASE WHEN p_data ? 'delivery_fallback_fee' THEN (p_data->>'delivery_fallback_fee')::numeric ELSE delivery_fallback_fee END,
        free_delivery_threshold = CASE WHEN p_data ? 'free_delivery_threshold' AND (p_data->>'free_delivery_threshold') IS NOT NULL AND (p_data->>'free_delivery_threshold') != '' THEN (p_data->>'free_delivery_threshold')::numeric ELSE free_delivery_threshold END,
        payment_methods = CASE WHEN p_data ? 'payment_methods' THEN p_data->'payment_methods' ELSE payment_methods END,
        updated_date = NOW()
    WHERE id = p_tenant_id;

    SELECT to_jsonb(t.*) INTO v_updated_tenant
    FROM public.tenants t
    WHERE t.id = p_tenant_id;

    RETURN v_updated_tenant;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.update_tenant_settings(uuid, jsonb) TO authenticated, service_role, anon;

-- 3. Atualizar get_master_tenants
DROP FUNCTION IF EXISTS public.get_master_tenants();

CREATE OR REPLACE FUNCTION public.get_master_tenants()
RETURNS TABLE(
    id UUID,
    code INTEGER,
    slug TEXT,
    name TEXT,
    plan TEXT,
    is_active BOOLEAN,
    logo_url TEXT,
    created_date TIMESTAMPTZ,
    total_orders BIGINT,
    total_revenue NUMERIC,
    admin_username TEXT,
    subscription_status TEXT,
    monthly_price NUMERIC,
    payment_link TEXT,
    next_due_date DATE,
    phone TEXT,
    email TEXT,
    cpf_cnpj TEXT,
    asaas_customer_id TEXT,
    asaas_subscription_id TEXT,
    custom_template TEXT,
    salon_mode TEXT,
    accepts_delivery BOOLEAN,
    accepts_takeaway BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NOT public.is_super_admin() THEN
        RAISE EXCEPTION 'Acesso negado: Visualização restrita ao SuperAdmin.';
    END IF;

    RETURN QUERY
    SELECT 
        t.id,
        t.code,
        t.slug,
        t.name,
        t.plan,
        t.is_active,
        t.logo_url,
        t.created_date,
        COUNT(o.id)::BIGINT AS total_orders,
        COALESCE(SUM(COALESCE(o.total, o.total_amount, 0)), 0)::NUMERIC AS total_revenue,
        COALESCE(
            (SELECT ta.username FROM public.tenant_admins ta WHERE ta.tenant_id = t.id LIMIT 1),
            (SELECT u.username FROM public.admin_users u WHERE u.tenant_id = t.id LIMIT 1)
        ) AS admin_username,
        COALESCE(t.subscription_status, 'pending') AS subscription_status,
        COALESCE(t.monthly_price, 149.00) AS monthly_price,
        t.payment_link,
        t.next_due_date,
        COALESCE(t.phone, t.whatsapp) AS phone,
        t.email,
        t.cpf_cnpj,
        t.asaas_customer_id,
        t.asaas_subscription_id,
        t.custom_template,
        COALESCE(t.salon_mode, 'full') AS salon_mode,
        COALESCE(t.accepts_delivery, true) AS accepts_delivery,
        COALESCE(t.accepts_takeaway, true) AS accepts_takeaway
    FROM public.tenants t
    LEFT JOIN public.orders o ON o.tenant_id = t.id
    GROUP BY t.id, t.code
    ORDER BY t.code ASC;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_master_tenants() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_master_tenants() TO authenticated, service_role;


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- MIGRATION: 20261016_whatsapp_otp_and_customer_auth.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- ==============================================================================
-- TABELA E FUNÇÕES PARA AUTENTICAÇÃO VIA WHATSAPP OTP E CADASTRO REAL DE CLIENTES
-- ==============================================================================

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

CREATE INDEX IF NOT EXISTS idx_whatsapp_otp_lookup 
    ON public.whatsapp_otp_codes(phone, verified, expires_at);

ALTER TABLE public.whatsapp_otp_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full otp" ON public.whatsapp_otp_codes;
CREATE POLICY "Service role full otp" 
    ON public.whatsapp_otp_codes FOR ALL 
    TO service_role 
    USING (true) 
    WITH CHECK (true);

-- ------------------------------------------------------------------------------
-- RPC 1: Solicitar Código OTP para WhatsApp
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.request_whatsapp_otp(
    p_phone TEXT,
    p_full_name TEXT DEFAULT '',
    p_tenant_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_clean_phone TEXT;
    v_tenant_id UUID;
    v_code TEXT;
    v_expires_at TIMESTAMPTZ;
BEGIN
    v_clean_phone := regexp_replace(COALESCE(p_phone, ''), '\D', '', 'g');
    
    IF LENGTH(v_clean_phone) < 10 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Número de WhatsApp inválido (mínimo 10 dígitos com DDD).');
    END IF;

    -- Resolver tenant_id fallback se nulo
    v_tenant_id := COALESCE(p_tenant_id, 'a0000000-0000-0000-0000-000000000001'::uuid);

    -- Gera código de 6 dígitos
    v_code := LPAD(FLOOR(RANDOM() * 900000 + 100000)::TEXT, 6, '0');
    v_expires_at := NOW() + INTERVAL '10 minutes';

    -- Invalida códigos antigos pendentes para o mesmo telefone
    UPDATE public.whatsapp_otp_codes
    SET verified = TRUE
    WHERE phone = v_clean_phone AND verified = FALSE;

    -- Insere novo código
    INSERT INTO public.whatsapp_otp_codes (
        tenant_id,
        phone,
        code,
        attempts,
        verified,
        expires_at,
        created_at
    ) VALUES (
        v_tenant_id,
        v_clean_phone,
        v_code,
        0,
        FALSE,
        v_expires_at,
        NOW()
    );

    RETURN jsonb_build_object(
        'success', true,
        'phone', v_clean_phone,
        'code', v_code,
        'expires_in_seconds', 600,
        'message', 'Código de verificação gerado com sucesso.'
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- RPC 2: Validar Código OTP e Criar/Logar Cliente
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.verify_whatsapp_otp(
    p_phone TEXT,
    p_code TEXT,
    p_full_name TEXT DEFAULT '',
    p_tenant_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_clean_phone TEXT;
    v_clean_code TEXT;
    v_tenant_id UUID;
    v_otp RECORD;
    v_final_name TEXT;
    v_customer RECORD;
BEGIN
    v_clean_phone := regexp_replace(COALESCE(p_phone, ''), '\D', '', 'g');
    v_clean_code := TRIM(COALESCE(p_code, ''));
    v_tenant_id := COALESCE(p_tenant_id, 'a0000000-0000-0000-0000-000000000001'::uuid);

    IF LENGTH(v_clean_phone) < 10 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Número de WhatsApp inválido.');
    END IF;

    IF LENGTH(v_clean_code) < 4 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Informe o código recebido.');
    END IF;

    -- Busca código ativo
    SELECT * INTO v_otp
    FROM public.whatsapp_otp_codes
    WHERE phone = v_clean_phone
      AND verified = FALSE
      AND expires_at > NOW()
    ORDER BY created_at DESC
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Código expirado ou não encontrado. Solicite um novo código.');
    END IF;

    IF v_otp.attempts >= 5 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Muitas tentativas incorretas. Solicite um novo código.');
    END IF;

    IF v_otp.code <> v_clean_code THEN
        UPDATE public.whatsapp_otp_codes
        SET attempts = attempts + 1
        WHERE id = v_otp.id;
        RETURN jsonb_build_object('success', false, 'error', 'Código incorreto. Verifique os dígitos digitados.');
    END IF;

    -- Código correto: marcar como verificado
    UPDATE public.whatsapp_otp_codes
    SET verified = TRUE
    WHERE id = v_otp.id;

    -- Resolver nome do cliente
    v_final_name := TRIM(COALESCE(p_full_name, ''));
    IF v_final_name = '' OR v_final_name = 'Cliente' THEN
        SELECT full_name INTO v_final_name
        FROM public.customers
        WHERE tenant_id = v_tenant_id AND phone = v_clean_phone
        LIMIT 1;
        
        IF v_final_name IS NULL OR v_final_name = '' THEN
            v_final_name := 'Cliente';
        END IF;
    END IF;

    -- Upsert no cadastro formal de clientes (public.customers)
    INSERT INTO public.customers (
        tenant_id,
        phone,
        full_name,
        created_date,
        updated_date
    ) VALUES (
        v_tenant_id,
        v_clean_phone,
        v_final_name,
        NOW(),
        NOW()
    )
    ON CONFLICT (tenant_id, phone) DO UPDATE
    SET full_name = CASE 
            WHEN EXCLUDED.full_name <> 'Cliente' THEN EXCLUDED.full_name 
            ELSE public.customers.full_name 
        END,
        updated_date = NOW()
    RETURNING * INTO v_customer;

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Conta verificada com sucesso!',
        'customer', jsonb_build_object(
            'id', v_customer.id,
            'tenant_id', v_customer.tenant_id,
            'phone', v_customer.phone,
            'full_name', v_customer.full_name,
            'email', COALESCE(v_customer.email, ''),
            'role', 'user'
        )
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.request_whatsapp_otp(TEXT, TEXT, UUID) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.verify_whatsapp_otp(TEXT, TEXT, TEXT, UUID) TO anon, authenticated, service_role;


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- MIGRATION: 20261021_table_service_fee.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- ==============================================================================
-- MIGRATION: 20261021_table_service_fee.sql
-- OBJETIVO: Taxa de Serviço de Mesa Configurável (Ativar/Desativar e % de serviço)
-- ==============================================================================

-- 1. Colunas de taxa de serviço de mesa na tabela tenants
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS table_service_fee_enabled BOOLEAN DEFAULT false;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS table_service_fee_rate NUMERIC DEFAULT 10;
UPDATE public.tenants SET table_service_fee_enabled = false WHERE table_service_fee_enabled IS NULL;
UPDATE public.tenants SET table_service_fee_rate = 10 WHERE table_service_fee_rate IS NULL;

-- 2. Atualizar update_tenant_settings
CREATE OR REPLACE FUNCTION public.update_tenant_settings(p_tenant_id uuid, p_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_updated_tenant JSONB;
BEGIN
    UPDATE public.tenants
    SET 
        name = COALESCE(p_data->>'name', name),
        logo_url = CASE WHEN p_data ? 'logo_url' THEN p_data->>'logo_url' ELSE logo_url END,
        opening_time = COALESCE(p_data->>'opening_time', opening_time),
        closing_time = COALESCE(p_data->>'closing_time', closing_time),
        open_days = CASE WHEN p_data ? 'open_days' THEN p_data->'open_days' ELSE open_days END,
        delivery_time = CASE WHEN p_data ? 'delivery_time' THEN p_data->>'delivery_time' ELSE delivery_time END,
        salon_mode = CASE WHEN p_data ? 'salon_mode' THEN p_data->>'salon_mode' ELSE salon_mode END,
        accepts_delivery = CASE 
            WHEN p_data ? 'accepts_delivery' THEN (p_data->>'accepts_delivery')::boolean 
            ELSE accepts_delivery 
        END,
        accepts_takeaway = CASE 
            WHEN p_data ? 'accepts_takeaway' THEN (p_data->>'accepts_takeaway')::boolean 
            ELSE accepts_takeaway 
        END,
        table_service_fee_enabled = CASE 
            WHEN p_data ? 'table_service_fee_enabled' THEN (p_data->>'table_service_fee_enabled')::boolean 
            ELSE table_service_fee_enabled 
        END,
        table_service_fee_rate = CASE 
            WHEN p_data ? 'table_service_fee_rate' THEN (p_data->>'table_service_fee_rate')::numeric 
            ELSE table_service_fee_rate 
        END,
        manual_store_open = CASE 
            WHEN p_data ? 'manual_store_open' THEN 
                CASE 
                    WHEN (p_data->>'manual_store_open') IS NULL THEN NULL
                    ELSE (p_data->>'manual_store_open')::boolean 
                END
            ELSE manual_store_open 
        END,
        manual_override_date = CASE 
            WHEN p_data ? 'manual_override_date' THEN 
                CASE 
                    WHEN (p_data->>'manual_override_date') IS NULL THEN NULL
                    ELSE p_data->>'manual_override_date' 
                END
            ELSE manual_override_date 
        END,
        address = COALESCE(p_data->>'address', address),
        cep = CASE WHEN p_data ? 'cep' THEN p_data->>'cep' ELSE cep END,
        address_street = CASE WHEN p_data ? 'address_street' THEN p_data->>'address_street' ELSE address_street END,
        address_number = CASE WHEN p_data ? 'address_number' THEN p_data->>'address_number' ELSE address_number END,
        address_neighborhood = CASE WHEN p_data ? 'address_neighborhood' THEN p_data->>'address_neighborhood' ELSE address_neighborhood END,
        address_city = CASE WHEN p_data ? 'address_city' THEN p_data->>'address_city' ELSE address_city END,
        address_state = CASE WHEN p_data ? 'address_state' THEN p_data->>'address_state' ELSE address_state END,
        address_complement = CASE WHEN p_data ? 'address_complement' THEN p_data->>'address_complement' ELSE address_complement END,
        instagram = CASE WHEN p_data ? 'instagram' THEN p_data->>'instagram' ELSE instagram END,
        whatsapp = CASE WHEN p_data ? 'whatsapp' THEN p_data->>'whatsapp' ELSE whatsapp END,
        delivery_fee = CASE WHEN p_data ? 'delivery_fee' THEN (p_data->>'delivery_fee')::numeric ELSE delivery_fee END,
        min_order_value = CASE WHEN p_data ? 'min_order_value' THEN (p_data->>'min_order_value')::numeric ELSE min_order_value END,
        delivery_fee_type = COALESCE(p_data->>'delivery_fee_type', delivery_fee_type),
        delivery_neighborhoods = CASE WHEN p_data ? 'delivery_neighborhoods' THEN p_data->'delivery_neighborhoods' ELSE delivery_neighborhoods END,
        delivery_unlisted_policy = COALESCE(p_data->>'delivery_unlisted_policy', delivery_unlisted_policy),
        delivery_fallback_fee = CASE WHEN p_data ? 'delivery_fallback_fee' THEN (p_data->>'delivery_fallback_fee')::numeric ELSE delivery_fallback_fee END,
        free_delivery_threshold = CASE WHEN p_data ? 'free_delivery_threshold' AND (p_data->>'free_delivery_threshold') IS NOT NULL AND (p_data->>'free_delivery_threshold') != '' THEN (p_data->>'free_delivery_threshold')::numeric ELSE free_delivery_threshold END,
        payment_methods = CASE WHEN p_data ? 'payment_methods' THEN p_data->'payment_methods' ELSE payment_methods END,
        updated_date = NOW()
    WHERE id = p_tenant_id;

    SELECT to_jsonb(t.*) INTO v_updated_tenant
    FROM public.tenants t
    WHERE t.id = p_tenant_id;

    RETURN v_updated_tenant;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.update_tenant_settings(uuid, jsonb) TO authenticated, service_role, anon;


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- MIGRATION: 20261028_orders_card_brand.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- Adiciona coluna card_brand para armazenar a bandeira do cartão ou vale-refeição (ex: Visa, Mastercard, Alelo, Sodexo)
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS card_brand TEXT;



-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- MIGRATION: 20261029_cancel_order_refund_system.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- ==============================================================================
-- MIGRATION: 20261029_cancel_order_refund_system.sql
-- OBJETIVO: Cancelamento Profissional de Pedidos, Estorno PIX e Reversão de Cashback
-- ==============================================================================

-- 1. Colunas de cancelamento e estorno na tabela orders
ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS cancel_reason TEXT,
ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS pix_refund_status TEXT DEFAULT 'none',
ADD COLUMN IF NOT EXISTS pix_refund_id TEXT,
ADD COLUMN IF NOT EXISTS pix_refund_amount NUMERIC DEFAULT 0.00;

-- 2. RPC para reverter atomicamente o cashback de um pedido cancelado
CREATE OR REPLACE FUNCTION public.revert_order_cashback(
    p_order_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_order RECORD;
    v_clean_phone TEXT;
    v_wallet RECORD;
    v_discount_used NUMERIC := 0.00;
    v_earned_amount NUMERIC := 0.00;
    v_already_refunded BOOLEAN := FALSE;
    v_already_reversed BOOLEAN := FALSE;
    v_cashback_refunded NUMERIC := 0.00;
    v_cashback_reversed NUMERIC := 0.00;
BEGIN
    SELECT id, tenant_id, customer_phone, customer_name, cashback_discount, cashback_earned, coupon_code, status
    INTO v_order
    FROM public.orders
    WHERE id = p_order_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Pedido não encontrado.');
    END IF;

    v_clean_phone := REGEXP_REPLACE(COALESCE(v_order.customer_phone, ''), '\D', '', 'g');
    IF length(v_clean_phone) < 8 THEN
        RETURN jsonb_build_object('success', true, 'message', 'Telefone do cliente não elegível.');
    END IF;

    SELECT id, balance, expires_at
    INTO v_wallet
    FROM public.customer_cashback_wallets
    WHERE tenant_id = v_order.tenant_id AND phone = v_clean_phone;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', true, 'message', 'Carteira não encontrada.');
    END IF;

    v_discount_used := COALESCE(v_order.cashback_discount, 0.00);
    v_earned_amount := COALESCE(v_order.cashback_earned, 0.00);

    -- Verifica se já houve estorno de devolução (refund) para este pedido
    SELECT EXISTS (
        SELECT 1 FROM public.customer_cashback_transactions
        WHERE wallet_id = v_wallet.id AND order_id = v_order.id AND type = 'refund'
    ) INTO v_already_refunded;

    -- 1. Devolver saldo que o cliente utilizou como desconto
    IF v_discount_used > 0 AND NOT v_already_refunded THEN
        UPDATE public.customer_cashback_wallets
        SET balance = balance + v_discount_used,
            updated_at = NOW()
        WHERE id = v_wallet.id;

        INSERT INTO public.customer_cashback_transactions (
            wallet_id, tenant_id, order_id, amount, type, description
        )
        VALUES (
            v_wallet.id, v_order.tenant_id, v_order.id, v_discount_used, 'refund',
            'Devolução de saldo por cancelamento do pedido #' || UPPER(SUBSTRING(v_order.id, 1, 6))
        );
        v_cashback_refunded := v_discount_used;
    END IF;

    -- Verifica se já houve revogação do bônus (reversal) para este pedido
    SELECT EXISTS (
        SELECT 1 FROM public.customer_cashback_transactions
        WHERE wallet_id = v_wallet.id AND order_id = v_order.id AND type = 'reversal'
    ) INTO v_already_reversed;

    -- 2. Revogar/estornar novo cashback que havia sido gerado
    IF v_earned_amount > 0 AND NOT v_already_reversed THEN
        UPDATE public.customer_cashback_wallets
        SET balance = GREATEST(0, balance - v_earned_amount),
            updated_at = NOW()
        WHERE id = v_wallet.id;

        INSERT INTO public.customer_cashback_transactions (
            wallet_id, tenant_id, order_id, amount, type, description
        )
        VALUES (
            v_wallet.id, v_order.tenant_id, v_order.id, -v_earned_amount, 'reversal',
            'Estorno de bônus por cancelamento do pedido #' || UPPER(SUBSTRING(v_order.id, 1, 6))
        );
        v_cashback_reversed := v_earned_amount;
    END IF;

    -- 3. Liberar cupom de desconto se houver uso registrado
    IF v_order.coupon_code IS NOT NULL AND length(v_order.coupon_code) > 0 THEN
        BEGIN
            DELETE FROM public.coupon_usages
            WHERE order_id = v_order.id;
        EXCEPTION WHEN OTHERS THEN
            NULL;
        END;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'cashback_refunded', v_cashback_refunded,
        'cashback_reversed', v_cashback_reversed
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.revert_order_cashback(TEXT) TO authenticated, service_role, anon;


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- MIGRATION: 20261029_cashback_loyalty_system.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- ==============================================================================
-- MIGRATION: 20261029_cashback_loyalty_system.sql
-- OBJETIVO: Programa de Cashback & Fidelidade da Loja (Multi-Tenant Isolado)
-- ==============================================================================

-- 1. Colunas de configuração de cashback na tabela tenants
ALTER TABLE public.tenants
ADD COLUMN IF NOT EXISTS cashback_enabled BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS cashback_rate NUMERIC DEFAULT 5.0,
ADD COLUMN IF NOT EXISTS cashback_validity_days INTEGER DEFAULT 15,
ADD COLUMN IF NOT EXISTS cashback_max_discount_percentage NUMERIC DEFAULT 50.0;

-- 2. Colunas de cashback na tabela orders
ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS cashback_discount NUMERIC DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS cashback_earned NUMERIC DEFAULT 0.00;

-- 3. Tabela de Carteiras de Cashback dos Clientes (Isolada por tenant_id + phone)
CREATE TABLE IF NOT EXISTS public.customer_cashback_wallets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    phone TEXT NOT NULL,
    customer_name TEXT,
    balance NUMERIC NOT NULL DEFAULT 0.00,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT customer_cashback_wallets_tenant_phone_key UNIQUE (tenant_id, phone),
    CONSTRAINT customer_cashback_balance_non_negative CHECK (balance >= 0)
);

CREATE INDEX IF NOT EXISTS idx_customer_cashback_wallets_lookup 
ON public.customer_cashback_wallets (tenant_id, phone);

-- 4. Tabela de Extrato de Movimentações de Cashback (order_id TEXT compatível com orders.id)
CREATE TABLE IF NOT EXISTS public.customer_cashback_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet_id UUID NOT NULL REFERENCES public.customer_cashback_wallets(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    order_id TEXT REFERENCES public.orders(id) ON DELETE SET NULL,
    amount NUMERIC NOT NULL,
    type TEXT NOT NULL, -- 'credit', 'debit', 'expired', 'adjustment'
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customer_cashback_transactions_wallet 
ON public.customer_cashback_transactions (wallet_id, created_at DESC);

-- 5. RLS (Row Level Security)
ALTER TABLE public.customer_cashback_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_cashback_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view wallets for active tenant" ON public.customer_cashback_wallets;
CREATE POLICY "Public can view wallets for active tenant"
ON public.customer_cashback_wallets FOR SELECT
USING (TRUE);

DROP POLICY IF EXISTS "Service and Auth can manage wallets" ON public.customer_cashback_wallets;
CREATE POLICY "Service and Auth can manage wallets"
ON public.customer_cashback_wallets FOR ALL
USING (TRUE)
WITH CHECK (TRUE);

DROP POLICY IF EXISTS "Public can view transactions" ON public.customer_cashback_transactions;
CREATE POLICY "Public can view transactions"
ON public.customer_cashback_transactions FOR SELECT
USING (TRUE);

DROP POLICY IF EXISTS "Service and Auth can manage transactions" ON public.customer_cashback_transactions;
CREATE POLICY "Service and Auth can manage transactions"
ON public.customer_cashback_transactions FOR ALL
USING (TRUE)
WITH CHECK (TRUE);

-- 6. RPC para consultar o saldo de cashback ativo de um cliente
CREATE OR REPLACE FUNCTION public.get_customer_cashback_balance(
    p_tenant_id UUID,
    p_phone TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_clean_phone TEXT := REGEXP_REPLACE(p_phone, '\D', '', 'g');
    v_wallet RECORD;
    v_tenant RECORD;
    v_is_expired BOOLEAN := FALSE;
    v_effective_balance NUMERIC := 0.00;
BEGIN
    SELECT cashback_enabled, cashback_rate, cashback_validity_days, cashback_max_discount_percentage
    INTO v_tenant
    FROM public.tenants
    WHERE id = p_tenant_id;

    IF NOT FOUND OR v_tenant.cashback_enabled IS NOT TRUE THEN
        RETURN jsonb_build_object(
            'enabled', false,
            'balance', 0.00,
            'rate', COALESCE(v_tenant.cashback_rate, 5.0),
            'max_discount_percentage', COALESCE(v_tenant.cashback_max_discount_percentage, 50.0)
        );
    END IF;

    IF v_clean_phone IS NULL OR length(v_clean_phone) < 8 THEN
        RETURN jsonb_build_object(
            'enabled', true,
            'balance', 0.00,
            'rate', v_tenant.cashback_rate,
            'max_discount_percentage', v_tenant.cashback_max_discount_percentage
        );
    END IF;

    SELECT id, balance, expires_at, customer_name
    INTO v_wallet
    FROM public.customer_cashback_wallets
    WHERE tenant_id = p_tenant_id AND phone = v_clean_phone;

    IF FOUND THEN
        -- Verifica se o saldo expirou
        IF v_wallet.expires_at IS NOT NULL AND v_wallet.expires_at < NOW() THEN
            v_is_expired := TRUE;
            v_effective_balance := 0.00;
        ELSE
            v_effective_balance := COALESCE(v_wallet.balance, 0.00);
        END IF;

        RETURN jsonb_build_object(
            'enabled', true,
            'balance', v_effective_balance,
            'expires_at', v_wallet.expires_at,
            'is_expired', v_is_expired,
            'rate', v_tenant.cashback_rate,
            'max_discount_percentage', v_tenant.cashback_max_discount_percentage,
            'customer_name', v_wallet.customer_name
        );
    ELSE
        RETURN jsonb_build_object(
            'enabled', true,
            'balance', 0.00,
            'expires_at', NULL,
            'is_expired', false,
            'rate', v_tenant.cashback_rate,
            'max_discount_percentage', v_tenant.cashback_max_discount_percentage
        );
    END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_customer_cashback_balance(UUID, TEXT) TO authenticated, service_role, anon;

-- 7. RPC para processar o cashback de um pedido (order_id TEXT)
CREATE OR REPLACE FUNCTION public.process_order_cashback(
    p_order_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_order RECORD;
    v_tenant RECORD;
    v_clean_phone TEXT;
    v_wallet_id UUID;
    v_validity_days INTEGER;
    v_new_expires_at TIMESTAMPTZ;
    v_discount_used NUMERIC := 0.00;
    v_earned_amount NUMERIC := 0.00;
BEGIN
    SELECT id, tenant_id, customer_phone, customer_name, total, total_amount, subtotal, cashback_discount, cashback_earned, status
    INTO v_order
    FROM public.orders
    WHERE id = p_order_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Pedido não encontrado.');
    END IF;

    SELECT cashback_enabled, cashback_rate, cashback_validity_days, cashback_max_discount_percentage
    INTO v_tenant
    FROM public.tenants
    WHERE id = v_order.tenant_id;

    IF NOT FOUND OR v_tenant.cashback_enabled IS NOT TRUE THEN
        RETURN jsonb_build_object('success', true, 'message', 'Cashback desativado para esta loja.');
    END IF;

    v_clean_phone := REGEXP_REPLACE(COALESCE(v_order.customer_phone, ''), '\D', '', 'g');
    IF length(v_clean_phone) < 8 THEN
        RETURN jsonb_build_object('success', true, 'message', 'Telefone do cliente não elegível.');
    END IF;

    v_validity_days := COALESCE(v_tenant.cashback_validity_days, 15);
    v_new_expires_at := NOW() + (v_validity_days || ' days')::INTERVAL;
    v_discount_used := COALESCE(v_order.cashback_discount, 0.00);
    v_earned_amount := COALESCE(v_order.cashback_earned, 0.00);

    -- Busca ou cria carteira
    INSERT INTO public.customer_cashback_wallets (
        tenant_id, phone, customer_name, balance, expires_at
    )
    VALUES (
        v_order.tenant_id, v_clean_phone, v_order.customer_name, 0.00, v_new_expires_at
    )
    ON CONFLICT (tenant_id, phone) DO UPDATE
    SET customer_name = COALESCE(EXCLUDED.customer_name, customer_cashback_wallets.customer_name),
        updated_at = NOW()
    RETURNING id INTO v_wallet_id;

    -- 1. Se usou cashback no pedido, debita da carteira
    IF v_discount_used > 0 THEN
        UPDATE public.customer_cashback_wallets
        SET balance = GREATEST(0, balance - v_discount_used),
            updated_at = NOW()
        WHERE id = v_wallet_id;

        INSERT INTO public.customer_cashback_transactions (
            wallet_id, tenant_id, order_id, amount, type, description
        )
        VALUES (
            v_wallet_id, v_order.tenant_id, v_order.id, -v_discount_used, 'debit',
            'Abatimento no pedido #' || UPPER(SUBSTRING(v_order.id, 1, 6))
        );
    END IF;

    -- 2. Se o pedido gerou cashback novo, credita na carteira e renova o prazo
    IF v_earned_amount > 0 THEN
        UPDATE public.customer_cashback_wallets
        SET balance = balance + v_earned_amount,
            expires_at = v_new_expires_at,
            updated_at = NOW()
        WHERE id = v_wallet_id;

        INSERT INTO public.customer_cashback_transactions (
            wallet_id, tenant_id, order_id, amount, type, description
        )
        VALUES (
            v_wallet_id, v_order.tenant_id, v_order.id, v_earned_amount, 'credit',
            'Cashback ganho no pedido #' || UPPER(SUBSTRING(v_order.id, 1, 6))
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'wallet_id', v_wallet_id,
        'discount_applied', v_discount_used,
        'cashback_earned', v_earned_amount,
        'expires_at', v_new_expires_at
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.process_order_cashback(TEXT) TO authenticated, service_role, anon;

-- 8. Atualizar update_tenant_settings para persistir os campos de cashback
CREATE OR REPLACE FUNCTION public.update_tenant_settings(p_tenant_id UUID, p_data JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_updated_tenant JSONB;
BEGIN
    UPDATE public.tenants
    SET 
        name = COALESCE(p_data->>'name', name),
        logo_url = CASE WHEN p_data ? 'logo_url' THEN p_data->>'logo_url' ELSE logo_url END,
        opening_time = COALESCE(p_data->>'opening_time', opening_time),
        closing_time = COALESCE(p_data->>'closing_time', closing_time),
        open_days = CASE WHEN p_data ? 'open_days' THEN p_data->'open_days' ELSE open_days END,
        delivery_time = CASE WHEN p_data ? 'delivery_time' THEN p_data->>'delivery_time' ELSE delivery_time END,
        salon_mode = CASE WHEN p_data ? 'salon_mode' THEN p_data->>'salon_mode' ELSE salon_mode END,
        cashback_enabled = CASE WHEN p_data ? 'cashback_enabled' THEN (p_data->>'cashback_enabled')::boolean ELSE cashback_enabled END,
        cashback_rate = CASE WHEN p_data ? 'cashback_rate' THEN (p_data->>'cashback_rate')::numeric ELSE cashback_rate END,
        cashback_validity_days = CASE WHEN p_data ? 'cashback_validity_days' THEN (p_data->>'cashback_validity_days')::integer ELSE cashback_validity_days END,
        cashback_max_discount_percentage = CASE WHEN p_data ? 'cashback_max_discount_percentage' THEN (p_data->>'cashback_max_discount_percentage')::numeric ELSE cashback_max_discount_percentage END,
        manual_store_open = CASE 
            WHEN p_data ? 'manual_store_open' THEN 
                CASE 
                    WHEN (p_data->>'manual_store_open') IS NULL THEN NULL
                    ELSE (p_data->>'manual_store_open')::boolean 
                END
            ELSE manual_store_open 
        END,
        manual_override_date = CASE 
            WHEN p_data ? 'manual_override_date' THEN 
                CASE 
                    WHEN (p_data->>'manual_override_date') IS NULL THEN NULL
                    ELSE p_data->>'manual_override_date' 
                END
            ELSE manual_override_date 
        END,
        address = COALESCE(p_data->>'address', address),
        cep = CASE WHEN p_data ? 'cep' THEN p_data->>'cep' ELSE cep END,
        address_street = CASE WHEN p_data ? 'address_street' THEN p_data->>'address_street' ELSE address_street END,
        address_number = CASE WHEN p_data ? 'address_number' THEN p_data->>'address_number' ELSE address_number END,
        address_neighborhood = CASE WHEN p_data ? 'address_neighborhood' THEN p_data->>'address_neighborhood' ELSE address_neighborhood END,
        address_city = CASE WHEN p_data ? 'address_city' THEN p_data->>'address_city' ELSE address_city END,
        address_state = CASE WHEN p_data ? 'address_state' THEN p_data->>'address_state' ELSE address_state END,
        address_complement = CASE WHEN p_data ? 'address_complement' THEN p_data->>'address_complement' ELSE address_complement END,
        instagram = CASE WHEN p_data ? 'instagram' THEN p_data->>'instagram' ELSE instagram END,
        whatsapp = CASE WHEN p_data ? 'whatsapp' THEN p_data->>'whatsapp' ELSE whatsapp END,
        delivery_fee = CASE WHEN p_data ? 'delivery_fee' THEN (p_data->>'delivery_fee')::numeric ELSE delivery_fee END,
        min_order_value = CASE WHEN p_data ? 'min_order_value' THEN (p_data->>'min_order_value')::numeric ELSE min_order_value END,
        delivery_fee_type = COALESCE(p_data->>'delivery_fee_type', delivery_fee_type),
        delivery_neighborhoods = CASE WHEN p_data ? 'delivery_neighborhoods' THEN p_data->'delivery_neighborhoods' ELSE delivery_neighborhoods END,
        delivery_unlisted_policy = COALESCE(p_data->>'delivery_unlisted_policy', delivery_unlisted_policy),
        delivery_fallback_fee = CASE WHEN p_data ? 'delivery_fallback_fee' THEN (p_data->>'delivery_fallback_fee')::numeric ELSE delivery_fallback_fee END,
        free_delivery_threshold = CASE WHEN p_data ? 'free_delivery_threshold' AND (p_data->>'free_delivery_threshold') IS NOT NULL AND (p_data->>'free_delivery_threshold') != '' THEN (p_data->>'free_delivery_threshold')::numeric ELSE free_delivery_threshold END,
        payment_methods = CASE WHEN p_data ? 'payment_methods' THEN p_data->'payment_methods' ELSE payment_methods END,
        accepts_delivery = CASE WHEN p_data ? 'accepts_delivery' THEN (p_data->>'accepts_delivery')::boolean ELSE accepts_delivery END,
        accepts_takeaway = CASE WHEN p_data ? 'accepts_takeaway' THEN (p_data->>'accepts_takeaway')::boolean ELSE accepts_takeaway END,
        table_service_fee_enabled = CASE WHEN p_data ? 'table_service_fee_enabled' THEN (p_data->>'table_service_fee_enabled')::boolean ELSE table_service_fee_enabled END,
        table_service_fee_rate = CASE WHEN p_data ? 'table_service_fee_rate' THEN (p_data->>'table_service_fee_rate')::numeric ELSE table_service_fee_rate END,
        updated_date = NOW()
    WHERE id = p_tenant_id;

    SELECT to_jsonb(t.*) INTO v_updated_tenant
    FROM public.tenants t
    WHERE t.id = p_tenant_id;

    RETURN v_updated_tenant;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_tenant_settings(UUID, JSONB) TO authenticated, service_role, anon;


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- MIGRATION: 20261029_plans_and_access_control.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- ==============================================================================
-- MIGRATION: 20261029_plans_and_access_control.sql
-- OBJETIVO: Governança de Planos (Visual / Autoatendimento / Completo)
--           Sincronização estrita de salon_mode e canais de atendimento por plano
-- ==============================================================================

-- 1. Atualizar RPC create_new_tenant para gravar salon_mode e canais de atendimento
CREATE OR REPLACE FUNCTION public.create_new_tenant(
    p_name TEXT,
    p_slug TEXT,
    p_plan TEXT DEFAULT 'basic'::TEXT,
    p_admin_username TEXT DEFAULT 'admin'::TEXT,
    p_admin_password TEXT DEFAULT 'admin123'::TEXT,
    p_primary_color TEXT DEFAULT '#E11D48'::TEXT,
    p_admin_email TEXT DEFAULT NULL::TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_tenant_id UUID := gen_random_uuid();
    v_clean_slug TEXT := LOWER(REGEXP_REPLACE(TRIM(p_slug), '[^a-zA-Z0-9\-]', '-', 'g'));
    v_auth_user_id UUID := gen_random_uuid();
    v_admin_email TEXT;
    v_hashed_password TEXT;
    v_salon_mode TEXT;
    v_accepts_delivery BOOLEAN;
    v_accepts_takeaway BOOLEAN;
    v_plan TEXT := LOWER(TRIM(COALESCE(p_plan, 'basic')));
BEGIN
    IF NOT (public.is_super_admin() OR auth.role() = 'service_role') THEN
        RAISE EXCEPTION 'Acesso negado: Apenas o SuperAdmin pode cadastrar novos restaurantes.';
    END IF;

    IF p_admin_password IS NULL OR length(trim(p_admin_password)) < 6 THEN
        RETURN jsonb_build_object('success', false, 'message', 'A senha do administrador deve ter no mínimo 6 caracteres.');
    END IF;

    IF EXISTS (SELECT 1 FROM public.tenants WHERE slug = v_clean_slug) THEN
        RETURN jsonb_build_object('success', false, 'message', 'Este slug/endereço já está em uso por outro restaurante.');
    END IF;

    -- Define salon_mode e canais conforme o plano contratado
    IF v_plan = 'showcase' THEN
        v_salon_mode := 'showcase';
        v_accepts_delivery := FALSE;
        v_accepts_takeaway := FALSE;
    ELSIF v_plan = 'table' THEN
        v_salon_mode := 'table_only';
        v_accepts_delivery := FALSE;
        v_accepts_takeaway := TRUE;
    ELSE
        v_salon_mode := 'full';
        v_accepts_delivery := TRUE;
        v_accepts_takeaway := TRUE;
    END IF;

    v_admin_email := COALESCE(
        NULLIF(LOWER(TRIM(p_admin_email)), ''),
        LOWER(TRIM(p_admin_username)) || '@' || v_clean_slug || '.delivery.internal'
    );

    IF EXISTS (SELECT 1 FROM auth.users WHERE email = v_admin_email) THEN
        RETURN jsonb_build_object('success', false, 'message', 'O e-mail ' || v_admin_email || ' já está em uso no sistema de autenticação.');
    END IF;

    -- 1. Inserir Tenant com salon_mode e canais consistentes
    INSERT INTO public.tenants (
        id, slug, name, plan, salon_mode, accepts_delivery, accepts_takeaway,
        logo_url, banner_url, theme_config, is_active,
        phone, whatsapp, address, instagram, delivery_fee, min_order_value
    )
    VALUES (
        v_tenant_id,
        v_clean_slug,
        TRIM(p_name),
        v_plan,
        v_salon_mode,
        v_accepts_delivery,
        v_accepts_takeaway,
        NULL,
        NULL,
        jsonb_build_object(
            'primary_color', p_primary_color,
            'secondary_color', '#111827',
            'layout_style', CASE WHEN v_plan = 'custom' THEN 'premium' ELSE 'standard' END
        ),
        TRUE,
        NULL,
        NULL,
        NULL,
        NULL,
        0.00,
        0.00
    );

    -- 2. Criptografar Senha com Blowfish/bcrypt
    v_hashed_password := extensions.crypt(p_admin_password, extensions.gen_salt('bf', 10));

    -- 3. Inserir em auth.users
    INSERT INTO auth.users (
        id,
        instance_id,
        aud,
        role,
        email,
        encrypted_password,
        email_confirmed_at,
        raw_app_meta_data,
        raw_user_meta_data,
        created_at,
        updated_at
    )
    VALUES (
        v_auth_user_id,
        '00000000-0000-0000-0000-000000000000',
        'authenticated',
        'authenticated',
        v_admin_email,
        v_hashed_password,
        NOW(),
        '{"provider": "email", "providers": ["email"]}'::jsonb,
        jsonb_build_object(
            'username', LOWER(TRIM(p_admin_username)),
            'tenant_id', v_tenant_id,
            'tenant_slug', v_clean_slug
        ),
        NOW(),
        NOW()
    );

    -- 4. Inserir em auth.identities
    INSERT INTO auth.identities (
        id,
        provider_id,
        user_id,
        identity_data,
        provider,
        last_sign_in_at,
        created_at,
        updated_at
    )
    VALUES (
        gen_random_uuid(),
        v_auth_user_id::text,
        v_auth_user_id,
        jsonb_build_object('sub', v_auth_user_id::text, 'email', v_admin_email),
        'email',
        NOW(),
        NOW(),
        NOW()
    );

    -- 5. Vincular em tenant_admins
    INSERT INTO public.tenant_admins (
        tenant_id,
        user_id,
        username,
        role,
        is_active
    )
    VALUES (
        v_tenant_id,
        v_auth_user_id,
        LOWER(TRIM(p_admin_username)),
        'admin',
        TRUE
    );

    -- 6. Sincronizar em public.admin_users
    INSERT INTO public.admin_users (
        id, tenant_id, username, password, role, permissions, active
    )
    VALUES (
        v_auth_user_id,
        v_tenant_id,
        LOWER(TRIM(p_admin_username)),
        v_hashed_password,
        'admin',
        '["*"]'::jsonb,
        TRUE
    );

    RETURN jsonb_build_object(
        'success', true,
        'tenant_id', v_tenant_id,
        'slug', v_clean_slug,
        'name', TRIM(p_name),
        'plan', v_plan,
        'salon_mode', v_salon_mode,
        'admin_username', LOWER(TRIM(p_admin_username)),
        'admin_email', v_admin_email,
        'message', 'Restaurante criado com perfil de plano configurado com sucesso!'
    );
END;
$$;

-- 2. Atualizar RPC update_tenant_info para sincronizar salon_mode e canais ao alterar plano
CREATE OR REPLACE FUNCTION public.update_tenant_info(
    p_tenant_id UUID, 
    p_name TEXT, 
    p_slug TEXT, 
    p_plan TEXT DEFAULT NULL::TEXT, 
    p_logo_url TEXT DEFAULT NULL::TEXT, 
    p_admin_username TEXT DEFAULT NULL::TEXT, 
    p_admin_password TEXT DEFAULT NULL::TEXT, 
    p_custom_template TEXT DEFAULT NULL::TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth', 'extensions', 'pg_temp'
AS $$
DECLARE
    v_clean_slug TEXT := LOWER(REGEXP_REPLACE(TRIM(p_slug), '[^a-zA-Z0-9\-]', '-', 'g'));
    v_existing_id UUID;
    v_hashed_password TEXT;
    v_plan TEXT := LOWER(TRIM(p_plan));
    v_salon_mode TEXT;
    v_accepts_delivery BOOLEAN;
    v_accepts_takeaway BOOLEAN;
BEGIN
    IF NOT (public.is_super_admin() OR (p_tenant_id = public.get_auth_tenant_id() AND public.get_auth_admin_role() IN ('super_admin', 'admin'))) THEN
        RAISE EXCEPTION 'Acesso negado: Você não possui autorização para editar este restaurante.';
    END IF;

    SELECT id INTO v_existing_id 
    FROM public.tenants 
    WHERE slug = v_clean_slug AND id != p_tenant_id;

    IF v_existing_id IS NOT NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Este slug/endereço já está em uso por outro restaurante.');
    END IF;

    -- Se o plano foi alterado, sincroniza automaticamente o salon_mode e canais
    IF v_plan IS NOT NULL THEN
        IF v_plan = 'showcase' THEN
            v_salon_mode := 'showcase';
            v_accepts_delivery := FALSE;
            v_accepts_takeaway := FALSE;
        ELSIF v_plan = 'table' THEN
            v_salon_mode := 'table_only';
            v_accepts_delivery := FALSE;
            v_accepts_takeaway := TRUE;
        ELSE
            v_salon_mode := 'full';
            v_accepts_delivery := TRUE;
            v_accepts_takeaway := TRUE;
        END IF;

        UPDATE public.tenants
        SET 
            name = TRIM(p_name),
            slug = v_clean_slug,
            plan = v_plan,
            salon_mode = v_salon_mode,
            accepts_delivery = v_accepts_delivery,
            accepts_takeaway = v_accepts_takeaway,
            logo_url = NULLIF(TRIM(p_logo_url), ''),
            custom_template = NULLIF(TRIM(p_custom_template), ''),
            updated_date = NOW()
        WHERE id = p_tenant_id;
    ELSE
        UPDATE public.tenants
        SET 
            name = TRIM(p_name),
            slug = v_clean_slug,
            logo_url = NULLIF(TRIM(p_logo_url), ''),
            custom_template = NULLIF(TRIM(p_custom_template), ''),
            updated_date = NOW()
        WHERE id = p_tenant_id;
    END IF;

    -- Se nova senha foi informada, atualiza em auth.users e nas tabelas locais
    IF p_admin_password IS NOT NULL AND TRIM(p_admin_password) != '' THEN
        v_hashed_password := extensions.crypt(p_admin_password, extensions.gen_salt('bf', 10));

        UPDATE auth.users
        SET encrypted_password = v_hashed_password,
            updated_at = NOW()
        WHERE id IN (SELECT user_id FROM public.tenant_admins WHERE tenant_id = p_tenant_id);

        IF p_admin_username IS NOT NULL AND TRIM(p_admin_username) != '' THEN
            UPDATE public.tenant_admins
            SET username = LOWER(TRIM(p_admin_username)),
                updated_at = NOW()
            WHERE tenant_id = p_tenant_id;

            UPDATE public.admin_users
            SET username = LOWER(TRIM(p_admin_username)),
                password = v_hashed_password,
                initial_password = NULL,
                updated_date = NOW()
            WHERE tenant_id = p_tenant_id;
        ELSE
            UPDATE public.admin_users
            SET password = v_hashed_password,
                initial_password = NULL,
                updated_date = NOW()
            WHERE tenant_id = p_tenant_id;
        END IF;
    ELSIF p_admin_username IS NOT NULL AND TRIM(p_admin_username) != '' THEN
        UPDATE public.tenant_admins
        SET username = LOWER(TRIM(p_admin_username)),
            updated_at = NOW()
        WHERE tenant_id = p_tenant_id;

        UPDATE public.admin_users
        SET username = LOWER(TRIM(p_admin_username)),
            updated_date = NOW()
        WHERE tenant_id = p_tenant_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'tenant_id', p_tenant_id,
        'slug', v_clean_slug,
        'name', TRIM(p_name),
        'plan', v_plan,
        'salon_mode', v_salon_mode,
        'custom_template', NULLIF(TRIM(p_custom_template), ''),
        'message', 'Restaurante e plano atualizados com sucesso!'
    );
END;
$$;

-- 3. Atualizar a empresa 'visual' e alinhar o salon_mode com o plano contratado
UPDATE public.tenants
SET plan = 'showcase',
    salon_mode = 'showcase',
    accepts_delivery = FALSE,
    accepts_takeaway = FALSE
WHERE slug = 'visual' OR name ILIKE '%visual%';



-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- SETUP SUPERADMIN INICIAL (CONDICIONAL)
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- ==============================================================================
-- SCRIPT: VÍNCULO SEGURO DO SUPERADMIN NO SUPABASE AUTH
-- Arquivo: supabase/scripts/setup_superadmin.sql
-- Objetivo: Vincular o usuário criado no Supabase Auth como super_admin em tenant_admins
-- SEM SENHAS NO CÓDIGO OU LOGS
-- ==============================================================================

DO $$
DECLARE
    v_user_id UUID;
    v_email TEXT := 'davi@delivery.internal';
BEGIN
    -- Localiza o UID do usuário no Supabase Auth
    SELECT id INTO v_user_id 
    FROM auth.users 
    WHERE email = LOWER(TRIM(v_email)) OR email LIKE 'davi@%'
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_user_id IS NULL THEN
        RAISE NOTICE 'Aviso: Usuário davi ainda não criado no Supabase Auth. Você poderá criar depois em Authentication -> Users.';
        RETURN;
    END IF;


    -- Vincula com segurança na tabela tenant_admins
    INSERT INTO public.tenant_admins (
        user_id,
        role,
        username,
        tenant_id,
        is_active
    ) VALUES (
        v_user_id,
        'super_admin',
        'davi',
        NULL,
        true
    )
    ON CONFLICT (user_id) DO UPDATE SET
        role = 'super_admin',
        username = 'davi',
        tenant_id = NULL,
        is_active = true,
        updated_at = NOW();

    RAISE NOTICE 'Conta SuperAdmin vinculada com sucesso para o email % (UID: %)!', v_email, v_user_id;
END $$;
