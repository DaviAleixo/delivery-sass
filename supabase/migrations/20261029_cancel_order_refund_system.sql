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

