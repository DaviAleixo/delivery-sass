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
