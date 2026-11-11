-- Order Idempotency Hardening:
-- 1. Serialize concurrent retries with same p_order_id via advisory lock
-- 2. Return existing order idempotently (before coupon/cashback/order_number side effects)
-- 3. Guard INSERT INTO public.orders with ON CONFLICT (id) DO NOTHING instead of throwing 23505

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
    v_add_price NUMERIC(10,2);
    v_verified_adds JSONB;
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
    v_table_rec RECORD;
    v_table_session_id UUID := NULL;
    v_clean_table_num TEXT := NULL;
    v_initial_status TEXT := 'pendente';
    v_payment_status TEXT := 'pending_delivery';
    v_neigh_item JSONB;
    v_matched_neigh BOOLEAN := FALSE;
    v_flavors JSONB;
    v_flavor JSONB;
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

    -- Idempotência por p_order_id (antes de consumir cupom/cashback/sequencial)
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

        IF v_flavors IS NOT NULL AND jsonb_typeof(v_flavors) = 'array' AND jsonb_array_length(v_flavors) > 0 AND v_size_key IS NOT NULL THEN
            v_flavor_sum := 0;
            v_flavor_max := 0;
            v_flavor_cnt := 0;
            FOR v_flavor IN SELECT * FROM jsonb_array_elements(v_flavors) LOOP
                SELECT COALESCE((p.pizza_prices->>v_size_key)::numeric, p.price, 0)
                INTO v_flavor_price
                FROM public.products p
                WHERE p.id = COALESCE(v_flavor->>'product_id', v_flavor->>'id') AND p.tenant_id = p_tenant_id;
                IF FOUND THEN
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
        IF v_item->'additionals' IS NOT NULL AND jsonb_typeof(v_item->'additionals') = 'array' THEN
            FOR v_add IN SELECT * FROM jsonb_array_elements(v_item->'additionals') LOOP
                v_add_price := NULL;

                IF NULLIF(v_add->>'id', '') IS NOT NULL THEN
                    SELECT ci.price INTO v_add_price
                    FROM public.complement_items ci
                    WHERE ci.id = v_add->>'id' AND ci.tenant_id = p_tenant_id AND ci.active = true
                    LIMIT 1;
                END IF;

                IF v_add_price IS NULL AND NULLIF(v_add->>'name', '') IS NOT NULL THEN
                    SELECT ci.price INTO v_add_price
                    FROM public.complement_items ci
                    WHERE ci.tenant_id = p_tenant_id AND LOWER(TRIM(ci.name)) = LOWER(TRIM(v_add->>'name')) AND ci.active = true
                    LIMIT 1;
                END IF;

                IF v_add_price IS NULL AND NULLIF(v_add->>'name', '') IS NOT NULL THEN
                    SELECT pa.price INTO v_add_price
                    FROM public.product_additionals pa
                    WHERE pa.tenant_id = p_tenant_id AND pa.product_id = v_db_product.id AND LOWER(TRIM(pa.name)) = LOWER(TRIM(v_add->>'name')) AND pa.active = true
                    LIMIT 1;
                END IF;

                v_add_price := GREATEST(0, COALESCE(v_add_price, 0));
                v_add_total := v_add_total + (v_add_price * GREATEST(1, COALESCE((v_add->>'quantity')::numeric, 1)));
                v_verified_adds := v_verified_adds || jsonb_build_object(
                    'id', v_add->>'id',
                    'name', COALESCE(v_add->>'name', 'Adicional'),
                    'price', v_add_price,
                    'quantity', GREATEST(1, COALESCE((v_add->>'quantity')::numeric, 1))
                );
            END LOOP;
        END IF;

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

