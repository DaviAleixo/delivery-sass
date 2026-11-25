-- Migration: Suporte a Cashback Vitalício (Sem expiração quando dias <= 0 ou NULL)
-- Data: 2026-11-25

CREATE OR REPLACE FUNCTION public.process_order_cashback(p_order_id text, p_action text DEFAULT 'all'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_order RECORD;
    v_tenant RECORD;
    v_clean_phone TEXT;
    v_wallet RECORD;
    v_wallet_id UUID;
    v_validity_days INTEGER;
    v_new_expires_at TIMESTAMPTZ;
    v_discount_used NUMERIC := 0.00;
    v_earned_amount NUMERIC := 0.00;
    v_debited_now NUMERIC := 0.00;
    v_credited_now NUMERIC := 0.00;
    v_tx_inserted UUID;
    v_has_reversal BOOLEAN := FALSE;
BEGIN
    SELECT id, tenant_id, customer_phone, customer_name, total, total_amount, subtotal,
           cashback_discount, cashback_earned, status, payment_status, pix_refund_status
    INTO v_order
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Pedido não encontrado.');
    END IF;

    IF public.is_authorized_for_tenant(v_order.tenant_id) IS NOT TRUE THEN
        RAISE EXCEPTION 'Acesso negado: Você não possui permissão para processar cashback deste pedido.';
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

    SELECT EXISTS (
        SELECT 1 FROM public.customer_cashback_transactions
        WHERE order_id = v_order.id AND type = 'reversal'
    ) INTO v_has_reversal;

    IF LOWER(COALESCE(v_order.status, '')) IN ('cancelado', 'reembolsado')
       OR LOWER(COALESCE(v_order.pix_refund_status, '')) IN ('refunded', 'refund_pending')
       OR LOWER(COALESCE(v_order.payment_status, '')) = 'refunded'
       OR v_has_reversal THEN
        RETURN jsonb_build_object(
            'success', false,
            'blocked_by_cancellation_or_refund', true,
            'credited_now', 0.00,
            'debited_now', 0.00,
            'message', 'Pedido cancelado ou estornado não pode receber crédito de cashback.'
        );
    END IF;

    -- Suporte a Cashback Vitalício (Sem expiração quando <= 0 ou NULL)
    v_validity_days := v_tenant.cashback_validity_days;
    IF v_validity_days IS NULL OR v_validity_days <= 0 THEN
        v_new_expires_at := NULL;
    ELSE
        v_new_expires_at := NOW() + (v_validity_days || ' days')::INTERVAL;
    END IF;

    v_discount_used := COALESCE(v_order.cashback_discount, 0.00);
    v_earned_amount := COALESCE(v_order.cashback_earned, 0.00);

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

    SELECT id, balance, expires_at
    INTO v_wallet
    FROM public.customer_cashback_wallets
    WHERE id = v_wallet_id
    FOR UPDATE;

    IF v_wallet.expires_at IS NOT NULL AND v_wallet.expires_at < NOW() AND COALESCE(v_wallet.balance, 0) > 0 THEN
        UPDATE public.customer_cashback_wallets
        SET balance = 0.00,
            updated_at = NOW()
        WHERE id = v_wallet_id;
    END IF;

    IF (p_action IN ('all', 'debit_only')) AND v_discount_used > 0 THEN
        v_tx_inserted := NULL;
        INSERT INTO public.customer_cashback_transactions (
            wallet_id, tenant_id, order_id, amount, type, description
        )
        VALUES (
            v_wallet_id, v_order.tenant_id, v_order.id, -v_discount_used, 'debit',
            'Abatimento no pedido #' || UPPER(SUBSTRING(v_order.id, 1, 6))
        )
        ON CONFLICT (order_id, type) WHERE order_id IS NOT NULL DO NOTHING
        RETURNING id INTO v_tx_inserted;

        IF v_tx_inserted IS NOT NULL THEN
            UPDATE public.customer_cashback_wallets
            SET balance = GREATEST(0, balance - v_discount_used),
                updated_at = NOW()
            WHERE id = v_wallet_id;
            v_debited_now := v_discount_used;
        END IF;
    END IF;

    IF (p_action IN ('all', 'credit_only')) AND v_earned_amount > 0 THEN
        v_tx_inserted := NULL;
        INSERT INTO public.customer_cashback_transactions (
            wallet_id, tenant_id, order_id, amount, type, description
        )
        VALUES (
            v_wallet_id, v_order.tenant_id, v_order.id, v_earned_amount, 'credit',
            'Cashback ganho no pedido #' || UPPER(SUBSTRING(v_order.id, 1, 6))
        )
        ON CONFLICT (order_id, type) WHERE order_id IS NOT NULL DO NOTHING
        RETURNING id INTO v_tx_inserted;

        IF v_tx_inserted IS NOT NULL THEN
            UPDATE public.customer_cashback_wallets
            SET balance = (CASE WHEN expires_at IS NOT NULL AND expires_at < NOW() THEN 0 ELSE balance END) + v_earned_amount,
                expires_at = v_new_expires_at,
                updated_at = NOW()
            WHERE id = v_wallet_id;
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
$function$;
