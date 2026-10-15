-- =====================================================================
-- 🍔 VRUUM BURGUER — SCHEMA E MIGRATION COMPLETO DO BANCO DE DADOS
-- SGBD Alvo: PostgreSQL 14+ / Supabase
-- Versão: 001_initial_schema_vruum_burguer
-- Descrição: Estrutura unificada e definitiva integrando o legado Base44
--            com o Supabase PostgreSQL, RLS, Triggers, Realtime e Seeds.
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
            'pendente',      -- pedido recebido, aguardando confirmação
            'confirmado',   -- pedido confirmado pelo restaurante
            'preparando',   -- em produção na cozinha
            'enviado',      -- saiu para entrega (delivery)
            'entregue',     -- entregue ao cliente / retirado no balcão
            'cancelado'     -- cancelado
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
            'delivery',     -- entrega no endereço do cliente
            'pickup',       -- retirada no balcão (PDV ou encomenda)
            'balcao'        -- alias de balcão
        );
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'coupon_discount_type') THEN
        CREATE TYPE coupon_discount_type AS ENUM (
            'percentage',    -- percentual (ex: 10%)
            'fixed_amount',  -- valor fixo (ex: R$ 5,00)
            'fixed'          -- alias compatível
        );
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'coupon_apply_to') THEN
        CREATE TYPE coupon_apply_to AS ENUM (
            'order_total',         -- aplica no total do pedido
            'specific_products'    -- aplica apenas em produtos específicos
        );
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
        CREATE TYPE user_role AS ENUM (
            'admin',
            'user'
        );
    END IF;
END $$;

-- ---------------------------------------------------------------------
-- 3. CRIAÇÃO DAS TABELAS
-- ---------------------------------------------------------------------

-- ============================ USERS ==================================
CREATE TABLE IF NOT EXISTS public.users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name       TEXT,
    email           TEXT NOT NULL UNIQUE,
    phone           TEXT,
    role            TEXT NOT NULL DEFAULT 'user',
    created_date    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_date    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ========================= SETTINGS ==================================
CREATE TABLE IF NOT EXISTS public.settings (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_name     TEXT DEFAULT 'PedeMuleke',
    restaurant_logo     TEXT,
    opening_time        TEXT DEFAULT '18:00',
    closing_time        TEXT DEFAULT '23:59',
    open_days           JSONB NOT NULL DEFAULT '[]'::jsonb,
    phone               TEXT DEFAULT '(11) 99999-9999',
    address             TEXT DEFAULT 'Av. Brasil, 1500 - Centro',
    instagram           TEXT DEFAULT '@delivery',
    whatsapp            TEXT DEFAULT '11999999999',
    delivery_fee        NUMERIC(10,2) NOT NULL DEFAULT 6.50,
    min_order_value     NUMERIC(10,2) NOT NULL DEFAULT 20.00,
    manual_store_open   BOOLEAN DEFAULT NULL,
    manual_override_date TEXT DEFAULT NULL,
    created_date        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_date        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ========================= ADMIN_USERS ===============================
CREATE TABLE IF NOT EXISTS public.admin_users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username        TEXT NOT NULL UNIQUE,
    password        TEXT NOT NULL,
    role            TEXT NOT NULL DEFAULT 'admin',
    active          BOOLEAN NOT NULL DEFAULT TRUE,
    created_date    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_date    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ========================== CATEGORIES ===============================
CREATE TABLE IF NOT EXISTS public.categories (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    order_index     NUMERIC NOT NULL DEFAULT 0,
    is_combo        BOOLEAN NOT NULL DEFAULT FALSE,
    created_date    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_date    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =========================== PRODUCTS ================================
CREATE TABLE IF NOT EXISTS public.products (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    description     TEXT,
    price           NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    category        TEXT REFERENCES public.categories(id) ON DELETE SET NULL,
    category_id     TEXT REFERENCES public.categories(id) ON DELETE SET NULL,
    image_url       TEXT,
    available       BOOLEAN NOT NULL DEFAULT TRUE,
    created_date    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_date    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ======================= PRODUCT_ADDITIONALS (LEGACY) ==================
CREATE TABLE IF NOT EXISTS public.product_additionals (
    id              TEXT PRIMARY KEY,
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
CREATE TABLE IF NOT EXISTS public.product_complement_groups (
    id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    product_id      TEXT NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    group_id        TEXT NOT NULL REFERENCES public.complement_groups(id) ON DELETE CASCADE,
    order_index     INTEGER NOT NULL DEFAULT 0,
    created_date    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_product_group UNIQUE (product_id, group_id)
);

-- ========================== BANNER_IMAGES ============================
CREATE TABLE IF NOT EXISTS public.banner_images (
    id              TEXT PRIMARY KEY,
    title           TEXT,
    image_url       TEXT NOT NULL,
    order_index     NUMERIC NOT NULL DEFAULT 0,
    active          BOOLEAN NOT NULL DEFAULT TRUE,
    created_date    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_date    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tabela/View de compatibilidade para banners
CREATE TABLE IF NOT EXISTS public.banners (
    id              TEXT PRIMARY KEY,
    title           TEXT,
    image_url       TEXT NOT NULL,
    order_index     NUMERIC NOT NULL DEFAULT 0,
    active          BOOLEAN NOT NULL DEFAULT TRUE,
    created_date    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_date    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================ COUPONS ================================
CREATE TABLE IF NOT EXISTS public.coupons (
    id                  TEXT PRIMARY KEY,
    code                TEXT NOT NULL UNIQUE,
    name                TEXT NOT NULL,
    description         TEXT,
    discount_type       TEXT NOT NULL DEFAULT 'percentage',
    discount_value      NUMERIC(10,2) NOT NULL,
    apply_to            TEXT NOT NULL DEFAULT 'order_total',
    applicable_products JSONB NOT NULL DEFAULT '[]'::jsonb,
    min_order_value     NUMERIC(10,2) NOT NULL DEFAULT 0,
    usage_limit         NUMERIC,
    start_date          TIMESTAMPTZ,
    end_date            TIMESTAMPTZ,
    active              BOOLEAN NOT NULL DEFAULT TRUE,
    created_date        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_date        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ========================== COUPON_USAGES =============================
CREATE TABLE IF NOT EXISTS public.coupon_usages (
    id              TEXT PRIMARY KEY,
    coupon_id       TEXT NOT NULL REFERENCES public.coupons(id) ON DELETE CASCADE,
    user_email      TEXT NOT NULL,
    order_id        TEXT,
    created_date    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_date    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================= ORDERS ================================
CREATE TABLE IF NOT EXISTS public.orders (
    id                  TEXT PRIMARY KEY,
    order_number        SERIAL,
    customer_name       TEXT NOT NULL,
    customer_phone      TEXT NOT NULL,
    customer_email      TEXT,
    customer_address    TEXT,
    delivery_address    TEXT,
    total_amount        NUMERIC(10,2) NOT NULL,
    total               NUMERIC(10,2),
    subtotal            NUMERIC(10,2) DEFAULT 0.00,
    delivery_fee        NUMERIC(10,2) DEFAULT 0.00,
    status              TEXT NOT NULL DEFAULT 'pendente',
    payment_method      TEXT,
    order_type          TEXT NOT NULL DEFAULT 'delivery',
    table_number        TEXT,
    notes               TEXT,
    coupon_code         TEXT,
    discount_amount     NUMERIC(10,2) NOT NULL DEFAULT 0,
    discount            NUMERIC(10,2) DEFAULT 0,
    user_email          TEXT,
    items               JSONB NOT NULL DEFAULT '[]'::jsonb,
    sent_at             TIMESTAMPTZ DEFAULT NOW(),
    created_date        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_date        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =========================== ORDER_ITEMS =============================
CREATE TABLE IF NOT EXISTS public.order_items (
    id                  TEXT PRIMARY KEY,
    order_id            TEXT NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    product_id          TEXT,
    product_name        TEXT NOT NULL,
    product_price       NUMERIC(10,2) NOT NULL,
    quantity            NUMERIC NOT NULL DEFAULT 1,
    subtotal            NUMERIC(10,2) NOT NULL,
    created_date        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_date        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ======================= ORDER_ITEM_ADDITIONALS ======================
CREATE TABLE IF NOT EXISTS public.order_item_additionals (
    id              TEXT PRIMARY KEY,
    order_item_id   TEXT NOT NULL REFERENCES public.order_items(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    price           NUMERIC(10,2) NOT NULL,
    created_date    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_date    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ========================== USER_ADDRESSES ===========================
CREATE TABLE IF NOT EXISTS public.user_addresses (
    id              TEXT PRIMARY KEY,
    user_email      TEXT NOT NULL,
    name            TEXT NOT NULL,
    cep             TEXT,
    zip_code        TEXT,
    street          TEXT NOT NULL,
    number          TEXT NOT NULL,
    complement      TEXT,
    neighborhood    TEXT NOT NULL,
    city            TEXT NOT NULL,
    state           TEXT NOT NULL,
    is_default      BOOLEAN NOT NULL DEFAULT FALSE,
    created_date    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_date    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------
-- 4. ÍNDICES DE PERFORMANCE
-- ---------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_products_category        ON public.products(category);
CREATE INDEX IF NOT EXISTS idx_products_available       ON public.products(available);
CREATE INDEX IF NOT EXISTS idx_additionals_product      ON public.product_additionals(product_id);
CREATE INDEX IF NOT EXISTS idx_orders_status            ON public.orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_type              ON public.orders(order_type);
CREATE INDEX IF NOT EXISTS idx_orders_created_date      ON public.orders(created_date DESC);
CREATE INDEX IF NOT EXISTS idx_orders_user_email        ON public.orders(user_email);
CREATE INDEX IF NOT EXISTS idx_orders_customer_phone    ON public.orders(customer_phone);
CREATE INDEX IF NOT EXISTS idx_order_items_order        ON public.order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_coupon_usages_coupon     ON public.coupon_usages(coupon_id);
CREATE INDEX IF NOT EXISTS idx_coupon_usages_email      ON public.coupon_usages(user_email);
CREATE INDEX IF NOT EXISTS idx_user_addresses_email     ON public.user_addresses(user_email);
CREATE INDEX IF NOT EXISTS idx_categories_order         ON public.categories(order_index);
CREATE INDEX IF NOT EXISTS idx_banners_order            ON public.banner_images(order_index);

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
        'product_additionals', 'banner_images', 'banners', 'coupons', 'coupon_usages',
        'orders', 'order_items', 'order_item_additionals', 'user_addresses'
    ] LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_updated ON public.%I;', t, t);
        EXECUTE format(
            'CREATE TRIGGER trg_%s_updated BEFORE UPDATE ON public.%I
             FOR EACH ROW EXECUTE FUNCTION public.set_updated_date();', t, t);
    END LOOP;
END $$;

-- ---------------------------------------------------------------------
-- 6. TRIGGER DE SINCRONIZAÇÃO BANNER_IMAGES <-> BANNERS
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
-- 7. ROW LEVEL SECURITY (RLS) & POLÍTICAS
-- ---------------------------------------------------------------------
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_additionals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.banner_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.banners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupon_usages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_item_additionals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_addresses ENABLE ROW LEVEL SECURITY;

-- Políticas de Acesso Total para a Aplicação (Web / Mobile)
DO $$
DECLARE tbl TEXT;
BEGIN
    FOREACH tbl IN ARRAY ARRAY[
        'users', 'settings', 'admin_users', 'categories', 'products',
        'product_additionals', 'banner_images', 'banners', 'coupons', 'coupon_usages',
        'orders', 'order_items', 'order_item_additionals', 'user_addresses'
    ] LOOP
        EXECUTE format('DROP POLICY IF EXISTS "Public Access Policy for %s" ON public.%I;', tbl, tbl);
        EXECUTE format('CREATE POLICY "Public Access Policy for %s" ON public.%I FOR ALL USING (true) WITH CHECK (true);', tbl, tbl);
    END LOOP;
END $$;

-- Configuração do bucket público 'restaurant-images' para Storage
INSERT INTO storage.buckets (id, name, public)
VALUES ('restaurant-images', 'restaurant-images', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DO $$
BEGIN
    DROP POLICY IF EXISTS "Public Access restaurant-images" ON storage.objects;
    CREATE POLICY "Public Access restaurant-images" ON storage.objects
    FOR ALL USING (bucket_id = 'restaurant-images') WITH CHECK (bucket_id = 'restaurant-images');
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;

-- ---------------------------------------------------------------------
-- 8. HABILITAR SUPABASE REALTIME
-- ---------------------------------------------------------------------
ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;

-- ---------------------------------------------------------------------
-- 9. DADOS INICIAIS (SEED DATA)
-- ---------------------------------------------------------------------

-- Configuração inicial da loja
INSERT INTO public.settings (
    id, restaurant_name, restaurant_logo, opening_time, closing_time,
    phone, address, instagram, whatsapp, delivery_fee, min_order_value, open_days
) VALUES (
    'a1b2c3d4-e5f6-7890-abcd-111122223333',
    'PedeMuleke',
    NULL,
    '18:00',
    '23:59',
    '(11) 99999-9999',
    'Av. Brasil, 1500 - Centro',
    '@delivery',
    '11999999999',
    6.50,
    20.00,
    '[
        {"day":0,"enabled":true,"opening_time":"18:00","closing_time":"23:59"},
        {"day":1,"enabled":true,"opening_time":"18:00","closing_time":"23:59"},
        {"day":2,"enabled":true,"opening_time":"18:00","closing_time":"23:59"},
        {"day":3,"enabled":true,"opening_time":"18:00","closing_time":"23:59"},
        {"day":4,"enabled":true,"opening_time":"18:00","closing_time":"23:59"},
        {"day":5,"enabled":true,"opening_time":"18:00","closing_time":"23:59"},
        {"day":6,"enabled":true,"opening_time":"18:00","closing_time":"23:59"}
    ]'::jsonb
) ON CONFLICT (id) DO NOTHING;

-- Função RPC de Autenticação Segura com Bcrypt
CREATE OR REPLACE FUNCTION public.verify_admin_login(p_username TEXT, p_password TEXT)
RETURNS JSONB AS $$
DECLARE
    v_user RECORD;
BEGIN
    SELECT id, username, role, active, password
    INTO v_user
    FROM public.admin_users
    WHERE username = p_username;

    IF v_user.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Usuário não encontrado');
    END IF;

    IF v_user.active = FALSE THEN
        RETURN jsonb_build_object('success', false, 'message', 'Usuário desativado');
    END IF;

    IF v_user.password = crypt(p_password, v_user.password) THEN
        RETURN jsonb_build_object(
            'success', true,
            'user', jsonb_build_object(
                'id', v_user.id,
                'username', v_user.username,
                'role', v_user.role
            )
        );
    ELSIF v_user.password = p_password THEN
        UPDATE public.admin_users
        SET password = crypt(p_password, gen_salt('bf', 10))
        WHERE id = v_user.id;
        
        RETURN jsonb_build_object(
            'success', true,
            'user', jsonb_build_object(
                'id', v_user.id,
                'username', v_user.username,
                'role', v_user.role
            )
        );
    ELSE
        RETURN jsonb_build_object('success', false, 'message', 'Senha incorreta');
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.verify_admin_login(TEXT, TEXT) TO anon, authenticated, service_role;

-- Usuário Admin padrão (senha '123' criptografada com Bcrypt salt)
INSERT INTO public.admin_users (id, username, password, role, active)
VALUES ('a1b2c3d4-e5f6-7890-abcd-000000000001', 'admin', crypt('123', gen_salt('bf', 10)), 'admin', TRUE)
ON CONFLICT (username) DO UPDATE SET password = EXCLUDED.password;

-- Usuário Cliente Demo
INSERT INTO public.users (id, full_name, email, phone, role)
VALUES ('a1b2c3d4-e5f6-7890-abcd-000000000002', 'Cliente Demo', 'cliente@vrumburguer.com', '(11) 98765-4321', 'user')
ON CONFLICT (email) DO NOTHING;

-- Categorias do Cardápio
INSERT INTO public.categories (id, name, order_index) VALUES
    ('cat-burgers',   'Burgers Artesanais',        1),
    ('cat-combos',    'Combos Especiais',          2),
    ('cat-porcoes',   'Porções & Acompanhamentos', 3),
    ('cat-bebidas',   'Bebidas',                   4),
    ('cat-sobremesas', 'Sobremesas',               5)
ON CONFLICT (id) DO NOTHING;

-- Produtos do Cardápio
INSERT INTO public.products (id, name, description, price, category, category_id, image_url, available) VALUES
    ('prod-1', 'Vrum Classic Burger', 'Pão brioche selado na manteiga, blend artesanal 180g, queijo cheddar derretido, cebola caramelizada e maionese especial da casa.', 34.90, 'cat-burgers', 'cat-burgers', 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=600&auto=format&fit=crop&q=80', true),
    ('prod-2', 'Vrum Bacon Monster', 'Pão brioche, 2x blends artesanais 160g, fatias generosas de bacon crocante, cheddar duplo, picles e molho barbecue rústico.', 44.90, 'cat-burgers', 'cat-burgers', 'https://images.unsplash.com/photo-1553979459-d2229ba7433b?w=600&auto=format&fit=crop&q=80', true),
    ('prod-3', 'Vrum Smash Duplo', 'Pão de batata macio, 2x ultra smash 90g com crostinha perfeita, queijo prato duplo e molho especial.', 29.90, 'cat-burgers', 'cat-burgers', 'https://images.unsplash.com/photo-1586190848861-99aa4a171e90?w=600&auto=format&fit=crop&q=80', true),
    ('prod-4', 'Vrum Crispy Chicken', 'Pão brioche, sobrecoxa empanada crocante temperada com especiarias, alface americana fresca, tomate e maionese de alho confit.', 32.90, 'cat-burgers', 'cat-burgers', 'https://images.unsplash.com/photo-1625813506062-0aeb1d7a094b?w=600&auto=format&fit=crop&q=80', true),
    ('prod-5', 'Combo Vrum Classic + Fritas + Refri', '1x Vrum Classic Burger + 1x Porção Individual de Batata Frita Crocante + 1x Refrigerante Lata 350ml.', 48.90, 'cat-combos', 'cat-combos', 'https://images.unsplash.com/photo-1594212699903-ec8a3eca50f5?w=600&auto=format&fit=crop&q=80', true),
    ('prod-6', 'Combo Smash Duplo Família', '2x Vrum Smash Duplo + 2x Batatas Fritas Médias + 2x Refrigerantes Lata.', 79.90, 'cat-combos', 'cat-combos', 'https://images.unsplash.com/photo-1561758033-d89a9ad46330?w=600&auto=format&fit=crop&q=80', true),
    ('prod-7', 'Batata Frita Rústica Especial', 'Batatas rústicas com casca, temperadas com alecrim fresco e páprica defumada, acompanhadas de maionese verde.', 22.90, 'cat-porcoes', 'cat-porcoes', 'https://images.unsplash.com/photo-1576107232684-1279f3908594?w=600&auto=format&fit=crop&q=80', true),
    ('prod-8', 'Onion Rings Empanadas', 'Porção de anéis de cebola ultra crocantes empanados na farinha panko, acompanham molho barbecue defumado.', 24.90, 'cat-porcoes', 'cat-porcoes', 'https://images.unsplash.com/photo-1639024471285-0afc27429188?w=600&auto=format&fit=crop&q=80', true),
    ('prod-9', 'Coca-Cola Original 350ml', 'Lata 350ml gelada.', 7.00, 'cat-bebidas', 'cat-bebidas', 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?w=600&auto=format&fit=crop&q=80', true),
    ('prod-10', 'Suco Natural de Laranja 400ml', 'Feito na hora com laranjas frescas selecionadas.', 9.90, 'cat-bebidas', 'cat-bebidas', 'https://images.unsplash.com/photo-1613478223719-2ab802602423?w=600&auto=format&fit=crop&q=80', true),
    ('prod-11', 'Milkshake de Nutella & Ninho 400ml', 'Sorvete cremoso de baunilha batido com bastante Nutella pura e leite em pó Ninho.', 22.90, 'cat-sobremesas', 'cat-sobremesas', 'https://images.unsplash.com/photo-1572490122747-3968b75cc699?w=600&auto=format&fit=crop&q=80', true),
    ('prod-12', 'Brownie Artesanal com Sorvete', 'Brownie de chocolate meio amargo com nozes, servido quentinho com sorvete de baunilha.', 19.90, 'cat-sobremesas', 'cat-sobremesas', 'https://images.unsplash.com/photo-1606313564200-e75d5e30476c?w=600&auto=format&fit=crop&q=80', true)
ON CONFLICT (id) DO NOTHING;

-- Adicionais dos Produtos
INSERT INTO public.product_additionals (id, product_id, name, price, required, max_quantity, active) VALUES
    ('add-1', 'prod-1', 'Bacon Extra (4 fatias)', 6.00, false, 3, true),
    ('add-2', 'prod-1', 'Cheddar Cremoso Extra', 5.00, false, 2, true),
    ('add-3', 'prod-1', 'Hambúrguer 180g Adicional', 12.00, false, 2, true),
    ('add-4', 'prod-2', 'Cebola Caramelizada', 4.50, false, 2, true),
    ('add-5', 'prod-3', 'Bacon Crocante', 5.00, false, 3, true),
    ('add-6', 'prod-4', 'Queijo Cheddar', 4.50, false, 2, true)
ON CONFLICT (id) DO NOTHING;

-- Banners do Carrossel
INSERT INTO public.banner_images (id, title, image_url, order_index, active) VALUES
    ('banner-1', 'Burgers Artesanais Suculentos', 'https://images.unsplash.com/photo-1550547660-d9450f859349?w=1200&auto=format&fit=crop&q=80', 1, true),
    ('banner-2', 'Combos Especiais com Batata e Refri', 'https://images.unsplash.com/photo-1561758033-d89a9ad46330?w=1200&auto=format&fit=crop&q=80', 2, true)
ON CONFLICT (id) DO NOTHING;

-- Cupons de Desconto
INSERT INTO public.coupons (id, code, name, description, discount_type, discount_value, apply_to, applicable_products, min_order_value, usage_limit, active) VALUES
    ('coupon-1', 'PRIMEIRA10', 'Primeira Compra', '10% de desconto no seu primeiro pedido', 'percentage', 10.00, 'order_total', '[]'::jsonb, 30.00, 1, true),
    ('coupon-2', 'VRUM5', 'Desconto Burger', 'R$ 5,00 de desconto em pedidos acima de R$ 40', 'fixed_amount', 5.00, 'order_total', '[]'::jsonb, 40.00, NULL, true)
ON CONFLICT (id) DO NOTHING;

-- Endereço Demo
INSERT INTO public.user_addresses (id, user_email, name, cep, zip_code, street, number, neighborhood, city, state, complement, is_default)
VALUES ('addr-1', 'cliente@vrumburguer.com', 'Minha Casa', '01001-000', '01001-000', 'Rua das Flores', '123', 'Centro', 'São Paulo', 'SP', 'Apto 42', true)
ON CONFLICT (id) DO NOTHING;

-- Função de agregação otimizada para listagem de clientes
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

-- Função para preenchimento automático de cliente guest por telefone
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

-- Sincronização automática de clientes de pedidos para a tabela users
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
            )
            ON CONFLICT (email) DO UPDATE SET
                full_name = EXCLUDED.full_name,
                phone = COALESCE(EXCLUDED.phone, public.users.phone),
                updated_date = NOW();
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

-- Função para atualizar nome do cliente por telefone (sincronizando users e orders)
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
        )
        ON CONFLICT (email) DO UPDATE SET
            full_name = EXCLUDED.full_name,
            updated_date = NOW();
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

COMMIT;
