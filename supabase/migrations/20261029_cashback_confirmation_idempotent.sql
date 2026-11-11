-- ==============================================================================
-- MIGRATION: 20261029_cashback_confirmation_idempotent.sql
-- Objetivo: Garantir idempotência total no processamento de cashback
-- Permite debitar saldo utilizado no checkout ('debit_only') e creditar novo
-- cashback no momento em que a loja confirma o pedido ('credit_only' no status 'confirmado'),
-- ou processar ambos de forma unificada ('all') sem duplicar transações.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.process_order_cashback(
    p_order_id TEXT,
    p_action TEXT DEFAULT 'all'
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
    v_already_debited BOOLEAN := FALSE;
    v_already_credited BOOLEAN := FALSE;
    v_debited_now NUMERIC := 0.00;
    v_credited_now NUMERIC := 0.00;
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

    -- Busca ou cria carteira do cliente vinculada à loja
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

    -- 1. Se usou cashback no pedido, debita da carteira de forma idempotente (se a ação permitir)
    IF (p_action IN ('all', 'debit_only')) AND v_discount_used > 0 THEN
        SELECT EXISTS (
            SELECT 1 FROM public.customer_cashback_transactions
            WHERE wallet_id = v_wallet_id AND order_id = v_order.id AND type = 'debit'
        ) INTO v_already_debited;

        IF NOT v_already_debited THEN
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
            v_debited_now := v_discount_used;
        END IF;
    END IF;

    -- 2. Se o pedido gerou cashback novo, credita na carteira e renova o prazo de forma idempotente (se a ação permitir)
    IF (p_action IN ('all', 'credit_only')) AND v_earned_amount > 0 THEN
        SELECT EXISTS (
            SELECT 1 FROM public.customer_cashback_transactions
            WHERE wallet_id = v_wallet_id AND order_id = v_order.id AND type = 'credit'
        ) INTO v_already_credited;

        IF NOT v_already_credited THEN
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
            v_credited_now := v_earned_amount;
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'wallet_id', v_wallet_id,
        'discount_applied', v_discount_used,
        'cashback_earned', v_earned_amount,
        'credited_now', v_credited_now,
        'debited_now', v_debited_now,
        'expires_at', v_new_expires_at
    );
END;
$$;

-- Suporte a chamadas antigas com 1 parâmetro e novas com 2 parâmetros
CREATE OR REPLACE FUNCTION public.process_order_cashback(
    p_order_id TEXT
)
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
AS $$
    SELECT public.process_order_cashback(p_order_id, 'all');
$$;

GRANT EXECUTE ON FUNCTION public.process_order_cashback(TEXT, TEXT) TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION public.process_order_cashback(TEXT) TO authenticated, service_role, anon;
