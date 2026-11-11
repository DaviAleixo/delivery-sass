-- Transações, Concorrência e Regras de Negócio:
-- 1. RPCs atômicas com FOR UPDATE para pagamento parcial e estorno em table_sessions (Tables.jsx Lost Update)
-- 2. Cancelamento automático de print_jobs pendentes/em impressão quando pedido muda para 'cancelado'
-- 3. Correção de cashback expirado em process_order_cashback + eliminação de lógica trivalente NULL em 6 RPCs
-- 4. Validações completas em create_public_order (horário/manual_store_open, payment_methods, pizza_flavors.available, grupos obrigatórios/min/max e vínculo adicional-produto)

-- ============================================================================
-- 1. Constraint + Trigger de Impressão para Cancelamento
-- ============================================================================
ALTER TABLE public.print_jobs DROP CONSTRAINT IF EXISTS print_jobs_status_check;
ALTER TABLE public.print_jobs
    ADD CONSTRAINT print_jobs_status_check
    CHECK (status = ANY (ARRAY['pending'::text, 'printing'::text, 'printed'::text, 'failed'::text, 'cancelled'::text]));

CREATE OR REPLACE FUNCTION public.fn_orders_sync_print_jobs()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_status TEXT := COALESCE(lower(NEW.status), 'pendente');
    v_order_type TEXT := COALESCE(lower(NEW.order_type), '');
    v_table_num TEXT := COALESCE(lower(NEW.table_number), '');
    v_channel TEXT := 'delivery';
    v_has_active_sectors BOOLEAN := false;
    v_sector RECORD;
    v_items JSONB := COALESCE(NEW.items, '[]'::jsonb);
    v_sector_items JSONB;
    v_item JSONB;
    v_item_sector_id UUID;
    v_allowed JSONB;
BEGIN
    IF v_status = 'cancelado' THEN
        UPDATE public.print_jobs
        SET status = 'cancelled',
            error_message = COALESCE(error_message, 'Pedido cancelado antes da impressão'),
            updated_date = NOW()
        WHERE order_id = NEW.id
          AND status IN ('pending', 'printing');
        RETURN NEW;
    END IF;

    IF v_status IN ('aguardando_pagamento', 'entregue') THEN
        RETURN NEW;
    END IF;

    IF TG_OP = 'INSERT' AND COALESCE(NEW.print_status, 'pending') = 'printed' THEN
        RETURN NEW;
    END IF;

    IF v_order_type IN ('pickup', 'balcao', 'takeaway') OR v_table_num LIKE '%balc%' THEN
        v_channel := 'pickup';
    ELSIF v_order_type IN ('dine_in', 'mesa') OR (v_table_num <> '' AND v_table_num NOT LIKE '%balc%') THEN
        v_channel := 'dine_in';
    ELSE
        v_channel := 'delivery';
    END IF;

    SELECT EXISTS (
        SELECT 1
        FROM public.production_sectors ps
        WHERE ps.tenant_id = NEW.tenant_id
          AND ps.is_active = true
          AND ps.operation_mode IN ('kds_and_print', 'print_only')
    ) INTO v_has_active_sectors;

    IF NOT v_has_active_sectors THEN
        INSERT INTO public.print_jobs (
            tenant_id, order_id, sector_id, sector_key, sector_name,
            printer_name, printer_type, paper_width, content_mode, copies,
            items_payload, status
        )
        VALUES (
            NEW.tenant_id, NEW.id, NULL, 'general', 'Geral',
            NULL, 'thermal_raw', '80mm', 'full_ticket', 1,
            v_items, 'pending'
        )
        ON CONFLICT (order_id, sector_key) DO NOTHING;

        RETURN NEW;
    END IF;

    FOR v_sector IN
        SELECT *
        FROM public.production_sectors ps
        WHERE ps.tenant_id = NEW.tenant_id
          AND ps.is_active = true
          AND ps.operation_mode IN ('kds_and_print', 'print_only')
        ORDER BY ps.order_index ASC, ps.created_date ASC
    LOOP
        v_allowed := COALESCE(v_sector.allowed_channels, '["delivery","pickup","dine_in"]'::jsonb);
        IF jsonb_typeof(v_allowed) = 'array' AND jsonb_array_length(v_allowed) > 0 THEN
            IF NOT (v_allowed ? v_channel) THEN
                CONTINUE;
            END IF;
        END IF;

        IF v_channel = 'delivery' AND COALESCE(v_sector.print_on_delivery, 'on_arrival') = 'on_accept' AND v_status = 'pendente' THEN
            CONTINUE;
        END IF;

        IF v_sector.content_mode IN ('full_ticket', 'short_receipt') THEN
            v_sector_items := v_items;
        ELSE
            v_sector_items := '[]'::jsonb;
            IF jsonb_typeof(v_items) = 'array' THEN
                FOR v_item IN SELECT * FROM jsonb_array_elements(v_items) LOOP
                    v_item_sector_id := NULL;
                    IF NULLIF(v_item->>'sector_id', '') IS NOT NULL THEN
                        BEGIN
                            v_item_sector_id := (v_item->>'sector_id')::uuid;
                        EXCEPTION WHEN OTHERS THEN
                            v_item_sector_id := NULL;
                        END;
                    END IF;

                    IF v_item_sector_id IS NULL AND NULLIF(v_item->>'product_id', '') IS NOT NULL THEN
                        SELECT COALESCE(p.sector_id, c.sector_id)
                        INTO v_item_sector_id
                        FROM public.products p
                        LEFT JOIN public.categories c ON c.id = COALESCE(NULLIF(v_item->>'category_id', ''), p.category_id, p.category)
                        WHERE p.id = v_item->>'product_id'
                        LIMIT 1;
                    END IF;

                    IF v_item_sector_id IS NULL AND NULLIF(v_item->>'category_id', '') IS NOT NULL THEN
                        SELECT c.sector_id INTO v_item_sector_id
                        FROM public.categories c
                        WHERE c.id = v_item->>'category_id'
                        LIMIT 1;
                    END IF;

                    IF v_item_sector_id = v_sector.id THEN
                        v_sector_items := v_sector_items || jsonb_build_array(v_item);
                    END IF;
                END LOOP;
            END IF;
        END IF;

        IF jsonb_typeof(v_sector_items) = 'array' AND jsonb_array_length(v_sector_items) > 0 THEN
            INSERT INTO public.print_jobs (
                tenant_id, order_id, sector_id, sector_key, sector_name,
                printer_name, printer_type, paper_width, content_mode, copies,
                items_payload, status
            )
            VALUES (
                NEW.tenant_id, NEW.id, v_sector.id, v_sector.id::text, v_sector.name,
                v_sector.printer_name, v_sector.printer_type, v_sector.paper_width, v_sector.content_mode,
                GREATEST(1, LEAST(5, COALESCE(v_sector.copies, 1))),
                v_sector_items, 'pending'
            )
            ON CONFLICT (order_id, sector_key) DO NOTHING;
        END IF;
    END LOOP;

    RETURN NEW;
END;
$function$;

-- ============================================================================
-- 2. Pagamento Parcial e Estorno Atômicos na Mesa (FOR UPDATE)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.add_table_session_partial_payment(
    p_session_id uuid,
    p_payment jsonb,
    p_service_fee_included boolean DEFAULT NULL,
    p_discount numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_session RECORD;
    v_details JSONB;
    v_payments JSONB;
    v_pay_id TEXT;
    v_exists BOOLEAN := FALSE;
    v_updated RECORD;
BEGIN
    SELECT *
    INTO v_session
    FROM public.table_sessions
    WHERE id = p_session_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Sessão da mesa não encontrada.');
    END IF;

    IF public.is_authorized_for_tenant(v_session.tenant_id) IS NOT TRUE THEN
        RAISE EXCEPTION 'Acesso negado para registrar pagamento nesta mesa.';
    END IF;

    IF v_session.status NOT IN ('open', 'bill_requested') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Esta comanda já foi encerrada.');
    END IF;

    IF p_payment IS NULL OR jsonb_typeof(p_payment) <> 'object' OR COALESCE((p_payment->>'amount')::numeric, 0) <= 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Dados de pagamento parcial inválidos.');
    END IF;

    v_details := CASE
        WHEN v_session.payment_details IS NOT NULL AND jsonb_typeof(v_session.payment_details) = 'object'
        THEN v_session.payment_details
        ELSE '{}'::jsonb
    END;

    v_payments := CASE
        WHEN v_details->'payments' IS NOT NULL AND jsonb_typeof(v_details->'payments') = 'array'
        THEN v_details->'payments'
        ELSE '[]'::jsonb
    END;

    v_pay_id := NULLIF(TRIM(COALESCE(p_payment->>'id', '')), '');
    IF v_pay_id IS NOT NULL THEN
        SELECT EXISTS (
            SELECT 1 FROM jsonb_array_elements(v_payments) elem
            WHERE elem->>'id' = v_pay_id
        ) INTO v_exists;
    END IF;

    IF NOT v_exists THEN
        v_payments := v_payments || jsonb_build_array(p_payment);
    END IF;

    v_details := jsonb_set(v_details, '{payments}', v_payments, true);
    IF p_service_fee_included IS NOT NULL THEN
        v_details := jsonb_set(v_details, '{service_fee_included}', to_jsonb(p_service_fee_included), true);
    END IF;
    IF p_discount IS NOT NULL THEN
        v_details := jsonb_set(v_details, '{discount}', to_jsonb(GREATEST(0, p_discount)), true);
    END IF;

    UPDATE public.table_sessions
    SET payment_details = v_details,
        updated_at = NOW()
    WHERE id = p_session_id
    RETURNING * INTO v_updated;

    RETURN jsonb_build_object(
        'success', true,
        'duplicate_ignored', v_exists,
        'session', to_jsonb(v_updated)
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.remove_table_session_partial_payment(
    p_session_id uuid,
    p_payment_id text,
    p_service_fee_included boolean DEFAULT NULL,
    p_discount numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_session RECORD;
    v_details JSONB;
    v_payments JSONB;
    v_filtered JSONB;
    v_updated RECORD;
BEGIN
    SELECT *
    INTO v_session
    FROM public.table_sessions
    WHERE id = p_session_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Sessão da mesa não encontrada.');
    END IF;

    IF public.is_authorized_for_tenant(v_session.tenant_id) IS NOT TRUE THEN
        RAISE EXCEPTION 'Acesso negado para estornar pagamento nesta mesa.';
    END IF;

    IF v_session.status NOT IN ('open', 'bill_requested') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Esta comanda já foi encerrada.');
    END IF;

    v_details := CASE
        WHEN v_session.payment_details IS NOT NULL AND jsonb_typeof(v_session.payment_details) = 'object'
        THEN v_session.payment_details
        ELSE '{}'::jsonb
    END;

    v_payments := CASE
        WHEN v_details->'payments' IS NOT NULL AND jsonb_typeof(v_details->'payments') = 'array'
        THEN v_details->'payments'
        ELSE '[]'::jsonb
    END;

    SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb)
    INTO v_filtered
    FROM jsonb_array_elements(v_payments) elem
    WHERE COALESCE(elem->>'id', '') <> COALESCE(p_payment_id, '');

    v_details := jsonb_set(v_details, '{payments}', v_filtered, true);
    IF p_service_fee_included IS NOT NULL THEN
        v_details := jsonb_set(v_details, '{service_fee_included}', to_jsonb(p_service_fee_included), true);
    END IF;
    IF p_discount IS NOT NULL THEN
        v_details := jsonb_set(v_details, '{discount}', to_jsonb(GREATEST(0, p_discount)), true);
    END IF;

    UPDATE public.table_sessions
    SET payment_details = v_details,
        updated_at = NOW()
    WHERE id = p_session_id
    RETURNING * INTO v_updated;

    RETURN jsonb_build_object(
        'success', true,
        'session', to_jsonb(v_updated)
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.add_table_session_partial_payment(uuid, jsonb, boolean, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_table_session_partial_payment(uuid, jsonb, boolean, numeric) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.remove_table_session_partial_payment(uuid, text, boolean, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remove_table_session_partial_payment(uuid, text, boolean, numeric) TO authenticated, service_role;

-- ============================================================================
-- 3. Correção de Cashback Expirado + Lógica Trivalente NULL em 6 RPCs
-- ============================================================================
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
    v_already_debited BOOLEAN := FALSE;
    v_already_credited BOOLEAN := FALSE;
    v_debited_now NUMERIC := 0.00;
    v_credited_now NUMERIC := 0.00;
BEGIN
    SELECT id, tenant_id, customer_phone, customer_name, total, total_amount, subtotal, cashback_discount, cashback_earned, status
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

    IF (p_action IN ('all', 'credit_only')) AND v_earned_amount > 0 THEN
        SELECT EXISTS (
            SELECT 1 FROM public.customer_cashback_transactions
            WHERE wallet_id = v_wallet_id AND order_id = v_order.id AND type = 'credit'
        ) INTO v_already_credited;

        IF NOT v_already_credited THEN
            UPDATE public.customer_cashback_wallets
            SET balance = (CASE WHEN expires_at IS NOT NULL AND expires_at < NOW() THEN 0 ELSE balance END) + v_earned_amount,
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
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Pedido não encontrado.');
    END IF;

    IF public.is_authorized_for_tenant(v_order.tenant_id) IS NOT TRUE THEN
        RAISE EXCEPTION 'Acesso negado: Você não possui permissão para estornar cashback deste pedido.';
    END IF;

    v_clean_phone := REGEXP_REPLACE(COALESCE(v_order.customer_phone, ''), '\D', '', 'g');
    IF length(v_clean_phone) < 8 THEN
        RETURN jsonb_build_object('success', true, 'message', 'Telefone do cliente não elegível.');
    END IF;

    SELECT id, balance, expires_at
    INTO v_wallet
    FROM public.customer_cashback_wallets
    WHERE tenant_id = v_order.tenant_id AND phone = v_clean_phone
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', true, 'message', 'Carteira não encontrada.');
    END IF;

    v_discount_used := COALESCE(v_order.cashback_discount, 0.00);
    v_earned_amount := COALESCE(v_order.cashback_earned, 0.00);

    SELECT EXISTS (
        SELECT 1 FROM public.customer_cashback_transactions
        WHERE wallet_id = v_wallet.id AND order_id = v_order.id AND type = 'refund'
    ) INTO v_already_refunded;

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

    SELECT EXISTS (
        SELECT 1 FROM public.customer_cashback_transactions
        WHERE wallet_id = v_wallet.id AND order_id = v_order.id AND type = 'reversal'
    ) INTO v_already_reversed;

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

    IF v_order.coupon_code IS NOT NULL AND length(v_order.coupon_code) > 0 THEN
        DELETE FROM public.coupon_usages WHERE order_id = v_order.id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'cashback_refunded', v_cashback_refunded,
        'cashback_reversed', v_cashback_reversed
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_tenant_settings(p_tenant_id uuid, p_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_updated_tenant JSONB;
BEGIN
    IF public.is_authorized_for_tenant(p_tenant_id) IS NOT TRUE THEN
        RAISE EXCEPTION 'Acesso negado: Sem permissão para alterar configurações desta loja.';
    END IF;

    UPDATE public.tenants
    SET 
        name = COALESCE(p_data->>'name', name),
        logo_url = CASE WHEN p_data ? 'logo_url' THEN p_data->>'logo_url' ELSE logo_url END,
        opening_time = COALESCE(p_data->>'opening_time', opening_time),
        closing_time = COALESCE(p_data->>'closing_time', closing_time),
        open_days = CASE WHEN p_data ? 'open_days' THEN p_data->'open_days' ELSE open_days END,
        delivery_time = CASE WHEN p_data ? 'delivery_time' THEN p_data->>'delivery_time' ELSE delivery_time END,
        salon_mode = CASE WHEN p_data ? 'salon_mode' THEN p_data->>'salon_mode' ELSE salon_mode END,
        auto_accept_delivery = CASE WHEN p_data ? 'auto_accept_delivery' THEN (p_data->>'auto_accept_delivery')::boolean ELSE auto_accept_delivery END,
        cashback_enabled = CASE WHEN p_data ? 'cashback_enabled' THEN (p_data->>'cashback_enabled')::boolean ELSE cashback_enabled END,
        cashback_rate = CASE WHEN p_data ? 'cashback_rate' THEN (p_data->>'cashback_rate')::numeric ELSE cashback_rate END,
        cashback_validity_days = CASE WHEN p_data ? 'cashback_validity_days' THEN (p_data->>'cashback_validity_days')::integer ELSE cashback_validity_days END,
        cashback_max_discount_percentage = CASE WHEN p_data ? 'cashback_max_discount_percentage' THEN (p_data->>'cashback_max_discount_percentage')::numeric ELSE cashback_max_discount_percentage END,
        manual_store_open = CASE 
            WHEN p_data ? 'manual_store_open' THEN 
                CASE WHEN (p_data->>'manual_store_open') IS NULL THEN NULL ELSE (p_data->>'manual_store_open')::boolean END
            ELSE manual_store_open 
        END,
        manual_override_date = CASE 
            WHEN p_data ? 'manual_override_date' THEN 
                CASE WHEN (p_data->>'manual_override_date') IS NULL THEN NULL ELSE p_data->>'manual_override_date' END
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
        accepts_dine_in = CASE WHEN p_data ? 'accepts_dine_in' THEN (p_data->>'accepts_dine_in')::boolean ELSE accepts_dine_in END,
        pizza_pricing_rule = COALESCE(p_data->>'pizza_pricing_rule', pizza_pricing_rule),
        table_service_fee_enabled = CASE WHEN p_data ? 'table_service_fee_enabled' THEN (p_data->>'table_service_fee_enabled')::boolean ELSE table_service_fee_enabled END,
        table_service_fee_rate = CASE WHEN p_data ? 'table_service_fee_rate' THEN (p_data->>'table_service_fee_rate')::numeric ELSE table_service_fee_rate END,
        updated_date = NOW()
    WHERE id = p_tenant_id;

    SELECT to_jsonb(t.*) INTO v_updated_tenant FROM public.tenants t WHERE t.id = p_tenant_id;
    RETURN v_updated_tenant;
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_store_admin_user(p_tenant_id uuid, p_username text, p_password text, p_role text DEFAULT 'admin'::text, p_permissions jsonb DEFAULT '["*"]'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'extensions', 'pg_temp'
AS $function$
DECLARE
    v_tenant_slug TEXT;
    v_clean_username TEXT;
    v_email TEXT;
    v_user_id UUID;
    v_encrypted_pw TEXT;
    v_existing_id UUID;
BEGIN
    IF NOT (
        public.is_super_admin() IS TRUE
        OR auth.role() = 'service_role'
        OR (public.is_authorized_for_tenant(p_tenant_id) IS TRUE AND COALESCE(public.get_auth_admin_role(), '') IN ('admin', 'super_admin'))
    ) THEN
        RAISE EXCEPTION 'Acesso negado: Apenas administradores da loja ou SuperAdmin podem criar usuários.';
    END IF;

    IF p_role = 'super_admin' AND public.is_super_admin() IS NOT TRUE THEN
        RAISE EXCEPTION 'Acesso negado: Apenas o SuperAdmin pode criar outro SuperAdmin.';
    END IF;

    SELECT slug INTO v_tenant_slug FROM public.tenants WHERE id = p_tenant_id;
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

    v_encrypted_pw := extensions.crypt(p_password, extensions.gen_salt('bf', 10));
    v_user_id := gen_random_uuid();

    INSERT INTO auth.users (
        instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data,
        confirmation_token, recovery_token, email_change_token_new, email_change,
        phone_change, phone_change_token, email_change_token_current, reauthentication_token,
        email_change_confirm_status, is_sso_user, is_anonymous, created_at, updated_at
    ) VALUES (
        '00000000-0000-0000-0000-000000000000'::uuid, v_user_id, 'authenticated', 'authenticated',
        v_email, v_encrypted_pw, now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        jsonb_build_object('username', p_username, 'tenant_id', p_tenant_id, 'tenant_slug', v_tenant_slug, 'email_verified', true),
        '', '', '', '', '', '', '', '', 0, false, false, now(), now()
    );

    INSERT INTO auth.identities (
        id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
    ) VALUES (
        gen_random_uuid(), v_user_id,
        jsonb_build_object('sub', v_user_id::text, 'email', v_email, 'email_verified', true, 'phone_verified', false),
        'email', v_user_id::text, now(), now(), now()
    );

    INSERT INTO public.tenant_admins (id, user_id, tenant_id, role, username, is_active, created_at, updated_at)
    VALUES (gen_random_uuid(), v_user_id, p_tenant_id, p_role, p_username, true, now(), now());

    INSERT INTO public.admin_users (id, tenant_id, username, password, role, permissions, active, created_date, updated_date)
    VALUES (v_user_id, p_tenant_id, p_username, v_encrypted_pw, p_role, p_permissions, true, now(), now())
    ON CONFLICT (id) DO UPDATE SET
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
$function$;

CREATE OR REPLACE FUNCTION public.update_store_admin_user(p_user_id uuid, p_username text DEFAULT NULL::text, p_password text DEFAULT NULL::text, p_role text DEFAULT NULL::text, p_permissions jsonb DEFAULT NULL::jsonb, p_active boolean DEFAULT NULL::boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'extensions', 'pg_temp'
AS $function$
DECLARE
    v_hashed_pw TEXT;
    v_target_tenant_id UUID;
BEGIN
    SELECT tenant_id INTO v_target_tenant_id FROM public.tenant_admins WHERE user_id = p_user_id LIMIT 1;
    IF v_target_tenant_id IS NULL THEN
        SELECT tenant_id INTO v_target_tenant_id FROM public.admin_users WHERE id = p_user_id LIMIT 1;
    END IF;

    IF NOT (
        public.is_super_admin() IS TRUE
        OR auth.role() = 'service_role'
        OR (v_target_tenant_id IS NOT NULL AND public.is_authorized_for_tenant(v_target_tenant_id) IS TRUE AND COALESCE(public.get_auth_admin_role(), '') IN ('admin', 'super_admin'))
    ) THEN
        RAISE EXCEPTION 'Acesso negado: Você não possui permissão para alterar este usuário.';
    END IF;

    IF p_role = 'super_admin' AND public.is_super_admin() IS NOT TRUE THEN
        RAISE EXCEPTION 'Acesso negado: Não é permitido promover para super_admin.';
    END IF;

    IF p_password IS NOT NULL AND LENGTH(TRIM(p_password)) >= 4 THEN
        v_hashed_pw := extensions.crypt(TRIM(p_password), extensions.gen_salt('bf', 10));
        UPDATE auth.users SET encrypted_password = v_hashed_pw, updated_at = now() WHERE id = p_user_id;
        UPDATE public.admin_users SET password = v_hashed_pw, updated_date = now() WHERE id = p_user_id;
    END IF;

    IF p_username IS NOT NULL AND LENGTH(TRIM(p_username)) >= 2 THEN
        UPDATE public.tenant_admins SET username = LOWER(TRIM(p_username)), updated_at = now() WHERE user_id = p_user_id;
        UPDATE public.admin_users SET username = LOWER(TRIM(p_username)), updated_date = now() WHERE id = p_user_id;
    END IF;

    IF p_role IS NOT NULL THEN
        UPDATE public.tenant_admins SET role = p_role, updated_at = now() WHERE user_id = p_user_id;
        UPDATE public.admin_users SET role = p_role, updated_date = now() WHERE id = p_user_id;
    END IF;

    IF p_active IS NOT NULL THEN
        UPDATE public.tenant_admins SET is_active = p_active, updated_at = now() WHERE user_id = p_user_id;
        UPDATE public.admin_users SET active = p_active, updated_date = now() WHERE id = p_user_id;
    END IF;

    IF p_permissions IS NOT NULL THEN
        UPDATE public.admin_users SET permissions = p_permissions, updated_date = now() WHERE id = p_user_id;
    END IF;

    RETURN jsonb_build_object('success', true);
END;
$function$;

CREATE OR REPLACE FUNCTION public.delete_store_admin_user(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'extensions', 'pg_temp'
AS $function$
DECLARE
    v_target_tenant_id UUID;
BEGIN
    SELECT tenant_id INTO v_target_tenant_id FROM public.tenant_admins WHERE user_id = p_user_id LIMIT 1;
    IF v_target_tenant_id IS NULL THEN
        SELECT tenant_id INTO v_target_tenant_id FROM public.admin_users WHERE id = p_user_id LIMIT 1;
    END IF;

    IF NOT (
        public.is_super_admin() IS TRUE
        OR auth.role() = 'service_role'
        OR (v_target_tenant_id IS NOT NULL AND public.is_authorized_for_tenant(v_target_tenant_id) IS TRUE AND COALESCE(public.get_auth_admin_role(), '') IN ('admin', 'super_admin'))
    ) THEN
        RAISE EXCEPTION 'Acesso negado: Você não possui permissão para excluir este usuário.';
    END IF;

    IF p_user_id = auth.uid() THEN
        RAISE EXCEPTION 'Não é possível excluir seu próprio usuário logado.';
    END IF;

    DELETE FROM public.tenant_admins WHERE user_id = p_user_id;
    DELETE FROM public.admin_users WHERE id = p_user_id;
    DELETE FROM auth.identities WHERE user_id = p_user_id;
    DELETE FROM auth.users WHERE id = p_user_id;

    RETURN jsonb_build_object('success', true);
END;
$function$;

-- ============================================================================
-- 4. create_public_order com validações completas de negócio & catálogo
-- ============================================================================
CREATE OR REPLACE FUNCTION public.create_public_order(
    p_tenant_id uuid,
    p_customer_name text,
    p_customer_phone text,
    p_delivery_type text,
    p_delivery_address text,
    p_payment_method text,
    p_items jsonb,
    p_coupon_code text DEFAULT NULL::text,
    p_notes text DEFAULT NULL::text,
    p_table_number text DEFAULT NULL::text,
    p_neighborhood text DEFAULT NULL::text,
    p_use_cashback boolean DEFAULT false,
    p_cashback_amount numeric DEFAULT NULL::numeric,
    p_card_brand text DEFAULT NULL::text,
    p_change_for text DEFAULT NULL::text,
    p_customer_email text DEFAULT NULL::text,
    p_order_id text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_tenant RECORD;
    v_order_id TEXT;
    v_requested_order_id TEXT;
    v_existing_order RECORD;
    v_order_number INT;
    v_tracking_token UUID := gen_random_uuid();
    v_subtotal NUMERIC(10,2) := 0;
    v_delivery_fee NUMERIC(10,2) := 0;
    v_discount NUMERIC(10,2) := 0;
    v_cashback_discount NUMERIC(10,2) := 0;
    v_cashback_earned NUMERIC(10,2) := 0;
    v_total NUMERIC(10,2) := 0;
    v_item JSONB;
    v_prod_id TEXT;
    v_qty NUMERIC(10,2);
    v_db_product RECORD;
    v_db_category RECORD;
    v_unit_price NUMERIC(10,2);
    v_add_total NUMERIC(10,2);
    v_add JSONB;
    v_add_qty NUMERIC(10,2);
    v_raw_add_id TEXT;
    v_clean_add_name TEXT;
    v_add_price NUMERIC(10,2);
    v_add_matched BOOLEAN;
    v_ci_rec RECORD;
    v_pa_rec RECORD;
    v_verified_adds JSONB;
    v_group_counts JSONB;
    v_grp_rec RECORD;
    v_grp_sel NUMERIC(10,2);
    v_grp_min INT;
    v_item_subtotal NUMERIC(10,2);
    v_verified_items JSONB := '[]'::jsonb;
    v_coupon RECORD;
    v_coupon_id TEXT := NULL;
    v_clean_phone TEXT := regexp_replace(COALESCE(p_customer_phone, ''), '\D', '', 'g');
    v_coupon_usages_count INT := 0;
    v_wallet RECORD;
    v_wallet_id UUID := NULL;
    v_after_coupon NUMERIC(10,2);
    v_max_cb_allowed NUMERIC(10,2);
    v_norm_type TEXT := LOWER(COALESCE(p_delivery_type, 'delivery'));
    v_is_dine_in BOOLEAN := FALSE;
    v_is_pickup BOOLEAN := FALSE;
    v_pm JSONB;
    v_norm_pm TEXT := LOWER(TRIM(COALESCE(p_payment_method, '')));
    v_table_rec RECORD;
    v_table_session_id UUID := NULL;
    v_clean_table_num TEXT := NULL;
    v_initial_status TEXT := 'pendente';
    v_payment_status TEXT := 'pending_delivery';
    v_neigh_item JSONB;
    v_matched_neigh BOOLEAN := FALSE;
    v_flavors JSONB;
    v_flavor JSONB;
    v_flavor_id TEXT;
    v_flavor_rec RECORD;
    v_flavor_prod_ids TEXT[];
    v_flavor_price NUMERIC(10,2);
    v_flavor_sum NUMERIC(10,2);
    v_flavor_max NUMERIC(10,2);
    v_flavor_cnt INT;
    v_size_key TEXT;
    v_resolved_sector_id UUID;
BEGIN
    SELECT *
    INTO v_tenant
    FROM public.tenants
    WHERE id = p_tenant_id;

    IF NOT FOUND OR NOT v_tenant.is_active THEN
        RETURN jsonb_build_object('success', false, 'message', 'Restaurante indisponível no momento.');
    END IF;

    IF COALESCE(v_tenant.salon_mode, 'full') = 'showcase' OR COALESCE(v_tenant.plan, '') = 'showcase' THEN
        RETURN jsonb_build_object('success', false, 'message', 'Este cardápio funciona apenas em modo vitrine e não recebe pedidos online.');
    END IF;

    IF COALESCE(v_tenant.manual_store_open, true) = false THEN
        RETURN jsonb_build_object('success', false, 'message', 'O restaurante está fechado no momento para novos pedidos.');
    END IF;

    v_is_dine_in := v_norm_type IN ('dine_in', 'mesa') OR (NULLIF(TRIM(COALESCE(p_table_number, '')), '') IS NOT NULL AND LOWER(TRIM(p_table_number)) NOT LIKE '%balc%');
    v_is_pickup := NOT v_is_dine_in AND v_norm_type IN ('pickup', 'balcao', 'takeaway');

    IF v_is_dine_in AND COALESCE(v_tenant.accepts_dine_in, true) = false THEN
        RETURN jsonb_build_object('success', false, 'message', 'Pedidos na mesa estão desativados para esta loja.');
    ELSIF v_is_pickup AND COALESCE(v_tenant.accepts_takeaway, true) = false THEN
        RETURN jsonb_build_object('success', false, 'message', 'Retirada no balcão está desativada para esta loja.');
    ELSIF NOT v_is_dine_in AND NOT v_is_pickup THEN
        IF COALESCE(v_tenant.salon_mode, 'full') = 'table_only' OR COALESCE(v_tenant.accepts_delivery, true) = false THEN
            RETURN jsonb_build_object('success', false, 'message', 'Delivery não está disponível para este estabelecimento.');
        END IF;
    END IF;

    IF NOT v_is_dine_in AND (TRIM(COALESCE(p_customer_name, '')) = '' OR LENGTH(v_clean_phone) < 8) THEN
        RETURN jsonb_build_object('success', false, 'message', 'Nome e telefone válidos são obrigatórios.');
    END IF;

    IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
        RETURN jsonb_build_object('success', false, 'message', 'O pedido deve conter pelo menos um item.');
    END IF;

    -- Idempotência por p_order_id (antes de validar estoque mutável, cupom ou cashback)
    v_requested_order_id := NULLIF(TRIM(COALESCE(p_order_id, '')), '');
    IF v_requested_order_id IS NOT NULL THEN
        IF LENGTH(v_requested_order_id) < 8 OR LENGTH(v_requested_order_id) > 128 THEN
            RETURN jsonb_build_object('success', false, 'message', 'Identificador de pedido inválido.');
        END IF;

        PERFORM pg_advisory_xact_lock(hashtext('order_idem_' || v_requested_order_id));

        SELECT * INTO v_existing_order
        FROM public.orders
        WHERE id = v_requested_order_id;

        IF FOUND THEN
            IF v_existing_order.tenant_id <> p_tenant_id OR (
                NOT (v_is_dine_in AND v_existing_order.order_type = 'dine_in')
                AND regexp_replace(COALESCE(v_existing_order.customer_phone, ''), '\D', '', 'g') <> v_clean_phone
            ) THEN
                RETURN jsonb_build_object('success', false, 'message', 'Conflito de identificador de pedido.');
            END IF;

            RETURN jsonb_build_object(
                'success', true,
                'idempotent_replay', true,
                'id', v_existing_order.id,
                'order_id', v_existing_order.id,
                'order_number', v_existing_order.order_number,
                'tracking_token', v_existing_order.tracking_token,
                'total', v_existing_order.total,
                'total_amount', v_existing_order.total_amount,
                'subtotal', v_existing_order.subtotal,
                'delivery_fee', v_existing_order.delivery_fee,
                'discount', v_existing_order.discount,
                'cashback_discount', v_existing_order.cashback_discount,
                'cashback_earned', v_existing_order.cashback_earned,
                'status', v_existing_order.status,
                'payment_status', v_existing_order.payment_status,
                'table_session_id', v_existing_order.table_session_id,
                'items', v_existing_order.items,
                'created_date', v_existing_order.created_date,
                'message', 'Pedido recuperado com idempotência!'
            );
        END IF;
    END IF;

    -- Validação de forma de pagamento aceita pela loja
    IF NOT v_is_dine_in THEN
        v_pm := COALESCE(v_tenant.payment_methods, '{}'::jsonb);

        IF v_norm_pm NOT IN ('pix', 'pix_manual', 'pix_online', 'dinheiro', 'cash', 'money', 'cartao_credito', 'cartao_debito', 'cartao', 'card_delivery', 'alimentacao', 'vale_alimentacao', 'caixa', 'comanda_mesa') THEN
            RETURN jsonb_build_object('success', false, 'message', 'Forma de pagamento inválida ou não suportada.');
        END IF;

        IF v_norm_pm = 'pix_online' THEN
            IF LOWER(COALESCE(v_pm->>'accept_online_mp', 'false')) <> 'true'
               OR NULLIF(TRIM(COALESCE(v_pm->>'mp_access_token', '')), '') IS NULL THEN
                RETURN jsonb_build_object('success', false, 'message', 'PIX Online não está habilitado para este estabelecimento.');
            END IF;
        ELSIF v_norm_pm IN ('pix', 'pix_manual') THEN
            IF (v_pm ? 'accept_pix_manual') AND LOWER(COALESCE(v_pm->>'accept_pix_manual', 'false')) <> 'true' THEN
                RETURN jsonb_build_object('success', false, 'message', 'PIX manual não está habilitado para este estabelecimento.');
            END IF;
        ELSIF v_norm_pm IN ('dinheiro', 'cash', 'money') THEN
            IF LOWER(COALESCE(v_pm->>'accept_cash', 'true')) = 'false' THEN
                RETURN jsonb_build_object('success', false, 'message', 'Pagamento em dinheiro está desativado nesta loja.');
            END IF;
        ELSIF v_norm_pm = 'cartao_credito' THEN
            IF (
                ((v_pm ? 'accept_card_credit') AND LOWER(COALESCE(v_pm->>'accept_card_credit', 'false')) <> 'true')
                OR (NOT (v_pm ? 'accept_card_credit') AND LOWER(COALESCE(v_pm->>'accept_card_delivery', 'true')) = 'false')
            ) THEN
                RETURN jsonb_build_object('success', false, 'message', 'Cartão de crédito está desativado nesta loja.');
            END IF;
        ELSIF v_norm_pm = 'cartao_debito' THEN
            IF (
                ((v_pm ? 'accept_card_debit') AND LOWER(COALESCE(v_pm->>'accept_card_debit', 'false')) <> 'true')
                OR (NOT (v_pm ? 'accept_card_debit') AND LOWER(COALESCE(v_pm->>'accept_card_delivery', 'true')) = 'false')
            ) THEN
                RETURN jsonb_build_object('success', false, 'message', 'Cartão de débito está desativado nesta loja.');
            END IF;
        ELSIF v_norm_pm IN ('cartao', 'card_delivery') THEN
            IF LOWER(COALESCE(v_pm->>'accept_card_delivery', 'true')) = 'false'
               AND LOWER(COALESCE(v_pm->>'accept_card_credit', 'false')) <> 'true'
               AND LOWER(COALESCE(v_pm->>'accept_card_debit', 'false')) <> 'true' THEN
                RETURN jsonb_build_object('success', false, 'message', 'Pagamento com cartão na entrega está desativado nesta loja.');
            END IF;
        ELSIF v_norm_pm IN ('alimentacao', 'vale_alimentacao') THEN
            IF LOWER(COALESCE(v_pm->>'accept_card_meal', 'false')) <> 'true' THEN
                RETURN jsonb_build_object('success', false, 'message', 'Vale alimentação está desativado nesta loja.');
            END IF;
        END IF;
    END IF;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_prod_id := v_item->>'product_id';
        v_qty := COALESCE((v_item->>'quantity')::numeric, 1);

        IF v_qty <= 0 OR v_qty > 200 THEN
            RETURN jsonb_build_object('success', false, 'message', 'Quantidade inválida para um dos itens.');
        END IF;

        SELECT id, name, price, available, category_id, category, pizza_prices, sector_id
        INTO v_db_product
        FROM public.products
        WHERE id = v_prod_id AND tenant_id = p_tenant_id;

        IF NOT FOUND THEN
            RETURN jsonb_build_object('success', false, 'message', 'Produto não encontrado no cardápio desta loja.');
        END IF;

        IF NOT v_db_product.available THEN
            RETURN jsonb_build_object('success', false, 'message', 'O item ' || v_db_product.name || ' não está disponível.');
        END IF;

        SELECT id, type, sector_id INTO v_db_category
        FROM public.categories
        WHERE id = COALESCE(v_db_product.category_id, v_db_product.category) AND tenant_id = p_tenant_id
        LIMIT 1;

        v_resolved_sector_id := COALESCE(v_db_product.sector_id, v_db_category.sector_id);
        v_unit_price := COALESCE(v_db_product.price, 0);

        v_size_key := NULLIF(TRIM(COALESCE(v_item->>'size_id', v_item->>'pizza_size_id', '')), '');
        v_flavors := v_item->'pizza_flavors';
        v_flavor_prod_ids := ARRAY[v_db_product.id];

        IF v_flavors IS NOT NULL AND jsonb_typeof(v_flavors) = 'array' AND jsonb_array_length(v_flavors) > 0 AND v_size_key IS NOT NULL THEN
            v_flavor_sum := 0;
            v_flavor_max := 0;
            v_flavor_cnt := 0;
            FOR v_flavor IN SELECT * FROM jsonb_array_elements(v_flavors) LOOP
                v_flavor_id := NULLIF(TRIM(COALESCE(v_flavor->>'product_id', v_flavor->>'id', '')), '');
                IF v_flavor_id IS NOT NULL THEN
                    SELECT p.id, p.name, p.available, COALESCE((p.pizza_prices->>v_size_key)::numeric, p.price, 0) AS f_price
                    INTO v_flavor_rec
                    FROM public.products p
                    WHERE p.id = v_flavor_id AND p.tenant_id = p_tenant_id;

                    IF NOT FOUND THEN
                        RETURN jsonb_build_object('success', false, 'message', 'Sabor de pizza não encontrado no cardápio desta loja.');
                    END IF;
                    IF NOT v_flavor_rec.available THEN
                        RETURN jsonb_build_object('success', false, 'message', 'O sabor ' || v_flavor_rec.name || ' não está disponível no momento.');
                    END IF;

                    v_flavor_price := v_flavor_rec.f_price;
                    v_flavor_prod_ids := array_append(v_flavor_prod_ids, v_flavor_rec.id);
                    v_flavor_sum := v_flavor_sum + v_flavor_price;
                    IF v_flavor_price > v_flavor_max THEN v_flavor_max := v_flavor_price; END IF;
                    v_flavor_cnt := v_flavor_cnt + 1;
                END IF;
            END LOOP;
            IF v_flavor_cnt > 0 THEN
                IF COALESCE(v_tenant.pizza_pricing_rule, 'highest_price') = 'average' THEN
                    v_unit_price := ROUND(v_flavor_sum / v_flavor_cnt, 2);
                ELSE
                    v_unit_price := v_flavor_max;
                END IF;
            END IF;
        ELSIF v_size_key IS NOT NULL AND v_db_product.pizza_prices IS NOT NULL AND (v_db_product.pizza_prices ? v_size_key) THEN
            v_unit_price := COALESCE((v_db_product.pizza_prices->>v_size_key)::numeric, v_unit_price);
        END IF;

        v_add_total := 0;
        v_verified_adds := '[]'::jsonb;
        v_group_counts := '{}'::jsonb;

        IF v_item->'additionals' IS NOT NULL AND jsonb_typeof(v_item->'additionals') = 'array' THEN
            FOR v_add IN SELECT * FROM jsonb_array_elements(v_item->'additionals') LOOP
                v_add_price := NULL;
                v_add_matched := FALSE;
                v_add_qty := GREATEST(1, COALESCE((v_add->>'quantity')::numeric, 1));
                v_raw_add_id := NULLIF(REGEXP_REPLACE(TRIM(COALESCE(v_add->>'id', '')), '-slot-\d+$', ''), '');
                v_clean_add_name := LOWER(TRIM(REGEXP_REPLACE(REGEXP_REPLACE(COALESCE(v_add->>'name', ''), '^\d+x\s+', '', 'i'), '\s*\((?:1/\d+|Metade)\)\s*$', '', 'i')));

                -- 1) Complemento vinculado a grupo ativo do produto ou de algum dos sabores da pizza
                IF v_raw_add_id IS NOT NULL THEN
                    SELECT ci.id, ci.name, ci.price, ci.group_id, ci.max_quantity
                    INTO v_ci_rec
                    FROM public.complement_items ci
                    JOIN public.complement_groups cg ON cg.id = ci.group_id AND cg.tenant_id = ci.tenant_id
                    JOIN public.product_complement_groups pcg ON pcg.group_id = cg.id AND pcg.tenant_id = ci.tenant_id
                    WHERE ci.id = v_raw_add_id
                      AND ci.tenant_id = p_tenant_id
                      AND ci.active = true
                      AND cg.active = true
                      AND pcg.product_id = ANY(v_flavor_prod_ids)
                    LIMIT 1;

                    IF FOUND THEN
                        IF COALESCE(v_ci_rec.max_quantity, 0) > 0 AND v_add_qty > v_ci_rec.max_quantity THEN
                            RETURN jsonb_build_object('success', false, 'message', 'Quantidade máxima excedida para o adicional ' || v_ci_rec.name || '.');
                        END IF;
                        v_add_price := v_ci_rec.price;
                        v_add_matched := TRUE;
                        v_group_counts := jsonb_set(
                            v_group_counts,
                            ARRAY[v_ci_rec.group_id],
                            to_jsonb(COALESCE((v_group_counts->>v_ci_rec.group_id)::numeric, 0) + v_add_qty),
                            true
                        );
                    END IF;
                END IF;

                IF NOT v_add_matched AND NULLIF(v_clean_add_name, '') IS NOT NULL THEN
                    SELECT ci.id, ci.name, ci.price, ci.group_id, ci.max_quantity
                    INTO v_ci_rec
                    FROM public.complement_items ci
                    JOIN public.complement_groups cg ON cg.id = ci.group_id AND cg.tenant_id = ci.tenant_id
                    JOIN public.product_complement_groups pcg ON pcg.group_id = cg.id AND pcg.tenant_id = ci.tenant_id
                    WHERE ci.tenant_id = p_tenant_id
                      AND ci.active = true
                      AND cg.active = true
                      AND pcg.product_id = ANY(v_flavor_prod_ids)
                      AND LOWER(TRIM(ci.name)) = v_clean_add_name
                    LIMIT 1;

                    IF FOUND THEN
                        IF COALESCE(v_ci_rec.max_quantity, 0) > 0 AND v_add_qty > v_ci_rec.max_quantity THEN
                            RETURN jsonb_build_object('success', false, 'message', 'Quantidade máxima excedida para o adicional ' || v_ci_rec.name || '.');
                        END IF;
                        v_add_price := v_ci_rec.price;
                        v_add_matched := TRUE;
                        v_group_counts := jsonb_set(
                            v_group_counts,
                            ARRAY[v_ci_rec.group_id],
                            to_jsonb(COALESCE((v_group_counts->>v_ci_rec.group_id)::numeric, 0) + v_add_qty),
                            true
                        );
                    END IF;
                END IF;

                -- 2) Fallback legado: product_additionals vinculado estritamente a este produto
                IF NOT v_add_matched THEN
                    SELECT pa.id, pa.name, pa.price, pa.max_quantity
                    INTO v_pa_rec
                    FROM public.product_additionals pa
                    WHERE pa.tenant_id = p_tenant_id
                      AND pa.product_id = v_db_product.id
                      AND pa.active = true
                      AND (
                          (v_raw_add_id IS NOT NULL AND pa.id = v_raw_add_id)
                          OR (NULLIF(v_clean_add_name, '') IS NOT NULL AND LOWER(TRIM(pa.name)) = v_clean_add_name)
                      )
                    LIMIT 1;

                    IF FOUND THEN
                        IF COALESCE(v_pa_rec.max_quantity, 0) > 0 AND v_add_qty > v_pa_rec.max_quantity THEN
                            RETURN jsonb_build_object('success', false, 'message', 'Quantidade máxima excedida para o adicional ' || v_pa_rec.name || '.');
                        END IF;
                        v_add_price := v_pa_rec.price;
                        v_add_matched := TRUE;
                    END IF;
                END IF;

                IF NOT v_add_matched THEN
                    RETURN jsonb_build_object('success', false, 'message', 'Adicional inválido, indisponível ou não pertence a este produto.');
                END IF;

                v_add_price := GREATEST(0, COALESCE(v_add_price, 0));
                v_add_total := v_add_total + (v_add_price * v_add_qty);
                v_verified_adds := v_verified_adds || jsonb_build_object(
                    'id', v_add->>'id',
                    'name', COALESCE(v_add->>'name', 'Adicional'),
                    'price', v_add_price,
                    'quantity', v_add_qty
                );
            END LOOP;
        END IF;

        -- Validação de complement_groups obrigatórios / min / max vinculados ao produto
        FOR v_grp_rec IN
            SELECT cg.id, cg.name, cg.required, cg.min_quantity, cg.max_quantity
            FROM public.product_complement_groups pcg
            JOIN public.complement_groups cg ON cg.id = pcg.group_id
            WHERE pcg.tenant_id = p_tenant_id
              AND pcg.product_id = v_db_product.id
              AND cg.active = true
        LOOP
            v_grp_sel := COALESCE((v_group_counts->>v_grp_rec.id)::numeric, 0);
            v_grp_min := CASE
                WHEN COALESCE(v_grp_rec.required, false) THEN GREATEST(1, COALESCE(v_grp_rec.min_quantity, 0))
                ELSE COALESCE(v_grp_rec.min_quantity, 0)
            END;

            IF v_grp_sel < v_grp_min THEN
                RETURN jsonb_build_object('success', false, 'message', 'Seleção obrigatória incompleta no grupo: ' || v_grp_rec.name);
            END IF;

            IF COALESCE(v_grp_rec.max_quantity, 0) > 0 AND v_grp_sel > v_grp_rec.max_quantity THEN
                RETURN jsonb_build_object('success', false, 'message', 'Quantidade máxima excedida no grupo: ' || v_grp_rec.name);
            END IF;
        END LOOP;

        v_item_subtotal := ROUND((v_unit_price + v_add_total) * v_qty, 2);
        v_subtotal := v_subtotal + v_item_subtotal;

        v_verified_items := v_verified_items || jsonb_build_object(
            'product_id', v_db_product.id,
            'product_name', COALESCE(NULLIF(v_item->>'product_name', ''), v_db_product.name),
            'product_price', v_unit_price,
            'category_id', COALESCE(v_db_product.category_id, v_db_product.category),
            'sector_id', v_resolved_sector_id,
            'quantity', v_qty,
            'subtotal', v_item_subtotal,
            'additionals', v_verified_adds,
            'notes', COALESCE(v_item->>'notes', '')
        );
    END LOOP;

    IF NOT v_is_dine_in AND NOT v_is_pickup THEN
        IF v_tenant.free_delivery_threshold IS NOT NULL AND v_tenant.free_delivery_threshold > 0 AND v_subtotal >= v_tenant.free_delivery_threshold THEN
            v_delivery_fee := 0;
        ELSIF COALESCE(v_tenant.delivery_fee_type, 'fixed') = 'neighborhood' AND NULLIF(TRIM(COALESCE(p_neighborhood, '')), '') IS NOT NULL THEN
            v_matched_neigh := FALSE;
            IF jsonb_typeof(v_tenant.delivery_neighborhoods) = 'array' THEN
                FOR v_neigh_item IN SELECT * FROM jsonb_array_elements(v_tenant.delivery_neighborhoods) LOOP
                    IF LOWER(TRIM(COALESCE(v_neigh_item->>'name', ''))) = LOWER(TRIM(p_neighborhood)) THEN
                        v_delivery_fee := GREATEST(0, COALESCE((v_neigh_item->>'fee')::numeric, 0));
                        v_matched_neigh := TRUE;
                        EXIT;
                    END IF;
                END LOOP;
            END IF;
            IF NOT v_matched_neigh THEN
                IF COALESCE(v_tenant.delivery_unlisted_policy, 'block') = 'block' THEN
                    RETURN jsonb_build_object('success', false, 'message', 'Bairro fora da área de entrega desta loja.');
                ELSE
                    v_delivery_fee := GREATEST(0, COALESCE(v_tenant.delivery_fallback_fee, v_tenant.delivery_fee, 0));
                END IF;
            END IF;
        ELSE
            v_delivery_fee := GREATEST(0, COALESCE(v_tenant.delivery_fee, 0));
        END IF;
    ELSE
        v_delivery_fee := 0;
    END IF;

    IF NOT v_is_dine_in AND p_coupon_code IS NOT NULL AND TRIM(p_coupon_code) <> '' THEN
        SELECT * INTO v_coupon
        FROM public.coupons
        WHERE tenant_id = p_tenant_id
          AND LOWER(code) = LOWER(TRIM(p_coupon_code))
          AND active = true
          AND (start_date IS NULL OR start_date <= now())
          AND (end_date IS NULL OR end_date >= now())
        FOR UPDATE;

        IF NOT FOUND THEN
            RETURN jsonb_build_object('success', false, 'message', 'Cupom inválido, expirado ou inativo.');
        END IF;

        v_coupon_id := v_coupon.id;

        IF v_coupon.usage_limit IS NOT NULL THEN
            SELECT COUNT(*) INTO v_coupon_usages_count
            FROM public.coupon_usages
            WHERE tenant_id = p_tenant_id AND coupon_id = v_coupon.id;

            IF v_coupon_usages_count >= v_coupon.usage_limit THEN
                RETURN jsonb_build_object('success', false, 'message', 'Este cupom atingiu o limite máximo de utilizações.');
            END IF;
        END IF;

        IF v_coupon.min_order_value IS NOT NULL AND (v_subtotal + v_delivery_fee) < v_coupon.min_order_value THEN
            RETURN jsonb_build_object('success', false, 'message', 'Pedido mínimo de R$ ' || v_coupon.min_order_value || ' necessário para este cupom.');
        END IF;

        IF v_coupon.discount_type = 'percentage' THEN
            v_discount := ROUND((v_subtotal * (v_coupon.discount_value / 100.0)), 2);
        ELSE
            v_discount := LEAST(v_coupon.discount_value, v_subtotal);
        END IF;
    END IF;

    IF NOT v_is_dine_in AND COALESCE(v_tenant.min_order_value, 0) > 0 AND (v_subtotal + v_delivery_fee - v_discount) < v_tenant.min_order_value THEN
        RETURN jsonb_build_object('success', false, 'message', 'Valor mínimo do pedido é R$ ' || v_tenant.min_order_value);
    END IF;

    v_after_coupon := GREATEST(0, v_subtotal + v_delivery_fee - v_discount);
    IF NOT v_is_dine_in AND COALESCE(v_tenant.cashback_enabled, false) = true AND LENGTH(v_clean_phone) >= 8 THEN
        IF p_use_cashback = true OR COALESCE(p_cashback_amount, 0) > 0 THEN
            SELECT * INTO v_wallet
            FROM public.customer_cashback_wallets
            WHERE tenant_id = p_tenant_id AND phone = v_clean_phone
            FOR UPDATE;

            IF FOUND AND v_wallet.balance > 0 AND (v_wallet.expires_at IS NULL OR v_wallet.expires_at >= NOW()) THEN
                v_wallet_id := v_wallet.id;
                v_max_cb_allowed := ROUND(v_after_coupon * (COALESCE(v_tenant.cashback_max_discount_percentage, 50.0) / 100.0), 2);
                v_cashback_discount := LEAST(v_wallet.balance, v_max_cb_allowed);
                IF p_cashback_amount IS NOT NULL AND p_cashback_amount > 0 THEN
                    v_cashback_discount := LEAST(v_cashback_discount, p_cashback_amount);
                END IF;
                v_cashback_discount := GREATEST(0, ROUND(v_cashback_discount, 2));
            END IF;
        END IF;

        v_total := GREATEST(0, v_after_coupon - v_cashback_discount);
        IF v_total > 0 AND COALESCE(v_tenant.cashback_rate, 0) > 0 THEN
            v_cashback_earned := ROUND(GREATEST(0, v_subtotal - v_discount - v_cashback_discount) * (v_tenant.cashback_rate / 100.0), 2);
        END IF;
    ELSE
        v_total := v_after_coupon;
    END IF;

    PERFORM pg_advisory_xact_lock(hashtext('order_num_' || p_tenant_id::text));
    SELECT COALESCE(MAX(order_number), 0) + 1
    INTO v_order_number
    FROM public.orders
    WHERE tenant_id = p_tenant_id;

    v_order_id := COALESCE(
        v_requested_order_id,
        'ord_' || to_char(now(), 'YYYYMMDD') || '_' || lpad(v_order_number::text, 4, '0') || '_' || substr(gen_random_uuid()::text, 1, 6)
    );

    IF v_is_dine_in THEN
        v_clean_table_num := REGEXP_REPLACE(TRIM(COALESCE(p_table_number, '')), '^Mesa\s*', '', 'i');
        SELECT * INTO v_table_rec
        FROM public.restaurant_tables
        WHERE tenant_id = p_tenant_id AND LOWER(table_number) = LOWER(v_clean_table_num)
        FOR UPDATE;

        IF FOUND THEN
            SELECT id INTO v_table_session_id
            FROM public.table_sessions
            WHERE table_id = v_table_rec.id AND tenant_id = p_tenant_id AND status IN ('open', 'bill_requested')
            LIMIT 1;

            IF v_table_session_id IS NULL THEN
                INSERT INTO public.table_sessions (
                    tenant_id, table_id, table_number, customer_name, customer_phone, people_count, status
                ) VALUES (
                    p_tenant_id, v_table_rec.id, v_table_rec.table_number, COALESCE(NULLIF(TRIM(p_customer_name), ''), 'Mesa ' || v_table_rec.table_number), v_clean_phone, 2, 'open'
                ) RETURNING id INTO v_table_session_id;

                UPDATE public.restaurant_tables SET status = 'occupied', updated_at = now() WHERE id = v_table_rec.id;
            END IF;
        END IF;
    END IF;

    IF LOWER(COALESCE(p_payment_method, '')) = 'pix_online' THEN
        v_initial_status := 'aguardando_pagamento';
        v_payment_status := 'pending';
    ELSIF v_is_dine_in THEN
        v_initial_status := 'confirmado';
        v_payment_status := 'pending_cashier';
    ELSIF COALESCE(v_tenant.auto_accept_delivery, false) = true AND NOT v_is_pickup THEN
        v_initial_status := 'confirmado';
        v_payment_status := 'pending_delivery';
    ELSE
        v_initial_status := 'pendente';
        v_payment_status := 'pending_delivery';
    END IF;

    INSERT INTO public.orders (
        id, tenant_id, order_number, tracking_token, customer_name, customer_phone, customer_email,
        customer_address, delivery_address, total_amount, total, subtotal, delivery_fee,
        discount_amount, discount, cashback_discount, cashback_earned,
        status, payment_status, payment_method, card_brand, change_for,
        order_type, table_number, table_session_id,
        notes, coupon_code, items, created_date, updated_date
    ) VALUES (
        v_order_id, p_tenant_id, v_order_number, v_tracking_token,
        COALESCE(NULLIF(TRIM(p_customer_name), ''), 'Mesa ' || COALESCE(v_clean_table_num, 'Salão')),
        COALESCE(v_clean_phone, ''), NULLIF(TRIM(COALESCE(p_customer_email, '')), ''),
        p_delivery_address, p_delivery_address, v_total, v_total, v_subtotal, v_delivery_fee,
        v_discount, v_discount, v_cashback_discount, v_cashback_earned,
        v_initial_status, v_payment_status, p_payment_method, p_card_brand,
        CASE WHEN NULLIF(REGEXP_REPLACE(COALESCE(p_change_for, ''), '[^0-9.]', '', 'g'), '') IS NOT NULL
             THEN REGEXP_REPLACE(p_change_for, '[^0-9.]', '', 'g')::numeric
             ELSE NULL END,
        CASE WHEN v_is_dine_in THEN 'dine_in' WHEN v_is_pickup THEN 'pickup' ELSE 'delivery' END,
        CASE WHEN v_is_pickup THEN 'Balcão' WHEN v_is_dine_in THEN COALESCE('Mesa ' || v_clean_table_num, p_table_number) ELSE NULL END,
        v_table_session_id,
        p_notes, CASE WHEN v_discount > 0 THEN UPPER(TRIM(p_coupon_code)) ELSE NULL END,
        v_verified_items, now(), now()
    )
    ON CONFLICT (id) DO NOTHING;

    IF NOT FOUND THEN
        SELECT * INTO v_existing_order FROM public.orders WHERE id = v_order_id;
        IF FOUND AND v_existing_order.tenant_id = p_tenant_id AND (
            (v_is_dine_in AND v_existing_order.order_type = 'dine_in')
            OR regexp_replace(COALESCE(v_existing_order.customer_phone, ''), '\D', '', 'g') = v_clean_phone
        ) THEN
            RETURN jsonb_build_object(
                'success', true,
                'idempotent_replay', true,
                'id', v_existing_order.id,
                'order_id', v_existing_order.id,
                'order_number', v_existing_order.order_number,
                'tracking_token', v_existing_order.tracking_token,
                'total', v_existing_order.total,
                'total_amount', v_existing_order.total_amount,
                'subtotal', v_existing_order.subtotal,
                'delivery_fee', v_existing_order.delivery_fee,
                'discount', v_existing_order.discount,
                'cashback_discount', v_existing_order.cashback_discount,
                'cashback_earned', v_existing_order.cashback_earned,
                'status', v_existing_order.status,
                'payment_status', v_existing_order.payment_status,
                'table_session_id', v_existing_order.table_session_id,
                'items', v_existing_order.items,
                'created_date', v_existing_order.created_date,
                'message', 'Pedido recuperado com idempotência!'
            );
        END IF;
        RETURN jsonb_build_object('success', false, 'message', 'Conflito ao registrar pedido.');
    END IF;

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

    IF v_discount > 0 AND v_coupon_id IS NOT NULL THEN
        INSERT INTO public.coupon_usages (id, tenant_id, coupon_id, user_email, order_id, created_date, updated_date)
        VALUES (
            gen_random_uuid()::text,
            p_tenant_id,
            v_coupon_id,
            COALESCE(NULLIF(TRIM(p_customer_email), '') || ' ', '') || '[phone:' || COALESCE(v_clean_phone, 'guest') || ']',
            v_order_id,
            now(),
            now()
        );
    END IF;

    IF v_cashback_discount > 0 AND v_wallet_id IS NOT NULL THEN
        UPDATE public.customer_cashback_wallets
        SET balance = GREATEST(0, balance - v_cashback_discount), updated_at = NOW()
        WHERE id = v_wallet_id;

        INSERT INTO public.customer_cashback_transactions (wallet_id, tenant_id, order_id, amount, type, description)
        VALUES (v_wallet_id, p_tenant_id, v_order_id, -v_cashback_discount, 'debit', 'Abatimento no pedido #' || UPPER(SUBSTRING(v_order_id, 1, 6)));
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'idempotent_replay', false,
        'id', v_order_id,
        'order_id', v_order_id,
        'order_number', v_order_number,
        'tracking_token', v_tracking_token,
        'total', v_total,
        'total_amount', v_total,
        'subtotal', v_subtotal,
        'delivery_fee', v_delivery_fee,
        'discount', v_discount,
        'cashback_discount', v_cashback_discount,
        'cashback_earned', v_cashback_earned,
        'status', v_initial_status,
        'payment_status', v_payment_status,
        'table_session_id', v_table_session_id,
        'items', v_verified_items,
        'created_date', now(),
        'message', 'Pedido criado com sucesso!'
    );
END;
$function$;
