-- =====================================================================
-- 🚀 PEDEMULEKE — DDL OFICIAL 100% LIMPO E CONSOLIDADO
-- Projeto Alvo: jqwtnzdsaivbjudvjhld (PedeMuleke Prod)
-- Extraído diretamente do catálogo ativo do PostgreSQL (Single Source of Truth)
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------
-- 1. FUNÇÃO AUXILIAR DE TIMESTAMP UPDATED_DATE
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_updated_date()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_date = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------
-- 2. SEQUÊNCIAS E CRIAÇÃO DE TABELAS
-- ---------------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS public.tenants_code_seq START WITH 1 INCREMENT BY 1;
CREATE SEQUENCE IF NOT EXISTS public.orders_order_number_seq START WITH 1 INCREMENT BY 1;

CREATE TABLE IF NOT EXISTS public.tenants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    slug text NOT NULL,
    name text NOT NULL,
    plan text DEFAULT 'basic'::text NOT NULL,
    custom_domain text,
    is_active boolean DEFAULT true NOT NULL,
    logo_url text,
    banner_url text,
    theme_config jsonb DEFAULT '{"font_family": "Inter", "layout_style": "standard", "primary_color": "#E11D48", "secondary_color": "#111827"}'::jsonb NOT NULL,
    phone text DEFAULT '(11) 99999-9999'::text,
    whatsapp text DEFAULT '11999999999'::text,
    address text DEFAULT 'Av. Principal, 100 - Centro'::text,
    instagram text DEFAULT ''::text,
    delivery_fee numeric DEFAULT 5.00 NOT NULL,
    min_order_value numeric DEFAULT 0.00 NOT NULL,
    delivery_time text DEFAULT '40-50 min'::text,
    opening_time text DEFAULT '18:00'::text,
    closing_time text DEFAULT '23:59'::text,
    open_days jsonb DEFAULT '["segunda", "terca", "quarta", "quinta", "sexta", "sabado", "domingo"]'::jsonb NOT NULL,
    manual_store_open boolean,
    manual_override_date text,
    created_date timestamp with time zone DEFAULT now() NOT NULL,
    updated_date timestamp with time zone DEFAULT now() NOT NULL,
    cep text,
    address_number text,
    address_street text,
    address_neighborhood text,
    address_city text,
    address_state text,
    address_complement text,
    delivery_fee_type text DEFAULT 'fixed'::text,
    delivery_neighborhoods jsonb DEFAULT '[]'::jsonb,
    delivery_unlisted_policy text DEFAULT 'block'::text,
    delivery_fallback_fee numeric DEFAULT 10.00,
    free_delivery_threshold numeric,
    asaas_customer_id text,
    asaas_subscription_id text,
    subscription_status text DEFAULT 'pending'::text,
    monthly_price numeric DEFAULT 149.00,
    payment_link text,
    next_due_date date,
    code integer DEFAULT nextval('tenants_code_seq'::regclass),
    email text,
    cpf_cnpj text,
    payment_methods jsonb DEFAULT '{"pix_key": "", "accept_cash": true, "pix_key_type": "phone", "mp_public_key": "", "mp_access_token": "", "accept_online_mp": false, "accept_pix_manual": true, "accept_card_delivery": true}'::jsonb,
    delivery_drivers jsonb DEFAULT '[]'::jsonb,
    custom_template text,
    salon_mode text DEFAULT 'full'::text,
    accepts_delivery boolean DEFAULT true,
    accepts_takeaway boolean DEFAULT true,
    accepts_dine_in boolean DEFAULT true,
    pizza_pricing_rule text DEFAULT 'highest_price'::text NOT NULL,
    table_service_fee_enabled boolean DEFAULT false,
    table_service_fee_rate numeric DEFAULT 10
);

CREATE TABLE IF NOT EXISTS public.admin_users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid,
    username text NOT NULL,
    password text NOT NULL,
    role text DEFAULT 'admin'::text NOT NULL,
    permissions jsonb DEFAULT '["*"]'::jsonb NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_date timestamp with time zone DEFAULT now() NOT NULL,
    updated_date timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.categories (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    tenant_id uuid NOT NULL,
    name text NOT NULL,
    order_index numeric DEFAULT 0 NOT NULL,
    is_combo boolean DEFAULT false NOT NULL,
    created_date timestamp with time zone DEFAULT now() NOT NULL,
    updated_date timestamp with time zone DEFAULT now() NOT NULL,
    type text DEFAULT 'standard'::text NOT NULL,
    pizza_sizes jsonb DEFAULT '[]'::jsonb
);

CREATE TABLE IF NOT EXISTS public.products (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    tenant_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    price numeric DEFAULT 0.00 NOT NULL,
    category text,
    category_id text,
    image_url text,
    available boolean DEFAULT true NOT NULL,
    popular boolean DEFAULT false NOT NULL,
    created_date timestamp with time zone DEFAULT now() NOT NULL,
    updated_date timestamp with time zone DEFAULT now() NOT NULL,
    pizza_prices jsonb DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.product_additionals (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    tenant_id uuid NOT NULL,
    product_id text NOT NULL,
    name text NOT NULL,
    price numeric DEFAULT 0.00 NOT NULL,
    required boolean DEFAULT false NOT NULL,
    max_quantity numeric DEFAULT 1 NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_date timestamp with time zone DEFAULT now() NOT NULL,
    updated_date timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.complement_groups (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    tenant_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    min_quantity integer DEFAULT 0 NOT NULL,
    max_quantity integer DEFAULT 1 NOT NULL,
    required boolean DEFAULT false NOT NULL,
    active boolean DEFAULT true NOT NULL,
    order_index integer DEFAULT 0 NOT NULL,
    created_date timestamp with time zone DEFAULT now() NOT NULL,
    updated_date timestamp with time zone DEFAULT now() NOT NULL,
    is_pizza_crust boolean DEFAULT false
);

CREATE TABLE IF NOT EXISTS public.complement_items (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    tenant_id uuid NOT NULL,
    group_id text NOT NULL,
    name text NOT NULL,
    description text,
    price numeric DEFAULT 0.00 NOT NULL,
    max_quantity integer DEFAULT 1 NOT NULL,
    image_url text,
    active boolean DEFAULT true NOT NULL,
    order_index integer DEFAULT 0 NOT NULL,
    created_date timestamp with time zone DEFAULT now() NOT NULL,
    updated_date timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.product_complement_groups (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    tenant_id uuid NOT NULL,
    product_id text NOT NULL,
    group_id text NOT NULL,
    order_index integer DEFAULT 0 NOT NULL,
    created_date timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.coupons (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    tenant_id uuid NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    description text,
    discount_type text DEFAULT 'percentage'::text NOT NULL,
    discount_value numeric NOT NULL,
    apply_to text DEFAULT 'order_total'::text NOT NULL,
    applicable_products jsonb DEFAULT '[]'::jsonb NOT NULL,
    min_order_value numeric DEFAULT 0.00 NOT NULL,
    usage_limit numeric,
    start_date timestamp with time zone,
    end_date timestamp with time zone,
    active boolean DEFAULT true NOT NULL,
    created_date timestamp with time zone DEFAULT now() NOT NULL,
    updated_date timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.coupon_usages (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    tenant_id uuid NOT NULL,
    coupon_id text NOT NULL,
    user_email text NOT NULL,
    order_id text,
    created_date timestamp with time zone DEFAULT now() NOT NULL,
    updated_date timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.customers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    phone text NOT NULL,
    full_name text NOT NULL,
    email text,
    created_date timestamp with time zone DEFAULT now(),
    updated_date timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.user_addresses (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    tenant_id uuid,
    user_email text,
    user_phone text,
    name text DEFAULT 'Casa'::text NOT NULL,
    cep text,
    zip_code text,
    street text NOT NULL,
    number text NOT NULL,
    complement text,
    neighborhood text NOT NULL,
    city text DEFAULT 'Contagem'::text NOT NULL,
    state text DEFAULT 'MG'::text NOT NULL,
    reference text,
    is_default boolean DEFAULT false NOT NULL,
    created_date timestamp with time zone DEFAULT now() NOT NULL,
    updated_date timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.restaurant_tables (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    table_number text NOT NULL,
    label text DEFAULT 'Salão'::text,
    capacity integer DEFAULT 4,
    status text DEFAULT 'available'::text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    created_date timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.table_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    table_id uuid NOT NULL,
    table_number text NOT NULL,
    customer_name text,
    customer_phone text,
    people_count integer DEFAULT 1,
    opened_at timestamp with time zone DEFAULT now(),
    closed_at timestamp with time zone,
    subtotal numeric DEFAULT 0.00,
    service_fee numeric DEFAULT 0.00,
    discount numeric DEFAULT 0.00,
    total_amount numeric DEFAULT 0.00,
    status text DEFAULT 'open'::text,
    payment_method text,
    payment_details jsonb DEFAULT '[]'::jsonb,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    created_date timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.orders (
    id text DEFAULT ('order_'::text || (gen_random_uuid())::text) NOT NULL,
    tenant_id uuid NOT NULL,
    order_number integer DEFAULT nextval('orders_order_number_seq'::regclass) NOT NULL,
    customer_name text NOT NULL,
    customer_phone text NOT NULL,
    customer_email text,
    customer_address text,
    delivery_address text,
    total_amount numeric DEFAULT 0.00 NOT NULL,
    total numeric DEFAULT 0.00,
    subtotal numeric DEFAULT 0.00,
    delivery_fee numeric DEFAULT 0.00,
    status text DEFAULT 'pendente'::text NOT NULL,
    payment_method text,
    order_type text DEFAULT 'delivery'::text NOT NULL,
    table_number text,
    notes text,
    coupon_code text,
    discount_amount numeric DEFAULT 0.00 NOT NULL,
    discount numeric DEFAULT 0.00,
    user_email text,
    items jsonb DEFAULT '[]'::jsonb NOT NULL,
    sent_at timestamp with time zone DEFAULT now(),
    created_date timestamp with time zone DEFAULT now() NOT NULL,
    updated_date timestamp with time zone DEFAULT now() NOT NULL,
    tracking_token uuid DEFAULT gen_random_uuid() NOT NULL,
    payment_status text DEFAULT 'pending'::text,
    mp_payment_id text,
    change_for numeric,
    print_status text DEFAULT 'pending'::text NOT NULL,
    printed_at timestamp with time zone,
    print_count integer DEFAULT 0 NOT NULL,
    driver_id text,
    driver_name text,
    trip_id text,
    dispatched_at timestamp with time zone,
    delivered_at timestamp with time zone,
    table_session_id uuid
);

CREATE TABLE IF NOT EXISTS public.order_items (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    tenant_id uuid NOT NULL,
    order_id text NOT NULL,
    product_id text,
    product_name text NOT NULL,
    product_price numeric DEFAULT 0.00 NOT NULL,
    quantity numeric DEFAULT 1 NOT NULL,
    subtotal numeric DEFAULT 0.00 NOT NULL,
    created_date timestamp with time zone DEFAULT now() NOT NULL,
    updated_date timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.order_item_additionals (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    order_item_id text NOT NULL,
    name text NOT NULL,
    price numeric DEFAULT 0.00 NOT NULL,
    created_date timestamp with time zone DEFAULT now() NOT NULL,
    updated_date timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.shift_closings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    shift_date date NOT NULL,
    period_mode text DEFAULT 'today'::text NOT NULL,
    period_label text NOT NULL,
    opened_at timestamp with time zone,
    closed_at timestamp with time zone DEFAULT now() NOT NULL,
    cashier_name text DEFAULT 'Operador'::text NOT NULL,
    gross_revenue numeric DEFAULT 0 NOT NULL,
    net_revenue numeric DEFAULT 0 NOT NULL,
    total_orders integer DEFAULT 0 NOT NULL,
    delivery_orders integer DEFAULT 0 NOT NULL,
    counter_orders integer DEFAULT 0 NOT NULL,
    dine_in_orders integer DEFAULT 0 NOT NULL,
    average_ticket numeric DEFAULT 0 NOT NULL,
    payment_breakdown jsonb DEFAULT '{}'::jsonb NOT NULL,
    cash_drawer jsonb DEFAULT '{}'::jsonb NOT NULL,
    driver_settlements jsonb DEFAULT '[]'::jsonb NOT NULL,
    raw_closing_data jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.system_issues (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    description text,
    severity text DEFAULT 'urgent'::text NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    source text DEFAULT 'manual'::text NOT NULL,
    path text,
    tenant_id uuid,
    tenant_name text,
    sentry_event_id text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    resolved_at timestamp with time zone,
    resolved_by text
);

CREATE TABLE IF NOT EXISTS public.tenant_admins (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    tenant_id uuid,
    role text NOT NULL,
    username text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.banner_images (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    tenant_id uuid NOT NULL,
    title text,
    image_url text NOT NULL,
    order_index numeric DEFAULT 0 NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_date timestamp with time zone DEFAULT now() NOT NULL,
    updated_date timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.banners (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    tenant_id uuid NOT NULL,
    title text,
    image_url text NOT NULL,
    order_index numeric DEFAULT 0 NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_date timestamp with time zone DEFAULT now() NOT NULL,
    updated_date timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.whatsapp_otp_codes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid,
    phone text NOT NULL,
    code text NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    verified boolean DEFAULT false NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- ---------------------------------------------------------------------
-- 3. CONSTRAINTS (PRIMARY KEYS, UNIQUE, CHECKS, FOREIGN KEYS)
-- ---------------------------------------------------------------------
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'admin_users_pkey'
    ) THEN
        ALTER TABLE public.admin_users ADD CONSTRAINT admin_users_pkey PRIMARY KEY (id);
    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'banner_images_pkey'
    ) THEN
        ALTER TABLE public.banner_images ADD CONSTRAINT banner_images_pkey PRIMARY KEY (id);
    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'banners_pkey'
    ) THEN
        ALTER TABLE public.banners ADD CONSTRAINT banners_pkey PRIMARY KEY (id);
    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'categories_pkey'
    ) THEN
        ALTER TABLE public.categories ADD CONSTRAINT categories_pkey PRIMARY KEY (id);
    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'complement_groups_pkey'
    ) THEN
        ALTER TABLE public.complement_groups ADD CONSTRAINT complement_groups_pkey PRIMARY KEY (id);
    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'complement_items_pkey'
    ) THEN
        ALTER TABLE public.complement_items ADD CONSTRAINT complement_items_pkey PRIMARY KEY (id);
    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'coupon_usages_pkey'
    ) THEN
        ALTER TABLE public.coupon_usages ADD CONSTRAINT coupon_usages_pkey PRIMARY KEY (id);
    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'coupons_pkey'
    ) THEN
        ALTER TABLE public.coupons ADD CONSTRAINT coupons_pkey PRIMARY KEY (id);
    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'customers_pkey'
    ) THEN
        ALTER TABLE public.customers ADD CONSTRAINT customers_pkey PRIMARY KEY (id);
    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'order_item_additionals_pkey'
    ) THEN
        ALTER TABLE public.order_item_additionals ADD CONSTRAINT order_item_additionals_pkey PRIMARY KEY (id);
    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'order_items_pkey'
    ) THEN
        ALTER TABLE public.order_items ADD CONSTRAINT order_items_pkey PRIMARY KEY (id);
    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'orders_pkey'
    ) THEN
        ALTER TABLE public.orders ADD CONSTRAINT orders_pkey PRIMARY KEY (id);
    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'product_additionals_pkey'
    ) THEN
        ALTER TABLE public.product_additionals ADD CONSTRAINT product_additionals_pkey PRIMARY KEY (id);
    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'product_complement_groups_pkey'
    ) THEN
        ALTER TABLE public.product_complement_groups ADD CONSTRAINT product_complement_groups_pkey PRIMARY KEY (id);
    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'products_pkey'
    ) THEN
        ALTER TABLE public.products ADD CONSTRAINT products_pkey PRIMARY KEY (id);
    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'restaurant_tables_pkey'
    ) THEN
        ALTER TABLE public.restaurant_tables ADD CONSTRAINT restaurant_tables_pkey PRIMARY KEY (id);
    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'shift_closings_pkey'
    ) THEN
        ALTER TABLE public.shift_closings ADD CONSTRAINT shift_closings_pkey PRIMARY KEY (id);
    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'system_issues_pkey'
    ) THEN
        ALTER TABLE public.system_issues ADD CONSTRAINT system_issues_pkey PRIMARY KEY (id);
    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'table_sessions_pkey'
    ) THEN
        ALTER TABLE public.table_sessions ADD CONSTRAINT table_sessions_pkey PRIMARY KEY (id);
    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'tenant_admins_pkey'
    ) THEN
        ALTER TABLE public.tenant_admins ADD CONSTRAINT tenant_admins_pkey PRIMARY KEY (id);
    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'tenants_pkey'
    ) THEN
        ALTER TABLE public.tenants ADD CONSTRAINT tenants_pkey PRIMARY KEY (id);
    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'user_addresses_pkey'
    ) THEN
        ALTER TABLE public.user_addresses ADD CONSTRAINT user_addresses_pkey PRIMARY KEY (id);
    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'whatsapp_otp_codes_pkey'
    ) THEN
        ALTER TABLE public.whatsapp_otp_codes ADD CONSTRAINT whatsapp_otp_codes_pkey PRIMARY KEY (id);
    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'unique_tenant_coupon_code'
    ) THEN
        ALTER TABLE public.coupons ADD CONSTRAINT unique_tenant_coupon_code UNIQUE (tenant_id, code);
    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'unique_tenant_customer_phone'
    ) THEN
        ALTER TABLE public.customers ADD CONSTRAINT unique_tenant_customer_phone UNIQUE (tenant_id, phone);
    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'unique_tenant_product_group'
    ) THEN
        ALTER TABLE public.product_complement_groups ADD CONSTRAINT unique_tenant_product_group UNIQUE (tenant_id, product_id, group_id);
    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'unique_table_per_tenant'
    ) THEN
        ALTER TABLE public.restaurant_tables ADD CONSTRAINT unique_table_per_tenant UNIQUE (tenant_id, table_number);
    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'tenant_admins_user_id_key'
    ) THEN
        ALTER TABLE public.tenant_admins ADD CONSTRAINT tenant_admins_user_id_key UNIQUE (user_id);
    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'tenants_slug_key'
    ) THEN
        ALTER TABLE public.tenants ADD CONSTRAINT tenants_slug_key UNIQUE (slug);
    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'tenants_code_key'
    ) THEN
        ALTER TABLE public.tenants ADD CONSTRAINT tenants_code_key UNIQUE (code);
    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'tenants_custom_domain_key'
    ) THEN
        ALTER TABLE public.tenants ADD CONSTRAINT tenants_custom_domain_key UNIQUE (custom_domain);
    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'orders_print_status_check'
    ) THEN
        ALTER TABLE public.orders ADD CONSTRAINT orders_print_status_check CHECK (print_status = ANY (ARRAY['pending'::text, 'printing'::text, 'printed'::text, 'failed'::text]));
    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'tenant_admins_role_check'
    ) THEN
        ALTER TABLE public.tenant_admins ADD CONSTRAINT tenant_admins_role_check CHECK (role = ANY (ARRAY['super_admin'::text, 'admin'::text, 'staff'::text]));
    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_super_admin_tenant'
    ) THEN
        ALTER TABLE public.tenant_admins ADD CONSTRAINT chk_super_admin_tenant CHECK (role = 'super_admin'::text OR tenant_id IS NOT NULL);
    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'admin_users_tenant_id_fkey'
    ) THEN
        ALTER TABLE public.admin_users ADD CONSTRAINT admin_users_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'banner_images_tenant_id_fkey'
    ) THEN
        ALTER TABLE public.banner_images ADD CONSTRAINT banner_images_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'banners_tenant_id_fkey'
    ) THEN
        ALTER TABLE public.banners ADD CONSTRAINT banners_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'categories_tenant_id_fkey'
    ) THEN
        ALTER TABLE public.categories ADD CONSTRAINT categories_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'complement_groups_tenant_id_fkey'
    ) THEN
        ALTER TABLE public.complement_groups ADD CONSTRAINT complement_groups_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'complement_items_tenant_id_fkey'
    ) THEN
        ALTER TABLE public.complement_items ADD CONSTRAINT complement_items_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'complement_items_group_id_fkey'
    ) THEN
        ALTER TABLE public.complement_items ADD CONSTRAINT complement_items_group_id_fkey FOREIGN KEY (group_id) REFERENCES complement_groups(id) ON DELETE CASCADE;
    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'coupon_usages_tenant_id_fkey'
    ) THEN
        ALTER TABLE public.coupon_usages ADD CONSTRAINT coupon_usages_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'coupon_usages_coupon_id_fkey'
    ) THEN
        ALTER TABLE public.coupon_usages ADD CONSTRAINT coupon_usages_coupon_id_fkey FOREIGN KEY (coupon_id) REFERENCES coupons(id) ON DELETE CASCADE;
    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'coupons_tenant_id_fkey'
    ) THEN
        ALTER TABLE public.coupons ADD CONSTRAINT coupons_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'customers_tenant_id_fkey'
    ) THEN
        ALTER TABLE public.customers ADD CONSTRAINT customers_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'order_item_additionals_order_item_id_fkey'
    ) THEN
        ALTER TABLE public.order_item_additionals ADD CONSTRAINT order_item_additionals_order_item_id_fkey FOREIGN KEY (order_item_id) REFERENCES order_items(id) ON DELETE CASCADE;
    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'order_items_order_id_fkey'
    ) THEN
        ALTER TABLE public.order_items ADD CONSTRAINT order_items_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;
    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'order_items_tenant_id_fkey'
    ) THEN
        ALTER TABLE public.order_items ADD CONSTRAINT order_items_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'orders_tenant_id_fkey'
    ) THEN
        ALTER TABLE public.orders ADD CONSTRAINT orders_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'orders_table_session_id_fkey'
    ) THEN
        ALTER TABLE public.orders ADD CONSTRAINT orders_table_session_id_fkey FOREIGN KEY (table_session_id) REFERENCES table_sessions(id) ON DELETE SET NULL;
    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'product_additionals_tenant_id_fkey'
    ) THEN
        ALTER TABLE public.product_additionals ADD CONSTRAINT product_additionals_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'product_additionals_product_id_fkey'
    ) THEN
        ALTER TABLE public.product_additionals ADD CONSTRAINT product_additionals_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;
    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'product_complement_groups_tenant_id_fkey'
    ) THEN
        ALTER TABLE public.product_complement_groups ADD CONSTRAINT product_complement_groups_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'product_complement_groups_product_id_fkey'
    ) THEN
        ALTER TABLE public.product_complement_groups ADD CONSTRAINT product_complement_groups_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;
    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'product_complement_groups_group_id_fkey'
    ) THEN
        ALTER TABLE public.product_complement_groups ADD CONSTRAINT product_complement_groups_group_id_fkey FOREIGN KEY (group_id) REFERENCES complement_groups(id) ON DELETE CASCADE;
    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'products_category_id_fkey'
    ) THEN
        ALTER TABLE public.products ADD CONSTRAINT products_category_id_fkey FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL;
    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'products_tenant_id_fkey'
    ) THEN
        ALTER TABLE public.products ADD CONSTRAINT products_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'products_category_fkey'
    ) THEN
        ALTER TABLE public.products ADD CONSTRAINT products_category_fkey FOREIGN KEY (category) REFERENCES categories(id) ON DELETE SET NULL;
    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'restaurant_tables_tenant_id_fkey'
    ) THEN
        ALTER TABLE public.restaurant_tables ADD CONSTRAINT restaurant_tables_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'shift_closings_tenant_id_fkey'
    ) THEN
        ALTER TABLE public.shift_closings ADD CONSTRAINT shift_closings_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'system_issues_tenant_id_fkey'
    ) THEN
        ALTER TABLE public.system_issues ADD CONSTRAINT system_issues_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE SET NULL;
    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'table_sessions_table_id_fkey'
    ) THEN
        ALTER TABLE public.table_sessions ADD CONSTRAINT table_sessions_table_id_fkey FOREIGN KEY (table_id) REFERENCES restaurant_tables(id) ON DELETE CASCADE;
    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'table_sessions_tenant_id_fkey'
    ) THEN
        ALTER TABLE public.table_sessions ADD CONSTRAINT table_sessions_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'tenant_admins_user_id_fkey'
    ) THEN
        ALTER TABLE public.tenant_admins ADD CONSTRAINT tenant_admins_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'tenant_admins_tenant_id_fkey'
    ) THEN
        ALTER TABLE public.tenant_admins ADD CONSTRAINT tenant_admins_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'user_addresses_tenant_id_fkey'
    ) THEN
        ALTER TABLE public.user_addresses ADD CONSTRAINT user_addresses_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'whatsapp_otp_codes_tenant_id_fkey'
    ) THEN
        ALTER TABLE public.whatsapp_otp_codes ADD CONSTRAINT whatsapp_otp_codes_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;

-- ---------------------------------------------------------------------
-- 4. ÍNDICES DE ALTA PERFORMANCE
-- ---------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_admin_users_lookup ON public.admin_users USING btree (tenant_id, username, active);
CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_users_unique_tenant_username ON public.admin_users USING btree (tenant_id, username) WHERE (tenant_id IS NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_users_unique_username ON public.admin_users USING btree (username) WHERE (tenant_id IS NULL);
CREATE INDEX IF NOT EXISTS idx_banners_tenant ON public.banners USING btree (tenant_id, active, order_index);
CREATE INDEX IF NOT EXISTS idx_categories_tenant_order ON public.categories USING btree (tenant_id, order_index);
CREATE INDEX IF NOT EXISTS idx_complement_groups_tenant ON public.complement_groups USING btree (tenant_id, order_index);
CREATE INDEX IF NOT EXISTS idx_complement_items_tenant_group ON public.complement_items USING btree (tenant_id, group_id, order_index);
CREATE INDEX IF NOT EXISTS idx_coupons_tenant_code ON public.coupons USING btree (tenant_id, code, active);
CREATE INDEX IF NOT EXISTS idx_orders_fifo_print_queue ON public.orders USING btree (tenant_id, print_status, created_date);
CREATE INDEX IF NOT EXISTS idx_orders_table_session ON public.orders USING btree (table_session_id);
CREATE INDEX IF NOT EXISTS idx_orders_tenant_date ON public.orders USING btree (tenant_id, created_date DESC);
CREATE INDEX IF NOT EXISTS idx_orders_tenant_phone ON public.orders USING btree (tenant_id, customer_phone);
CREATE INDEX IF NOT EXISTS idx_orders_tenant_status ON public.orders USING btree (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_tracking_token ON public.orders USING btree (id, tracking_token);
CREATE INDEX IF NOT EXISTS idx_product_comp_groups_tenant ON public.product_complement_groups USING btree (tenant_id, product_id);
CREATE INDEX IF NOT EXISTS idx_products_tenant_cat ON public.products USING btree (tenant_id, category_id, available);
CREATE INDEX IF NOT EXISTS idx_products_tenant_popular ON public.products USING btree (tenant_id, popular) WHERE (popular = true);
CREATE INDEX IF NOT EXISTS idx_restaurant_tables_status ON public.restaurant_tables USING btree (status);
CREATE INDEX IF NOT EXISTS idx_restaurant_tables_tenant ON public.restaurant_tables USING btree (tenant_id);
CREATE INDEX IF NOT EXISTS idx_shift_closings_tenant_date ON public.shift_closings USING btree (tenant_id, shift_date DESC);
CREATE INDEX IF NOT EXISTS idx_system_issues_created_at ON public.system_issues USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_system_issues_severity ON public.system_issues USING btree (severity);
CREATE INDEX IF NOT EXISTS idx_system_issues_status ON public.system_issues USING btree (status);
CREATE INDEX IF NOT EXISTS idx_system_issues_tenant_id ON public.system_issues USING btree (tenant_id);
CREATE INDEX IF NOT EXISTS idx_table_sessions_status ON public.table_sessions USING btree (status);
CREATE INDEX IF NOT EXISTS idx_table_sessions_table ON public.table_sessions USING btree (table_id);
CREATE INDEX IF NOT EXISTS idx_table_sessions_tenant ON public.table_sessions USING btree (tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_admins_tenant ON public.tenant_admins USING btree (tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_admins_user ON public.tenant_admins USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_tenants_custom_domain ON public.tenants USING btree (custom_domain) WHERE (custom_domain IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_tenants_slug ON public.tenants USING btree (slug);
CREATE INDEX IF NOT EXISTS idx_whatsapp_otp_lookup ON public.whatsapp_otp_codes USING btree (phone, verified, expires_at);

-- ---------------------------------------------------------------------
-- 5. TRIGGERS DE UPDATED_DATE
-- ---------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_update_date_tenants ON public.tenants;
CREATE TRIGGER trg_update_date_tenants
    BEFORE UPDATE ON public.tenants
    FOR EACH ROW
    EXECUTE FUNCTION handle_updated_date();
DROP TRIGGER IF EXISTS trg_update_date_admin_users ON public.admin_users;
CREATE TRIGGER trg_update_date_admin_users
    BEFORE UPDATE ON public.admin_users
    FOR EACH ROW
    EXECUTE FUNCTION handle_updated_date();
DROP TRIGGER IF EXISTS trg_update_date_categories ON public.categories;
CREATE TRIGGER trg_update_date_categories
    BEFORE UPDATE ON public.categories
    FOR EACH ROW
    EXECUTE FUNCTION handle_updated_date();
DROP TRIGGER IF EXISTS trg_update_date_products ON public.products;
CREATE TRIGGER trg_update_date_products
    BEFORE UPDATE ON public.products
    FOR EACH ROW
    EXECUTE FUNCTION handle_updated_date();
DROP TRIGGER IF EXISTS trg_update_date_product_additionals ON public.product_additionals;
CREATE TRIGGER trg_update_date_product_additionals
    BEFORE UPDATE ON public.product_additionals
    FOR EACH ROW
    EXECUTE FUNCTION handle_updated_date();
DROP TRIGGER IF EXISTS trg_update_date_complement_groups ON public.complement_groups;
CREATE TRIGGER trg_update_date_complement_groups
    BEFORE UPDATE ON public.complement_groups
    FOR EACH ROW
    EXECUTE FUNCTION handle_updated_date();
DROP TRIGGER IF EXISTS trg_update_date_complement_items ON public.complement_items;
CREATE TRIGGER trg_update_date_complement_items
    BEFORE UPDATE ON public.complement_items
    FOR EACH ROW
    EXECUTE FUNCTION handle_updated_date();
DROP TRIGGER IF EXISTS trg_update_date_coupons ON public.coupons;
CREATE TRIGGER trg_update_date_coupons
    BEFORE UPDATE ON public.coupons
    FOR EACH ROW
    EXECUTE FUNCTION handle_updated_date();
DROP TRIGGER IF EXISTS trg_update_date_coupon_usages ON public.coupon_usages;
CREATE TRIGGER trg_update_date_coupon_usages
    BEFORE UPDATE ON public.coupon_usages
    FOR EACH ROW
    EXECUTE FUNCTION handle_updated_date();
DROP TRIGGER IF EXISTS trg_update_date_customers ON public.customers;
CREATE TRIGGER trg_update_date_customers
    BEFORE UPDATE ON public.customers
    FOR EACH ROW
    EXECUTE FUNCTION handle_updated_date();
DROP TRIGGER IF EXISTS trg_update_date_user_addresses ON public.user_addresses;
CREATE TRIGGER trg_update_date_user_addresses
    BEFORE UPDATE ON public.user_addresses
    FOR EACH ROW
    EXECUTE FUNCTION handle_updated_date();
DROP TRIGGER IF EXISTS trg_update_date_orders ON public.orders;
CREATE TRIGGER trg_update_date_orders
    BEFORE UPDATE ON public.orders
    FOR EACH ROW
    EXECUTE FUNCTION handle_updated_date();
DROP TRIGGER IF EXISTS trg_update_date_order_items ON public.order_items;
CREATE TRIGGER trg_update_date_order_items
    BEFORE UPDATE ON public.order_items
    FOR EACH ROW
    EXECUTE FUNCTION handle_updated_date();
DROP TRIGGER IF EXISTS trg_update_date_order_item_additionals ON public.order_item_additionals;
CREATE TRIGGER trg_update_date_order_item_additionals
    BEFORE UPDATE ON public.order_item_additionals
    FOR EACH ROW
    EXECUTE FUNCTION handle_updated_date();
DROP TRIGGER IF EXISTS trg_update_date_banner_images ON public.banner_images;
CREATE TRIGGER trg_update_date_banner_images
    BEFORE UPDATE ON public.banner_images
    FOR EACH ROW
    EXECUTE FUNCTION handle_updated_date();
DROP TRIGGER IF EXISTS trg_update_date_banners ON public.banners;
CREATE TRIGGER trg_update_date_banners
    BEFORE UPDATE ON public.banners
    FOR EACH ROW
    EXECUTE FUNCTION handle_updated_date();

-- ---------------------------------------------------------------------
-- 6. TODAS AS FUNÇÕES E RPCS (31 FUNÇÕES)
-- ---------------------------------------------------------------------

-- Routine: close_table_session
CREATE OR REPLACE FUNCTION public.close_table_session(p_tenant_id uuid, p_session_id uuid, p_payment_method text DEFAULT 'money'::text, p_payment_details jsonb DEFAULT '[]'::jsonb, p_service_fee numeric DEFAULT 0, p_discount numeric DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_session RECORD;
  v_subtotal NUMERIC := 0;
  v_total NUMERIC := 0;
BEGIN
  SELECT * INTO v_session FROM public.table_sessions 
  WHERE id = p_session_id AND tenant_id = p_tenant_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sessão não encontrada');
  END IF;

  -- Calcula subtotal somando os pedidos da sessão
  SELECT COALESCE(SUM(total_amount), 0) INTO v_subtotal
  FROM public.orders 
  WHERE table_session_id = p_session_id AND status != 'cancelado';

  v_total := v_subtotal + COALESCE(p_service_fee, 0) - COALESCE(p_discount, 0);
  IF v_total < 0 THEN v_total := 0; END IF;

  -- Atualiza a sessão para fechada
  UPDATE public.table_sessions
  SET 
    subtotal = v_subtotal,
    service_fee = COALESCE(p_service_fee, 0),
    discount = COALESCE(p_discount, 0),
    total_amount = v_total,
    status = 'closed',
    closed_at = now(),
    payment_method = p_payment_method,
    payment_details = p_payment_details,
    updated_at = now()
  WHERE id = p_session_id;

  -- Libera a mesa física
  UPDATE public.restaurant_tables
  SET status = 'available', updated_at = now()
  WHERE id = v_session.table_id;

  -- Atualiza status de pedidos para entregue e pago
  UPDATE public.orders
  SET payment_status = 'paid', status = 'entregue'
  WHERE table_session_id = p_session_id AND status != 'cancelado';

  RETURN jsonb_build_object('success', true, 'total_amount', v_total);
END;
$function$
;

-- Routine: create_new_tenant
CREATE OR REPLACE FUNCTION public.create_new_tenant(p_name text, p_slug text, p_plan text DEFAULT 'basic'::text, p_admin_username text DEFAULT 'admin'::text, p_admin_password text DEFAULT NULL::text, p_primary_color text DEFAULT '#E11D48'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_tenant_id UUID := gen_random_uuid();
    v_clean_slug TEXT := LOWER(REGEXP_REPLACE(TRIM(p_slug), '[^a-zA-Z0-9\-]', '-', 'g'));
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
$function$
;

-- Routine: create_new_tenant
CREATE OR REPLACE FUNCTION public.create_new_tenant(p_name text, p_slug text, p_plan text DEFAULT 'basic'::text, p_admin_username text DEFAULT 'admin'::text, p_admin_password text DEFAULT 'admin123'::text, p_primary_color text DEFAULT '#E11D48'::text, p_admin_email text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_tenant_id UUID := gen_random_uuid();
    v_clean_slug TEXT := LOWER(REGEXP_REPLACE(TRIM(p_slug), '[^a-zA-Z0-9\-]', '-', 'g'));
    v_auth_user_id UUID := gen_random_uuid();
    v_admin_email TEXT;
    v_hashed_password TEXT;
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

    v_admin_email := COALESCE(
        NULLIF(LOWER(TRIM(p_admin_email)), ''),
        LOWER(TRIM(p_admin_username)) || '@' || v_clean_slug || '.delivery.internal'
    );

    IF EXISTS (SELECT 1 FROM auth.users WHERE email = v_admin_email) THEN
        RETURN jsonb_build_object('success', false, 'message', 'O e-mail ' || v_admin_email || ' já está em uso no sistema de autenticação.');
    END IF;

    -- 1. Inserir Tenant
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

    -- 6. Sincronizar em public.admin_users (SEM initial_password, com hash bcrypt)
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
        'admin_username', LOWER(TRIM(p_admin_username)),
        'admin_email', v_admin_email,
        'message', 'Restaurante criado com conta Supabase Auth ativa com sucesso!'
    );
END;
$function$
;

-- Routine: create_public_order
CREATE OR REPLACE FUNCTION public.create_public_order(p_tenant_id uuid, p_customer_name text, p_customer_phone text, p_delivery_type text, p_delivery_address text, p_payment_method text, p_items jsonb, p_coupon_code text DEFAULT NULL::text, p_notes text DEFAULT NULL::text, p_table_number text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
    SELECT id, name, is_active, delivery_fee, min_order_value, free_delivery_threshold
    INTO v_tenant
    FROM public.tenants
    WHERE id = p_tenant_id;

    IF NOT FOUND OR NOT v_tenant.is_active THEN
        RETURN jsonb_build_object('success', false, 'message', 'Restaurante indisponível no momento.');
    END IF;

    IF TRIM(COALESCE(p_customer_name, '')) = '' OR TRIM(COALESCE(p_customer_phone, '')) = '' THEN
        RETURN jsonb_build_object('success', false, 'message', 'Nome e telefone são obrigatórios.');
    END IF;

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

    IF v_tenant.min_order_value > 0 AND v_subtotal < v_tenant.min_order_value THEN
        RETURN jsonb_build_object('success', false, 'message', 'Valor mínimo do pedido é R$ ' || v_tenant.min_order_value);
    END IF;

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

    IF p_delivery_type = 'delivery' THEN
        IF v_tenant.free_delivery_threshold IS NOT NULL AND v_tenant.free_delivery_threshold > 0 AND v_subtotal >= v_tenant.free_delivery_threshold THEN
            v_delivery_fee := 0;
        ELSE
            v_delivery_fee := COALESCE(v_tenant.delivery_fee, 0);
        END IF;
    ELSE
        v_delivery_fee := 0;
    END IF;

    v_total := GREATEST(0, (v_subtotal + v_delivery_fee - v_discount));

    SELECT COALESCE(MAX(order_number), 0) + 1
    INTO v_order_number
    FROM public.orders
    WHERE tenant_id = p_tenant_id;

    v_order_id := 'ord_' || to_char(now(), 'YYYYMMDD') || '_' || lpad(v_order_number::text, 4, '0') || '_' || substr(gen_random_uuid()::text, 1, 6);

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
$function$
;

-- Routine: create_store_admin_user
CREATE OR REPLACE FUNCTION public.create_store_admin_user(p_tenant_id uuid, p_username text, p_password text, p_role text DEFAULT 'admin'::text, p_permissions jsonb DEFAULT '["*"]'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_tenant_slug TEXT;
    v_clean_username TEXT;
    v_email TEXT;
    v_user_id UUID;
    v_encrypted_pw TEXT;
    v_existing_id UUID;
BEGIN
    SELECT slug INTO v_tenant_slug
    FROM public.tenants
    WHERE id = p_tenant_id;

    IF v_tenant_slug IS NULL THEN
        RAISE EXCEPTION 'Restaurante não encontrado para o ID informado.';
    END IF;

    v_clean_username := LOWER(TRIM(p_username));
    IF LENGTH(v_clean_username) < 2 THEN
        RAISE EXCEPTION 'O nome de usuário deve ter pelo menos 2 caracteres.';
    END IF;

    IF LENGTH(p_password) < 4 THEN
        RAISE EXCEPTION 'A senha deve ter pelo menos 4 caracteres.';
    END IF;

    v_email := v_clean_username || '@' || LOWER(TRIM(v_tenant_slug)) || '.delivery.internal';

    SELECT id INTO v_existing_id
    FROM public.tenant_admins
    WHERE tenant_id = p_tenant_id AND LOWER(username) = v_clean_username;

    IF v_existing_id IS NOT NULL THEN
        RAISE EXCEPTION 'O usuário "%" já existe neste restaurante.', p_username;
    END IF;

    -- Criptografia com Blowfish (bcrypt)
    v_encrypted_pw := extensions.crypt(p_password, extensions.gen_salt('bf', 8));
    v_user_id := gen_random_uuid();

    INSERT INTO auth.users (
        instance_id,
        id,
        aud,
        role,
        email,
        encrypted_password,
        email_confirmed_at,
        raw_app_meta_data,
        raw_user_meta_data,
        confirmation_token,
        recovery_token,
        email_change_token_new,
        email_change,
        phone_change,
        phone_change_token,
        email_change_token_current,
        reauthentication_token,
        email_change_confirm_status,
        is_sso_user,
        is_anonymous,
        created_at,
        updated_at
    ) VALUES (
        '00000000-0000-0000-0000-000000000000'::uuid,
        v_user_id,
        'authenticated',
        'authenticated',
        v_email,
        v_encrypted_pw,
        now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        jsonb_build_object('username', p_username, 'tenant_id', p_tenant_id, 'tenant_slug', v_tenant_slug, 'email_verified', true),
        '', '', '', '', '', '', '', '', 0, false, false, now(), now()
    );

    INSERT INTO auth.identities (
        id,
        user_id,
        identity_data,
        provider,
        provider_id,
        last_sign_in_at,
        created_at,
        updated_at
    ) VALUES (
        gen_random_uuid(),
        v_user_id,
        jsonb_build_object('sub', v_user_id::text, 'email', v_email, 'email_verified', true, 'phone_verified', false),
        'email',
        v_user_id::text,
        now(),
        now(),
        now()
    );

    INSERT INTO public.tenant_admins (
        id,
        user_id,
        tenant_id,
        role,
        username,
        is_active,
        created_at,
        updated_at
    ) VALUES (
        gen_random_uuid(),
        v_user_id,
        p_tenant_id,
        p_role,
        p_username,
        true,
        now(),
        now()
    );

    -- Sincronizar na tabela public.admin_users com a senha criptografada (v_encrypted_pw)
    INSERT INTO public.admin_users (
        id,
        tenant_id,
        username,
        password,
        role,
        permissions,
        active,
        created_date,
        updated_date
    ) VALUES (
        v_user_id,
        p_tenant_id,
        p_username,
        v_encrypted_pw,
        p_role,
        p_permissions,
        true,
        now(),
        now()
    ) ON CONFLICT (id) DO UPDATE SET
        username = EXCLUDED.username,
        password = EXCLUDED.password,
        role = EXCLUDED.role,
        permissions = EXCLUDED.permissions,
        updated_date = now();

    RETURN jsonb_build_object(
        'success', true,
        'user_id', v_user_id,
        'email', v_email,
        'username', p_username,
        'tenant_slug', v_tenant_slug
    );
END;
$function$
;

-- Routine: delete_store_admin_user
CREATE OR REPLACE FUNCTION public.delete_store_admin_user(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'extensions', 'pg_temp'
AS $function$
BEGIN
    DELETE FROM public.tenant_admins WHERE user_id = p_user_id;
    DELETE FROM public.admin_users WHERE id = p_user_id;
    DELETE FROM auth.identities WHERE user_id = p_user_id;
    DELETE FROM auth.users WHERE id = p_user_id;

    RETURN jsonb_build_object('success', true);
END;
$function$
;

-- Routine: delete_tenant
CREATE OR REPLACE FUNCTION public.delete_tenant(p_tenant_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
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
$function$
;

-- Routine: generate_default_tables
CREATE OR REPLACE FUNCTION public.generate_default_tables(p_tenant_id uuid, p_count integer DEFAULT 10)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_i INT;
  v_created INT := 0;
BEGIN
  FOR v_i IN 1..p_count LOOP
    INSERT INTO public.restaurant_tables (tenant_id, table_number, label, capacity, status)
    VALUES (p_tenant_id, v_i::TEXT, 'Salão Principal', 4, 'available')
    ON CONFLICT (tenant_id, table_number) DO NOTHING;
    IF FOUND THEN
      v_created := v_created + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'created', v_created);
END;
$function$
;

-- Routine: get_auth_admin_role
CREATE OR REPLACE FUNCTION public.get_auth_admin_role()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
    SELECT role 
    FROM public.tenant_admins 
    WHERE user_id = auth.uid() AND is_active = true 
    LIMIT 1;
$function$
;

-- Routine: get_auth_tenant_id
CREATE OR REPLACE FUNCTION public.get_auth_tenant_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
    SELECT tenant_id 
    FROM public.tenant_admins 
    WHERE user_id = auth.uid() AND is_active = true 
    LIMIT 1;
$function$
;

-- Routine: get_clients_summary
CREATE OR REPLACE FUNCTION public.get_clients_summary(p_tenant_id uuid)
 RETURNS TABLE(id text, customer_phone text, customer_name text, customer_email text, last_address text, total_orders bigint, total_spent numeric, first_order_at timestamp with time zone, last_order_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$
;

-- Routine: get_master_tenants
CREATE OR REPLACE FUNCTION public.get_master_tenants()
 RETURNS TABLE(id uuid, code integer, slug text, name text, plan text, is_active boolean, logo_url text, created_date timestamp with time zone, total_orders bigint, total_revenue numeric, admin_username text, subscription_status text, monthly_price numeric, payment_link text, next_due_date date, phone text, email text, cpf_cnpj text, asaas_customer_id text, asaas_subscription_id text, custom_template text, salon_mode text, accepts_delivery boolean, accepts_takeaway boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$
;

-- Routine: get_order_by_tracking_token
CREATE OR REPLACE FUNCTION public.get_order_by_tracking_token(p_order_id text, p_tracking_token uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$
;

-- Routine: get_sales_metrics
CREATE OR REPLACE FUNCTION public.get_sales_metrics(p_tenant_id uuid, p_start_date timestamp with time zone DEFAULT NULL::timestamp with time zone, p_end_date timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$
;

-- Routine: get_store_admin_users
CREATE OR REPLACE FUNCTION public.get_store_admin_users()
 RETURNS TABLE(id uuid, tenant_id uuid, username text, role text, permissions jsonb, active boolean, created_date timestamp with time zone, updated_date timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_caller_tenant_id UUID := public.get_auth_tenant_id();
BEGIN
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
$function$
;

-- Routine: handle_updated_date
CREATE OR REPLACE FUNCTION public.handle_updated_date()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    NEW.updated_date = NOW();
    RETURN NEW;
END;
$function$
;

-- Routine: is_super_admin
CREATE OR REPLACE FUNCTION public.is_super_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
    SELECT EXISTS (
        SELECT 1 
        FROM public.tenant_admins 
        WHERE user_id = auth.uid() AND role = 'super_admin' AND is_active = true
    );
$function$
;

-- Routine: lookup_customer_by_phone
CREATE OR REPLACE FUNCTION public.lookup_customer_by_phone(p_phone text, p_tenant_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(customer_name text, customer_phone text, customer_email text, last_address text, total_orders bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_effective_tenant_id UUID;
    v_is_admin BOOLEAN := false;
BEGIN
    IF public.get_auth_tenant_id() IS NOT NULL OR public.is_super_admin() THEN
        v_effective_tenant_id := COALESCE(p_tenant_id, public.get_auth_tenant_id());
        v_is_admin := true;
    ELSE
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
$function$
;

-- Routine: open_table_session
CREATE OR REPLACE FUNCTION public.open_table_session(p_tenant_id uuid, p_table_id uuid, p_customer_name text DEFAULT NULL::text, p_customer_phone text DEFAULT NULL::text, p_people_count integer DEFAULT 1)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_table RECORD;
  v_session_id UUID;
  v_result JSONB;
BEGIN
  SELECT * INTO v_table FROM public.restaurant_tables 
  WHERE id = p_table_id AND tenant_id = p_tenant_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Mesa não encontrada');
  END IF;

  -- Cria nova sessão aberta
  INSERT INTO public.table_sessions (
    tenant_id, table_id, table_number, customer_name, customer_phone, people_count, status
  ) VALUES (
    p_tenant_id, p_table_id, v_table.table_number, p_customer_name, p_customer_phone, p_people_count, 'open'
  ) RETURNING id INTO v_session_id;

  -- Atualiza status da mesa para ocupada
  UPDATE public.restaurant_tables 
  SET status = 'occupied', updated_at = now()
  WHERE id = p_table_id;

  SELECT to_jsonb(s.*) INTO v_result 
  FROM public.table_sessions s WHERE s.id = v_session_id;

  RETURN jsonb_build_object('success', true, 'session', v_result);
END;
$function$
;

-- Routine: reopen_system_issue
CREATE OR REPLACE FUNCTION public.reopen_system_issue(p_issue_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
$function$
;

-- Routine: report_system_issue
CREATE OR REPLACE FUNCTION public.report_system_issue(p_title text, p_description text DEFAULT NULL::text, p_severity text DEFAULT 'urgent'::text, p_source text DEFAULT 'manual'::text, p_path text DEFAULT NULL::text, p_tenant_id uuid DEFAULT NULL::uuid, p_tenant_name text DEFAULT NULL::text, p_sentry_event_id text DEFAULT NULL::text, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
$function$
;

-- Routine: request_whatsapp_otp
CREATE OR REPLACE FUNCTION public.request_whatsapp_otp(p_phone text, p_full_name text DEFAULT ''::text, p_tenant_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
$function$
;

-- Routine: resolve_admin_login_email
CREATE OR REPLACE FUNCTION public.resolve_admin_login_email(p_username text, p_tenant_slug text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
    SELECT u.email::TEXT
    FROM auth.users u
    JOIN public.tenant_admins ta ON ta.user_id = u.id
    LEFT JOIN public.tenants t ON t.id = ta.tenant_id
    WHERE LOWER(ta.username) = LOWER(TRIM(p_username))
      AND ta.is_active = true
      AND (
          -- 1. Se identificador for 'superadmin' ou 'master', busca o SuperAdmin geral
          (LOWER(TRIM(COALESCE(p_tenant_slug, ''))) IN ('superadmin', 'master') AND ta.tenant_id IS NULL AND ta.role = 'super_admin')
          -- 2. Se for número ou slug, busca pelo código da loja (1, 2, 3...) ou pelo slug
          OR (
              LOWER(TRIM(COALESCE(p_tenant_slug, ''))) NOT IN ('superadmin', 'master') 
              AND p_tenant_slug IS NOT NULL 
              AND (LOWER(t.slug) = LOWER(TRIM(p_tenant_slug)) OR t.code::text = TRIM(p_tenant_slug))
          )
      )
    ORDER BY ta.created_at DESC
    LIMIT 1;
$function$
;

-- Routine: resolve_system_issue
CREATE OR REPLACE FUNCTION public.resolve_system_issue(p_issue_id uuid, p_resolved_by text DEFAULT 'SuperAdmin'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
$function$
;

-- Routine: toggle_tenant_status
CREATE OR REPLACE FUNCTION public.toggle_tenant_status(p_tenant_id uuid, p_is_active boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$
;

-- Routine: update_store_admin_user
CREATE OR REPLACE FUNCTION public.update_store_admin_user(p_user_id uuid, p_username text DEFAULT NULL::text, p_password text DEFAULT NULL::text, p_role text DEFAULT NULL::text, p_permissions jsonb DEFAULT NULL::jsonb, p_active boolean DEFAULT NULL::boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_hashed_pw TEXT;
BEGIN
    IF p_password IS NOT NULL AND LENGTH(TRIM(p_password)) >= 4 THEN
        v_hashed_pw := extensions.crypt(TRIM(p_password), extensions.gen_salt('bf', 8));
        
        UPDATE auth.users
        SET encrypted_password = v_hashed_pw,
            updated_at = now()
        WHERE id = p_user_id;

        UPDATE public.admin_users
        SET password = v_hashed_pw,
            updated_date = now()
        WHERE id = p_user_id;
    END IF;

    IF p_username IS NOT NULL AND LENGTH(TRIM(p_username)) >= 2 THEN
        UPDATE public.tenant_admins
        SET username = LOWER(TRIM(p_username)), updated_at = now()
        WHERE user_id = p_user_id;

        UPDATE public.admin_users
        SET username = LOWER(TRIM(p_username)), updated_date = now()
        WHERE id = p_user_id;
    END IF;

    IF p_role IS NOT NULL THEN
        UPDATE public.tenant_admins
        SET role = p_role, updated_at = now()
        WHERE user_id = p_user_id;

        UPDATE public.admin_users
        SET role = p_role, updated_date = now()
        WHERE id = p_user_id;
    END IF;

    IF p_active IS NOT NULL THEN
        UPDATE public.tenant_admins
        SET is_active = p_active, updated_at = now()
        WHERE user_id = p_user_id;

        UPDATE public.admin_users
        SET active = p_active, updated_date = now()
        WHERE id = p_user_id;
    END IF;

    IF p_permissions IS NOT NULL THEN
        UPDATE public.admin_users
        SET permissions = p_permissions, updated_date = now()
        WHERE id = p_user_id;
    END IF;

    RETURN jsonb_build_object('success', true);
END;
$function$
;

-- Routine: update_tenant_delivery_drivers
CREATE OR REPLACE FUNCTION public.update_tenant_delivery_drivers(p_tenant_id uuid, p_drivers jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  UPDATE tenants
  SET delivery_drivers = p_drivers,
      updated_date = now()
  WHERE id = p_tenant_id
  RETURNING delivery_drivers INTO v_result;

  RETURN jsonb_build_object('success', true, 'delivery_drivers', v_result);
END;
$function$
;

-- Routine: update_tenant_info
CREATE OR REPLACE FUNCTION public.update_tenant_info(p_tenant_id uuid, p_name text, p_slug text, p_plan text DEFAULT NULL::text, p_logo_url text DEFAULT NULL::text, p_admin_username text DEFAULT NULL::text, p_admin_password text DEFAULT NULL::text, p_custom_template text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'extensions', 'pg_temp'
AS $function$
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
$function$
;

-- Routine: update_tenant_payment_methods
CREATE OR REPLACE FUNCTION public.update_tenant_payment_methods(p_tenant_id uuid, p_payment_methods jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    UPDATE public.tenants
    SET 
        payment_methods = p_payment_methods,
        updated_date = NOW()
    WHERE id = p_tenant_id;

    RETURN jsonb_build_object(
        'success', true,
        'tenant_id', p_tenant_id,
        'payment_methods', p_payment_methods
    );
END;
$function$
;

-- Routine: update_tenant_settings
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
$function$
;

-- Routine: verify_whatsapp_otp
CREATE OR REPLACE FUNCTION public.verify_whatsapp_otp(p_phone text, p_code text, p_full_name text DEFAULT ''::text, p_tenant_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
$function$
;

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- 7. ROW LEVEL SECURITY (RLS) E POLICIES
-- ---------------------------------------------------------------------
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_additionals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.complement_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.complement_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_complement_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupon_usages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.table_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_item_additionals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shift_closings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.banner_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.banners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_otp_codes ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'admin_users' AND policyname = 'Block anon read admin_users'
    ) THEN
        CREATE POLICY "Block anon read admin_users" ON public.admin_users
    AS PERMISSIVE
    FOR SELECT
    TO anon
    USING (false)
;

    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'admin_users' AND policyname = 'Block anon write admin_users'
    ) THEN
        CREATE POLICY "Block anon write admin_users" ON public.admin_users
    AS PERMISSIVE
    FOR ALL
    TO anon
    USING (false)
    WITH CHECK (false)
;

    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'admin_users' AND policyname = 'Block public read admin_users'
    ) THEN
        CREATE POLICY "Block public read admin_users" ON public.admin_users
    AS PERMISSIVE
    FOR ALL
    TO anon
    USING (false)
    WITH CHECK (false)
;

    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'admin_users' AND policyname = 'Service role full access admin_users'
    ) THEN
        CREATE POLICY "Service role full access admin_users" ON public.admin_users
    AS PERMISSIVE
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true)
;

    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'admin_users' AND policyname = 'Service role full admin_users'
    ) THEN
        CREATE POLICY "Service role full admin_users" ON public.admin_users
    AS PERMISSIVE
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true)
;

    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'admin_users' AND policyname = 'Superadmin manage admin_users'
    ) THEN
        CREATE POLICY "Superadmin manage admin_users" ON public.admin_users
    AS PERMISSIVE
    FOR ALL
    TO authenticated
    USING ((is_super_admin() OR (tenant_id = get_auth_tenant_id())))
    WITH CHECK ((is_super_admin() OR (tenant_id = get_auth_tenant_id())))
;

    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'banner_images' AND policyname = 'Admin manage banner_images'
    ) THEN
        CREATE POLICY "Admin manage banner_images" ON public.banner_images
    AS PERMISSIVE
    FOR ALL
    TO authenticated
    USING (((tenant_id = get_auth_tenant_id()) OR is_super_admin()))
    WITH CHECK (((tenant_id = get_auth_tenant_id()) OR is_super_admin()))
;

    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'banner_images' AND policyname = 'Public read banner_images'
    ) THEN
        CREATE POLICY "Public read banner_images" ON public.banner_images
    AS PERMISSIVE
    FOR SELECT
    TO anon,authenticated
    USING ((active = true))
;

    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'banners' AND policyname = 'Admin manage banners'
    ) THEN
        CREATE POLICY "Admin manage banners" ON public.banners
    AS PERMISSIVE
    FOR ALL
    TO authenticated
    USING (((tenant_id = get_auth_tenant_id()) OR is_super_admin()))
    WITH CHECK (((tenant_id = get_auth_tenant_id()) OR is_super_admin()))
;

    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'banners' AND policyname = 'Public read banners'
    ) THEN
        CREATE POLICY "Public read banners" ON public.banners
    AS PERMISSIVE
    FOR SELECT
    TO anon,authenticated
    USING ((active = true))
;

    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'categories' AND policyname = 'Public and admin manage categories'
    ) THEN
        CREATE POLICY "Public and admin manage categories" ON public.categories
    AS PERMISSIVE
    FOR ALL
    TO anon,authenticated
    USING (true)
    WITH CHECK (true)
;

    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'complement_groups' AND policyname = 'Public and admin manage complement_groups'
    ) THEN
        CREATE POLICY "Public and admin manage complement_groups" ON public.complement_groups
    AS PERMISSIVE
    FOR ALL
    TO anon,authenticated
    USING (true)
    WITH CHECK (true)
;

    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'complement_groups' AND policyname = 'Public read active complement_groups'
    ) THEN
        CREATE POLICY "Public read active complement_groups" ON public.complement_groups
    AS PERMISSIVE
    FOR SELECT
    TO anon,authenticated
    USING ((active = true))
;

    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'complement_items' AND policyname = 'Public and admin manage complement_items'
    ) THEN
        CREATE POLICY "Public and admin manage complement_items" ON public.complement_items
    AS PERMISSIVE
    FOR ALL
    TO anon,authenticated
    USING (true)
    WITH CHECK (true)
;

    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'complement_items' AND policyname = 'Public read active complement_items'
    ) THEN
        CREATE POLICY "Public read active complement_items" ON public.complement_items
    AS PERMISSIVE
    FOR SELECT
    TO anon,authenticated
    USING ((active = true))
;

    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'coupon_usages' AND policyname = 'Admin view coupon_usages'
    ) THEN
        CREATE POLICY "Admin view coupon_usages" ON public.coupon_usages
    AS PERMISSIVE
    FOR SELECT
    TO authenticated
    USING (((tenant_id = get_auth_tenant_id()) OR is_super_admin()))
;

    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'coupon_usages' AND policyname = 'Anon insert coupon_usages'
    ) THEN
        CREATE POLICY "Anon insert coupon_usages" ON public.coupon_usages
    AS PERMISSIVE
    FOR INSERT
    TO anon,authenticated
    WITH CHECK (true)
;

    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'coupon_usages' AND policyname = 'Service role full coupon_usages'
    ) THEN
        CREATE POLICY "Service role full coupon_usages" ON public.coupon_usages
    AS PERMISSIVE
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true)
;

    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'coupons' AND policyname = 'Admin manage coupons'
    ) THEN
        CREATE POLICY "Admin manage coupons" ON public.coupons
    AS PERMISSIVE
    FOR ALL
    TO authenticated
    USING (((tenant_id = get_auth_tenant_id()) OR is_super_admin()))
    WITH CHECK (((tenant_id = get_auth_tenant_id()) OR is_super_admin()))
;

    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'coupons' AND policyname = 'Public read active coupons'
    ) THEN
        CREATE POLICY "Public read active coupons" ON public.coupons
    AS PERMISSIVE
    FOR SELECT
    TO anon,authenticated
    USING (((active = true) AND ((end_date IS NULL) OR (end_date >= now()))))
;

    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'customers' AND policyname = 'Admin manage tenant customers'
    ) THEN
        CREATE POLICY "Admin manage tenant customers" ON public.customers
    AS PERMISSIVE
    FOR ALL
    TO authenticated
    USING (((tenant_id = get_auth_tenant_id()) OR is_super_admin()))
    WITH CHECK (((tenant_id = get_auth_tenant_id()) OR is_super_admin()))
;

    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'customers' AND policyname = 'Admin view tenant customers'
    ) THEN
        CREATE POLICY "Admin view tenant customers" ON public.customers
    AS PERMISSIVE
    FOR SELECT
    TO authenticated
    USING (((tenant_id = get_auth_tenant_id()) OR is_super_admin()))
;

    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'customers' AND policyname = 'Service role full customers'
    ) THEN
        CREATE POLICY "Service role full customers" ON public.customers
    AS PERMISSIVE
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true)
;

    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'order_item_additionals' AND policyname = 'Admin manage order_item_additionals'
    ) THEN
        CREATE POLICY "Admin manage order_item_additionals" ON public.order_item_additionals
    AS PERMISSIVE
    FOR ALL
    TO authenticated
    USING ((EXISTS ( SELECT 1
   FROM order_items oi
  WHERE ((oi.id = order_item_additionals.order_item_id) AND ((oi.tenant_id = get_auth_tenant_id()) OR is_super_admin())))))
    WITH CHECK ((EXISTS ( SELECT 1
   FROM order_items oi
  WHERE ((oi.id = order_item_additionals.order_item_id) AND ((oi.tenant_id = get_auth_tenant_id()) OR is_super_admin())))))
;

    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'order_item_additionals' AND policyname = 'Service role full order_item_additionals'
    ) THEN
        CREATE POLICY "Service role full order_item_additionals" ON public.order_item_additionals
    AS PERMISSIVE
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true)
;

    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'order_items' AND policyname = 'Admin manage tenant order_items'
    ) THEN
        CREATE POLICY "Admin manage tenant order_items" ON public.order_items
    AS PERMISSIVE
    FOR ALL
    TO authenticated
    USING (((tenant_id = get_auth_tenant_id()) OR is_super_admin()))
    WITH CHECK (((tenant_id = get_auth_tenant_id()) OR is_super_admin()))
;

    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'order_items' AND policyname = 'Service role full order_items'
    ) THEN
        CREATE POLICY "Service role full order_items" ON public.order_items
    AS PERMISSIVE
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true)
;

    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'orders' AND policyname = 'Admin delete orders'
    ) THEN
        CREATE POLICY "Admin delete orders" ON public.orders
    AS PERMISSIVE
    FOR DELETE
    TO anon,authenticated
    USING (true)
;

    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'orders' AND policyname = 'Public and admin select orders'
    ) THEN
        CREATE POLICY "Public and admin select orders" ON public.orders
    AS PERMISSIVE
    FOR SELECT
    TO anon,authenticated
    USING (true)
;

    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'orders' AND policyname = 'Public and admin update orders'
    ) THEN
        CREATE POLICY "Public and admin update orders" ON public.orders
    AS PERMISSIVE
    FOR UPDATE
    TO anon,authenticated
    USING (true)
    WITH CHECK (true)
;

    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'orders' AND policyname = 'Public insert orders'
    ) THEN
        CREATE POLICY "Public insert orders" ON public.orders
    AS PERMISSIVE
    FOR INSERT
    TO anon,authenticated
    WITH CHECK (true)
;

    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'orders' AND policyname = 'Service role full orders'
    ) THEN
        CREATE POLICY "Service role full orders" ON public.orders
    AS PERMISSIVE
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true)
;

    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'product_additionals' AND policyname = 'Admin manage product_additionals'
    ) THEN
        CREATE POLICY "Admin manage product_additionals" ON public.product_additionals
    AS PERMISSIVE
    FOR ALL
    TO authenticated
    USING (((tenant_id = get_auth_tenant_id()) OR is_super_admin()))
    WITH CHECK (((tenant_id = get_auth_tenant_id()) OR is_super_admin()))
;

    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'product_additionals' AND policyname = 'Public and admin manage product additionals'
    ) THEN
        CREATE POLICY "Public and admin manage product additionals" ON public.product_additionals
    AS PERMISSIVE
    FOR ALL
    TO anon,authenticated
    USING (true)
    WITH CHECK (true)
;

    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'product_additionals' AND policyname = 'Public read active product_additionals'
    ) THEN
        CREATE POLICY "Public read active product_additionals" ON public.product_additionals
    AS PERMISSIVE
    FOR SELECT
    TO anon,authenticated
    USING ((active = true))
;

    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'product_complement_groups' AND policyname = 'Admin manage product_complement_groups'
    ) THEN
        CREATE POLICY "Admin manage product_complement_groups" ON public.product_complement_groups
    AS PERMISSIVE
    FOR ALL
    TO authenticated
    USING (((tenant_id = get_auth_tenant_id()) OR is_super_admin()))
    WITH CHECK (((tenant_id = get_auth_tenant_id()) OR is_super_admin()))
;

    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'product_complement_groups' AND policyname = 'Public read product_complement_groups'
    ) THEN
        CREATE POLICY "Public read product_complement_groups" ON public.product_complement_groups
    AS PERMISSIVE
    FOR SELECT
    TO anon,authenticated
    USING (true)
;

    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'products' AND policyname = 'Admin manage products'
    ) THEN
        CREATE POLICY "Admin manage products" ON public.products
    AS PERMISSIVE
    FOR ALL
    TO anon,authenticated
    USING (true)
    WITH CHECK (true)
;

    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'products' AND policyname = 'Public and admin select products'
    ) THEN
        CREATE POLICY "Public and admin select products" ON public.products
    AS PERMISSIVE
    FOR SELECT
    TO anon,authenticated
    USING (true)
;

    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'restaurant_tables' AND policyname = 'Admins can manage tables'
    ) THEN
        CREATE POLICY "Admins can manage tables" ON public.restaurant_tables
    AS PERMISSIVE
    FOR ALL
    TO public
    USING (true)
;

    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'restaurant_tables' AND policyname = 'Public can view tables'
    ) THEN
        CREATE POLICY "Public can view tables" ON public.restaurant_tables
    AS PERMISSIVE
    FOR SELECT
    TO public
    USING (true)
;

    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'shift_closings' AND policyname = 'allow_all_shift_closings_authenticated'
    ) THEN
        CREATE POLICY "allow_all_shift_closings_authenticated" ON public.shift_closings
    AS PERMISSIVE
    FOR ALL
    TO anon,authenticated,service_role
    USING (true)
    WITH CHECK (true)
;

    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'system_issues' AND policyname = 'Anyone can delete issues'
    ) THEN
        CREATE POLICY "Anyone can delete issues" ON public.system_issues
    AS PERMISSIVE
    FOR DELETE
    TO anon,authenticated
    USING (true)
;

    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'system_issues' AND policyname = 'Anyone can read issues'
    ) THEN
        CREATE POLICY "Anyone can read issues" ON public.system_issues
    AS PERMISSIVE
    FOR SELECT
    TO anon,authenticated
    USING (true)
;

    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'system_issues' AND policyname = 'Anyone can update issues'
    ) THEN
        CREATE POLICY "Anyone can update issues" ON public.system_issues
    AS PERMISSIVE
    FOR UPDATE
    TO anon,authenticated
    USING (true)
    WITH CHECK (true)
;

    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'system_issues' AND policyname = 'Public can report issues'
    ) THEN
        CREATE POLICY "Public can report issues" ON public.system_issues
    AS PERMISSIVE
    FOR INSERT
    TO anon,authenticated
    WITH CHECK (true)
;

    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'table_sessions' AND policyname = 'Admins can manage sessions'
    ) THEN
        CREATE POLICY "Admins can manage sessions" ON public.table_sessions
    AS PERMISSIVE
    FOR ALL
    TO public
    USING (true)
;

    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'table_sessions' AND policyname = 'Public can view sessions'
    ) THEN
        CREATE POLICY "Public can view sessions" ON public.table_sessions
    AS PERMISSIVE
    FOR SELECT
    TO public
    USING (true)
;

    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'tenant_admins' AND policyname = 'Admin view own membership'
    ) THEN
        CREATE POLICY "Admin view own membership" ON public.tenant_admins
    AS PERMISSIVE
    FOR SELECT
    TO authenticated
    USING (((user_id = auth.uid()) OR is_super_admin()))
;

    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'tenant_admins' AND policyname = 'Service role full tenant_admins'
    ) THEN
        CREATE POLICY "Service role full tenant_admins" ON public.tenant_admins
    AS PERMISSIVE
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true)
;

    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'tenant_admins' AND policyname = 'Superadmin manage tenant_admins'
    ) THEN
        CREATE POLICY "Superadmin manage tenant_admins" ON public.tenant_admins
    AS PERMISSIVE
    FOR ALL
    TO authenticated
    USING (is_super_admin())
    WITH CHECK (is_super_admin())
;

    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'tenants' AND policyname = 'Admin update own tenant'
    ) THEN
        CREATE POLICY "Admin update own tenant" ON public.tenants
    AS PERMISSIVE
    FOR UPDATE
    TO authenticated
    USING (((id = get_auth_tenant_id()) OR is_super_admin()))
    WITH CHECK (((id = get_auth_tenant_id()) OR is_super_admin()))
;

    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'tenants' AND policyname = 'Public read active tenants'
    ) THEN
        CREATE POLICY "Public read active tenants" ON public.tenants
    AS PERMISSIVE
    FOR SELECT
    TO anon,authenticated
    USING ((is_active = true))
;

    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'tenants' AND policyname = 'Service role full tenants'
    ) THEN
        CREATE POLICY "Service role full tenants" ON public.tenants
    AS PERMISSIVE
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true)
;

    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'tenants' AND policyname = 'Superadmin manage tenants'
    ) THEN
        CREATE POLICY "Superadmin manage tenants" ON public.tenants
    AS PERMISSIVE
    FOR ALL
    TO authenticated
    USING (is_super_admin())
    WITH CHECK (is_super_admin())
;

    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'user_addresses' AND policyname = 'Admin manage user_addresses'
    ) THEN
        CREATE POLICY "Admin manage user_addresses" ON public.user_addresses
    AS PERMISSIVE
    FOR ALL
    TO authenticated
    USING (((tenant_id = get_auth_tenant_id()) OR is_super_admin()))
    WITH CHECK (((tenant_id = get_auth_tenant_id()) OR is_super_admin()))
;

    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'user_addresses' AND policyname = 'Allow manage addresses'
    ) THEN
        CREATE POLICY "Allow manage addresses" ON public.user_addresses
    AS PERMISSIVE
    FOR ALL
    TO public
    USING (true)
    WITH CHECK (true)
;

    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'user_addresses' AND policyname = 'Anon insert user_addresses'
    ) THEN
        CREATE POLICY "Anon insert user_addresses" ON public.user_addresses
    AS PERMISSIVE
    FOR INSERT
    TO anon,authenticated
    WITH CHECK (true)
;

    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'user_addresses' AND policyname = 'Service role full user_addresses'
    ) THEN
        CREATE POLICY "Service role full user_addresses" ON public.user_addresses
    AS PERMISSIVE
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true)
;

    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'whatsapp_otp_codes' AND policyname = 'Service role full otp'
    ) THEN
        CREATE POLICY "Service role full otp" ON public.whatsapp_otp_codes
    AS PERMISSIVE
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true)
;

    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;

-- ---------------------------------------------------------------------
-- 8. PUBLICAÇÃO REALTIME
-- ---------------------------------------------------------------------
DO $$ BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.restaurant_tables;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.table_sessions;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.tenants;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;
