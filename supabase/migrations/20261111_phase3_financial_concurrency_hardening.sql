-- ============================================================================
-- Fase 3: Hardening de Concorrência Financeira & Máquina de Estados Atômica
-- 1. Unicidade no ledger de cashback (order_id, type) e coupon_usages (coupon_id, order_id)
-- 2. RPCs atômicas com FOR UPDATE para conciliação Mercado Pago (reconcile_mp_payment_atomic,
--    attach_mp_payment_atomic, finalize_mp_refund_atomic) bloqueando webhooks fora de ordem
--    e ressurreição de pedidos cancelados/estornados
-- 3. Blindagem transacional entre process_order_cashback e revert_order_cashback
-- ============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS uq_cashback_tx_order_type
ON public.customer_cashback_transactions (order_id, type)
WHERE order_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_coupon_usages_coupon_order
ON public.coupon_usages (coupon_id, order_id)
WHERE order_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 1. attach_mp_payment_atomic: vincula mp_payment_id sem sobrescrever paid/cancelado
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.attach_mp_payment_atomic(
    p_order_id text,
    p_mp_payment_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_order RECORD;
    v_next_status TEXT;
BEGIN
    SELECT id, status, payment_status, mp_payment_id, pix_refund_status
    INTO v_order
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Pedido não encontrado.', 'status_code', 404);
    END IF;

    IF v_order.status = 'cancelado'
       OR LOWER(COALESCE(v_order.payment_status, '')) IN ('paid', 'refunded')
       OR LOWER(COALESCE(v_order.pix_refund_status, '')) = 'refunded' THEN
        RETURN jsonb_build_object(
            'success', false,
            'already_terminal', true,
            'status', v_order.status,
            'payment_status', v_order.payment_status,
            'mp_payment_id', v_order.mp_payment_id,
            'status_code', 409
        );
    END IF;

    v_next_status := CASE
        WHEN v_order.status IN ('pendente', 'aguardando_pagamento') THEN 'aguardando_pagamento'
        ELSE v_order.status
    END;

    UPDATE public.orders
    SET mp_payment_id = COALESCE(NULLIF(v_order.mp_payment_id, ''), NULLIF(TRIM(p_mp_payment_id), '')),
        payment_status = CASE WHEN LOWER(COALESCE(v_order.payment_status, '')) IN ('paid', 'refunded') THEN v_order.payment_status ELSE 'pending' END,
        status = v_next_status,
        updated_date = NOW()
    WHERE id = p_order_id;

    RETURN jsonb_build_object(
        'success', true,
        'status', v_next_status,
        'payment_status', 'pending',
        'mp_payment_id', COALESCE(NULLIF(v_order.mp_payment_id, ''), NULLIF(TRIM(p_mp_payment_id), '')),
        'status_code', 200
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.attach_mp_payment_atomic(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.attach_mp_payment_atomic(text, text) TO service_role;

-- ----------------------------------------------------------------------------
-- 2. reconcile_mp_payment_atomic: transição monotônica sob FOR UPDATE
--    - Nunca desfaz cancelamento ('cancelado')
--    - Nunca rebaixa 'paid' / 'refunded' por webhook atrasado/fora de ordem
--    - Sinaliza 'refund_pending' se aprovação chegar após cancelamento
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reconcile_mp_payment_atomic(
    p_order_id text,
    p_mp_payment_id text,
    p_mp_status text,
    p_mp_status_detail text DEFAULT NULL,
    p_mp_external_ref text DEFAULT NULL,
    p_transaction_amount numeric DEFAULT NULL,
    p_auto_accept_delivery boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_order RECORD;
    v_norm_mp_status TEXT := LOWER(TRIM(COALESCE(p_mp_status, 'pending')));
    v_clean_mp_id TEXT := NULLIF(TRIM(COALESCE(p_mp_payment_id, '')), '');
    v_clean_ext_ref TEXT := NULLIF(TRIM(COALESCE(p_mp_external_ref, '')), '');
    v_expected_total NUMERIC;
    v_next_status TEXT;
    v_resolved_after_pix TEXT;
BEGIN
    SELECT id, tenant_id, total_amount, total, order_type, status, payment_status, mp_payment_id, pix_refund_status
    INTO v_order
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'status_code', 404,
            'status', 'order_not_found',
            'is_approved', false,
            'error', 'Pedido não encontrado.'
        );
    END IF;

    IF v_clean_ext_ref IS NOT NULL AND v_clean_ext_ref <> v_order.id THEN
        RETURN jsonb_build_object(
            'status_code', 422,
            'status', 'reference_mismatch',
            'is_approved', false,
            'error', 'Pagamento não pertence a este pedido.'
        );
    END IF;

    IF NULLIF(TRIM(COALESCE(v_order.mp_payment_id, '')), '') IS NOT NULL
       AND v_clean_mp_id IS NOT NULL
       AND v_order.mp_payment_id <> v_clean_mp_id THEN
        RETURN jsonb_build_object(
            'status_code', 422,
            'status', 'payment_mismatch',
            'is_approved', false,
            'error', 'Identificador de pagamento divergente do registrado no pedido.'
        );
    END IF;

    -- Aprovação financeira
    IF v_norm_mp_status = 'approved' THEN
        IF v_clean_ext_ref IS NULL THEN
            RETURN jsonb_build_object(
                'status_code', 422,
                'status', 'reference_missing',
                'is_approved', false,
                'error', 'Pagamento sem referência externa vinculada ao pedido.'
            );
        END IF;

        v_expected_total := COALESCE(v_order.total_amount, v_order.total, 0);
        IF COALESCE(p_transaction_amount, 0) < (v_expected_total - 0.05) THEN
            RETURN jsonb_build_object(
                'status_code', 422,
                'status', 'fraud_detected',
                'is_approved', false,
                'error', 'Valor pago no Mercado Pago é inferior ao valor do pedido.'
            );
        END IF;

        -- Webhook approved atrasado chegando após estorno já concluído: não reverter estorno
        IF LOWER(COALESCE(v_order.pix_refund_status, '')) = 'refunded'
           OR LOWER(COALESCE(v_order.payment_status, '')) = 'refunded' THEN
            RETURN jsonb_build_object(
                'status_code', 200,
                'status', 'refunded',
                'status_detail', p_mp_status_detail,
                'is_approved', false,
                'idempotent_replay', true,
                'stale_ignored', true,
                'resolved_order_status', v_order.status,
                'payment_status', v_order.payment_status
            );
        END IF;

        -- Pagamento aprovado enquanto/após pedido cancelado: jamais ressuscita pedido para cozinha/KDS
        IF v_order.status = 'cancelado' THEN
            UPDATE public.orders
            SET payment_status = 'paid',
                mp_payment_id = COALESCE(NULLIF(v_order.mp_payment_id, ''), v_clean_mp_id),
                pix_refund_status = CASE
                    WHEN LOWER(COALESCE(v_order.pix_refund_status, '')) IN ('refunded', 'refund_pending') THEN v_order.pix_refund_status
                    ELSE 'refund_pending'
                END,
                updated_date = NOW()
            WHERE id = v_order.id;

            RETURN jsonb_build_object(
                'status_code', 200,
                'status', 'approved',
                'status_detail', p_mp_status_detail,
                'is_approved', true,
                'cancelled_conflict', true,
                'refund_required', true,
                'resolved_order_status', 'cancelado',
                'payment_status', 'paid',
                'pix_refund_status', 'refund_pending'
            );
        END IF;

        -- Já estava pago e fora de aguardando_pagamento -> replay idempotente sem mutação
        IF LOWER(COALESCE(v_order.payment_status, '')) = 'paid' AND v_order.status <> 'aguardando_pagamento' THEN
            RETURN jsonb_build_object(
                'status_code', 200,
                'status', 'approved',
                'status_detail', p_mp_status_detail,
                'is_approved', true,
                'idempotent_replay', true,
                'resolved_order_status', v_order.status,
                'payment_status', 'paid'
            );
        END IF;

        v_resolved_after_pix := CASE
            WHEN COALESCE(p_auto_accept_delivery, false) AND COALESCE(v_order.order_type, 'delivery') = 'delivery'
            THEN 'confirmado'
            ELSE 'pendente'
        END;

        v_next_status := CASE
            WHEN v_order.status = 'aguardando_pagamento' THEN v_resolved_after_pix
            ELSE v_order.status
        END;

        UPDATE public.orders
        SET payment_status = 'paid',
            status = v_next_status,
            mp_payment_id = COALESCE(NULLIF(v_order.mp_payment_id, ''), v_clean_mp_id),
            updated_date = NOW()
        WHERE id = v_order.id;

        RETURN jsonb_build_object(
            'status_code', 200,
            'status', 'approved',
            'status_detail', p_mp_status_detail,
            'is_approved', true,
            'idempotent_replay', false,
            'resolved_order_status', v_next_status,
            'payment_status', 'paid'
        );
    END IF;

    -- Reembolso / chargeback vindo do MP
    IF v_norm_mp_status IN ('refunded', 'charged_back') THEN
        IF LOWER(COALESCE(v_order.pix_refund_status, '')) <> 'refunded'
           OR LOWER(COALESCE(v_order.payment_status, '')) <> 'refunded' THEN
            UPDATE public.orders
            SET pix_refund_status = 'refunded',
                payment_status = 'refunded',
                updated_date = NOW()
            WHERE id = v_order.id;
        END IF;

        RETURN jsonb_build_object(
            'status_code', 200,
            'status', v_norm_mp_status,
            'status_detail', p_mp_status_detail,
            'is_approved', false,
            'refunded', true,
            'resolved_order_status', v_order.status,
            'payment_status', 'refunded'
        );
    END IF;

    -- Webhooks fora de ordem (pending / in_process / rejected / cancelled) NÃO rebaixam pedido já pago ou estornado
    IF LOWER(COALESCE(v_order.payment_status, '')) IN ('paid', 'refunded')
       OR LOWER(COALESCE(v_order.pix_refund_status, '')) = 'refunded' THEN
        RETURN jsonb_build_object(
            'status_code', 200,
            'status', v_order.payment_status,
            'status_detail', p_mp_status_detail,
            'is_approved', LOWER(COALESCE(v_order.payment_status, '')) = 'paid',
            'stale_ignored', true,
            'resolved_order_status', v_order.status,
            'payment_status', v_order.payment_status
        );
    END IF;

    IF v_norm_mp_status IN ('rejected', 'cancelled') THEN
        UPDATE public.orders
        SET payment_status = 'failed',
            updated_date = NOW()
        WHERE id = v_order.id
          AND LOWER(COALESCE(payment_status, '')) NOT IN ('paid', 'refunded');
    END IF;

    RETURN jsonb_build_object(
        'status_code', 200,
        'status', v_norm_mp_status,
        'status_detail', p_mp_status_detail,
        'is_approved', false,
        'resolved_order_status', v_order.status
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.reconcile_mp_payment_atomic(text, text, text, text, text, numeric, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_mp_payment_atomic(text, text, text, text, text, numeric, boolean) TO service_role;

-- ----------------------------------------------------------------------------
-- 3. finalize_mp_refund_atomic: sincroniza estorno + payment_status sob FOR UPDATE
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.finalize_mp_refund_atomic(
    p_order_id text,
    p_refund_id text,
    p_refund_amount numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_order RECORD;
BEGIN
    SELECT id, pix_refund_status, pix_refund_id, pix_refund_amount, payment_status
    INTO v_order
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Pedido não encontrado.');
    END IF;

    IF LOWER(COALESCE(v_order.pix_refund_status, '')) = 'refunded' THEN
        RETURN jsonb_build_object(
            'success', true,
            'already_refunded', true,
            'refund_id', v_order.pix_refund_id,
            'amount', COALESCE(v_order.pix_refund_amount, p_refund_amount)
        );
    END IF;

    UPDATE public.orders
    SET pix_refund_status = 'refunded',
        payment_status = 'refunded',
        pix_refund_id = COALESCE(NULLIF(TRIM(p_refund_id), ''), v_order.pix_refund_id),
        pix_refund_amount = COALESCE(p_refund_amount, v_order.pix_refund_amount),
        updated_date = NOW()
    WHERE id = p_order_id;

    RETURN jsonb_build_object(
        'success', true,
        'already_refunded', false,
        'refund_id', p_refund_id,
        'amount', p_refund_amount
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.finalize_mp_refund_atomic(text, text, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_mp_refund_atomic(text, text, numeric) TO service_role;

-- ----------------------------------------------------------------------------
-- 4. process_order_cashback & revert_order_cashback: blindagem total contra
--    crédito em pedido cancelado/estornado e estorno fantasma de saldo
-- ----------------------------------------------------------------------------
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

    v_validity_days := COALESCE(v_tenant.cashback_validity_days, 15);
    v_new_expires_at := NOW() + (v_validity_days || ' days')::INTERVAL;
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

    -- Nunca ressuscitar saldo expirado ao movimentar a carteira
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

CREATE OR REPLACE FUNCTION public.revert_order_cashback(p_order_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_order RECORD;
    v_clean_phone TEXT;
    v_wallet RECORD;
    v_wallet_id UUID;
    v_discount_used NUMERIC := 0.00;
    v_earned_amount NUMERIC := 0.00;
    v_has_debit BOOLEAN := FALSE;
    v_has_credit BOOLEAN := FALSE;
    v_tx_inserted UUID;
    v_cashback_refunded NUMERIC := 0.00;
    v_cashback_reversed NUMERIC := 0.00;
BEGIN
    SELECT id, tenant_id, customer_phone, customer_name, cashback_discount, cashback_earned, coupon_code, status
    INTO v_order
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Pedido não encontrado.');
    END IF;

    IF public.is_authorized_for_tenant(v_order.tenant_id) IS NOT TRUE THEN
        RAISE EXCEPTION 'Acesso negado: Você não possui permissão para estornar cashback deste pedido.';
    END IF;

    IF v_order.coupon_code IS NOT NULL AND length(v_order.coupon_code) > 0 THEN
        DELETE FROM public.coupon_usages WHERE order_id = v_order.id;
    END IF;

    v_clean_phone := REGEXP_REPLACE(COALESCE(v_order.customer_phone, ''), '\D', '', 'g');
    IF length(v_clean_phone) < 8 THEN
        RETURN jsonb_build_object('success', true, 'message', 'Telefone do cliente não elegível.');
    END IF;

    v_discount_used := COALESCE(v_order.cashback_discount, 0.00);
    v_earned_amount := COALESCE(v_order.cashback_earned, 0.00);

    -- Garante carteira existente para poder gravar inclusive bloqueio preventivo ('reversal') se necessário
    INSERT INTO public.customer_cashback_wallets (
        tenant_id, phone, customer_name, balance, expires_at
    )
    VALUES (
        v_order.tenant_id, v_clean_phone, v_order.customer_name, 0.00, NOW() + INTERVAL '15 days'
    )
    ON CONFLICT (tenant_id, phone) DO NOTHING;

    SELECT id, balance, expires_at
    INTO v_wallet
    FROM public.customer_cashback_wallets
    WHERE tenant_id = v_order.tenant_id AND phone = v_clean_phone
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', true, 'message', 'Carteira não encontrada.');
    END IF;
    v_wallet_id := v_wallet.id;

    -- Só devolve cashback usado se houve de fato débito registrado para este pedido
    SELECT EXISTS (
        SELECT 1 FROM public.customer_cashback_transactions
        WHERE order_id = v_order.id AND type = 'debit'
    ) INTO v_has_debit;

    IF v_discount_used > 0 AND v_has_debit THEN
        v_tx_inserted := NULL;
        INSERT INTO public.customer_cashback_transactions (
            wallet_id, tenant_id, order_id, amount, type, description
        )
        VALUES (
            v_wallet_id, v_order.tenant_id, v_order.id, v_discount_used, 'refund',
            'Devolução de saldo por cancelamento do pedido #' || UPPER(SUBSTRING(v_order.id, 1, 6))
        )
        ON CONFLICT (order_id, type) WHERE order_id IS NOT NULL DO NOTHING
        RETURNING id INTO v_tx_inserted;

        IF v_tx_inserted IS NOT NULL THEN
            UPDATE public.customer_cashback_wallets
            SET balance = balance + v_discount_used,
                updated_at = NOW()
            WHERE id = v_wallet_id;
            v_cashback_refunded := v_discount_used;
        END IF;
    END IF;

    -- Só abate bônus se ele já foi creditado; se ainda não foi, grava reversal 0.00 para bloquear crédito concorrente/futuro
    SELECT EXISTS (
        SELECT 1 FROM public.customer_cashback_transactions
        WHERE order_id = v_order.id AND type = 'credit'
    ) INTO v_has_credit;

    IF v_earned_amount > 0 THEN
        v_tx_inserted := NULL;
        IF v_has_credit THEN
            INSERT INTO public.customer_cashback_transactions (
                wallet_id, tenant_id, order_id, amount, type, description
            )
            VALUES (
                v_wallet_id, v_order.tenant_id, v_order.id, -v_earned_amount, 'reversal',
                'Estorno de bônus por cancelamento do pedido #' || UPPER(SUBSTRING(v_order.id, 1, 6))
            )
            ON CONFLICT (order_id, type) WHERE order_id IS NOT NULL DO NOTHING
            RETURNING id INTO v_tx_inserted;

            IF v_tx_inserted IS NOT NULL THEN
                UPDATE public.customer_cashback_wallets
                SET balance = GREATEST(0, balance - v_earned_amount),
                    updated_at = NOW()
                WHERE id = v_wallet_id;
                v_cashback_reversed := v_earned_amount;
            END IF;
        ELSE
            INSERT INTO public.customer_cashback_transactions (
                wallet_id, tenant_id, order_id, amount, type, description
            )
            VALUES (
                v_wallet_id, v_order.tenant_id, v_order.id, 0.00, 'reversal',
                'Bloqueio preventivo de bônus por cancelamento/estorno #' || UPPER(SUBSTRING(v_order.id, 1, 6))
            )
            ON CONFLICT (order_id, type) WHERE order_id IS NOT NULL DO NOTHING;
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'cashback_refunded', v_cashback_refunded,
        'cashback_reversed', v_cashback_reversed
    );
END;
$function$;

