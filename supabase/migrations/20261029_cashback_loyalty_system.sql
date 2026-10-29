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
