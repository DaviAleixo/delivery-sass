-- ==========================================================
-- ATUALIZACAO INCREMENTAL DE PRODUCAO (11/11/2026 a 13/11/2026)
-- ==========================================================


-- >>> MIGRATION: 20261111_db_structure_unique_order_number_and_advisors.sql
-- Estrutura do Banco PostgreSQL & Políticas RLS:
-- 1. Saneamento do único registro histórico duplicado de (tenant_id, order_number) e criação do índice UNIQUE
-- 2. Atualização explícita de delete_tenant cobrindo todas as novas tabelas filhas (preservando system_issues)
-- 3. Remoção dos 4 avisos de multiple_permissive_policies em tenants, tenant_admins e system_issues

-- ============================================================================
-- 1. Renumerar duplicata histórica em orders e criar UNIQUE (tenant_id, order_number)
-- ============================================================================
DO $$
DECLARE
    v_dup RECORD;
    v_next_num INT;
BEGIN
    -- Aproveita a lacuna #4 existente no tenant 'teste' caso o registro legado duplicado #3 ainda esteja presente
    IF EXISTS (
        SELECT 1 FROM public.orders
        WHERE id = '63df245d-82ca-4159-83e9-dc0064ad9cbf'
          AND tenant_id = '5489690b-a8dd-4f5e-bd75-de339521ac47'::uuid
          AND order_number = 3
    ) AND NOT EXISTS (
        SELECT 1 FROM public.orders
        WHERE tenant_id = '5489690b-a8dd-4f5e-bd75-de339521ac47'::uuid
          AND order_number = 4
    ) THEN
        UPDATE public.orders
        SET order_number = 4
        WHERE id = '63df245d-82ca-4159-83e9-dc0064ad9cbf';
    END IF;

    -- Fallback seguro para quaisquer outras eventuais duplicatas de (tenant_id, order_number)
    FOR v_dup IN
        SELECT id, tenant_id
        FROM (
            SELECT id,
                   tenant_id,
                   ROW_NUMBER() OVER (
                       PARTITION BY tenant_id, order_number
                       ORDER BY created_date ASC NULLS FIRST, id ASC
                   ) AS rn
            FROM public.orders
            WHERE order_number IS NOT NULL
        ) ranked
        WHERE rn > 1
    LOOP
        SELECT COALESCE(MAX(order_number), 0) + 1
        INTO v_next_num
        FROM public.orders
        WHERE tenant_id = v_dup.tenant_id;

        UPDATE public.orders
        SET order_number = v_next_num
        WHERE id = v_dup.id;
    END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_orders_tenant_order_number
    ON public.orders (tenant_id, order_number)
    WHERE order_number IS NOT NULL;

-- ============================================================================
-- 2. delete_tenant explícita e completa para todas as tabelas do SaaS
-- ============================================================================
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
    IF NOT (public.is_super_admin() IS TRUE OR auth.role() = 'service_role') THEN
        RAISE EXCEPTION 'Acesso negado: Apenas o SuperAdmin pode excluir estabelecimentos.';
    END IF;

    SELECT slug, name INTO v_slug, v_name
    FROM public.tenants
    WHERE id = p_tenant_id;

    IF v_slug IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Empresa não encontrada.');
    END IF;

    -- Coleta os IDs de contas Auth vinculadas ao tenant
    SELECT ARRAY(
        SELECT DISTINCT uid
        FROM (
            SELECT user_id AS uid FROM public.tenant_admins WHERE tenant_id = p_tenant_id AND user_id IS NOT NULL
            UNION
            SELECT id AS uid FROM public.admin_users WHERE tenant_id = p_tenant_id AND id IS NOT NULL
        ) sub
    ) INTO v_auth_user_ids;

    -- Exclusão explícita em ordem segura de dependências (system_issues preserva histórico via SET NULL)
    DELETE FROM public.print_jobs WHERE tenant_id = p_tenant_id;
    DELETE FROM public.customer_cashback_transactions WHERE tenant_id = p_tenant_id;
    DELETE FROM public.customer_cashback_wallets WHERE tenant_id = p_tenant_id;
    DELETE FROM public.customer_sessions WHERE tenant_id = p_tenant_id;
    DELETE FROM public.whatsapp_otp_codes WHERE tenant_id = p_tenant_id;
    DELETE FROM public.shift_closings WHERE tenant_id = p_tenant_id;
    DELETE FROM public.order_items WHERE tenant_id = p_tenant_id;
    DELETE FROM public.orders WHERE tenant_id = p_tenant_id;
    DELETE FROM public.table_sessions WHERE tenant_id = p_tenant_id;
    DELETE FROM public.restaurant_tables WHERE tenant_id = p_tenant_id;
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
    DELETE FROM public.production_sectors WHERE tenant_id = p_tenant_id;
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
$function$;

-- ============================================================================
-- 3. Eliminar os 4 avisos de multiple_permissive_policies (authenticated)
-- ============================================================================
DROP POLICY IF EXISTS tenants_manage_superadmin ON public.tenants;
CREATE POLICY tenants_insert_superadmin
    ON public.tenants FOR INSERT
    TO authenticated
    WITH CHECK (public.is_super_admin());
CREATE POLICY tenants_delete_superadmin
    ON public.tenants FOR DELETE
    TO authenticated
    USING (public.is_super_admin());

DROP POLICY IF EXISTS tenant_admins_manage_super ON public.tenant_admins;
CREATE POLICY tenant_admins_insert_super
    ON public.tenant_admins FOR INSERT
    TO authenticated
    WITH CHECK (public.is_super_admin());
CREATE POLICY tenant_admins_update_super
    ON public.tenant_admins FOR UPDATE
    TO authenticated
    USING (public.is_super_admin())
    WITH CHECK (public.is_super_admin());
CREATE POLICY tenant_admins_delete_super
    ON public.tenant_admins FOR DELETE
    TO authenticated
    USING (public.is_super_admin());

DROP POLICY IF EXISTS system_issues_superadmin_manage ON public.system_issues;
CREATE POLICY system_issues_superadmin_select
    ON public.system_issues FOR SELECT
    TO authenticated
    USING (public.is_super_admin());
CREATE POLICY system_issues_superadmin_update
    ON public.system_issues FOR UPDATE
    TO authenticated
    USING (public.is_super_admin())
    WITH CHECK (public.is_super_admin());
CREATE POLICY system_issues_superadmin_delete
    ON public.system_issues FOR DELETE
    TO authenticated
    USING (public.is_super_admin());



-- >>> MIGRATION: 20261111_fix_create_public_order_record_binding.sql
-- Fix PL/pgSQL record-not-assigned-yet (55000) in create_public_order when no coupon or no cashback wallet is used,
-- and revoke direct RPC execute from trigger functions.

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
        NULLIF(TRIM(p_order_id), ''),
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

REVOKE ALL ON FUNCTION public.fn_orders_assign_tenant_order_number() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_orders_auto_accept_delivery() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_orders_sync_print_jobs() FROM PUBLIC, anon, authenticated;



-- >>> MIGRATION: 20261111_fix_public_menu_anon_rls_policies.sql
-- Separate anon vs authenticated SELECT policies on public catalog/coupon/banner tables
-- so Postgres never evaluates get_auth_tenant_id() / is_super_admin() under anon role when active = false/null.

DROP POLICY IF EXISTS complement_groups_public_select ON public.complement_groups;
CREATE POLICY complement_groups_anon_select ON public.complement_groups
  FOR SELECT TO anon USING (active = true);
CREATE POLICY complement_groups_auth_select ON public.complement_groups
  FOR SELECT TO authenticated USING (active = true OR tenant_id = public.get_auth_tenant_id() OR public.is_super_admin());

DROP POLICY IF EXISTS complement_items_public_select ON public.complement_items;
CREATE POLICY complement_items_anon_select ON public.complement_items
  FOR SELECT TO anon USING (active = true);
CREATE POLICY complement_items_auth_select ON public.complement_items
  FOR SELECT TO authenticated USING (active = true OR tenant_id = public.get_auth_tenant_id() OR public.is_super_admin());

DROP POLICY IF EXISTS product_additionals_public_select ON public.product_additionals;
CREATE POLICY product_additionals_anon_select ON public.product_additionals
  FOR SELECT TO anon USING (active = true);
CREATE POLICY product_additionals_auth_select ON public.product_additionals
  FOR SELECT TO authenticated USING (active = true OR tenant_id = public.get_auth_tenant_id() OR public.is_super_admin());

DROP POLICY IF EXISTS banner_images_public_select ON public.banner_images;
CREATE POLICY banner_images_anon_select ON public.banner_images
  FOR SELECT TO anon USING (active = true);
CREATE POLICY banner_images_auth_select ON public.banner_images
  FOR SELECT TO authenticated USING (active = true OR tenant_id = public.get_auth_tenant_id() OR public.is_super_admin());

DROP POLICY IF EXISTS banners_public_select ON public.banners;
CREATE POLICY banners_anon_select ON public.banners
  FOR SELECT TO anon USING (active = true);
CREATE POLICY banners_auth_select ON public.banners
  FOR SELECT TO authenticated USING (active = true OR tenant_id = public.get_auth_tenant_id() OR public.is_super_admin());

DROP POLICY IF EXISTS coupons_public_select ON public.coupons;
CREATE POLICY coupons_anon_select ON public.coupons
  FOR SELECT TO anon USING (active = true AND (end_date IS NULL OR end_date >= now()));
CREATE POLICY coupons_auth_select ON public.coupons
  FOR SELECT TO authenticated USING ((active = true AND (end_date IS NULL OR end_date >= now())) OR tenant_id = public.get_auth_tenant_id() OR public.is_super_admin());



-- >>> MIGRATION: 20261111_fix_three_valued_null_auth_checks.sql
-- Cleanup temporary test address probe rows created while uncovering 3-valued NULL logic
DELETE FROM public.user_addresses WHERE street = 'Hack';

-- Strict boolean helper that NEVER returns NULL (prevents SQL 3-valued OR NULL bypass in IF NOT checks)
CREATE OR REPLACE FUNCTION public.is_authorized_for_tenant(p_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
    SELECT COALESCE(
        public.is_super_admin()
        OR auth.role() = 'service_role'
        OR (p_tenant_id IS NOT NULL AND public.get_auth_tenant_id() IS NOT NULL AND p_tenant_id = public.get_auth_tenant_id()),
        FALSE
    );
$function$;

REVOKE ALL ON FUNCTION public.is_authorized_for_tenant(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_authorized_for_tenant(uuid) TO authenticated, service_role;

-- Customer address & lookup functions (now with strict COALESCE(..., FALSE) and IS NOT TRUE)
CREATE OR REPLACE FUNCTION public.get_customer_addresses(
    p_tenant_id uuid,
    p_phone text,
    p_customer_token text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_clean_phone TEXT := regexp_replace(COALESCE(p_phone, ''), '\D', '', 'g');
    v_rows JSONB := '[]'::jsonb;
    v_is_authorized BOOLEAN := FALSE;
BEGIN
    IF LENGTH(v_clean_phone) < 8 THEN
        RETURN '[]'::jsonb;
    END IF;

    v_is_authorized := public.is_authorized_for_tenant(p_tenant_id)
        OR COALESCE(public.validate_customer_session_token(p_tenant_id, v_clean_phone, p_customer_token), FALSE);

    IF v_is_authorized IS NOT TRUE THEN
        RETURN '[]'::jsonb;
    END IF;

    SELECT COALESCE(jsonb_agg(to_jsonb(a) ORDER BY a.is_default DESC, a.created_date DESC), '[]'::jsonb)
    INTO v_rows
    FROM public.user_addresses a
    WHERE a.tenant_id = p_tenant_id
      AND regexp_replace(COALESCE(a.user_phone, ''), '\D', '', 'g') = v_clean_phone;

    RETURN v_rows;
END;
$function$;

CREATE OR REPLACE FUNCTION public.save_customer_address(
    p_tenant_id uuid,
    p_phone text,
    p_data jsonb,
    p_customer_token text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_clean_phone TEXT := regexp_replace(COALESCE(p_phone, ''), '\D', '', 'g');
    v_id TEXT := COALESCE(NULLIF(p_data->>'id', ''), gen_random_uuid()::text);
    v_saved JSONB;
    v_is_authorized BOOLEAN := FALSE;
BEGIN
    IF LENGTH(v_clean_phone) < 8 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Telefone inválido.');
    END IF;

    v_is_authorized := public.is_authorized_for_tenant(p_tenant_id)
        OR COALESCE(public.validate_customer_session_token(p_tenant_id, v_clean_phone, p_customer_token), FALSE);

    IF v_is_authorized IS NOT TRUE THEN
        RETURN jsonb_build_object('success', false, 'error', 'Autenticação WhatsApp necessária para gerenciar endereços.');
    END IF;

    IF EXISTS (SELECT 1 FROM public.user_addresses WHERE id = v_id AND tenant_id = p_tenant_id AND regexp_replace(COALESCE(user_phone, ''), '\D', '', 'g') = v_clean_phone) THEN
        UPDATE public.user_addresses
        SET name = COALESCE(p_data->>'name', name),
            cep = COALESCE(p_data->>'cep', cep),
            street = COALESCE(p_data->>'street', street),
            number = COALESCE(p_data->>'number', number),
            complement = p_data->>'complement',
            neighborhood = COALESCE(p_data->>'neighborhood', neighborhood),
            city = COALESCE(p_data->>'city', city),
            state = COALESCE(p_data->>'state', state),
            reference = p_data->>'reference',
            is_default = COALESCE((p_data->>'is_default')::boolean, is_default),
            updated_date = NOW()
        WHERE id = v_id
        RETURNING to_jsonb(user_addresses.*) INTO v_saved;
    ELSE
        INSERT INTO public.user_addresses (
            id, tenant_id, user_phone, user_email, name, cep, street, number, complement, neighborhood, city, state, reference, is_default
        ) VALUES (
            v_id, p_tenant_id, v_clean_phone, p_data->>'user_email',
            COALESCE(p_data->>'name', 'Casa'), p_data->>'cep',
            COALESCE(p_data->>'street', ''), COALESCE(p_data->>'number', 'S/N'),
            p_data->>'complement', COALESCE(p_data->>'neighborhood', ''),
            COALESCE(p_data->>'city', ''), COALESCE(p_data->>'state', 'MG'),
            p_data->>'reference', COALESCE((p_data->>'is_default')::boolean, false)
        )
        RETURNING to_jsonb(user_addresses.*) INTO v_saved;
    END IF;

    RETURN jsonb_build_object('success', true, 'address', v_saved);
END;
$function$;

CREATE OR REPLACE FUNCTION public.delete_customer_address(
    p_tenant_id uuid,
    p_phone text,
    p_address_id text,
    p_customer_token text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_clean_phone TEXT := regexp_replace(COALESCE(p_phone, ''), '\D', '', 'g');
    v_is_authorized BOOLEAN := FALSE;
BEGIN
    v_is_authorized := public.is_authorized_for_tenant(p_tenant_id)
        OR COALESCE(public.validate_customer_session_token(p_tenant_id, v_clean_phone, p_customer_token), FALSE);

    IF v_is_authorized IS NOT TRUE THEN
        RETURN jsonb_build_object('success', false, 'error', 'Autenticação WhatsApp necessária para excluir endereço.');
    END IF;

    DELETE FROM public.user_addresses
    WHERE id = p_address_id
      AND tenant_id = p_tenant_id
      AND regexp_replace(COALESCE(user_phone, ''), '\D', '', 'g') = v_clean_phone;

    RETURN jsonb_build_object('success', true);
END;
$function$;

-- Harden admin RPCs against 3-valued NULL when called by non-admin authenticated sessions
CREATE OR REPLACE FUNCTION public.generate_spooler_pairing_code(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
    v_code TEXT;
    v_token TEXT;
    v_alphabet TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    v_part TEXT := '';
    v_i INT;
BEGIN
    IF public.is_authorized_for_tenant(p_tenant_id) IS NOT TRUE THEN
        RAISE EXCEPTION 'Acesso negado para parear esta loja.';
    END IF;

    FOR v_i IN 1..6 LOOP
        v_part := v_part || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
    END LOOP;

    v_code := 'PM-' || substr(v_part, 1, 3) || '-' || substr(v_part, 4, 3);
    v_token := encode(extensions.gen_random_bytes(24), 'hex');

    UPDATE public.tenants
    SET spooler_pairing_code = v_code, spooler_station_token = v_token, updated_date = NOW()
    WHERE id = p_tenant_id;

    RETURN jsonb_build_object('pairing_code', v_code, 'station_token', v_token);
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_tenant_payment_methods(p_tenant_id uuid, p_payment_methods jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    IF public.is_authorized_for_tenant(p_tenant_id) IS NOT TRUE THEN
        RAISE EXCEPTION 'Acesso negado: Sem permissão para alterar métodos de pagamento desta loja.';
    END IF;

    UPDATE public.tenants SET payment_methods = p_payment_methods, updated_date = NOW() WHERE id = p_tenant_id;
    RETURN jsonb_build_object('success', true, 'tenant_id', p_tenant_id, 'payment_methods', p_payment_methods);
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_tenant_delivery_drivers(p_tenant_id uuid, p_drivers jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_result jsonb;
BEGIN
    IF public.is_authorized_for_tenant(p_tenant_id) IS NOT TRUE THEN
        RAISE EXCEPTION 'Acesso negado: Sem permissão para alterar entregadores desta loja.';
    END IF;

    UPDATE public.tenants SET delivery_drivers = p_drivers, updated_date = now() WHERE id = p_tenant_id RETURNING delivery_drivers INTO v_result;
    RETURN jsonb_build_object('success', true, 'delivery_drivers', v_result);
END;
$function$;

CREATE OR REPLACE FUNCTION public.generate_default_tables(p_tenant_id uuid, p_count integer DEFAULT 10)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_i INT;
  v_created INT := 0;
BEGIN
  IF public.is_authorized_for_tenant(p_tenant_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'Acesso negado para gerar mesas nesta loja.';
  END IF;

  FOR v_i IN 1..p_count LOOP
    INSERT INTO public.restaurant_tables (tenant_id, table_number, label, capacity, status)
    VALUES (p_tenant_id, v_i::TEXT, 'Salão Principal', 4, 'available')
    ON CONFLICT (tenant_id, table_number) DO NOTHING;
    IF FOUND THEN v_created := v_created + 1; END IF;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'created', v_created);
END;
$function$;

CREATE OR REPLACE FUNCTION public.open_table_session(
    p_tenant_id uuid,
    p_table_id uuid,
    p_customer_name text DEFAULT NULL::text,
    p_customer_phone text DEFAULT NULL::text,
    p_people_count integer DEFAULT 1
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_table RECORD;
  v_existing RECORD;
  v_session_id UUID;
  v_result JSONB;
BEGIN
  IF public.is_authorized_for_tenant(p_tenant_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'Acesso negado para abrir mesa nesta loja.';
  END IF;

  SELECT * INTO v_table FROM public.restaurant_tables WHERE id = p_table_id AND tenant_id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Mesa não encontrada'); END IF;

  SELECT * INTO v_existing FROM public.table_sessions WHERE table_id = p_table_id AND tenant_id = p_tenant_id AND status IN ('open', 'bill_requested') LIMIT 1;
  IF FOUND THEN RETURN jsonb_build_object('success', true, 'already_open', true, 'session', to_jsonb(v_existing)); END IF;

  INSERT INTO public.table_sessions (tenant_id, table_id, table_number, customer_name, customer_phone, people_count, status)
  VALUES (p_tenant_id, p_table_id, v_table.table_number, p_customer_name, p_customer_phone, p_people_count, 'open')
  RETURNING id INTO v_session_id;

  UPDATE public.restaurant_tables SET status = 'occupied', updated_at = now() WHERE id = p_table_id;
  SELECT to_jsonb(s.*) INTO v_result FROM public.table_sessions s WHERE s.id = v_session_id;
  RETURN jsonb_build_object('success', true, 'session', v_result);
END;
$function$;

CREATE OR REPLACE FUNCTION public.close_table_session(
    p_tenant_id uuid,
    p_session_id uuid,
    p_payment_method text DEFAULT 'money'::text,
    p_payment_details jsonb DEFAULT '[]'::jsonb,
    p_service_fee numeric DEFAULT 0,
    p_discount numeric DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_session RECORD;
  v_subtotal NUMERIC := 0;
  v_total NUMERIC := 0;
BEGIN
  IF public.is_authorized_for_tenant(p_tenant_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'Acesso negado para fechar mesa nesta loja.';
  END IF;

  SELECT * INTO v_session FROM public.table_sessions WHERE id = p_session_id AND tenant_id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Sessão não encontrada'); END IF;

  SELECT COALESCE(SUM(total_amount), 0) INTO v_subtotal FROM public.orders WHERE table_session_id = p_session_id AND status != 'cancelado';
  v_total := GREATEST(0, v_subtotal + COALESCE(p_service_fee, 0) - COALESCE(p_discount, 0));

  UPDATE public.table_sessions
  SET subtotal = v_subtotal, service_fee = COALESCE(p_service_fee, 0), discount = COALESCE(p_discount, 0),
      total_amount = v_total, status = 'closed', closed_at = now(), payment_method = p_payment_method,
      payment_details = p_payment_details, updated_at = now()
  WHERE id = p_session_id;

  UPDATE public.restaurant_tables SET status = 'available', updated_at = now() WHERE id = v_session.table_id;
  UPDATE public.orders SET payment_status = 'paid', status = 'entregue' WHERE table_session_id = p_session_id AND status != 'cancelado';

  RETURN jsonb_build_object('success', true, 'total_amount', v_total);
END;
$function$;



-- >>> MIGRATION: 20261111_order_idempotency_hardening.sql
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



-- >>> MIGRATION: 20261111_parte1_impressoes_completo.sql
-- Migration: Parte 1 Completa (Aceite Automático Delivery, Etapa 2 Spooler Autônomo, Senha Curta e Auto-Sync print_jobs)

-- 1. Novas colunas em public.tenants
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS auto_accept_delivery BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS spooler_pairing_code TEXT,
  ADD COLUMN IF NOT EXISTS spooler_station_token TEXT,
  ADD COLUMN IF NOT EXISTS spooler_last_seen_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS uq_tenants_spooler_pairing_code
  ON public.tenants (spooler_pairing_code)
  WHERE spooler_pairing_code IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_tenants_spooler_station_token
  ON public.tenants (spooler_station_token)
  WHERE spooler_station_token IS NOT NULL;

-- 2. Liberar 'short_receipt' (Senha Curta / Autoatendimento / Maquininha) em production_sectors e print_jobs
ALTER TABLE public.production_sectors
  DROP CONSTRAINT IF EXISTS production_sectors_content_mode_check;

ALTER TABLE public.production_sectors
  ADD CONSTRAINT production_sectors_content_mode_check
  CHECK (content_mode IN ('production_only', 'full_ticket', 'short_receipt'));

ALTER TABLE public.print_jobs
  DROP CONSTRAINT IF EXISTS print_jobs_content_mode_check;

ALTER TABLE public.print_jobs
  ADD CONSTRAINT print_jobs_content_mode_check
  CHECK (content_mode IN ('production_only', 'full_ticket', 'short_receipt'));

-- 3. Atualizar RPC update_tenant_settings para persistir auto_accept_delivery
CREATE OR REPLACE FUNCTION public.update_tenant_settings(p_tenant_id uuid, p_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
        auto_accept_delivery = CASE WHEN p_data ? 'auto_accept_delivery' THEN (p_data->>'auto_accept_delivery')::boolean ELSE auto_accept_delivery END,
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
$function$;

-- 4. RPC segura para gerar código de pareamento do Spooler Autônomo (.exe)
CREATE OR REPLACE FUNCTION public.generate_spooler_pairing_code(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    v_code TEXT;
    v_token TEXT;
    v_alphabet TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    v_part TEXT := '';
    v_i INT;
BEGIN
    IF NOT (p_tenant_id = public.get_auth_tenant_id() OR public.is_super_admin()) THEN
        RAISE EXCEPTION 'Acesso negado para parear esta loja.';
    END IF;

    FOR v_i IN 1..6 LOOP
        v_part := v_part || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
    END LOOP;

    v_code := 'PM-' || substr(v_part, 1, 3) || '-' || substr(v_part, 4, 3);
    v_token := encode(gen_random_bytes(24), 'hex');

    UPDATE public.tenants
    SET
        spooler_pairing_code = v_code,
        spooler_station_token = v_token,
        updated_date = NOW()
    WHERE id = p_tenant_id;

    RETURN jsonb_build_object(
        'pairing_code', v_code,
        'station_token', v_token
    );
END;
$function$;

-- 5. Trigger de Auto-Aceite Delivery no servidor (blindagem extra caso pedido venha sem o flag do front)
CREATE OR REPLACE FUNCTION public.fn_orders_auto_accept_delivery()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    v_auto_accept BOOLEAN := false;
BEGIN
    IF NEW.status = 'pendente' AND COALESCE(lower(NEW.order_type), 'delivery') = 'delivery' THEN
        SELECT COALESCE(t.auto_accept_delivery, false)
        INTO v_auto_accept
        FROM public.tenants t
        WHERE t.id = NEW.tenant_id;

        IF v_auto_accept THEN
            NEW.status := 'confirmado';
        END IF;
    END IF;
    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_orders_auto_accept_delivery ON public.orders;
CREATE TRIGGER trg_orders_auto_accept_delivery
    BEFORE INSERT OR UPDATE OF status
    ON public.orders
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_orders_auto_accept_delivery();

-- 6. Trigger que gera fila print_jobs no Postgres mesmo com o navegador fechado
CREATE OR REPLACE FUNCTION public.fn_orders_sync_print_jobs()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
    -- Ignora rascunhos PIX, cancelados e já finalizados
    IF v_status IN ('aguardando_pagamento', 'cancelado', 'entregue') THEN
        RETURN NEW;
    END IF;

    -- Não cria fila retroativa se o pedido já entrou marcado como impresso
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

DROP TRIGGER IF EXISTS trg_orders_sync_print_jobs ON public.orders;
CREATE TRIGGER trg_orders_sync_print_jobs
    AFTER INSERT OR UPDATE OF status
    ON public.orders
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_orders_sync_print_jobs();



-- >>> MIGRATION: 20261111_payment_integrity_hardening.sql
-- Payment Integrity Hardening:
-- Prevent converting an already-paid PIX order back to payment_status = 'pending_delivery'

CREATE OR REPLACE FUNCTION public.convert_pix_order_to_delivery(
    p_order_id text,
    p_tracking_token uuid,
    p_payment_method text DEFAULT 'card_delivery'::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_order RECORD;
    v_next_status TEXT := 'pendente';
BEGIN
    SELECT o.*, t.auto_accept_delivery
    INTO v_order
    FROM public.orders o
    JOIN public.tenants t ON t.id = o.tenant_id
    WHERE o.id = p_order_id AND o.tracking_token = p_tracking_token
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Pedido não encontrado ou token inválido.');
    END IF;

    IF LOWER(COALESCE(v_order.payment_status, '')) = 'paid' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Este pedido já teve o pagamento aprovado e não pode ser convertido.');
    END IF;

    IF v_order.status NOT IN ('aguardando_pagamento', 'pendente') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Este pedido não pode mais alterar a forma de pagamento.');
    END IF;

    IF COALESCE(v_order.auto_accept_delivery, false) = true AND COALESCE(v_order.order_type, 'delivery') = 'delivery' THEN
        v_next_status := 'confirmado';
    END IF;

    UPDATE public.orders
    SET payment_method = p_payment_method,
        payment_status = 'pending_delivery',
        status = v_next_status,
        updated_date = NOW()
    WHERE id = p_order_id;

    RETURN jsonb_build_object('success', true, 'status', v_next_status, 'payment_status', 'pending_delivery');
END;
$function$;



-- >>> MIGRATION: 20261111_pentest_remediation_customer_sessions_and_auth_privacy.sql
-- 1. Customer session tokens (prevents unauthenticated IDOR on saved addresses & PII enumeration)
CREATE TABLE IF NOT EXISTS public.customer_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    phone TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customer_sessions_tenant_phone
    ON public.customer_sessions (tenant_id, phone, expires_at);

ALTER TABLE public.customer_sessions ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.issue_customer_session_token(p_tenant_id uuid, p_phone text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
    v_clean_phone TEXT := regexp_replace(COALESCE(p_phone, ''), '\D', '', 'g');
    v_raw_token TEXT;
    v_hash TEXT;
BEGIN
    IF p_tenant_id IS NULL OR LENGTH(v_clean_phone) < 8 THEN
        RETURN NULL;
    END IF;

    v_raw_token := encode(extensions.gen_random_bytes(24), 'hex');
    v_hash := encode(extensions.digest(v_raw_token, 'sha256'), 'hex');

    DELETE FROM public.customer_sessions
    WHERE expires_at < NOW() - INTERVAL '1 day';

    INSERT INTO public.customer_sessions (tenant_id, phone, token_hash, expires_at)
    VALUES (p_tenant_id, v_clean_phone, v_hash, NOW() + INTERVAL '30 days');

    RETURN v_raw_token;
END;
$function$;

CREATE OR REPLACE FUNCTION public.validate_customer_session_token(p_tenant_id uuid, p_phone text, p_token text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
    v_clean_phone TEXT := regexp_replace(COALESCE(p_phone, ''), '\D', '', 'g');
    v_hash TEXT;
BEGIN
    IF p_tenant_id IS NULL OR LENGTH(v_clean_phone) < 8 OR NULLIF(TRIM(COALESCE(p_token, '')), '') IS NULL THEN
        RETURN FALSE;
    END IF;

    v_hash := encode(extensions.digest(TRIM(p_token), 'sha256'), 'hex');

    RETURN EXISTS (
        SELECT 1
        FROM public.customer_sessions cs
        WHERE cs.tenant_id = p_tenant_id
          AND cs.phone = v_clean_phone
          AND cs.token_hash = v_hash
          AND cs.expires_at > NOW()
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.issue_customer_session_token(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validate_customer_session_token(uuid, text, text) FROM PUBLIC, anon, authenticated;

-- 2. Update verify_whatsapp_otp to issue customer_token
CREATE OR REPLACE FUNCTION public.verify_whatsapp_otp(p_phone text, p_code text, p_full_name text DEFAULT ''::text, p_tenant_id uuid DEFAULT NULL::uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
    v_clean_phone TEXT;
    v_clean_code TEXT;
    v_tenant_id UUID;
    v_otp RECORD;
    v_final_name TEXT;
    v_customer RECORD;
    v_customer_token TEXT;
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

    SELECT * INTO v_otp
    FROM public.whatsapp_otp_codes
    WHERE phone = v_clean_phone AND verified = FALSE AND expires_at > NOW()
    ORDER BY created_at DESC
    LIMIT 1
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Código expirado ou não encontrado. Solicite um novo código.');
    END IF;

    IF v_otp.attempts >= 5 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Muitas tentativas incorretas. Solicite um novo código.');
    END IF;

    IF v_otp.code <> v_clean_code THEN
        UPDATE public.whatsapp_otp_codes SET attempts = attempts + 1 WHERE id = v_otp.id;
        RETURN jsonb_build_object('success', false, 'error', 'Código incorreto. Verifique os dígitos digitados.');
    END IF;

    UPDATE public.whatsapp_otp_codes SET verified = TRUE WHERE id = v_otp.id;

    v_final_name := TRIM(COALESCE(p_full_name, ''));
    IF v_final_name = '' OR v_final_name = 'Cliente' THEN
        SELECT full_name INTO v_final_name
        FROM public.customers WHERE tenant_id = v_tenant_id AND phone = v_clean_phone LIMIT 1;
        IF v_final_name IS NULL OR v_final_name = '' THEN v_final_name := 'Cliente'; END IF;
    END IF;

    INSERT INTO public.customers (tenant_id, phone, full_name, created_date, updated_date)
    VALUES (v_tenant_id, v_clean_phone, v_final_name, NOW(), NOW())
    ON CONFLICT (tenant_id, phone) DO UPDATE
    SET full_name = CASE WHEN EXCLUDED.full_name <> 'Cliente' THEN EXCLUDED.full_name ELSE public.customers.full_name END,
        updated_date = NOW()
    RETURNING * INTO v_customer;

    v_customer_token := public.issue_customer_session_token(v_tenant_id, v_clean_phone);

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Conta verificada com sucesso!',
        'customer_token', v_customer_token,
        'customer', jsonb_build_object(
            'id', v_customer.id,
            'tenant_id', v_customer.tenant_id,
            'phone', v_customer.phone,
            'full_name', v_customer.full_name,
            'email', COALESCE(v_customer.email, ''),
            'role', 'user',
            'customer_token', v_customer_token
        )
    );
END;
$function$;

-- 3. Drop legacy unauthenticated address & lookup RPC signatures and replace with token-protected versions
DROP FUNCTION IF EXISTS public.get_customer_addresses(uuid, text);
DROP FUNCTION IF EXISTS public.save_customer_address(uuid, text, jsonb);
DROP FUNCTION IF EXISTS public.delete_customer_address(uuid, text, text);
DROP FUNCTION IF EXISTS public.lookup_customer_by_phone(text, uuid);

CREATE OR REPLACE FUNCTION public.get_customer_addresses(
    p_tenant_id uuid,
    p_phone text,
    p_customer_token text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_clean_phone TEXT := regexp_replace(COALESCE(p_phone, ''), '\D', '', 'g');
    v_rows JSONB := '[]'::jsonb;
    v_is_authorized BOOLEAN := FALSE;
BEGIN
    IF LENGTH(v_clean_phone) < 8 THEN
        RETURN '[]'::jsonb;
    END IF;

    v_is_authorized := public.is_super_admin()
        OR auth.role() = 'service_role'
        OR (p_tenant_id = public.get_auth_tenant_id())
        OR public.validate_customer_session_token(p_tenant_id, v_clean_phone, p_customer_token);

    IF NOT v_is_authorized THEN
        RETURN '[]'::jsonb;
    END IF;

    SELECT COALESCE(jsonb_agg(to_jsonb(a) ORDER BY a.is_default DESC, a.created_date DESC), '[]'::jsonb)
    INTO v_rows
    FROM public.user_addresses a
    WHERE a.tenant_id = p_tenant_id
      AND regexp_replace(COALESCE(a.user_phone, ''), '\D', '', 'g') = v_clean_phone;

    RETURN v_rows;
END;
$function$;

CREATE OR REPLACE FUNCTION public.save_customer_address(
    p_tenant_id uuid,
    p_phone text,
    p_data jsonb,
    p_customer_token text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_clean_phone TEXT := regexp_replace(COALESCE(p_phone, ''), '\D', '', 'g');
    v_id TEXT := COALESCE(NULLIF(p_data->>'id', ''), gen_random_uuid()::text);
    v_saved JSONB;
    v_is_authorized BOOLEAN := FALSE;
BEGIN
    IF LENGTH(v_clean_phone) < 8 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Telefone inválido.');
    END IF;

    v_is_authorized := public.is_super_admin()
        OR auth.role() = 'service_role'
        OR (p_tenant_id = public.get_auth_tenant_id())
        OR public.validate_customer_session_token(p_tenant_id, v_clean_phone, p_customer_token);

    IF NOT v_is_authorized THEN
        RETURN jsonb_build_object('success', false, 'error', 'Autenticação WhatsApp necessária para gerenciar endereços.');
    END IF;

    IF EXISTS (SELECT 1 FROM public.user_addresses WHERE id = v_id AND tenant_id = p_tenant_id AND regexp_replace(COALESCE(user_phone, ''), '\D', '', 'g') = v_clean_phone) THEN
        UPDATE public.user_addresses
        SET name = COALESCE(p_data->>'name', name),
            cep = COALESCE(p_data->>'cep', cep),
            street = COALESCE(p_data->>'street', street),
            number = COALESCE(p_data->>'number', number),
            complement = p_data->>'complement',
            neighborhood = COALESCE(p_data->>'neighborhood', neighborhood),
            city = COALESCE(p_data->>'city', city),
            state = COALESCE(p_data->>'state', state),
            reference = p_data->>'reference',
            is_default = COALESCE((p_data->>'is_default')::boolean, is_default),
            updated_date = NOW()
        WHERE id = v_id
        RETURNING to_jsonb(user_addresses.*) INTO v_saved;
    ELSE
        INSERT INTO public.user_addresses (
            id, tenant_id, user_phone, user_email, name, cep, street, number, complement, neighborhood, city, state, reference, is_default
        ) VALUES (
            v_id, p_tenant_id, v_clean_phone, p_data->>'user_email',
            COALESCE(p_data->>'name', 'Casa'), p_data->>'cep',
            COALESCE(p_data->>'street', ''), COALESCE(p_data->>'number', 'S/N'),
            p_data->>'complement', COALESCE(p_data->>'neighborhood', ''),
            COALESCE(p_data->>'city', ''), COALESCE(p_data->>'state', 'MG'),
            p_data->>'reference', COALESCE((p_data->>'is_default')::boolean, false)
        )
        RETURNING to_jsonb(user_addresses.*) INTO v_saved;
    END IF;

    RETURN jsonb_build_object('success', true, 'address', v_saved);
END;
$function$;

CREATE OR REPLACE FUNCTION public.delete_customer_address(
    p_tenant_id uuid,
    p_phone text,
    p_address_id text,
    p_customer_token text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_clean_phone TEXT := regexp_replace(COALESCE(p_phone, ''), '\D', '', 'g');
    v_is_authorized BOOLEAN := FALSE;
BEGIN
    v_is_authorized := public.is_super_admin()
        OR auth.role() = 'service_role'
        OR (p_tenant_id = public.get_auth_tenant_id())
        OR public.validate_customer_session_token(p_tenant_id, v_clean_phone, p_customer_token);

    IF NOT v_is_authorized THEN
        RETURN jsonb_build_object('success', false, 'error', 'Autenticação WhatsApp necessária para excluir endereço.');
    END IF;

    DELETE FROM public.user_addresses
    WHERE id = p_address_id
      AND tenant_id = p_tenant_id
      AND regexp_replace(COALESCE(user_phone, ''), '\D', '', 'g') = v_clean_phone;

    RETURN jsonb_build_object('success', true);
END;
$function$;

CREATE OR REPLACE FUNCTION public.lookup_customer_by_phone(
    p_phone text,
    p_tenant_id uuid DEFAULT NULL::uuid,
    p_customer_token text DEFAULT NULL::text
)
RETURNS TABLE(customer_name text, customer_phone text, customer_email text, last_address text, total_orders bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_effective_tenant_id UUID;
    v_is_admin BOOLEAN := false;
    v_clean_phone TEXT := regexp_replace(COALESCE(p_phone, ''), '\D', '', 'g');
BEGIN
    IF public.get_auth_tenant_id() IS NOT NULL OR public.is_super_admin() THEN
        v_effective_tenant_id := COALESCE(p_tenant_id, public.get_auth_tenant_id());
        v_is_admin := true;
    ELSE
        v_effective_tenant_id := p_tenant_id;
        IF v_effective_tenant_id IS NULL OR NOT public.validate_customer_session_token(v_effective_tenant_id, v_clean_phone, p_customer_token) THEN
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
      AND REGEXP_REPLACE(o.customer_phone, '\D', '', 'g') = v_clean_phone
    GROUP BY o.customer_phone
    LIMIT 1;
END;
$function$;

-- 4. Strip customer_name from anonymous get_customer_cashback_balance responses (prevent phone scraping)
CREATE OR REPLACE FUNCTION public.get_customer_cashback_balance(p_tenant_id uuid, p_phone text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_clean_phone TEXT := REGEXP_REPLACE(COALESCE(p_phone, ''), '\D', '', 'g');
    v_wallet RECORD;
    v_tenant RECORD;
    v_is_expired BOOLEAN := FALSE;
    v_effective_balance NUMERIC := 0.00;
    v_is_admin BOOLEAN := (public.is_super_admin() OR p_tenant_id = public.get_auth_tenant_id() OR auth.role() = 'service_role');
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
            'customer_name', CASE WHEN v_is_admin THEN v_wallet.customer_name ELSE NULL END
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
$function$;

GRANT EXECUTE ON FUNCTION public.get_customer_addresses(uuid, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_customer_address(uuid, text, jsonb, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_customer_address(uuid, text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lookup_customer_by_phone(text, uuid, text) TO anon, authenticated;

-- 5. Revoke public execution of resolve_admin_login_email & verify_admin_reset_email (now called server-side via admin-login Edge Function)
REVOKE ALL ON FUNCTION public.resolve_admin_login_email(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.verify_admin_reset_email(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_admin_login_email(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.verify_admin_reset_email(text, text) TO service_role;



-- >>> MIGRATION: 20261111_phase3_financial_concurrency_hardening.sql
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



-- >>> MIGRATION: 20261111_phase4_operational_resilience.sql
-- ============================================================================
-- Fase 4: Resiliência Operacional & Recuperação de Falhas
-- 1. Máquina de estados terminal em public.orders (impede 2 operadores concorrentes
--    de ressuscitar pedido 'cancelado' ou regredir pedido 'entregue')
-- 2. Recuperação automática + dead-letter em public.spooler_poll (>90s printing)
-- 3. Idempotência de print_count em public.spooler_ack em retries de rede
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_orders_guard_status_transition()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_old TEXT := LOWER(COALESCE(OLD.status, ''));
    v_new TEXT := LOWER(COALESCE(NEW.status, ''));
BEGIN
    IF v_old = v_new THEN
        RETURN NEW;
    END IF;

    IF v_old = 'cancelado' AND v_new <> 'cancelado' THEN
        RAISE EXCEPTION 'Transição inválida: pedido cancelado não pode ser reativado para "%".', NEW.status
            USING ERRCODE = 'P0001';
    END IF;

    IF v_old = 'entregue' AND v_new NOT IN ('entregue', 'cancelado') THEN
        RAISE EXCEPTION 'Transição inválida: pedido já entregue não pode regredir para "%".', NEW.status
            USING ERRCODE = 'P0001';
    END IF;

    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_orders_guard_status_transition ON public.orders;
CREATE TRIGGER trg_orders_guard_status_transition
    BEFORE UPDATE OF status ON public.orders
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_orders_guard_status_transition();

CREATE OR REPLACE FUNCTION public.spooler_poll(p_station_token TEXT)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
    v_tenant RECORD;
    v_jobs JSONB := '[]'::jsonb;
    v_recovered_count INT := 0;
    v_dead_letter_count INT := 0;
BEGIN
    IF COALESCE(trim(p_station_token), '') = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Token de estação ausente.');
    END IF;

    SELECT id, name, slug
    INTO v_tenant
    FROM public.tenants
    WHERE spooler_station_token = trim(p_station_token)
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Estação não autorizada ou desconectada.');
    END IF;

    UPDATE public.tenants
    SET spooler_last_seen_at = NOW()
    WHERE id = v_tenant.id;

    -- 1) Dead-letter: jobs travados em 'printing' > 90s que atingiram 5 tentativas vão para 'failed'
    UPDATE public.print_jobs
    SET status = 'failed',
        error_message = COALESCE(NULLIF(error_message, ''), 'Falha após 5 tentativas: Spooler ou impressora interrompido antes da confirmação.'),
        updated_date = NOW()
    WHERE tenant_id = v_tenant.id
      AND status = 'printing'
      AND updated_date < NOW() - INTERVAL '90 seconds'
      AND attempts >= 5;
    GET DIAGNOSTICS v_dead_letter_count = ROW_COUNT;

    -- 2) Recupera jobs travados em 'printing' há mais de 90s (< 5 tentativas) para nova tentativa
    UPDATE public.print_jobs
    SET status = 'pending', updated_date = NOW()
    WHERE tenant_id = v_tenant.id
      AND status = 'printing'
      AND updated_date < NOW() - INTERVAL '90 seconds'
      AND attempts < 5;
    GET DIAGNOSTICS v_recovered_count = ROW_COUNT;

    -- 3) Claim atômico FIFO dos próximos jobs térmicos das últimas 12 horas
    WITH next_jobs AS (
        SELECT pj.id
        FROM public.print_jobs pj
        WHERE pj.tenant_id = v_tenant.id
          AND pj.status = 'pending'
          AND pj.printer_type <> 'a4_browser'
          AND pj.created_date >= NOW() - INTERVAL '12 hours'
        ORDER BY pj.created_date ASC
        LIMIT 10
        FOR UPDATE SKIP LOCKED
    ),
    claimed AS (
        UPDATE public.print_jobs pj
        SET
            status = 'printing',
            attempts = pj.attempts + 1,
            updated_date = NOW()
        FROM next_jobs nj
        WHERE pj.id = nj.id
        RETURNING pj.*
    )
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'id', c.id,
                'order_id', c.order_id,
                'sector_id', c.sector_id,
                'sector_key', c.sector_key,
                'sector_name', c.sector_name,
                'printer_name', c.printer_name,
                'printer_type', c.printer_type,
                'paper_width', c.paper_width,
                'content_mode', c.content_mode,
                'copies', c.copies,
                'items_payload', c.items_payload,
                'storeName', v_tenant.name,
                'order', to_jsonb(o.*)
            )
            ORDER BY c.created_date ASC
        ),
        '[]'::jsonb
    )
    INTO v_jobs
    FROM claimed c
    JOIN public.orders o ON o.id = c.order_id;

    RETURN jsonb_build_object(
        'success', true,
        'tenantName', v_tenant.name,
        'recoveredCount', v_recovered_count,
        'deadLetterCount', v_dead_letter_count,
        'jobs', v_jobs
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.spooler_ack(
    p_station_token TEXT,
    p_job_id UUID,
    p_status TEXT,
    p_error_message TEXT DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
    v_tenant_id UUID;
    v_prev_status TEXT;
    v_order_id TEXT;
    v_final_status TEXT := CASE WHEN p_status = 'printed' THEN 'printed' ELSE 'failed' END;
    v_all_done BOOLEAN := false;
BEGIN
    SELECT id INTO v_tenant_id
    FROM public.tenants
    WHERE spooler_station_token = trim(COALESCE(p_station_token, ''))
    LIMIT 1;

    IF v_tenant_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Estação não autorizada.');
    END IF;

    SELECT status, order_id
    INTO v_prev_status, v_order_id
    FROM public.print_jobs
    WHERE id = p_job_id
      AND tenant_id = v_tenant_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Job não encontrado.');
    END IF;

    -- Idempotência: se já estava 'printed' e recebeu retry de ACK 'printed', não duplica print_count
    IF v_prev_status = 'printed' AND v_final_status = 'printed' THEN
        RETURN jsonb_build_object('success', true, 'idempotent_replay', true);
    END IF;

    -- Não regride job já cancelado para printed/failed
    IF v_prev_status = 'cancelled' THEN
        RETURN jsonb_build_object('success', true, 'cancelled_ignored', true);
    END IF;

    UPDATE public.print_jobs
    SET
        status = v_final_status,
        printed_at = CASE WHEN v_final_status = 'printed' THEN COALESCE(printed_at, NOW()) ELSE NULL END,
        error_message = p_error_message,
        updated_date = NOW()
    WHERE id = p_job_id
      AND tenant_id = v_tenant_id;

    IF v_final_status = 'printed' THEN
        SELECT NOT EXISTS (
            SELECT 1
            FROM public.print_jobs pj
            WHERE pj.order_id = v_order_id
              AND pj.status NOT IN ('printed', 'cancelled')
        ) INTO v_all_done;

        IF v_all_done THEN
            UPDATE public.orders
            SET
                print_status = 'printed',
                printed_at = COALESCE(printed_at, NOW()),
                print_count = COALESCE(print_count, 0) + 1,
                updated_date = NOW()
            WHERE id = v_order_id;
        END IF;
    ELSIF v_final_status = 'failed' THEN
        UPDATE public.orders
        SET print_status = 'failed',
            updated_date = NOW()
        WHERE id = v_order_id
          AND print_status <> 'printed';
    END IF;

    RETURN jsonb_build_object('success', true, 'idempotent_replay', false);
END;
$function$;



-- >>> MIGRATION: 20261111_phase5_storage_and_security_hardening.sql
-- ============================================================================
-- Fase 5: Hardening de Storage Multi-Tenant (Bloqueio SVG + Isolamento por Tenant)
-- 1. Remove 'image/svg+xml' de allowed_mime_types do bucket 'restaurant-images'
-- 2. Revoga INSERT público anônimo em storage.objects
-- 3. Restringe INSERT/UPDATE/DELETE em 'restaurant-images' estritamente à pasta
--    tenants/<tenant_id>/... do admin autenticado ou SuperAdmin
-- ============================================================================

UPDATE storage.buckets
SET allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
WHERE id = 'restaurant-images';

DROP POLICY IF EXISTS "Authorized upload restaurant images" ON storage.objects;
DROP POLICY IF EXISTS "Admin delete restaurant images" ON storage.objects;
DROP POLICY IF EXISTS "Admin update restaurant images" ON storage.objects;
DROP POLICY IF EXISTS "Tenant isolated upload restaurant images" ON storage.objects;
DROP POLICY IF EXISTS "Tenant isolated update restaurant images" ON storage.objects;
DROP POLICY IF EXISTS "Tenant isolated delete restaurant images" ON storage.objects;

CREATE POLICY "Tenant isolated upload restaurant images"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'restaurant-images'
    AND (
        public.is_super_admin() IS TRUE
        OR (
            public.get_auth_tenant_id() IS NOT NULL
            AND public.is_authorized_for_tenant(public.get_auth_tenant_id()) IS TRUE
            AND name LIKE ('tenants/' || public.get_auth_tenant_id()::text || '/%')
            AND name NOT LIKE '%..%'
        )
    )
);

CREATE POLICY "Tenant isolated update restaurant images"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
    bucket_id = 'restaurant-images'
    AND (
        public.is_super_admin() IS TRUE
        OR (
            public.get_auth_tenant_id() IS NOT NULL
            AND public.is_authorized_for_tenant(public.get_auth_tenant_id()) IS TRUE
            AND name LIKE ('tenants/' || public.get_auth_tenant_id()::text || '/%')
        )
    )
)
WITH CHECK (
    bucket_id = 'restaurant-images'
    AND (
        public.is_super_admin() IS TRUE
        OR (
            public.get_auth_tenant_id() IS NOT NULL
            AND public.is_authorized_for_tenant(public.get_auth_tenant_id()) IS TRUE
            AND name LIKE ('tenants/' || public.get_auth_tenant_id()::text || '/%')
            AND name NOT LIKE '%..%'
        )
    )
);

CREATE POLICY "Tenant isolated delete restaurant images"
ON storage.objects
FOR DELETE
TO authenticated
USING (
    bucket_id = 'restaurant-images'
    AND (
        public.is_super_admin() IS TRUE
        OR (
            public.get_auth_tenant_id() IS NOT NULL
            AND public.is_authorized_for_tenant(public.get_auth_tenant_id()) IS TRUE
            AND name LIKE ('tenants/' || public.get_auth_tenant_id()::text || '/%')
        )
    )
);



-- >>> MIGRATION: 20261111_production_sectors_and_print_jobs.sql
-- Migration: Setores de Produção Dinâmicos (production_sectors) + Fila de Impressão (print_jobs)
-- e vínculos opcionais em categories e products.

-- 1. Tabela de Setores de Produção por Tenant (ex: Cozinha, Bar, Fritura, Caixa)
CREATE TABLE IF NOT EXISTS public.production_sectors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  content_mode TEXT NOT NULL DEFAULT 'production_only' CHECK (content_mode IN ('production_only', 'full_ticket')),
  operation_mode TEXT NOT NULL DEFAULT 'kds_and_print' CHECK (operation_mode IN ('kds_and_print', 'kds_only', 'print_only')),
  printer_name TEXT,
  printer_type TEXT NOT NULL DEFAULT 'thermal_raw' CHECK (printer_type IN ('thermal_raw', 'a4_browser')),
  paper_width TEXT NOT NULL DEFAULT '80mm' CHECK (paper_width IN ('80mm', '58mm', 'a4')),
  copies INTEGER NOT NULL DEFAULT 1 CHECK (copies >= 1 AND copies <= 5),
  order_index INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_date TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_production_sectors_tenant_order
  ON public.production_sectors (tenant_id, order_index, created_date);

CREATE UNIQUE INDEX IF NOT EXISTS uq_production_sectors_tenant_slug
  ON public.production_sectors (tenant_id, slug);

-- 2. Coluna sector_id em categories (padrão da categoria) e products (override opcional)
ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS sector_id UUID REFERENCES public.production_sectors(id) ON DELETE SET NULL;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS sector_id UUID REFERENCES public.production_sectors(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_categories_sector_id ON public.categories (sector_id);
CREATE INDEX IF NOT EXISTS idx_products_sector_id ON public.products (sector_id);

-- 3. Tabela persistente de fila de impressão por pedido e setor (base para anti-duplicidade e Etapa 2)
CREATE TABLE IF NOT EXISTS public.print_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  order_id TEXT NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  sector_id UUID REFERENCES public.production_sectors(id) ON DELETE SET NULL,
  sector_key TEXT NOT NULL,
  sector_name TEXT NOT NULL DEFAULT 'Geral',
  printer_name TEXT,
  printer_type TEXT NOT NULL DEFAULT 'thermal_raw' CHECK (printer_type IN ('thermal_raw', 'a4_browser')),
  paper_width TEXT NOT NULL DEFAULT '80mm' CHECK (paper_width IN ('80mm', '58mm', 'a4')),
  content_mode TEXT NOT NULL DEFAULT 'full_ticket' CHECK (content_mode IN ('production_only', 'full_ticket')),
  copies INTEGER NOT NULL DEFAULT 1 CHECK (copies >= 1 AND copies <= 5),
  items_payload JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'printing', 'printed', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  created_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  printed_at TIMESTAMPTZ,
  updated_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_print_jobs_order_sector_key UNIQUE (order_id, sector_key)
);

CREATE INDEX IF NOT EXISTS idx_print_jobs_tenant_status
  ON public.print_jobs (tenant_id, status, created_date DESC);

CREATE INDEX IF NOT EXISTS idx_print_jobs_order_id
  ON public.print_jobs (order_id);

-- 4. Políticas RLS
ALTER TABLE public.production_sectors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.print_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public select production_sectors" ON public.production_sectors;
CREATE POLICY "Public select production_sectors"
  ON public.production_sectors
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Admin insert own production_sectors" ON public.production_sectors;
CREATE POLICY "Admin insert own production_sectors"
  ON public.production_sectors
  FOR INSERT
  WITH CHECK (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin());

DROP POLICY IF EXISTS "Admin update own production_sectors" ON public.production_sectors;
CREATE POLICY "Admin update own production_sectors"
  ON public.production_sectors
  FOR UPDATE
  USING (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin())
  WITH CHECK (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin());

DROP POLICY IF EXISTS "Admin delete own production_sectors" ON public.production_sectors;
CREATE POLICY "Admin delete own production_sectors"
  ON public.production_sectors
  FOR DELETE
  USING (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin());

DROP POLICY IF EXISTS "Admin manage own print_jobs" ON public.print_jobs;
CREATE POLICY "Admin manage own print_jobs"
  ON public.print_jobs
  FOR ALL
  USING (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin())
  WITH CHECK (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin());



-- >>> MIGRATION: 20261111_realtime_sync_hardening.sql
-- Realtime & Synchronization Hardening:
-- Add table_sessions, restaurant_tables, and print_jobs to supabase_realtime publication
-- and enable REPLICA IDENTITY FULL so UPDATE/DELETE payloads include complete row state.

ALTER TABLE public.table_sessions REPLICA IDENTITY FULL;
ALTER TABLE public.restaurant_tables REPLICA IDENTITY FULL;
ALTER TABLE public.print_jobs REPLICA IDENTITY FULL;

DO $$
DECLARE
    v_tbl TEXT;
BEGIN
    FOREACH v_tbl IN ARRAY ARRAY['table_sessions', 'restaurant_tables', 'print_jobs'] LOOP
        IF NOT EXISTS (
            SELECT 1
            FROM pg_publication_tables
            WHERE pubname = 'supabase_realtime'
              AND schemaname = 'public'
              AND tablename = v_tbl
        ) THEN
            EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', v_tbl);
        END IF;
    END LOOP;
END $$;



-- >>> MIGRATION: 20261111_sector_channels_and_delivery_trigger.sql
-- Migration: Canais permitidos por setor (Delivery, Balcão/Retirada, Mesa/Autoatendimento)
-- e gatilho de impressão no Delivery (imediato ao chegar vs somente após aceitar).

ALTER TABLE public.production_sectors
  ADD COLUMN IF NOT EXISTS allowed_channels JSONB NOT NULL DEFAULT '["delivery","pickup","dine_in"]'::jsonb,
  ADD COLUMN IF NOT EXISTS print_on_delivery TEXT NOT NULL DEFAULT 'on_arrival'
    CHECK (print_on_delivery IN ('on_arrival', 'on_accept'));



-- >>> MIGRATION: 20261111_security_and_concurrency_hardening.sql
-- ============================================================================
-- MIGRATION: Hardening Completo de Segurança (RLS + RPCs), Concorrência,
-- Isolamento Multi-Tenant, Spooler, Cupons, Mesas, Cashback e Índices.
-- ============================================================================

-- 1. VIEW PÚBLICA SEGURA DE TENANTS (NUNCA expõe mp_access_token, cpf_cnpj, asaas_*, spooler_*)
DROP VIEW IF EXISTS public.tenants_public;
CREATE VIEW public.tenants_public AS
SELECT
    t.id,
    t.slug,
    t.name,
    t.plan,
    t.custom_domain,
    t.is_active,
    t.logo_url,
    t.banner_url,
    t.theme_config,
    t.phone,
    t.whatsapp,
    t.address,
    t.instagram,
    t.delivery_fee,
    t.min_order_value,
    t.delivery_time,
    t.opening_time,
    t.closing_time,
    t.open_days,
    t.manual_store_open,
    t.manual_override_date,
    t.created_date,
    t.updated_date,
    t.cep,
    t.address_number,
    t.address_street,
    t.address_neighborhood,
    t.address_city,
    t.address_state,
    t.address_complement,
    t.delivery_fee_type,
    t.delivery_neighborhoods,
    t.delivery_unlisted_policy,
    t.delivery_fallback_fee,
    t.free_delivery_threshold,
    t.subscription_status,
    t.next_due_date,
    t.code,
    t.custom_template,
    t.salon_mode,
    t.accepts_delivery,
    t.accepts_takeaway,
    t.accepts_dine_in,
    t.pizza_pricing_rule,
    t.table_service_fee_enabled,
    t.table_service_fee_rate,
    t.cashback_enabled,
    t.cashback_rate,
    t.cashback_validity_days,
    t.cashback_max_discount_percentage,
    t.auto_accept_delivery,
    (
        (COALESCE(t.payment_methods, '{}'::jsonb) - 'mp_access_token')
        || jsonb_build_object(
            'has_online_mp',
            COALESCE(t.payment_methods->>'mp_access_token', '') <> ''
        )
    ) AS payment_methods
FROM public.tenants t;

GRANT SELECT ON public.tenants_public TO anon, authenticated;

-- 2. CORRIGIR PAREMETRO DE SCHEMA & SEARCH_PATH EM FUNÇÕES EXISTENTES
CREATE OR REPLACE FUNCTION public.handle_updated_date()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    NEW.updated_date = NOW();
    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.generate_spooler_pairing_code(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
    v_code TEXT;
    v_token TEXT;
    v_alphabet TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    v_part TEXT := '';
    v_i INT;
BEGIN
    IF NOT (p_tenant_id = public.get_auth_tenant_id() OR public.is_super_admin()) THEN
        RAISE EXCEPTION 'Acesso negado para parear esta loja.';
    END IF;

    FOR v_i IN 1..6 LOOP
        v_part := v_part || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
    END LOOP;

    v_code := 'PM-' || substr(v_part, 1, 3) || '-' || substr(v_part, 4, 3);
    v_token := encode(extensions.gen_random_bytes(24), 'hex');

    UPDATE public.tenants
    SET
        spooler_pairing_code = v_code,
        spooler_station_token = v_token,
        updated_date = NOW()
    WHERE id = p_tenant_id;

    RETURN jsonb_build_object(
        'pairing_code', v_code,
        'station_token', v_token
    );
END;
$function$;

ALTER FUNCTION public.create_new_tenant(text, text, text, text, text, text, text)
SET search_path TO 'public', 'auth', 'extensions', 'pg_temp';

-- 3. REMOVER SOBRECARGA LEGADA INSEGURA DE CASHBACK E BLINDAR CONCORRÊNCIA (FOR UPDATE)
DROP FUNCTION IF EXISTS public.process_order_cashback(text);

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

    IF NOT (public.is_super_admin() OR auth.role() = 'service_role' OR v_order.tenant_id = public.get_auth_tenant_id()) THEN
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

    -- Lock exclusivo na carteira para evitar corrida em chamadas concorrentes
    PERFORM 1 FROM public.customer_cashback_wallets WHERE id = v_wallet_id FOR UPDATE;

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

    IF NOT (public.is_super_admin() OR auth.role() = 'service_role' OR v_order.tenant_id = public.get_auth_tenant_id()) THEN
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

-- 4. BLINDAR TODAS AS RPCs ADMINISTRATIVAS CONTRA CHAMADAS ANÔNIMAS OU CROSS-TENANT
CREATE OR REPLACE FUNCTION public.create_store_admin_user(
    p_tenant_id uuid,
    p_username text,
    p_password text,
    p_role text DEFAULT 'admin'::text,
    p_permissions jsonb DEFAULT '["*"]'::jsonb
)
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
    IF NOT (public.is_super_admin() OR auth.role() = 'service_role' OR (p_tenant_id = public.get_auth_tenant_id() AND public.get_auth_admin_role() IN ('admin', 'super_admin'))) THEN
        RAISE EXCEPTION 'Acesso negado: Apenas administradores da loja ou SuperAdmin podem criar usuários.';
    END IF;

    IF p_role = 'super_admin' AND NOT public.is_super_admin() THEN
        RAISE EXCEPTION 'Acesso negado: Apenas o SuperAdmin pode criar outro SuperAdmin.';
    END IF;

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

CREATE OR REPLACE FUNCTION public.update_store_admin_user(
    p_user_id uuid,
    p_username text DEFAULT NULL::text,
    p_password text DEFAULT NULL::text,
    p_role text DEFAULT NULL::text,
    p_permissions jsonb DEFAULT NULL::jsonb,
    p_active boolean DEFAULT NULL::boolean
)
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

    IF NOT (public.is_super_admin() OR auth.role() = 'service_role' OR (v_target_tenant_id IS NOT NULL AND v_target_tenant_id = public.get_auth_tenant_id() AND public.get_auth_admin_role() IN ('admin', 'super_admin'))) THEN
        RAISE EXCEPTION 'Acesso negado: Você não possui permissão para alterar este usuário.';
    END IF;

    IF p_role = 'super_admin' AND NOT public.is_super_admin() THEN
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

    IF NOT (public.is_super_admin() OR auth.role() = 'service_role' OR (v_target_tenant_id IS NOT NULL AND v_target_tenant_id = public.get_auth_tenant_id() AND public.get_auth_admin_role() IN ('admin', 'super_admin'))) THEN
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

CREATE OR REPLACE FUNCTION public.update_tenant_payment_methods(p_tenant_id uuid, p_payment_methods jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    IF NOT (public.is_super_admin() OR auth.role() = 'service_role' OR p_tenant_id = public.get_auth_tenant_id()) THEN
        RAISE EXCEPTION 'Acesso negado: Sem permissão para alterar métodos de pagamento desta loja.';
    END IF;

    UPDATE public.tenants
    SET payment_methods = p_payment_methods,
        updated_date = NOW()
    WHERE id = p_tenant_id;

    RETURN jsonb_build_object('success', true, 'tenant_id', p_tenant_id, 'payment_methods', p_payment_methods);
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_tenant_delivery_drivers(p_tenant_id uuid, p_drivers jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_result jsonb;
BEGIN
    IF NOT (public.is_super_admin() OR auth.role() = 'service_role' OR p_tenant_id = public.get_auth_tenant_id()) THEN
        RAISE EXCEPTION 'Acesso negado: Sem permissão para alterar entregadores desta loja.';
    END IF;

    UPDATE public.tenants
    SET delivery_drivers = p_drivers,
        updated_date = now()
    WHERE id = p_tenant_id
    RETURNING delivery_drivers INTO v_result;

    RETURN jsonb_build_object('success', true, 'delivery_drivers', v_result);
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
    IF NOT (public.is_super_admin() OR auth.role() = 'service_role' OR p_tenant_id = public.get_auth_tenant_id()) THEN
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

CREATE OR REPLACE FUNCTION public.generate_default_tables(p_tenant_id uuid, p_count integer DEFAULT 10)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_i INT;
  v_created INT := 0;
BEGIN
  IF NOT (public.is_super_admin() OR auth.role() = 'service_role' OR p_tenant_id = public.get_auth_tenant_id()) THEN
    RAISE EXCEPTION 'Acesso negado para gerar mesas nesta loja.';
  END IF;

  FOR v_i IN 1..p_count LOOP
    INSERT INTO public.restaurant_tables (tenant_id, table_number, label, capacity, status)
    VALUES (p_tenant_id, v_i::TEXT, 'Salão Principal', 4, 'available')
    ON CONFLICT (tenant_id, table_number) DO NOTHING;
    IF FOUND THEN v_created := v_created + 1; END IF;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'created', v_created);
END;
$function$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_table_sessions_active_table
ON public.table_sessions (table_id)
WHERE (status IN ('open', 'bill_requested'));

CREATE OR REPLACE FUNCTION public.open_table_session(
    p_tenant_id uuid,
    p_table_id uuid,
    p_customer_name text DEFAULT NULL::text,
    p_customer_phone text DEFAULT NULL::text,
    p_people_count integer DEFAULT 1
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_table RECORD;
  v_existing RECORD;
  v_session_id UUID;
  v_result JSONB;
BEGIN
  IF NOT (public.is_super_admin() OR auth.role() = 'service_role' OR p_tenant_id = public.get_auth_tenant_id()) THEN
    RAISE EXCEPTION 'Acesso negado para abrir mesa nesta loja.';
  END IF;

  -- Lock exclusivo na mesa física para impedir sessões duplicadas em chamadas simultâneas
  SELECT * INTO v_table FROM public.restaurant_tables 
  WHERE id = p_table_id AND tenant_id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Mesa não encontrada');
  END IF;

  SELECT * INTO v_existing
  FROM public.table_sessions
  WHERE table_id = p_table_id AND tenant_id = p_tenant_id AND status IN ('open', 'bill_requested')
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object('success', true, 'already_open', true, 'session', to_jsonb(v_existing));
  END IF;

  INSERT INTO public.table_sessions (
    tenant_id, table_id, table_number, customer_name, customer_phone, people_count, status
  ) VALUES (
    p_tenant_id, p_table_id, v_table.table_number, p_customer_name, p_customer_phone, p_people_count, 'open'
  ) RETURNING id INTO v_session_id;

  UPDATE public.restaurant_tables 
  SET status = 'occupied', updated_at = now()
  WHERE id = p_table_id;

  SELECT to_jsonb(s.*) INTO v_result FROM public.table_sessions s WHERE s.id = v_session_id;
  RETURN jsonb_build_object('success', true, 'session', v_result);
END;
$function$;

CREATE OR REPLACE FUNCTION public.close_table_session(
    p_tenant_id uuid,
    p_session_id uuid,
    p_payment_method text DEFAULT 'money'::text,
    p_payment_details jsonb DEFAULT '[]'::jsonb,
    p_service_fee numeric DEFAULT 0,
    p_discount numeric DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_session RECORD;
  v_subtotal NUMERIC := 0;
  v_total NUMERIC := 0;
BEGIN
  IF NOT (public.is_super_admin() OR auth.role() = 'service_role' OR p_tenant_id = public.get_auth_tenant_id()) THEN
    RAISE EXCEPTION 'Acesso negado para fechar mesa nesta loja.';
  END IF;

  SELECT * INTO v_session FROM public.table_sessions 
  WHERE id = p_session_id AND tenant_id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sessão não encontrada');
  END IF;

  SELECT COALESCE(SUM(total_amount), 0) INTO v_subtotal
  FROM public.orders 
  WHERE table_session_id = p_session_id AND status != 'cancelado';

  v_total := v_subtotal + COALESCE(p_service_fee, 0) - COALESCE(p_discount, 0);
  IF v_total < 0 THEN v_total := 0; END IF;

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

  UPDATE public.restaurant_tables
  SET status = 'available', updated_at = now()
  WHERE id = v_session.table_id;

  UPDATE public.orders
  SET payment_status = 'paid', status = 'entregue'
  WHERE table_session_id = p_session_id AND status != 'cancelado';

  RETURN jsonb_build_object('success', true, 'total_amount', v_total);
END;
$function$;

CREATE OR REPLACE FUNCTION public.auto_deliver_stale_orders(p_tenant_id uuid DEFAULT NULL::uuid, p_timeout_hours integer DEFAULT 2)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_stale_order RECORD;
    v_auto_count INTEGER := 0;
    v_order_ids TEXT[] := ARRAY[]::TEXT[];
    v_effective_tenant UUID;
BEGIN
    IF public.is_super_admin() OR auth.role() = 'service_role' THEN
        v_effective_tenant := p_tenant_id;
    ELSIF public.get_auth_tenant_id() IS NOT NULL THEN
        v_effective_tenant := public.get_auth_tenant_id();
    ELSE
        RAISE EXCEPTION 'Acesso negado: Apenas lojistas autenticados podem finalizar pedidos.';
    END IF;

    FOR v_stale_order IN
        SELECT id, order_number, tenant_id, cashback_earned, dispatched_at, created_date
        FROM public.orders
        WHERE status = 'enviado'
          AND (v_effective_tenant IS NULL OR tenant_id = v_effective_tenant)
          AND (
            (dispatched_at IS NOT NULL AND dispatched_at < NOW() - (p_timeout_hours || ' hours')::INTERVAL)
            OR
            (dispatched_at IS NULL AND created_date < NOW() - ((p_timeout_hours + 1) || ' hours')::INTERVAL)
          )
    LOOP
        UPDATE public.orders
        SET status = 'entregue',
            delivered_at = NOW(),
            updated_date = NOW()
        WHERE id = v_stale_order.id;

        IF COALESCE(v_stale_order.cashback_earned, 0) > 0 THEN
            PERFORM public.process_order_cashback(v_stale_order.id, 'credit_only');
        END IF;

        v_auto_count := v_auto_count + 1;
        v_order_ids := array_append(v_order_ids, v_stale_order.id);
    END LOOP;

    RETURN jsonb_build_object('success', true, 'auto_delivered_count', v_auto_count, 'order_ids', v_order_ids);
END;
$function$;

CREATE OR REPLACE FUNCTION public.resolve_system_issue(p_issue_id uuid, p_resolved_by text DEFAULT 'SuperAdmin'::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_updated JSONB;
BEGIN
    IF NOT (public.is_super_admin() OR auth.role() = 'service_role') THEN
        RAISE EXCEPTION 'Acesso negado: Apenas SuperAdmin pode resolver pendências.';
    END IF;

    UPDATE public.system_issues
    SET status = 'resolved', resolved_at = NOW(), resolved_by = COALESCE(p_resolved_by, 'SuperAdmin')
    WHERE id = p_issue_id
    RETURNING to_jsonb(system_issues.*) INTO v_updated;
    RETURN v_updated;
END;
$function$;

CREATE OR REPLACE FUNCTION public.reopen_system_issue(p_issue_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_updated JSONB;
BEGIN
    IF NOT (public.is_super_admin() OR auth.role() = 'service_role') THEN
        RAISE EXCEPTION 'Acesso negado: Apenas SuperAdmin pode reabrir pendências.';
    END IF;

    UPDATE public.system_issues
    SET status = 'open', resolved_at = NULL, resolved_by = NULL
    WHERE id = p_issue_id
    RETURNING to_jsonb(system_issues.*) INTO v_updated;
    RETURN v_updated;
END;
$function$;

CREATE OR REPLACE FUNCTION public.report_system_issue(
    p_title text,
    p_description text DEFAULT NULL::text,
    p_severity text DEFAULT 'urgent'::text,
    p_source text DEFAULT 'manual'::text,
    p_path text DEFAULT NULL::text,
    p_tenant_id uuid DEFAULT NULL::uuid,
    p_tenant_name text DEFAULT NULL::text,
    p_sentry_event_id text DEFAULT NULL::text,
    p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_issue JSONB;
BEGIN
    INSERT INTO public.system_issues (
        title, description, severity, status, source, path, tenant_id, tenant_name, sentry_event_id, metadata
    ) VALUES (
        LEFT(COALESCE(p_title, 'Erro'), 200),
        LEFT(p_description, 4000),
        CASE WHEN p_severity IN ('urgent', 'warning', 'info') THEN p_severity ELSE 'urgent' END,
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
$function$;

CREATE OR REPLACE FUNCTION public.request_whatsapp_otp(p_phone text, p_full_name text DEFAULT ''::text, p_tenant_id uuid DEFAULT NULL::uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
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

    v_tenant_id := COALESCE(p_tenant_id, 'a0000000-0000-0000-0000-000000000001'::uuid);
    v_code := LPAD(FLOOR(RANDOM() * 900000 + 100000)::TEXT, 6, '0');
    v_expires_at := NOW() + INTERVAL '10 minutes';

    UPDATE public.whatsapp_otp_codes SET verified = TRUE WHERE phone = v_clean_phone AND verified = FALSE;

    INSERT INTO public.whatsapp_otp_codes (tenant_id, phone, code, attempts, verified, expires_at, created_at)
    VALUES (v_tenant_id, v_clean_phone, v_code, 0, FALSE, v_expires_at, NOW());

    RETURN jsonb_build_object(
        'success', true,
        'phone', v_clean_phone,
        'code', v_code,
        'expires_in_seconds', 600,
        'message', 'Código de verificação gerado com sucesso.'
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.verify_whatsapp_otp(p_phone text, p_code text, p_full_name text DEFAULT ''::text, p_tenant_id uuid DEFAULT NULL::uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
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

    SELECT * INTO v_otp
    FROM public.whatsapp_otp_codes
    WHERE phone = v_clean_phone AND verified = FALSE AND expires_at > NOW()
    ORDER BY created_at DESC
    LIMIT 1
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Código expirado ou não encontrado. Solicite um novo código.');
    END IF;

    IF v_otp.attempts >= 5 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Muitas tentativas incorretas. Solicite um novo código.');
    END IF;

    IF v_otp.code <> v_clean_code THEN
        UPDATE public.whatsapp_otp_codes SET attempts = attempts + 1 WHERE id = v_otp.id;
        RETURN jsonb_build_object('success', false, 'error', 'Código incorreto. Verifique os dígitos digitados.');
    END IF;

    UPDATE public.whatsapp_otp_codes SET verified = TRUE WHERE id = v_otp.id;

    v_final_name := TRIM(COALESCE(p_full_name, ''));
    IF v_final_name = '' OR v_final_name = 'Cliente' THEN
        SELECT full_name INTO v_final_name
        FROM public.customers WHERE tenant_id = v_tenant_id AND phone = v_clean_phone LIMIT 1;
        IF v_final_name IS NULL OR v_final_name = '' THEN v_final_name := 'Cliente'; END IF;
    END IF;

    INSERT INTO public.customers (tenant_id, phone, full_name, created_date, updated_date)
    VALUES (v_tenant_id, v_clean_phone, v_final_name, NOW(), NOW())
    ON CONFLICT (tenant_id, phone) DO UPDATE
    SET full_name = CASE WHEN EXCLUDED.full_name <> 'Cliente' THEN EXCLUDED.full_name ELSE public.customers.full_name END,
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
$function$;

-- Revogar acesso anônimo às RPCs administrativas
REVOKE ALL ON FUNCTION public.create_store_admin_user(uuid, text, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_store_admin_user(uuid, text, text, text, jsonb) TO authenticated;

REVOKE ALL ON FUNCTION public.update_store_admin_user(uuid, text, text, text, jsonb, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_store_admin_user(uuid, text, text, text, jsonb, boolean) TO authenticated;

REVOKE ALL ON FUNCTION public.delete_store_admin_user(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_store_admin_user(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.update_tenant_payment_methods(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_tenant_payment_methods(uuid, jsonb) TO authenticated;

REVOKE ALL ON FUNCTION public.update_tenant_delivery_drivers(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_tenant_delivery_drivers(uuid, jsonb) TO authenticated;

REVOKE ALL ON FUNCTION public.update_tenant_settings(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_tenant_settings(uuid, jsonb) TO authenticated;

REVOKE ALL ON FUNCTION public.generate_default_tables(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_default_tables(uuid, integer) TO authenticated;

REVOKE ALL ON FUNCTION public.open_table_session(uuid, uuid, text, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.open_table_session(uuid, uuid, text, text, integer) TO authenticated;

REVOKE ALL ON FUNCTION public.close_table_session(uuid, uuid, text, jsonb, numeric, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.close_table_session(uuid, uuid, text, jsonb, numeric, numeric) TO authenticated;

REVOKE ALL ON FUNCTION public.auto_deliver_stale_orders(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.auto_deliver_stale_orders(uuid, integer) TO authenticated;

REVOKE ALL ON FUNCTION public.process_order_cashback(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.process_order_cashback(text, text) TO authenticated;

REVOKE ALL ON FUNCTION public.revert_order_cashback(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revert_order_cashback(text) TO authenticated;

REVOKE ALL ON FUNCTION public.resolve_system_issue(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_system_issue(uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION public.reopen_system_issue(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reopen_system_issue(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.generate_spooler_pairing_code(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_spooler_pairing_code(uuid) TO authenticated;

-- 5. TRIGGER DE NUMERAÇÃO ATÔMICA POR TENANT + OTIMIZAÇÃO DO PRINT JOBS TRIGGER
ALTER TABLE public.orders ALTER COLUMN order_number DROP DEFAULT;

CREATE OR REPLACE FUNCTION public.fn_orders_assign_tenant_order_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    IF NEW.order_number IS NULL AND NEW.tenant_id IS NOT NULL THEN
        PERFORM pg_advisory_xact_lock(hashtext('order_num_' || NEW.tenant_id::text));
        SELECT COALESCE(MAX(order_number), 0) + 1
        INTO NEW.order_number
        FROM public.orders
        WHERE tenant_id = NEW.tenant_id;
    END IF;
    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_orders_assign_tenant_order_number ON public.orders;
CREATE TRIGGER trg_orders_assign_tenant_order_number
BEFORE INSERT ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.fn_orders_assign_tenant_order_number();

-- Otimiza trigger de print_jobs para não disparar em updates de print_status / payment_status irrelevantes
DROP TRIGGER IF EXISTS trg_orders_sync_print_jobs ON public.orders;
CREATE TRIGGER trg_orders_sync_print_jobs
AFTER INSERT OR UPDATE OF status, items, order_type, table_number ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.fn_orders_sync_print_jobs();

-- 6. CHECKOUT PÚBLICO SERVIDOR-VALIDADO COMPLETO (ATÔMICO, COM LOCK DE ORDER_NUMBER, CUPOM, CASHBACK E MESA)
DROP FUNCTION IF EXISTS public.create_public_order(uuid, text, text, text, text, text, jsonb, text, text, text);

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
    v_clean_phone TEXT := regexp_replace(COALESCE(p_customer_phone, ''), '\D', '', 'g');
    v_coupon_usages_count INT := 0;
    v_wallet RECORD;
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

    -- Recalcular preços oficiais de cada item, pizza e adicional diretamente do banco
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

        -- Suporte a preços por tamanho de pizza
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

        -- Adicionais e Complementos oficiais do banco
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

    -- Taxa de entrega oficial
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

    -- Cupom de desconto com lock FOR UPDATE e respeito a usage_limit
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

    -- Cashback: débito atômico e cálculo de ganho
    v_after_coupon := GREATEST(0, v_subtotal + v_delivery_fee - v_discount);
    IF NOT v_is_dine_in AND COALESCE(v_tenant.cashback_enabled, false) = true AND LENGTH(v_clean_phone) >= 8 THEN
        IF p_use_cashback = true OR COALESCE(p_cashback_amount, 0) > 0 THEN
            SELECT * INTO v_wallet
            FROM public.customer_cashback_wallets
            WHERE tenant_id = p_tenant_id AND phone = v_clean_phone
            FOR UPDATE;

            IF FOUND AND v_wallet.balance > 0 AND (v_wallet.expires_at IS NULL OR v_wallet.expires_at >= NOW()) THEN
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

    -- Lock por tenant para numeração sequencial sem colisão
    PERFORM pg_advisory_xact_lock(hashtext('order_num_' || p_tenant_id::text));
    SELECT COALESCE(MAX(order_number), 0) + 1
    INTO v_order_number
    FROM public.orders
    WHERE tenant_id = p_tenant_id;

    v_order_id := COALESCE(
        NULLIF(TRIM(p_order_id), ''),
        'ord_' || to_char(now(), 'YYYYMMDD') || '_' || lpad(v_order_number::text, 4, '0') || '_' || substr(gen_random_uuid()::text, 1, 6)
    );

    -- Vinculação / abertura atômica de sessão de mesa se dine_in
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

    IF v_discount > 0 AND v_coupon.id IS NOT NULL THEN
        INSERT INTO public.coupon_usages (id, tenant_id, coupon_id, user_email, order_id, created_date, updated_date)
        VALUES (
            gen_random_uuid()::text,
            p_tenant_id,
            v_coupon.id,
            COALESCE(NULLIF(TRIM(p_customer_email), '') || ' ', '') || '[phone:' || COALESCE(v_clean_phone, 'guest') || ']',
            v_order_id,
            now(),
            now()
        );
    END IF;

    IF v_cashback_discount > 0 AND v_wallet.id IS NOT NULL THEN
        UPDATE public.customer_cashback_wallets
        SET balance = GREATEST(0, balance - v_cashback_discount), updated_at = NOW()
        WHERE id = v_wallet.id;

        INSERT INTO public.customer_cashback_transactions (wallet_id, tenant_id, order_id, amount, type, description)
        VALUES (v_wallet.id, p_tenant_id, v_order_id, -v_cashback_discount, 'debit', 'Abatimento no pedido #' || UPPER(SUBSTRING(v_order_id, 1, 6)));
    END IF;

    RETURN jsonb_build_object(
        'success', true,
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

GRANT EXECUTE ON FUNCTION public.create_public_order(uuid, text, text, text, text, text, jsonb, text, text, text, text, boolean, numeric, text, text, text, text) TO anon, authenticated;

-- 7. RPCs PÚBLICAS SEGURAS PARA CLIENTE (MyOrders por token, Endereços por telefone, Sessão de Mesa, PIX fallback, Cupom usage)
CREATE OR REPLACE FUNCTION public.get_public_orders_by_tokens(p_tokens jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_result JSONB := '[]'::jsonb;
BEGIN
    IF p_tokens IS NULL OR jsonb_typeof(p_tokens) <> 'array' THEN
        RETURN '[]'::jsonb;
    END IF;

    SELECT COALESCE(jsonb_agg(row_to_json(q) ORDER BY q.created_date DESC), '[]'::jsonb)
    INTO v_result
    FROM (
        SELECT
            o.id, o.tenant_id, o.order_number, o.tracking_token, o.customer_name, o.customer_phone,
            o.delivery_address, o.customer_address, o.total, o.total_amount, o.subtotal, o.delivery_fee,
            o.discount, o.discount_amount, o.cashback_discount, o.cashback_earned,
            o.status, o.payment_status, o.payment_method, o.order_type, o.table_number,
            o.notes, o.items, o.created_date, o.updated_date, o.cancel_reason
        FROM public.orders o
        JOIN jsonb_array_elements(p_tokens) tok
          ON o.id = tok->>'id'
         AND o.tracking_token::text = tok->>'tracking_token'
    ) q;

    RETURN v_result;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_public_orders_by_tokens(jsonb) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.convert_pix_order_to_delivery(p_order_id text, p_tracking_token uuid, p_payment_method text DEFAULT 'card_delivery'::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_order RECORD;
    v_next_status TEXT := 'pendente';
BEGIN
    SELECT o.*, t.auto_accept_delivery
    INTO v_order
    FROM public.orders o
    JOIN public.tenants t ON t.id = o.tenant_id
    WHERE o.id = p_order_id AND o.tracking_token = p_tracking_token
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Pedido não encontrado ou token inválido.');
    END IF;

    IF v_order.status NOT IN ('aguardando_pagamento', 'pendente') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Este pedido não pode mais alterar a forma de pagamento.');
    END IF;

    IF COALESCE(v_order.auto_accept_delivery, false) = true AND COALESCE(v_order.order_type, 'delivery') = 'delivery' THEN
        v_next_status := 'confirmado';
    END IF;

    UPDATE public.orders
    SET payment_method = p_payment_method,
        payment_status = 'pending_delivery',
        status = v_next_status,
        updated_date = NOW()
    WHERE id = p_order_id;

    RETURN jsonb_build_object('success', true, 'status', v_next_status, 'payment_status', 'pending_delivery');
END;
$function$;

GRANT EXECUTE ON FUNCTION public.convert_pix_order_to_delivery(text, uuid, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_public_table_session(p_tenant_id uuid, p_table_number text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_clean_num TEXT := REGEXP_REPLACE(TRIM(COALESCE(p_table_number, '')), '^Mesa\s*', '', 'i');
    v_session RECORD;
BEGIN
    SELECT id, table_id, table_number, status, opened_at, people_count, subtotal
    INTO v_session
    FROM public.table_sessions
    WHERE tenant_id = p_tenant_id
      AND LOWER(table_number) = LOWER(v_clean_num)
      AND status IN ('open', 'bill_requested')
    ORDER BY opened_at DESC
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('found', false);
    END IF;

    RETURN jsonb_build_object('found', true, 'session', to_jsonb(v_session));
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_public_table_session(uuid, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_customer_addresses(p_tenant_id uuid, p_phone text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_clean_phone TEXT := regexp_replace(COALESCE(p_phone, ''), '\D', '', 'g');
    v_rows JSONB := '[]'::jsonb;
BEGIN
    IF LENGTH(v_clean_phone) < 8 THEN
        RETURN '[]'::jsonb;
    END IF;

    SELECT COALESCE(jsonb_agg(to_jsonb(a) ORDER BY a.is_default DESC, a.created_date DESC), '[]'::jsonb)
    INTO v_rows
    FROM public.user_addresses a
    WHERE a.tenant_id = p_tenant_id
      AND regexp_replace(COALESCE(a.user_phone, ''), '\D', '', 'g') = v_clean_phone;

    RETURN v_rows;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_customer_addresses(uuid, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.save_customer_address(
    p_tenant_id uuid,
    p_phone text,
    p_data jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_clean_phone TEXT := regexp_replace(COALESCE(p_phone, ''), '\D', '', 'g');
    v_id TEXT := COALESCE(NULLIF(p_data->>'id', ''), gen_random_uuid()::text);
    v_saved JSONB;
BEGIN
    IF LENGTH(v_clean_phone) < 8 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Telefone inválido.');
    END IF;

    IF EXISTS (SELECT 1 FROM public.user_addresses WHERE id = v_id AND tenant_id = p_tenant_id AND regexp_replace(COALESCE(user_phone, ''), '\D', '', 'g') = v_clean_phone) THEN
        UPDATE public.user_addresses
        SET name = COALESCE(p_data->>'name', name),
            cep = COALESCE(p_data->>'cep', cep),
            street = COALESCE(p_data->>'street', street),
            number = COALESCE(p_data->>'number', number),
            complement = p_data->>'complement',
            neighborhood = COALESCE(p_data->>'neighborhood', neighborhood),
            city = COALESCE(p_data->>'city', city),
            state = COALESCE(p_data->>'state', state),
            reference = p_data->>'reference',
            is_default = COALESCE((p_data->>'is_default')::boolean, is_default),
            updated_date = NOW()
        WHERE id = v_id
        RETURNING to_jsonb(user_addresses.*) INTO v_saved;
    ELSE
        INSERT INTO public.user_addresses (
            id, tenant_id, user_phone, user_email, name, cep, street, number, complement, neighborhood, city, state, reference, is_default
        ) VALUES (
            v_id, p_tenant_id, v_clean_phone, p_data->>'user_email',
            COALESCE(p_data->>'name', 'Casa'), p_data->>'cep',
            COALESCE(p_data->>'street', ''), COALESCE(p_data->>'number', 'S/N'),
            p_data->>'complement', COALESCE(p_data->>'neighborhood', ''),
            COALESCE(p_data->>'city', ''), COALESCE(p_data->>'state', 'MG'),
            p_data->>'reference', COALESCE((p_data->>'is_default')::boolean, false)
        )
        RETURNING to_jsonb(user_addresses.*) INTO v_saved;
    END IF;

    RETURN jsonb_build_object('success', true, 'address', v_saved);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.save_customer_address(uuid, text, jsonb) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.delete_customer_address(p_tenant_id uuid, p_phone text, p_address_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_clean_phone TEXT := regexp_replace(COALESCE(p_phone, ''), '\D', '', 'g');
BEGIN
    DELETE FROM public.user_addresses
    WHERE id = p_address_id
      AND tenant_id = p_tenant_id
      AND regexp_replace(COALESCE(user_phone, ''), '\D', '', 'g') = v_clean_phone;

    RETURN jsonb_build_object('success', true);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.delete_customer_address(uuid, text, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_coupon_usage_count(p_tenant_id uuid, p_coupon_id text, p_phone text DEFAULT NULL::text)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
    SELECT COUNT(*)::integer
    FROM public.coupon_usages
    WHERE tenant_id = p_tenant_id
      AND coupon_id = p_coupon_id;
$function$;

GRANT EXECUTE ON FUNCTION public.get_coupon_usage_count(uuid, text, text) TO anon, authenticated;

-- 8. FECHAMENTO ESTRITO DE RLS EM TODAS AS TABELAS (FIM DO VAZAMENTO ANÔNIMO E CROSS-TENANT)
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT tablename, policyname
        FROM pg_policies
        WHERE schemaname = 'public'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
    END LOOP;
END $$;

-- tenants: apenas admin autenticado da loja ou super_admin (leitura pública vai via tenants_public!)
CREATE POLICY "tenants_select_auth" ON public.tenants FOR SELECT TO authenticated USING (id = public.get_auth_tenant_id() OR public.is_super_admin());
CREATE POLICY "tenants_update_auth" ON public.tenants FOR UPDATE TO authenticated USING (id = public.get_auth_tenant_id() OR public.is_super_admin()) WITH CHECK (id = public.get_auth_tenant_id() OR public.is_super_admin());
CREATE POLICY "tenants_manage_superadmin" ON public.tenants FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

-- tenant_admins (corrige auth_rls_initplan com SELECT auth.uid())
CREATE POLICY "tenant_admins_select_own" ON public.tenant_admins FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()) OR public.is_super_admin());
CREATE POLICY "tenant_admins_manage_super" ON public.tenant_admins FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

-- admin_users (sem acesso para anon!)
CREATE POLICY "admin_users_manage_auth" ON public.admin_users FOR ALL TO authenticated USING (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin()) WITH CHECK (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin());

-- Catálogo público: SELECT público, escrita restrita ao admin do tenant
CREATE POLICY "categories_public_select" ON public.categories FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "categories_admin_write" ON public.categories FOR INSERT TO authenticated WITH CHECK (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin());
CREATE POLICY "categories_admin_update" ON public.categories FOR UPDATE TO authenticated USING (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin()) WITH CHECK (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin());
CREATE POLICY "categories_admin_delete" ON public.categories FOR DELETE TO authenticated USING (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin());

CREATE POLICY "products_public_select" ON public.products FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "products_admin_write" ON public.products FOR INSERT TO authenticated WITH CHECK (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin());
CREATE POLICY "products_admin_update" ON public.products FOR UPDATE TO authenticated USING (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin()) WITH CHECK (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin());
CREATE POLICY "products_admin_delete" ON public.products FOR DELETE TO authenticated USING (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin());

CREATE POLICY "complement_groups_public_select" ON public.complement_groups FOR SELECT TO anon, authenticated USING (active = true OR tenant_id = public.get_auth_tenant_id() OR public.is_super_admin());
CREATE POLICY "complement_groups_admin_write" ON public.complement_groups FOR INSERT TO authenticated WITH CHECK (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin());
CREATE POLICY "complement_groups_admin_update" ON public.complement_groups FOR UPDATE TO authenticated USING (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin()) WITH CHECK (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin());
CREATE POLICY "complement_groups_admin_delete" ON public.complement_groups FOR DELETE TO authenticated USING (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin());

CREATE POLICY "complement_items_public_select" ON public.complement_items FOR SELECT TO anon, authenticated USING (active = true OR tenant_id = public.get_auth_tenant_id() OR public.is_super_admin());
CREATE POLICY "complement_items_admin_write" ON public.complement_items FOR INSERT TO authenticated WITH CHECK (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin());
CREATE POLICY "complement_items_admin_update" ON public.complement_items FOR UPDATE TO authenticated USING (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin()) WITH CHECK (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin());
CREATE POLICY "complement_items_admin_delete" ON public.complement_items FOR DELETE TO authenticated USING (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin());

CREATE POLICY "product_complement_groups_public_select" ON public.product_complement_groups FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "product_complement_groups_admin_write" ON public.product_complement_groups FOR INSERT TO authenticated WITH CHECK (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin());
CREATE POLICY "product_complement_groups_admin_update" ON public.product_complement_groups FOR UPDATE TO authenticated USING (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin()) WITH CHECK (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin());
CREATE POLICY "product_complement_groups_admin_delete" ON public.product_complement_groups FOR DELETE TO authenticated USING (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin());

CREATE POLICY "product_additionals_public_select" ON public.product_additionals FOR SELECT TO anon, authenticated USING (active = true OR tenant_id = public.get_auth_tenant_id() OR public.is_super_admin());
CREATE POLICY "product_additionals_admin_write" ON public.product_additionals FOR INSERT TO authenticated WITH CHECK (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin());
CREATE POLICY "product_additionals_admin_update" ON public.product_additionals FOR UPDATE TO authenticated USING (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin()) WITH CHECK (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin());
CREATE POLICY "product_additionals_admin_delete" ON public.product_additionals FOR DELETE TO authenticated USING (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin());

CREATE POLICY "banner_images_public_select" ON public.banner_images FOR SELECT TO anon, authenticated USING (active = true OR tenant_id = public.get_auth_tenant_id() OR public.is_super_admin());
CREATE POLICY "banner_images_admin_write" ON public.banner_images FOR INSERT TO authenticated WITH CHECK (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin());
CREATE POLICY "banner_images_admin_update" ON public.banner_images FOR UPDATE TO authenticated USING (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin()) WITH CHECK (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin());
CREATE POLICY "banner_images_admin_delete" ON public.banner_images FOR DELETE TO authenticated USING (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin());

CREATE POLICY "banners_public_select" ON public.banners FOR SELECT TO anon, authenticated USING (active = true OR tenant_id = public.get_auth_tenant_id() OR public.is_super_admin());
CREATE POLICY "banners_admin_write" ON public.banners FOR INSERT TO authenticated WITH CHECK (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin());
CREATE POLICY "banners_admin_update" ON public.banners FOR UPDATE TO authenticated USING (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin()) WITH CHECK (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin());
CREATE POLICY "banners_admin_delete" ON public.banners FOR DELETE TO authenticated USING (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin());

CREATE POLICY "coupons_public_select" ON public.coupons FOR SELECT TO anon, authenticated USING ((active = true AND (end_date IS NULL OR end_date >= now())) OR tenant_id = public.get_auth_tenant_id() OR public.is_super_admin());
CREATE POLICY "coupons_admin_write" ON public.coupons FOR INSERT TO authenticated WITH CHECK (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin());
CREATE POLICY "coupons_admin_update" ON public.coupons FOR UPDATE TO authenticated USING (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin()) WITH CHECK (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin());
CREATE POLICY "coupons_admin_delete" ON public.coupons FOR DELETE TO authenticated USING (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin());

CREATE POLICY "production_sectors_public_select" ON public.production_sectors FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "production_sectors_admin_write" ON public.production_sectors FOR INSERT TO authenticated WITH CHECK (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin());
CREATE POLICY "production_sectors_admin_update" ON public.production_sectors FOR UPDATE TO authenticated USING (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin()) WITH CHECK (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin());
CREATE POLICY "production_sectors_admin_delete" ON public.production_sectors FOR DELETE TO authenticated USING (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin());

CREATE POLICY "restaurant_tables_public_select" ON public.restaurant_tables FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "restaurant_tables_admin_write" ON public.restaurant_tables FOR INSERT TO authenticated WITH CHECK (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin());
CREATE POLICY "restaurant_tables_admin_update" ON public.restaurant_tables FOR UPDATE TO authenticated USING (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin()) WITH CHECK (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin());
CREATE POLICY "restaurant_tables_admin_delete" ON public.restaurant_tables FOR DELETE TO authenticated USING (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin());

-- Tabelas privadas / financeiras / operacionais: acesso direto estritamente por tenant autenticado ou SuperAdmin
CREATE POLICY "orders_tenant_isolation" ON public.orders FOR ALL TO authenticated USING (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin()) WITH CHECK (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin());
CREATE POLICY "order_items_tenant_isolation" ON public.order_items FOR ALL TO authenticated USING (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin()) WITH CHECK (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin());
CREATE POLICY "order_item_additionals_tenant_isolation" ON public.order_item_additionals FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.order_items oi WHERE oi.id = order_item_additionals.order_item_id AND (oi.tenant_id = public.get_auth_tenant_id() OR public.is_super_admin()))) WITH CHECK (EXISTS (SELECT 1 FROM public.order_items oi WHERE oi.id = order_item_additionals.order_item_id AND (oi.tenant_id = public.get_auth_tenant_id() OR public.is_super_admin())));
CREATE POLICY "coupon_usages_tenant_isolation" ON public.coupon_usages FOR ALL TO authenticated USING (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin()) WITH CHECK (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin());
CREATE POLICY "table_sessions_tenant_isolation" ON public.table_sessions FOR ALL TO authenticated USING (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin()) WITH CHECK (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin());
CREATE POLICY "shift_closings_tenant_isolation" ON public.shift_closings FOR ALL TO authenticated USING (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin()) WITH CHECK (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin());
CREATE POLICY "customers_tenant_isolation" ON public.customers FOR ALL TO authenticated USING (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin()) WITH CHECK (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin());
CREATE POLICY "user_addresses_tenant_isolation" ON public.user_addresses FOR ALL TO authenticated USING (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin()) WITH CHECK (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin());
CREATE POLICY "cashback_wallets_tenant_isolation" ON public.customer_cashback_wallets FOR ALL TO authenticated USING (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin()) WITH CHECK (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin());
CREATE POLICY "cashback_tx_tenant_isolation" ON public.customer_cashback_transactions FOR ALL TO authenticated USING (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin()) WITH CHECK (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin());
CREATE POLICY "print_jobs_tenant_isolation" ON public.print_jobs FOR ALL TO authenticated USING (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin()) WITH CHECK (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin());

-- system_issues: leitura/gestão exclusiva do SuperAdmin; inserção via report_system_issue RPC
CREATE POLICY "system_issues_superadmin_manage" ON public.system_issues FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
CREATE POLICY "system_issues_public_insert" ON public.system_issues FOR INSERT TO anon, authenticated WITH CHECK (true);

-- 9. ÍNDICES DE CHAVES ESTRANGEIRAS FALTANTES (Performance Advisor)
CREATE INDEX IF NOT EXISTS idx_banner_images_tenant_id ON public.banner_images (tenant_id);
CREATE INDEX IF NOT EXISTS idx_complement_items_group_id ON public.complement_items (group_id);
CREATE INDEX IF NOT EXISTS idx_coupon_usages_coupon_id ON public.coupon_usages (coupon_id);
CREATE INDEX IF NOT EXISTS idx_coupon_usages_tenant_id ON public.coupon_usages (tenant_id);
CREATE INDEX IF NOT EXISTS idx_cashback_tx_order_id ON public.customer_cashback_transactions (order_id);
CREATE INDEX IF NOT EXISTS idx_cashback_tx_tenant_id ON public.customer_cashback_transactions (tenant_id);
CREATE INDEX IF NOT EXISTS idx_order_item_additionals_item_id ON public.order_item_additionals (order_item_id);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON public.order_items (order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_tenant_id ON public.order_items (tenant_id);
CREATE INDEX IF NOT EXISTS idx_print_jobs_sector_id ON public.print_jobs (sector_id);
CREATE INDEX IF NOT EXISTS idx_product_additionals_product_id ON public.product_additionals (product_id);
CREATE INDEX IF NOT EXISTS idx_product_additionals_tenant_id ON public.product_additionals (tenant_id);
CREATE INDEX IF NOT EXISTS idx_product_complement_groups_group_id ON public.product_complement_groups (group_id);
CREATE INDEX IF NOT EXISTS idx_product_complement_groups_product_id ON public.product_complement_groups (product_id);
CREATE INDEX IF NOT EXISTS idx_products_category ON public.products (category);
CREATE INDEX IF NOT EXISTS idx_products_category_id ON public.products (category_id);
CREATE INDEX IF NOT EXISTS idx_user_addresses_tenant_id ON public.user_addresses (tenant_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_otp_codes_tenant_id ON public.whatsapp_otp_codes (tenant_id);


-- >>> MIGRATION: 20261111_spooler_cloud_rpcs.sql
-- RPCs atômicas para o Spooler Autônomo (.exe Etapa 2) parear, consumir print_jobs e confirmar impressão
-- Autenticação baseada no token criptográfico exclusivo da loja (spooler_station_token).

CREATE OR REPLACE FUNCTION public.spooler_pair(p_pairing_code TEXT)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    v_tenant RECORD;
    v_clean_code TEXT := upper(trim(COALESCE(p_pairing_code, '')));
BEGIN
    IF v_clean_code = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Código de pareamento obrigatório.');
    END IF;

    SELECT id, name, slug, spooler_station_token
    INTO v_tenant
    FROM public.tenants
    WHERE spooler_pairing_code = v_clean_code
      AND spooler_station_token IS NOT NULL
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Código de pareamento inválido.');
    END IF;

    UPDATE public.tenants
    SET spooler_last_seen_at = NOW()
    WHERE id = v_tenant.id;

    RETURN jsonb_build_object(
        'success', true,
        'stationToken', v_tenant.spooler_station_token,
        'tenantId', v_tenant.id,
        'tenantName', v_tenant.name,
        'tenantSlug', v_tenant.slug
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.spooler_poll(p_station_token TEXT)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    v_tenant RECORD;
    v_jobs JSONB := '[]'::jsonb;
BEGIN
    IF COALESCE(trim(p_station_token), '') = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Token de estação ausente.');
    END IF;

    SELECT id, name, slug
    INTO v_tenant
    FROM public.tenants
    WHERE spooler_station_token = trim(p_station_token)
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Estação não autorizada ou desconectada.');
    END IF;

    UPDATE public.tenants
    SET spooler_last_seen_at = NOW()
    WHERE id = v_tenant.id;

    -- Recupera jobs travados em 'printing' há mais de 90s (máx 5 tentativas)
    UPDATE public.print_jobs
    SET status = 'pending', updated_date = NOW()
    WHERE tenant_id = v_tenant.id
      AND status = 'printing'
      AND updated_date < NOW() - INTERVAL '90 seconds'
      AND attempts < 5;

    -- Claim atômico FIFO dos próximos jobs térmicos das últimas 12 horas
    WITH next_jobs AS (
        SELECT pj.id
        FROM public.print_jobs pj
        WHERE pj.tenant_id = v_tenant.id
          AND pj.status = 'pending'
          AND pj.printer_type <> 'a4_browser'
          AND pj.created_date >= NOW() - INTERVAL '12 hours'
        ORDER BY pj.created_date ASC
        LIMIT 10
        FOR UPDATE SKIP LOCKED
    ),
    claimed AS (
        UPDATE public.print_jobs pj
        SET
            status = 'printing',
            attempts = pj.attempts + 1,
            updated_date = NOW()
        FROM next_jobs nj
        WHERE pj.id = nj.id
        RETURNING pj.*
    )
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'id', c.id,
                'order_id', c.order_id,
                'sector_id', c.sector_id,
                'sector_key', c.sector_key,
                'sector_name', c.sector_name,
                'printer_name', c.printer_name,
                'printer_type', c.printer_type,
                'paper_width', c.paper_width,
                'content_mode', c.content_mode,
                'copies', c.copies,
                'items_payload', c.items_payload,
                'storeName', v_tenant.name,
                'order', to_jsonb(o.*)
            )
            ORDER BY c.created_date ASC
        ),
        '[]'::jsonb
    )
    INTO v_jobs
    FROM claimed c
    JOIN public.orders o ON o.id = c.order_id;

    RETURN jsonb_build_object(
        'success', true,
        'tenantName', v_tenant.name,
        'jobs', v_jobs
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.spooler_ack(
    p_station_token TEXT,
    p_job_id UUID,
    p_status TEXT,
    p_error_message TEXT DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    v_tenant_id UUID;
    v_order_id TEXT;
    v_final_status TEXT := CASE WHEN p_status = 'printed' THEN 'printed' ELSE 'failed' END;
    v_all_done BOOLEAN := false;
BEGIN
    SELECT id INTO v_tenant_id
    FROM public.tenants
    WHERE spooler_station_token = trim(COALESCE(p_station_token, ''))
    LIMIT 1;

    IF v_tenant_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Estação não autorizada.');
    END IF;

    UPDATE public.print_jobs
    SET
        status = v_final_status,
        printed_at = CASE WHEN v_final_status = 'printed' THEN NOW() ELSE NULL END,
        error_message = p_error_message,
        updated_date = NOW()
    WHERE id = p_job_id
      AND tenant_id = v_tenant_id
    RETURNING order_id INTO v_order_id;

    IF v_order_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Job não encontrado.');
    END IF;

    IF v_final_status = 'printed' THEN
        SELECT NOT EXISTS (
            SELECT 1
            FROM public.print_jobs pj
            WHERE pj.order_id = v_order_id
              AND pj.status <> 'printed'
        ) INTO v_all_done;

        IF v_all_done THEN
            UPDATE public.orders
            SET
                print_status = 'printed',
                printed_at = NOW(),
                print_count = COALESCE(print_count, 0) + 1,
                updated_date = NOW()
            WHERE id = v_order_id;
        END IF;
    END IF;

    RETURN jsonb_build_object('success', true);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.spooler_pair(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.spooler_poll(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.spooler_ack(TEXT, UUID, TEXT, TEXT) TO anon, authenticated;



-- >>> MIGRATION: 20261111_transactions_concurrency_business_rules.sql
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


-- >>> MIGRATION: 20261112_cash_management_sessions_and_blind_closing.sql
-- ============================================================================
-- Migration: Gestão de Caixa Padrão Ouro (cash_sessions, cash_movements,
-- Fechamento Cego por loja e RPCs atômicas com RLS)
-- ============================================================================

-- 1. Configuração por loja de Fechamento Cego
ALTER TABLE public.tenants
    ADD COLUMN IF NOT EXISTS blind_cash_closing BOOLEAN NOT NULL DEFAULT false;

-- 2. Sessões de Caixa (Persistência multi-dispositivo e trilha de auditoria)
CREATE TABLE IF NOT EXISTS public.cash_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
    opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    closed_at TIMESTAMPTZ,
    opened_by TEXT NOT NULL DEFAULT 'Operador Principal',
    closed_by TEXT,
    initial_float NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (initial_float >= 0),
    notes TEXT NOT NULL DEFAULT '',
    expected_cash NUMERIC(10,2),
    counted_cash NUMERIC(10,2),
    difference_amount NUMERIC(10,2),
    justification TEXT NOT NULL DEFAULT '',
    blind_closing BOOLEAN NOT NULL DEFAULT false,
    shift_closing_id UUID REFERENCES public.shift_closings(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_cash_sessions_open_tenant
    ON public.cash_sessions (tenant_id)
    WHERE status = 'open';

CREATE INDEX IF NOT EXISTS idx_cash_sessions_tenant_opened
    ON public.cash_sessions (tenant_id, opened_at DESC);

CREATE INDEX IF NOT EXISTS idx_cash_sessions_shift_closing_id
    ON public.cash_sessions (shift_closing_id);

ALTER TABLE public.cash_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cash_sessions_tenant_isolation" ON public.cash_sessions;
CREATE POLICY "cash_sessions_tenant_isolation"
    ON public.cash_sessions
    FOR ALL
    TO authenticated
    USING (
        tenant_id = (SELECT public.get_auth_tenant_id())
        OR (SELECT public.is_super_admin())
    )
    WITH CHECK (
        tenant_id = (SELECT public.get_auth_tenant_id())
        OR (SELECT public.is_super_admin())
    );

-- 3. Movimentações da Gaveta (Abertura, Suprimentos, Sangrias e Despesas)
CREATE TABLE IF NOT EXISTS public.cash_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    cash_session_id UUID NOT NULL REFERENCES public.cash_sessions(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('open', 'supply', 'bleed', 'expense')),
    title TEXT NOT NULL,
    category TEXT,
    amount NUMERIC(10,2) NOT NULL CHECK (amount >= 0),
    direction TEXT NOT NULL CHECK (direction IN ('in', 'out')),
    operator_name TEXT NOT NULL DEFAULT 'Operador Principal',
    notes TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cash_movements_tenant_created
    ON public.cash_movements (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_cash_movements_session_created
    ON public.cash_movements (cash_session_id, created_at ASC);

ALTER TABLE public.cash_movements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cash_movements_tenant_isolation" ON public.cash_movements;
CREATE POLICY "cash_movements_tenant_isolation"
    ON public.cash_movements
    FOR ALL
    TO authenticated
    USING (
        tenant_id = (SELECT public.get_auth_tenant_id())
        OR (SELECT public.is_super_admin())
    )
    WITH CHECK (
        tenant_id = (SELECT public.get_auth_tenant_id())
        OR (SELECT public.is_super_admin())
    );

-- 4. RPC: Abrir Sessão de Caixa com trava contra duplicidade
CREATE OR REPLACE FUNCTION public.open_cash_session(
    p_tenant_id UUID,
    p_initial_float NUMERIC DEFAULT 0,
    p_operator TEXT DEFAULT 'Operador Principal',
    p_notes TEXT DEFAULT ''
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_existing_id UUID;
    v_blind_closing BOOLEAN := false;
    v_session public.cash_sessions%ROWTYPE;
    v_movement public.cash_movements%ROWTYPE;
    v_operator TEXT := COALESCE(NULLIF(TRIM(p_operator), ''), 'Operador Principal');
    v_notes TEXT := COALESCE(TRIM(p_notes), '');
BEGIN
    IF public.is_authorized_for_tenant(p_tenant_id) IS NOT TRUE THEN
        RAISE EXCEPTION 'Acesso negado: Sem permissão para abrir o caixa desta loja.';
    END IF;

    IF p_initial_float IS NULL OR p_initial_float < 0 THEN
        RAISE EXCEPTION 'Valor de troco inicial inválido.';
    END IF;

    SELECT id INTO v_existing_id
    FROM public.cash_sessions
    WHERE tenant_id = p_tenant_id AND status = 'open'
    FOR UPDATE;

    IF v_existing_id IS NOT NULL THEN
        RAISE EXCEPTION 'Já existe um caixa aberto para esta loja.';
    END IF;

    SELECT COALESCE(blind_cash_closing, false) INTO v_blind_closing
    FROM public.tenants
    WHERE id = p_tenant_id;

    INSERT INTO public.cash_sessions (
        tenant_id, status, opened_at, opened_by, initial_float, notes, blind_closing
    )
    VALUES (
        p_tenant_id, 'open', NOW(), v_operator, ROUND(p_initial_float, 2), v_notes, COALESCE(v_blind_closing, false)
    )
    RETURNING * INTO v_session;

    INSERT INTO public.cash_movements (
        tenant_id, cash_session_id, type, title, category, amount, direction, operator_name, notes
    )
    VALUES (
        p_tenant_id, v_session.id, 'open', 'Abertura de Caixa (Troco Inicial)', 'abertura', ROUND(p_initial_float, 2), 'in', v_operator, v_notes
    )
    RETURNING * INTO v_movement;

    RETURN jsonb_build_object(
        'session', to_jsonb(v_session),
        'movements', jsonb_build_array(to_jsonb(v_movement))
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.open_cash_session(UUID, NUMERIC, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.open_cash_session(UUID, NUMERIC, TEXT, TEXT) TO authenticated;

-- 5. RPC: Registrar Suprimento, Sangria ou Despesa na Sessão Aberta
CREATE OR REPLACE FUNCTION public.add_cash_movement(
    p_tenant_id UUID,
    p_session_id UUID,
    p_type TEXT,
    p_title TEXT,
    p_amount NUMERIC,
    p_operator TEXT DEFAULT 'Operador Principal',
    p_category TEXT DEFAULT NULL,
    p_notes TEXT DEFAULT ''
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_session_status TEXT;
    v_direction TEXT;
    v_movement public.cash_movements%ROWTYPE;
    v_operator TEXT := COALESCE(NULLIF(TRIM(p_operator), ''), 'Operador Principal');
    v_title TEXT := COALESCE(NULLIF(TRIM(p_title), ''), 'Movimentação de Caixa');
BEGIN
    IF public.is_authorized_for_tenant(p_tenant_id) IS NOT TRUE THEN
        RAISE EXCEPTION 'Acesso negado: Sem permissão para movimentar o caixa desta loja.';
    END IF;

    IF p_type NOT IN ('supply', 'bleed', 'expense') THEN
        RAISE EXCEPTION 'Tipo de movimentação inválido: %.', p_type;
    END IF;

    IF p_amount IS NULL OR p_amount <= 0 THEN
        RAISE EXCEPTION 'O valor da movimentação deve ser maior que zero.';
    END IF;

    SELECT status INTO v_session_status
    FROM public.cash_sessions
    WHERE id = p_session_id AND tenant_id = p_tenant_id
    FOR UPDATE;

    IF v_session_status IS NULL OR v_session_status <> 'open' THEN
        RAISE EXCEPTION 'Nenhuma sessão de caixa aberta encontrada para registrar a movimentação.';
    END IF;

    v_direction := CASE WHEN p_type = 'supply' THEN 'in' ELSE 'out' END;

    INSERT INTO public.cash_movements (
        tenant_id, cash_session_id, type, title, category, amount, direction, operator_name, notes
    )
    VALUES (
        p_tenant_id, p_session_id, p_type, v_title, p_category, ROUND(p_amount, 2), v_direction, v_operator, COALESCE(TRIM(p_notes), '')
    )
    RETURNING * INTO v_movement;

    UPDATE public.cash_sessions
    SET updated_at = NOW()
    WHERE id = p_session_id;

    RETURN to_jsonb(v_movement);
END;
$function$;

REVOKE ALL ON FUNCTION public.add_cash_movement(UUID, UUID, TEXT, TEXT, NUMERIC, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_cash_movement(UUID, UUID, TEXT, TEXT, NUMERIC, TEXT, TEXT, TEXT) TO authenticated;

-- 6. RPC: Fechar Sessão de Caixa com Validação de Justificativa em Divergências
CREATE OR REPLACE FUNCTION public.close_cash_session(
    p_tenant_id UUID,
    p_session_id UUID,
    p_expected_cash NUMERIC,
    p_counted_cash NUMERIC,
    p_difference NUMERIC,
    p_justification TEXT DEFAULT '',
    p_closed_by TEXT DEFAULT 'Operador Principal',
    p_blind_closing BOOLEAN DEFAULT false,
    p_shift_closing_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_session public.cash_sessions%ROWTYPE;
    v_trimmed_just TEXT := COALESCE(TRIM(p_justification), '');
    v_closed_by TEXT := COALESCE(NULLIF(TRIM(p_closed_by), ''), 'Operador Principal');
    v_diff NUMERIC(10,2) := ROUND(COALESCE(p_counted_cash, 0) - COALESCE(p_expected_cash, 0), 2);
BEGIN
    IF public.is_authorized_for_tenant(p_tenant_id) IS NOT TRUE THEN
        RAISE EXCEPTION 'Acesso negado: Sem permissão para fechar o caixa desta loja.';
    END IF;

    IF p_counted_cash IS NULL OR p_counted_cash < 0 THEN
        RAISE EXCEPTION 'Informe um valor contado na gaveta válido (maior ou igual a zero).';
    END IF;

    IF ABS(v_diff) >= 0.01 AND LENGTH(v_trimmed_just) = 0 THEN
        RAISE EXCEPTION 'Justificativa obrigatória quando houver sobra ou falta no fechamento.';
    END IF;

    SELECT * INTO v_session
    FROM public.cash_sessions
    WHERE id = p_session_id AND tenant_id = p_tenant_id AND status = 'open'
    FOR UPDATE;

    IF v_session.id IS NULL THEN
        RAISE EXCEPTION 'Sessão de caixa aberta não encontrada ou já fechada.';
    END IF;

    UPDATE public.cash_sessions
    SET
        status = 'closed',
        closed_at = NOW(),
        closed_by = v_closed_by,
        expected_cash = ROUND(COALESCE(p_expected_cash, 0), 2),
        counted_cash = ROUND(p_counted_cash, 2),
        difference_amount = v_diff,
        justification = v_trimmed_just,
        blind_closing = COALESCE(p_blind_closing, v_session.blind_closing, false),
        shift_closing_id = p_shift_closing_id,
        updated_at = NOW()
    WHERE id = p_session_id
    RETURNING * INTO v_session;

    RETURN to_jsonb(v_session);
END;
$function$;

REVOKE ALL ON FUNCTION public.close_cash_session(UUID, UUID, NUMERIC, NUMERIC, NUMERIC, TEXT, TEXT, BOOLEAN, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.close_cash_session(UUID, UUID, NUMERIC, NUMERIC, NUMERIC, TEXT, TEXT, BOOLEAN, UUID) TO authenticated;

-- 7. Atualizar update_tenant_settings para persistir blind_cash_closing
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
        blind_cash_closing = CASE WHEN p_data ? 'blind_cash_closing' THEN (p_data->>'blind_cash_closing')::boolean ELSE blind_cash_closing END,
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

-- 8. Atualizar delete_tenant para remover cash_movements e cash_sessions
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
    IF NOT (public.is_super_admin() IS TRUE OR auth.role() = 'service_role') THEN
        RAISE EXCEPTION 'Acesso negado: Apenas o SuperAdmin pode excluir estabelecimentos.';
    END IF;

    SELECT slug, name INTO v_slug, v_name
    FROM public.tenants
    WHERE id = p_tenant_id;

    IF v_slug IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Empresa não encontrada.');
    END IF;

    -- Coleta os IDs de contas Auth vinculadas ao tenant
    SELECT ARRAY(
        SELECT DISTINCT uid
        FROM (
            SELECT user_id AS uid FROM public.tenant_admins WHERE tenant_id = p_tenant_id AND user_id IS NOT NULL
            UNION
            SELECT id AS uid FROM public.admin_users WHERE tenant_id = p_tenant_id AND id IS NOT NULL
        ) sub
    ) INTO v_auth_user_ids;

    -- Exclusão explícita em ordem segura de dependências (system_issues preserva histórico via SET NULL)
    DELETE FROM public.print_jobs WHERE tenant_id = p_tenant_id;
    DELETE FROM public.customer_cashback_transactions WHERE tenant_id = p_tenant_id;
    DELETE FROM public.customer_cashback_wallets WHERE tenant_id = p_tenant_id;
    DELETE FROM public.customer_sessions WHERE tenant_id = p_tenant_id;
    DELETE FROM public.whatsapp_otp_codes WHERE tenant_id = p_tenant_id;
    DELETE FROM public.cash_movements WHERE tenant_id = p_tenant_id;
    DELETE FROM public.cash_sessions WHERE tenant_id = p_tenant_id;
    DELETE FROM public.shift_closings WHERE tenant_id = p_tenant_id;
    DELETE FROM public.order_items WHERE tenant_id = p_tenant_id;
    DELETE FROM public.orders WHERE tenant_id = p_tenant_id;
    DELETE FROM public.table_sessions WHERE tenant_id = p_tenant_id;
    DELETE FROM public.restaurant_tables WHERE tenant_id = p_tenant_id;
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
    DELETE FROM public.production_sectors WHERE tenant_id = p_tenant_id;
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
$function$;



-- >>> MIGRATION: 20261112_cash_session_orders_integrity.sql
-- ============================================================================
-- Migration: Integridade Contábil de Pedidos x Sessões de Caixa (Combo ERP)
-- 1. Coluna orders.cash_session_id ligada a public.cash_sessions
-- 2. Trigger automática para vincular novos pedidos ao caixa aberto (sem nunca
--    bloquear vendas online quando o caixa estiver fechado)
-- 3. Auto-vínculo ao aceitar/pagar pedido online órfão quando houver caixa aberto
-- 4. RPCs para listar e resgatar pedidos órfãos + suporte na abertura de caixa
-- ============================================================================

-- 1. Adiciona coluna cash_session_id em public.orders
ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS cash_session_id UUID REFERENCES public.cash_sessions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_orders_cash_session_id
    ON public.orders (cash_session_id);

CREATE INDEX IF NOT EXISTS idx_orders_tenant_cash_session
    ON public.orders (tenant_id, cash_session_id);

CREATE INDEX IF NOT EXISTS idx_orders_tenant_unlinked_recent
    ON public.orders (tenant_id, created_date DESC)
    WHERE cash_session_id IS NULL;

-- 2. Backfill seguro para pedidos existentes cuja criação ocorreu estritamente
-- dentro da janela de uma sessão já registrada em cash_sessions
UPDATE public.orders o
SET cash_session_id = s.id
FROM public.cash_sessions s
WHERE o.cash_session_id IS NULL
  AND o.tenant_id = s.tenant_id
  AND LOWER(COALESCE(o.status, '')) <> 'cancelado'
  AND o.created_date >= s.opened_at
  AND o.created_date <= COALESCE(s.closed_at, NOW());

-- 3. Trigger para carimbar cash_session_id automaticamente em INSERT/UPDATE
CREATE OR REPLACE FUNCTION public.fn_orders_attach_cash_session()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_open_session_id UUID;
    v_status TEXT := LOWER(COALESCE(NEW.status, ''));
    v_pay_status TEXT := LOWER(COALESCE(NEW.payment_status, ''));
BEGIN
    IF NEW.cash_session_id IS NOT NULL OR NEW.tenant_id IS NULL THEN
        RETURN NEW;
    END IF;

    IF v_status = 'cancelado' THEN
        RETURN NEW;
    END IF;

    IF TG_OP = 'INSERT' THEN
        SELECT id INTO v_open_session_id
        FROM public.cash_sessions
        WHERE tenant_id = NEW.tenant_id
          AND status = 'open'
        LIMIT 1;

        IF v_open_session_id IS NOT NULL THEN
            NEW.cash_session_id := v_open_session_id;
        END IF;

        RETURN NEW;
    END IF;

    IF TG_OP = 'UPDATE' AND OLD.cash_session_id IS NULL THEN
        -- Quando um pedido órfão é aceito/operado ou quitado enquanto existe um caixa aberto,
        -- vincula automaticamente ao turno aberto.
        IF v_status IN ('confirmado', 'preparando', 'enviado', 'entregue') OR v_pay_status = 'paid' THEN
            SELECT id INTO v_open_session_id
            FROM public.cash_sessions
            WHERE tenant_id = NEW.tenant_id
              AND status = 'open'
            LIMIT 1;

            IF v_open_session_id IS NOT NULL THEN
                NEW.cash_session_id := v_open_session_id;
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_orders_attach_cash_session ON public.orders;
CREATE TRIGGER trg_orders_attach_cash_session
    BEFORE INSERT OR UPDATE ON public.orders
    FOR EACH ROW
    WHEN (NEW.cash_session_id IS NULL)
    EXECUTE FUNCTION public.fn_orders_attach_cash_session();

REVOKE ALL ON FUNCTION public.fn_orders_attach_cash_session() FROM PUBLIC, anon, authenticated;

-- 4. Atualiza close_table_session para garantir vínculo dos pedidos da comanda ao caixa aberto
CREATE OR REPLACE FUNCTION public.close_table_session(
    p_tenant_id uuid,
    p_session_id uuid,
    p_payment_method text DEFAULT 'money'::text,
    p_payment_details jsonb DEFAULT '[]'::jsonb,
    p_service_fee numeric DEFAULT 0,
    p_discount numeric DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_session RECORD;
  v_subtotal NUMERIC := 0;
  v_total NUMERIC := 0;
  v_open_cash_session_id UUID;
BEGIN
  IF public.is_authorized_for_tenant(p_tenant_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'Acesso negado para fechar mesa nesta loja.';
  END IF;

  SELECT * INTO v_session FROM public.table_sessions WHERE id = p_session_id AND tenant_id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Sessão não encontrada'); END IF;

  SELECT id INTO v_open_cash_session_id
  FROM public.cash_sessions
  WHERE tenant_id = p_tenant_id AND status = 'open'
  LIMIT 1;

  SELECT COALESCE(SUM(total_amount), 0) INTO v_subtotal FROM public.orders WHERE table_session_id = p_session_id AND status != 'cancelado';
  v_total := GREATEST(0, v_subtotal + COALESCE(p_service_fee, 0) - COALESCE(p_discount, 0));

  UPDATE public.table_sessions
  SET subtotal = v_subtotal, service_fee = COALESCE(p_service_fee, 0), discount = COALESCE(p_discount, 0),
      total_amount = v_total, status = 'closed', closed_at = now(), payment_method = p_payment_method,
      payment_details = p_payment_details, updated_at = now()
  WHERE id = p_session_id;

  UPDATE public.restaurant_tables SET status = 'available', updated_at = now() WHERE id = v_session.table_id;

  UPDATE public.orders
  SET payment_status = 'paid',
      status = 'entregue',
      cash_session_id = COALESCE(cash_session_id, v_open_cash_session_id)
  WHERE table_session_id = p_session_id AND status != 'cancelado';

  RETURN jsonb_build_object('success', true, 'total_amount', v_total, 'cash_session_id', v_open_cash_session_id);
END;
$function$;

-- 5. RPC: Listar pedidos órfãos (criados com caixa fechado desde o último fechamento / 36h)
CREATE OR REPLACE FUNCTION public.get_orphan_orders_for_tenant(p_tenant_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_last_closed_at TIMESTAMPTZ;
    v_window_floor TIMESTAMPTZ;
    v_orders JSONB := '[]'::jsonb;
    v_count INTEGER := 0;
    v_total NUMERIC(12,2) := 0;
    v_cash_total NUMERIC(12,2) := 0;
BEGIN
    IF public.is_authorized_for_tenant(p_tenant_id) IS NOT TRUE THEN
        RAISE EXCEPTION 'Acesso negado: Sem permissão para consultar pedidos órfãos desta loja.';
    END IF;

    SELECT MAX(closed_at) INTO v_last_closed_at
    FROM public.cash_sessions
    WHERE tenant_id = p_tenant_id AND status = 'closed';

    v_window_floor := GREATEST(
        NOW() - INTERVAL '36 hours',
        COALESCE(v_last_closed_at, NOW() - INTERVAL '36 hours')
    );

    SELECT
        COUNT(*),
        COALESCE(SUM(COALESCE(total_amount, total, 0)), 0),
        COALESCE(SUM(
            CASE
                WHEN LOWER(COALESCE(payment_method, '')) LIKE '%dinheiro%'
                  OR LOWER(COALESCE(payment_method, '')) = 'cash'
                THEN COALESCE(total_amount, total, 0)
                ELSE 0
            END
        ), 0),
        COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'id', id,
                    'order_number', order_number,
                    'customer_name', customer_name,
                    'order_type', order_type,
                    'payment_method', payment_method,
                    'status', status,
                    'total_amount', COALESCE(total_amount, total, 0),
                    'created_date', created_date
                )
                ORDER BY created_date ASC
            ),
            '[]'::jsonb
        )
    INTO v_count, v_total, v_cash_total, v_orders
    FROM public.orders
    WHERE tenant_id = p_tenant_id
      AND cash_session_id IS NULL
      AND LOWER(COALESCE(status, '')) <> 'cancelado'
      AND created_date >= v_window_floor;

    RETURN jsonb_build_object(
        'count', v_count,
        'total_amount', ROUND(v_total, 2),
        'cash_total', ROUND(v_cash_total, 2),
        'window_floor', v_window_floor,
        'orders', v_orders
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_orphan_orders_for_tenant(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_orphan_orders_for_tenant(UUID) TO authenticated;

-- 6. RPC: Vincular pedidos órfãos à sessão de caixa aberta
CREATE OR REPLACE FUNCTION public.attach_orphan_orders_to_session(
    p_tenant_id UUID,
    p_session_id UUID DEFAULT NULL,
    p_order_ids TEXT[] DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_target_session_id UUID;
    v_last_closed_at TIMESTAMPTZ;
    v_window_floor TIMESTAMPTZ;
    v_attached_ids TEXT[] := '{}';
    v_attached_total NUMERIC(12,2) := 0;
BEGIN
    IF public.is_authorized_for_tenant(p_tenant_id) IS NOT TRUE THEN
        RAISE EXCEPTION 'Acesso negado: Sem permissão para vincular pedidos ao caixa desta loja.';
    END IF;

    IF p_session_id IS NOT NULL THEN
        SELECT id INTO v_target_session_id
        FROM public.cash_sessions
        WHERE id = p_session_id AND tenant_id = p_tenant_id AND status = 'open'
        FOR UPDATE;
    ELSE
        SELECT id INTO v_target_session_id
        FROM public.cash_sessions
        WHERE tenant_id = p_tenant_id AND status = 'open'
        LIMIT 1
        FOR UPDATE;
    END IF;

    IF v_target_session_id IS NULL THEN
        RAISE EXCEPTION 'Nenhuma sessão de caixa aberta encontrada para vincular os pedidos.';
    END IF;

    SELECT MAX(closed_at) INTO v_last_closed_at
    FROM public.cash_sessions
    WHERE tenant_id = p_tenant_id AND status = 'closed';

    v_window_floor := GREATEST(
        NOW() - INTERVAL '36 hours',
        COALESCE(v_last_closed_at, NOW() - INTERVAL '36 hours')
    );

    WITH updated AS (
        UPDATE public.orders
        SET cash_session_id = v_target_session_id
        WHERE tenant_id = p_tenant_id
          AND cash_session_id IS NULL
          AND LOWER(COALESCE(status, '')) <> 'cancelado'
          AND (
              (p_order_ids IS NOT NULL AND id = ANY(p_order_ids))
              OR (p_order_ids IS NULL AND created_date >= v_window_floor)
          )
        RETURNING id, COALESCE(total_amount, total, 0) AS amt
    )
    SELECT
        COALESCE(ARRAY_AGG(id), '{}'),
        COALESCE(SUM(amt), 0)
    INTO v_attached_ids, v_attached_total
    FROM updated;

    RETURN jsonb_build_object(
        'success', true,
        'session_id', v_target_session_id,
        'attached_count', COALESCE(array_length(v_attached_ids, 1), 0),
        'attached_total', ROUND(v_attached_total, 2),
        'attached_order_ids', to_jsonb(v_attached_ids)
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.attach_orphan_orders_to_session(UUID, UUID, TEXT[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.attach_orphan_orders_to_session(UUID, UUID, TEXT[]) TO authenticated;

-- 7. Atualiza open_cash_session para permitir resgate atômico de pedidos órfãos na abertura
DROP FUNCTION IF EXISTS public.open_cash_session(UUID, NUMERIC, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.open_cash_session(
    p_tenant_id UUID,
    p_initial_float NUMERIC DEFAULT 0,
    p_operator TEXT DEFAULT 'Operador Principal',
    p_notes TEXT DEFAULT '',
    p_attach_order_ids TEXT[] DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_existing_id UUID;
    v_blind_closing BOOLEAN := false;
    v_session public.cash_sessions%ROWTYPE;
    v_movement public.cash_movements%ROWTYPE;
    v_operator TEXT := COALESCE(NULLIF(TRIM(p_operator), ''), 'Operador Principal');
    v_notes TEXT := COALESCE(TRIM(p_notes), '');
    v_attached_ids TEXT[] := '{}';
    v_attached_total NUMERIC(12,2) := 0;
BEGIN
    IF public.is_authorized_for_tenant(p_tenant_id) IS NOT TRUE THEN
        RAISE EXCEPTION 'Acesso negado: Sem permissão para abrir o caixa desta loja.';
    END IF;

    IF p_initial_float IS NULL OR p_initial_float < 0 THEN
        RAISE EXCEPTION 'Valor de troco inicial inválido.';
    END IF;

    SELECT id INTO v_existing_id
    FROM public.cash_sessions
    WHERE tenant_id = p_tenant_id AND status = 'open'
    FOR UPDATE;

    IF v_existing_id IS NOT NULL THEN
        RAISE EXCEPTION 'Já existe um caixa aberto para esta loja.';
    END IF;

    SELECT COALESCE(blind_cash_closing, false) INTO v_blind_closing
    FROM public.tenants
    WHERE id = p_tenant_id;

    INSERT INTO public.cash_sessions (
        tenant_id, status, opened_at, opened_by, initial_float, notes, blind_closing
    )
    VALUES (
        p_tenant_id, 'open', NOW(), v_operator, ROUND(p_initial_float, 2), v_notes, COALESCE(v_blind_closing, false)
    )
    RETURNING * INTO v_session;

    INSERT INTO public.cash_movements (
        tenant_id, cash_session_id, type, title, category, amount, direction, operator_name, notes
    )
    VALUES (
        p_tenant_id, v_session.id, 'open', 'Abertura de Caixa (Troco Inicial)', 'abertura', ROUND(p_initial_float, 2), 'in', v_operator, v_notes
    )
    RETURNING * INTO v_movement;

    IF p_attach_order_ids IS NOT NULL AND COALESCE(array_length(p_attach_order_ids, 1), 0) > 0 THEN
        WITH attached AS (
            UPDATE public.orders
            SET cash_session_id = v_session.id
            WHERE tenant_id = p_tenant_id
              AND cash_session_id IS NULL
              AND LOWER(COALESCE(status, '')) <> 'cancelado'
              AND id = ANY(p_attach_order_ids)
            RETURNING id, COALESCE(total_amount, total, 0) AS amt
        )
        SELECT
            COALESCE(ARRAY_AGG(id), '{}'),
            COALESCE(SUM(amt), 0)
        INTO v_attached_ids, v_attached_total
        FROM attached;
    END IF;

    RETURN jsonb_build_object(
        'session', to_jsonb(v_session),
        'movements', jsonb_build_array(to_jsonb(v_movement)),
        'attached_orders_count', COALESCE(array_length(v_attached_ids, 1), 0),
        'attached_orders_total', ROUND(v_attached_total, 2),
        'attached_order_ids', to_jsonb(v_attached_ids)
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.open_cash_session(UUID, NUMERIC, TEXT, TEXT, TEXT[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.open_cash_session(UUID, NUMERIC, TEXT, TEXT, TEXT[]) TO authenticated;


-- >>> MIGRATION: 20261112_clients_crm_and_notes.sql
-- Mini-CRM de Clientes: tabela de anotações internas, correção de cancelados/normalização em get_clients_summary,
-- ficha 360 do cliente (get_client_crm_detail) e salvamento de notas (upsert_client_crm_note).

CREATE TABLE IF NOT EXISTS public.customer_crm_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    phone_clean TEXT NOT NULL,
    notes TEXT NOT NULL DEFAULT '',
    updated_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_customer_crm_notes_tenant_phone UNIQUE (tenant_id, phone_clean)
);

CREATE INDEX IF NOT EXISTS idx_customer_crm_notes_tenant
ON public.customer_crm_notes (tenant_id, phone_clean);

ALTER TABLE public.customer_crm_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant isolated crm notes" ON public.customer_crm_notes;
CREATE POLICY "Tenant isolated crm notes"
ON public.customer_crm_notes
FOR ALL
TO authenticated
USING (public.is_authorized_for_tenant(tenant_id) IS TRUE)
WITH CHECK (public.is_authorized_for_tenant(tenant_id) IS TRUE);

REVOKE ALL ON TABLE public.customer_crm_notes FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.customer_crm_notes TO authenticated, service_role;

-- Recria get_clients_summary com:
-- 1) checagem estrita is_authorized_for_tenant(p_tenant_id) IS TRUE
-- 2) exclusão de pedidos cancelados da contagem e faturamento
-- 3) normalização de telefone por dígitos para evitar duplicidade
-- 4) saldo ativo de cashback, último canal/pagamento e nota interna do CRM
DROP FUNCTION IF EXISTS public.get_clients_summary(UUID);

CREATE OR REPLACE FUNCTION public.get_clients_summary(p_tenant_id UUID)
RETURNS TABLE(
    id TEXT,
    customer_phone TEXT,
    customer_name TEXT,
    customer_email TEXT,
    last_address TEXT,
    total_orders BIGINT,
    total_spent NUMERIC,
    first_order_at TIMESTAMPTZ,
    last_order_at TIMESTAMPTZ,
    cashback_balance NUMERIC,
    cashback_expires_at TIMESTAMPTZ,
    crm_notes TEXT,
    last_order_type TEXT,
    last_payment_method TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF public.is_authorized_for_tenant(p_tenant_id) IS NOT TRUE THEN
        RAISE EXCEPTION 'Acesso negado: Você não possui autorização para consultar clientes deste restaurante.';
    END IF;

    RETURN QUERY
    WITH store_orders AS (
        SELECT
            REGEXP_REPLACE(o.customer_phone, '\D', '', 'g') AS phone_clean,
            (ARRAY_AGG(o.customer_phone ORDER BY o.created_date DESC))[1] AS raw_phone,
            (ARRAY_AGG(o.customer_name ORDER BY o.created_date DESC) FILTER (WHERE o.customer_name IS NOT NULL AND TRIM(o.customer_name) <> '' AND o.customer_name <> 'Cliente'))[1] AS cust_name,
            (ARRAY_AGG(o.customer_email ORDER BY o.created_date DESC) FILTER (WHERE o.customer_email IS NOT NULL AND TRIM(o.customer_email) <> ''))[1] AS cust_email,
            (ARRAY_AGG(COALESCE(o.delivery_address, o.customer_address) ORDER BY o.created_date DESC) FILTER (WHERE COALESCE(o.delivery_address, o.customer_address) IS NOT NULL AND TRIM(COALESCE(o.delivery_address, o.customer_address)) <> ''))[1] AS last_addr,
            (ARRAY_AGG(o.order_type ORDER BY o.created_date DESC) FILTER (WHERE o.order_type IS NOT NULL))[1] AS last_otype,
            (ARRAY_AGG(o.payment_method ORDER BY o.created_date DESC) FILTER (WHERE o.payment_method IS NOT NULL))[1] AS last_pmethod,
            COUNT(*) FILTER (WHERE LOWER(COALESCE(o.status, '')) <> 'cancelado')::BIGINT AS total_ord,
            COALESCE(SUM(COALESCE(o.total, o.total_amount, 0)) FILTER (WHERE LOWER(COALESCE(o.status, '')) <> 'cancelado'), 0)::NUMERIC AS spent,
            MIN(o.created_date) FILTER (WHERE LOWER(COALESCE(o.status, '')) <> 'cancelado') AS first_ord,
            MAX(o.created_date) FILTER (WHERE LOWER(COALESCE(o.status, '')) <> 'cancelado') AS last_ord,
            MAX(o.created_date) AS any_last_ord
        FROM public.orders o
        WHERE o.tenant_id = p_tenant_id
          AND o.customer_phone IS NOT NULL
          AND LENGTH(REGEXP_REPLACE(o.customer_phone, '\D', '', 'g')) >= 8
        GROUP BY REGEXP_REPLACE(o.customer_phone, '\D', '', 'g')
    ),
    store_customers AS (
        SELECT DISTINCT ON (REGEXP_REPLACE(c.phone, '\D', '', 'g'))
            c.id::text AS cust_id,
            REGEXP_REPLACE(c.phone, '\D', '', 'g') AS phone_clean,
            c.phone,
            c.full_name,
            c.email,
            c.created_date
        FROM public.customers c
        WHERE c.tenant_id = p_tenant_id
          AND c.phone IS NOT NULL
          AND LENGTH(REGEXP_REPLACE(c.phone, '\D', '', 'g')) >= 8
        ORDER BY REGEXP_REPLACE(c.phone, '\D', '', 'g'), c.created_date DESC
    ),
    merged AS (
        SELECT
            COALESCE(sc.cust_id, so.phone_clean) AS id,
            COALESCE(so.phone_clean, sc.phone_clean) AS phone_clean,
            COALESCE(so.raw_phone, sc.phone) AS customer_phone,
            COALESCE(NULLIF(TRIM(so.cust_name), ''), NULLIF(TRIM(sc.full_name), ''), 'Cliente') AS customer_name,
            COALESCE(NULLIF(TRIM(so.cust_email), ''), NULLIF(TRIM(sc.email), ''), '') AS customer_email,
            COALESCE(so.last_addr, '') AS last_address,
            COALESCE(so.total_ord, 0)::BIGINT AS total_orders,
            COALESCE(so.spent, 0)::NUMERIC AS total_spent,
            COALESCE(so.first_ord, sc.created_date) AS first_order_at,
            so.last_ord AS last_order_at,
            COALESCE(so.last_ord, so.any_last_ord, sc.created_date) AS sort_date,
            COALESCE(so.last_otype, '') AS last_order_type,
            COALESCE(so.last_pmethod, '') AS last_payment_method
        FROM store_customers sc
        FULL OUTER JOIN store_orders so ON sc.phone_clean = so.phone_clean
        WHERE COALESCE(so.total_ord, 0) > 0 OR sc.cust_id IS NOT NULL
    )
    SELECT
        m.id,
        m.customer_phone,
        m.customer_name,
        m.customer_email,
        m.last_address,
        m.total_orders,
        m.total_spent,
        m.first_order_at,
        m.last_order_at,
        CASE
            WHEN w.expires_at IS NOT NULL AND w.expires_at <= NOW() THEN 0::NUMERIC
            ELSE COALESCE(w.balance, 0)::NUMERIC
        END AS cashback_balance,
        CASE
            WHEN w.expires_at IS NOT NULL AND w.expires_at <= NOW() THEN NULL::TIMESTAMPTZ
            ELSE w.expires_at
        END AS cashback_expires_at,
        COALESCE(n.notes, '') AS crm_notes,
        m.last_order_type,
        m.last_payment_method
    FROM merged m
    LEFT JOIN public.customer_cashback_wallets w
        ON w.tenant_id = p_tenant_id
       AND REGEXP_REPLACE(w.phone, '\D', '', 'g') = m.phone_clean
    LEFT JOIN public.customer_crm_notes n
        ON n.tenant_id = p_tenant_id
       AND n.phone_clean = m.phone_clean
    ORDER BY m.sort_date DESC NULLS LAST;
END;
$$;

REVOKE ALL ON FUNCTION public.get_clients_summary(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_clients_summary(UUID) TO authenticated, service_role;

-- Ficha 360 do cliente: histórico recente de pedidos, itens mais pedidos, cashback e nota CRM
CREATE OR REPLACE FUNCTION public.get_client_crm_detail(
    p_tenant_id UUID,
    p_phone TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_clean_phone TEXT := REGEXP_REPLACE(COALESCE(p_phone, ''), '\D', '', 'g');
    v_orders JSONB := '[]'::jsonb;
    v_top_items JSONB := '[]'::jsonb;
    v_notes TEXT := '';
    v_cashback_balance NUMERIC := 0;
    v_cashback_expires TIMESTAMPTZ := NULL;
BEGIN
    IF public.is_authorized_for_tenant(p_tenant_id) IS NOT TRUE THEN
        RAISE EXCEPTION 'Acesso negado: Você não possui autorização para consultar detalhes deste cliente.';
    END IF;

    IF LENGTH(v_clean_phone) < 8 THEN
        RETURN jsonb_build_object(
            'orders', '[]'::jsonb,
            'top_items', '[]'::jsonb,
            'notes', '',
            'cashback_balance', 0,
            'cashback_expires_at', NULL
        );
    END IF;

    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'id', sub.id,
                'order_number', sub.order_number,
                'created_date', sub.created_date,
                'status', sub.status,
                'order_type', sub.order_type,
                'payment_method', sub.payment_method,
                'total', COALESCE(sub.total, sub.total_amount, 0),
                'delivery_address', COALESCE(sub.delivery_address, sub.customer_address, ''),
                'items', COALESCE(sub.items, '[]'::jsonb)
            )
            ORDER BY sub.created_date DESC
        ),
        '[]'::jsonb
    )
    INTO v_orders
    FROM (
        SELECT
            o.id,
            o.order_number,
            o.created_date,
            o.status,
            o.order_type,
            o.payment_method,
            o.total,
            o.total_amount,
            o.delivery_address,
            o.customer_address,
            o.items
        FROM public.orders o
        WHERE o.tenant_id = p_tenant_id
          AND REGEXP_REPLACE(COALESCE(o.customer_phone, ''), '\D', '', 'g') = v_clean_phone
        ORDER BY o.created_date DESC
        LIMIT 15
    ) sub;

    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'name', agg.item_name,
                'qty', agg.total_qty
            )
            ORDER BY agg.total_qty DESC
        ),
        '[]'::jsonb
    )
    INTO v_top_items
    FROM (
        SELECT
            COALESCE(NULLIF(TRIM(item->>'name'), ''), NULLIF(TRIM(item->>'product_name'), ''), 'Item') AS item_name,
            SUM(GREATEST(COALESCE((item->>'quantity')::NUMERIC, 1), 1))::BIGINT AS total_qty
        FROM public.orders o,
             LATERAL jsonb_array_elements(
                 CASE WHEN jsonb_typeof(o.items) = 'array' THEN o.items ELSE '[]'::jsonb END
             ) AS item
        WHERE o.tenant_id = p_tenant_id
          AND REGEXP_REPLACE(COALESCE(o.customer_phone, ''), '\D', '', 'g') = v_clean_phone
          AND LOWER(COALESCE(o.status, '')) <> 'cancelado'
        GROUP BY 1
        ORDER BY 2 DESC
        LIMIT 5
    ) agg;

    SELECT COALESCE(n.notes, '')
    INTO v_notes
    FROM public.customer_crm_notes n
    WHERE n.tenant_id = p_tenant_id
      AND n.phone_clean = v_clean_phone
    LIMIT 1;

    SELECT
        CASE
            WHEN w.expires_at IS NOT NULL AND w.expires_at <= NOW() THEN 0
            ELSE COALESCE(w.balance, 0)
        END,
        CASE
            WHEN w.expires_at IS NOT NULL AND w.expires_at <= NOW() THEN NULL
            ELSE w.expires_at
        END
    INTO v_cashback_balance, v_cashback_expires
    FROM public.customer_cashback_wallets w
    WHERE w.tenant_id = p_tenant_id
      AND REGEXP_REPLACE(COALESCE(w.phone, ''), '\D', '', 'g') = v_clean_phone
    LIMIT 1;

    RETURN jsonb_build_object(
        'orders', COALESCE(v_orders, '[]'::jsonb),
        'top_items', COALESCE(v_top_items, '[]'::jsonb),
        'notes', COALESCE(v_notes, ''),
        'cashback_balance', COALESCE(v_cashback_balance, 0),
        'cashback_expires_at', v_cashback_expires
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_client_crm_detail(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_client_crm_detail(UUID, TEXT) TO authenticated, service_role;

-- Salva ou limpa anotação interna do lojista sobre o cliente
CREATE OR REPLACE FUNCTION public.upsert_client_crm_note(
    p_tenant_id UUID,
    p_phone TEXT,
    p_notes TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_clean_phone TEXT := REGEXP_REPLACE(COALESCE(p_phone, ''), '\D', '', 'g');
    v_trimmed_notes TEXT := LEFT(TRIM(COALESCE(p_notes, '')), 1000);
BEGIN
    IF public.is_authorized_for_tenant(p_tenant_id) IS NOT TRUE THEN
        RAISE EXCEPTION 'Acesso negado: Você não possui autorização para editar anotações deste restaurante.';
    END IF;

    IF LENGTH(v_clean_phone) < 8 THEN
        RAISE EXCEPTION 'Telefone inválido para vincular anotação.';
    END IF;

    IF v_trimmed_notes = '' THEN
        DELETE FROM public.customer_crm_notes
        WHERE tenant_id = p_tenant_id
          AND phone_clean = v_clean_phone;

        RETURN jsonb_build_object('ok', true, 'notes', '');
    END IF;

    INSERT INTO public.customer_crm_notes (tenant_id, phone_clean, notes, updated_by, updated_at)
    VALUES (p_tenant_id, v_clean_phone, v_trimmed_notes, auth.uid()::text, NOW())
    ON CONFLICT (tenant_id, phone_clean)
    DO UPDATE SET
        notes = EXCLUDED.notes,
        updated_by = EXCLUDED.updated_by,
        updated_at = NOW();

    RETURN jsonb_build_object('ok', true, 'notes', v_trimmed_notes);
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_client_crm_note(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_client_crm_note(UUID, TEXT, TEXT) TO authenticated, service_role;



-- >>> MIGRATION: 20261112_financial_account_custom_name.sql
-- Permite personalizar o nome da conta Banco (ex: Nubank PJ, Itaú) e do Cofre, retornando o nome no overview.

CREATE OR REPLACE FUNCTION public.get_financial_overview(
    p_tenant_id UUID,
    p_start_date DATE DEFAULT (date_trunc('month', CURRENT_DATE))::DATE,
    p_end_date DATE DEFAULT CURRENT_DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_safe_balance NUMERIC(12,2) := 0;
    v_safe_name TEXT := 'Cofre da Loja';
    v_bank_balance NUMERIC(12,2) := 0;
    v_bank_name TEXT := 'Banco / Conta Digital';
    v_drawer_balance NUMERIC(12,2) := 0;
    v_drawer_open BOOLEAN := false;
    v_open_session public.cash_sessions%ROWTYPE;
    v_cash_sales NUMERIC(12,2) := 0;
    v_mov_in NUMERIC(12,2) := 0;
    v_mov_out NUMERIC(12,2) := 0;
    v_income_total NUMERIC(12,2) := 0;
    v_expense_total NUMERIC(12,2) := 0;
    v_pending_expense_total NUMERIC(12,2) := 0;
    v_entries JSONB := '[]'::JSONB;
BEGIN
    IF public.is_authorized_for_tenant(p_tenant_id) IS NOT TRUE THEN
        RAISE EXCEPTION 'Acesso negado.';
    END IF;

    PERFORM public.ensure_tenant_financial_accounts(p_tenant_id);

    SELECT COALESCE(balance, 0), COALESCE(NULLIF(TRIM(name), ''), 'Cofre da Loja')
    INTO v_safe_balance, v_safe_name
    FROM public.financial_accounts
    WHERE tenant_id = p_tenant_id AND code = 'safe';

    SELECT COALESCE(balance, 0), COALESCE(NULLIF(TRIM(name), ''), 'Banco / Conta Digital')
    INTO v_bank_balance, v_bank_name
    FROM public.financial_accounts
    WHERE tenant_id = p_tenant_id AND code = 'bank';

    -- Saldo ao vivo da Gaveta (sessão aberta atual)
    SELECT * INTO v_open_session
    FROM public.cash_sessions
    WHERE tenant_id = p_tenant_id AND status = 'open'
    ORDER BY opened_at DESC
    LIMIT 1;

    IF v_open_session.id IS NOT NULL THEN
        v_drawer_open := true;
        SELECT COALESCE(SUM(total_amount), 0) INTO v_cash_sales
        FROM public.orders
        WHERE tenant_id = p_tenant_id
          AND cash_session_id = v_open_session.id
          AND status <> 'cancelled'
          AND (
            LOWER(COALESCE(payment_method, '')) LIKE '%dinheiro%'
            OR LOWER(COALESCE(payment_method, '')) = 'cash'
          );

        SELECT
            COALESCE(SUM(CASE WHEN type = 'supply' AND direction = 'in' THEN amount ELSE 0 END), 0),
            COALESCE(SUM(CASE WHEN type IN ('bleed', 'expense') AND direction = 'out' THEN amount ELSE 0 END), 0)
        INTO v_mov_in, v_mov_out
        FROM public.cash_movements
        WHERE cash_session_id = v_open_session.id;

        v_drawer_balance := ROUND(COALESCE(v_open_session.initial_float, 0) + v_cash_sales + v_mov_in - v_mov_out, 2);
    END IF;

    SELECT
        COALESCE(SUM(CASE WHEN entry_type = 'income' AND status = 'paid' THEN amount ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN entry_type = 'expense' AND status = 'paid' THEN amount ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN entry_type = 'expense' AND status = 'pending' THEN amount ELSE 0 END), 0)
    INTO v_income_total, v_expense_total, v_pending_expense_total
    FROM public.financial_entries
    WHERE tenant_id = p_tenant_id
      AND due_date BETWEEN p_start_date AND p_end_date;

    SELECT COALESCE(jsonb_agg(to_jsonb(e) ORDER BY e.due_date DESC, e.created_at DESC), '[]'::JSONB)
    INTO v_entries
    FROM (
        SELECT *
        FROM public.financial_entries
        WHERE tenant_id = p_tenant_id
          AND due_date BETWEEN p_start_date AND p_end_date
        ORDER BY due_date DESC, created_at DESC
        LIMIT 300
    ) e;

    RETURN jsonb_build_object(
        'accounts', jsonb_build_object(
            'drawer', jsonb_build_object('balance', v_drawer_balance, 'is_open', v_drawer_open),
            'safe', jsonb_build_object('balance', v_safe_balance, 'name', v_safe_name),
            'bank', jsonb_build_object('balance', v_bank_balance, 'name', v_bank_name)
        ),
        'summary', jsonb_build_object(
            'income_total', v_income_total,
            'expense_total', v_expense_total,
            'net_total', ROUND(v_income_total - v_expense_total, 2),
            'pending_expense_total', v_pending_expense_total
        ),
        'entries', v_entries
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_financial_account_name(
    p_tenant_id UUID,
    p_code TEXT,
    p_name TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_clean_name TEXT := LEFT(TRIM(COALESCE(p_name, '')), 60);
    v_updated public.financial_accounts%ROWTYPE;
BEGIN
    IF public.is_authorized_for_tenant(p_tenant_id) IS NOT TRUE THEN
        RAISE EXCEPTION 'Acesso negado: Sem permissão para editar contas desta loja.';
    END IF;

    IF p_code NOT IN ('safe', 'bank') THEN
        RAISE EXCEPTION 'Conta inválida para renomeação.';
    END IF;

    IF NULLIF(v_clean_name, '') IS NULL THEN
        RAISE EXCEPTION 'Informe um nome válido para a conta.';
    END IF;

    PERFORM public.ensure_tenant_financial_accounts(p_tenant_id);

    UPDATE public.financial_accounts
    SET name = v_clean_name,
        updated_at = NOW()
    WHERE tenant_id = p_tenant_id AND code = p_code
    RETURNING * INTO v_updated;

    RETURN jsonb_build_object('account', to_jsonb(v_updated));
END;
$function$;

REVOKE ALL ON FUNCTION public.update_financial_account_name(UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_financial_account_name(UUID, TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.update_financial_account_name(UUID, TEXT, TEXT) TO authenticated;



-- >>> MIGRATION: 20261112_financial_account_kind_savings.sql
-- Alinha account_kind ao padrão Conta Azul / Bling / Omie (Conta Bancária, Maquininha/App de Repasse, Reserva/Poupança)
ALTER TABLE public.financial_accounts
    DROP CONSTRAINT IF EXISTS financial_accounts_account_kind_check;

ALTER TABLE public.financial_accounts
    ADD CONSTRAINT financial_accounts_account_kind_check
    CHECK (account_kind IN ('checking', 'acquirer', 'savings', 'digital'));

CREATE OR REPLACE FUNCTION public.create_financial_bank_account(
    p_tenant_id UUID,
    p_name TEXT,
    p_account_kind TEXT DEFAULT 'checking',
    p_initial_balance NUMERIC DEFAULT 0,
    p_is_default BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_clean_name TEXT := LEFT(TRIM(COALESCE(p_name, '')), 60);
    v_kind TEXT := COALESCE(NULLIF(TRIM(COALESCE(p_account_kind, '')), ''), 'checking');
    v_init NUMERIC(12,2) := ROUND(COALESCE(p_initial_balance, 0), 2);
    v_has_active BOOLEAN;
    v_make_default BOOLEAN;
    v_created public.financial_accounts%ROWTYPE;
BEGIN
    IF public.is_authorized_for_tenant(p_tenant_id) IS NOT TRUE THEN
        RAISE EXCEPTION 'Acesso negado: Sem permissão para gerenciar bancos desta loja.';
    END IF;

    IF NULLIF(v_clean_name, '') IS NULL THEN
        RAISE EXCEPTION 'Informe o nome do banco.';
    END IF;

    IF v_kind NOT IN ('checking', 'acquirer', 'savings', 'digital') THEN
        RAISE EXCEPTION 'Tipo de conta inválido.';
    END IF;

    PERFORM public.ensure_tenant_financial_accounts(p_tenant_id);

    SELECT EXISTS(
        SELECT 1 FROM public.financial_accounts
        WHERE tenant_id = p_tenant_id AND code = 'bank' AND is_active = true
    ) INTO v_has_active;

    v_make_default := COALESCE(p_is_default, false) OR NOT v_has_active;

    IF v_make_default THEN
        UPDATE public.financial_accounts
        SET is_default = false, updated_at = NOW()
        WHERE tenant_id = p_tenant_id AND code = 'bank' AND is_default = true;
    END IF;

    INSERT INTO public.financial_accounts (
        tenant_id, code, name, balance, is_default, is_active, account_kind
    )
    VALUES (
        p_tenant_id, 'bank', v_clean_name, v_init, v_make_default, true, v_kind
    )
    RETURNING * INTO v_created;

    RETURN jsonb_build_object('bank', to_jsonb(v_created));
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_financial_bank_account(
    p_tenant_id UUID,
    p_account_id UUID,
    p_name TEXT,
    p_account_kind TEXT DEFAULT NULL,
    p_is_default BOOLEAN DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_clean_name TEXT := LEFT(TRIM(COALESCE(p_name, '')), 60);
    v_target public.financial_accounts%ROWTYPE;
BEGIN
    IF public.is_authorized_for_tenant(p_tenant_id) IS NOT TRUE THEN
        RAISE EXCEPTION 'Acesso negado.';
    END IF;

    IF NULLIF(v_clean_name, '') IS NULL THEN
        RAISE EXCEPTION 'Informe um nome válido para o banco.';
    END IF;

    SELECT * INTO v_target
    FROM public.financial_accounts
    WHERE id = p_account_id AND tenant_id = p_tenant_id AND code = 'bank' AND is_active = true
    FOR UPDATE;

    IF v_target.id IS NULL THEN
        RAISE EXCEPTION 'Banco não encontrado.';
    END IF;

    IF p_account_kind IS NOT NULL AND p_account_kind NOT IN ('checking', 'acquirer', 'savings', 'digital') THEN
        RAISE EXCEPTION 'Tipo de conta inválido.';
    END IF;

    IF p_is_default IS TRUE AND NOT v_target.is_default THEN
        UPDATE public.financial_accounts
        SET is_default = false, updated_at = NOW()
        WHERE tenant_id = p_tenant_id AND code = 'bank' AND is_default = true AND id <> p_account_id;
    END IF;

    UPDATE public.financial_accounts
    SET name = v_clean_name,
        account_kind = COALESCE(p_account_kind, account_kind),
        is_default = CASE WHEN p_is_default IS TRUE THEN true ELSE is_default END,
        updated_at = NOW()
    WHERE id = p_account_id
    RETURNING * INTO v_target;

    RETURN jsonb_build_object('bank', to_jsonb(v_target));
END;
$function$;



-- >>> MIGRATION: 20261112_financial_hardening_and_revokes.sql
-- ============================================================================
-- Hardening: Revoke PUBLIC/anon em funções financeiras + advisory lock contra corrida
-- ============================================================================

CREATE OR REPLACE FUNCTION public.create_financial_entry(
    p_tenant_id UUID,
    p_entry_type TEXT,
    p_description TEXT,
    p_category TEXT DEFAULT 'Outros',
    p_amount NUMERIC DEFAULT 0,
    p_account_code TEXT DEFAULT 'safe',
    p_target_account_code TEXT DEFAULT NULL,
    p_status TEXT DEFAULT 'paid',
    p_due_date DATE DEFAULT CURRENT_DATE,
    p_operator_name TEXT DEFAULT 'Operador',
    p_notes TEXT DEFAULT '',
    p_source_type TEXT DEFAULT 'manual',
    p_source_id UUID DEFAULT NULL,
    p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_existing public.financial_entries%ROWTYPE;
    v_inserted public.financial_entries%ROWTYPE;
    v_desc TEXT := NULLIF(TRIM(COALESCE(p_description, '')), '');
    v_cat TEXT := COALESCE(NULLIF(TRIM(COALESCE(p_category, '')), ''), 'Outros');
    v_op TEXT := COALESCE(NULLIF(TRIM(COALESCE(p_operator_name, '')), ''), 'Operador');
    v_notes TEXT := COALESCE(TRIM(COALESCE(p_notes, '')), '');
    v_amount NUMERIC(12,2) := ROUND(COALESCE(p_amount, 0), 2);
    v_status TEXT := COALESCE(NULLIF(TRIM(COALESCE(p_status, '')), ''), 'paid');
    v_source_type TEXT := NULLIF(TRIM(COALESCE(p_source_type, '')), '');
    v_idem TEXT := NULLIF(TRIM(COALESCE(p_idempotency_key, '')), '');
BEGIN
    IF public.is_authorized_for_tenant(p_tenant_id) IS NOT TRUE THEN
        RAISE EXCEPTION 'Acesso negado: Sem permissão para registrar lançamentos nesta loja.';
    END IF;

    IF p_entry_type NOT IN ('income', 'expense', 'transfer') THEN
        RAISE EXCEPTION 'Tipo de lançamento inválido.';
    END IF;

    IF v_status NOT IN ('paid', 'pending') THEN
        RAISE EXCEPTION 'Status de lançamento inválido.';
    END IF;

    IF v_desc IS NULL THEN
        RAISE EXCEPTION 'Informe uma descrição para o lançamento.';
    END IF;

    IF v_amount <= 0 THEN
        RAISE EXCEPTION 'O valor do lançamento deve ser maior que zero.';
    END IF;

    IF p_account_code NOT IN ('drawer', 'safe', 'bank') THEN
        RAISE EXCEPTION 'Conta de origem inválida.';
    END IF;

    IF p_entry_type = 'transfer' THEN
        IF p_target_account_code IS NULL OR p_target_account_code NOT IN ('drawer', 'safe', 'bank') THEN
            RAISE EXCEPTION 'Informe a conta de destino da transferência.';
        END IF;
        IF p_target_account_code = p_account_code THEN
            RAISE EXCEPTION 'A conta de origem e destino devem ser diferentes.';
        END IF;
        v_status := 'paid';
    END IF;

    -- Serializa requisições concorrentes com mesma chave de idempotência ou origem
    IF v_idem IS NOT NULL THEN
        PERFORM pg_advisory_xact_lock(hashtext('fin_idem:' || p_tenant_id::text || ':' || v_idem));
        SELECT * INTO v_existing
        FROM public.financial_entries
        WHERE tenant_id = p_tenant_id AND idempotency_key = v_idem
        LIMIT 1;
        IF v_existing.id IS NOT NULL THEN
            RETURN jsonb_build_object('entry', to_jsonb(v_existing), 'deduplicated', true);
        END IF;
    END IF;

    IF v_source_type IS NOT NULL AND p_source_id IS NOT NULL THEN
        PERFORM pg_advisory_xact_lock(hashtext('fin_src:' || p_tenant_id::text || ':' || v_source_type || ':' || p_source_id::text));
        SELECT * INTO v_existing
        FROM public.financial_entries
        WHERE tenant_id = p_tenant_id AND source_type = v_source_type AND source_id = p_source_id
        LIMIT 1;
        IF v_existing.id IS NOT NULL THEN
            RETURN jsonb_build_object('entry', to_jsonb(v_existing), 'deduplicated', true);
        END IF;
    END IF;

    PERFORM public.ensure_tenant_financial_accounts(p_tenant_id);

    PERFORM 1 FROM public.financial_accounts
    WHERE tenant_id = p_tenant_id AND code IN (p_account_code, COALESCE(p_target_account_code, ''))
    FOR UPDATE;

    INSERT INTO public.financial_entries (
        tenant_id, entry_type, status, description, category, amount,
        account_code, target_account_code, due_date, paid_at,
        operator_name, notes, source_type, source_id, idempotency_key
    )
    VALUES (
        p_tenant_id,
        p_entry_type,
        v_status,
        v_desc,
        v_cat,
        v_amount,
        p_account_code,
        CASE WHEN p_entry_type = 'transfer' THEN p_target_account_code ELSE NULL END,
        COALESCE(p_due_date, CURRENT_DATE),
        CASE WHEN v_status = 'paid' THEN NOW() ELSE NULL END,
        v_op,
        v_notes,
        COALESCE(v_source_type, 'manual'),
        p_source_id,
        v_idem
    )
    RETURNING * INTO v_inserted;

    IF v_status = 'paid' THEN
        PERFORM public.apply_financial_entry_balance_effect(
            p_tenant_id,
            v_inserted.entry_type,
            v_inserted.amount,
            v_inserted.account_code,
            v_inserted.target_account_code,
            1
        );
    END IF;

    RETURN jsonb_build_object('entry', to_jsonb(v_inserted), 'deduplicated', false);
END;
$function$;

REVOKE ALL ON FUNCTION public.ensure_tenant_financial_accounts(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.apply_financial_entry_balance_effect(UUID, TEXT, NUMERIC, TEXT, TEXT, NUMERIC) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_financial_entry(UUID, TEXT, TEXT, TEXT, NUMERIC, TEXT, TEXT, TEXT, DATE, TEXT, TEXT, TEXT, UUID, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mark_financial_entry_paid(UUID, UUID, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_financial_entry(UUID, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_financial_overview(UUID, DATE, DATE) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_financial_installments(UUID, TEXT, TEXT, TEXT, TEXT, NUMERIC, TEXT, DATE, INTEGER, BOOLEAN, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_payables_receivables_overview(UUID) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.ensure_tenant_financial_accounts(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_financial_entry(UUID, TEXT, TEXT, TEXT, NUMERIC, TEXT, TEXT, TEXT, DATE, TEXT, TEXT, TEXT, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_financial_entry_paid(UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_financial_entry(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_financial_overview(UUID, DATE, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_financial_installments(UUID, TEXT, TEXT, TEXT, TEXT, NUMERIC, TEXT, DATE, INTEGER, BOOLEAN, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_payables_receivables_overview(UUID) TO authenticated;



-- >>> MIGRATION: 20261112_financial_vault_and_ledger.sql
-- ============================================================================
-- Migration: Financeiro Simplão + Conta Cofre + Troco Retido no Fechamento
-- Padrão: RLS multi-tenant, RPCs atômicas com FOR UPDATE e idempotência
-- ============================================================================

-- 1. Colunas na sessão de caixa para troco retido (próximo turno) e recolhimento ao cofre
ALTER TABLE public.cash_sessions
    ADD COLUMN IF NOT EXISTS retained_float NUMERIC(10,2),
    ADD COLUMN IF NOT EXISTS collected_to_safe NUMERIC(10,2) NOT NULL DEFAULT 0;

-- 2. Contas Financeiras por loja (Cofre e Banco; Gaveta é lida ao vivo de cash_sessions)
CREATE TABLE IF NOT EXISTS public.financial_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    code TEXT NOT NULL CHECK (code IN ('safe', 'bank')),
    name TEXT NOT NULL,
    balance NUMERIC(12,2) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, code)
);

CREATE INDEX IF NOT EXISTS idx_financial_accounts_tenant
    ON public.financial_accounts (tenant_id, code);

ALTER TABLE public.financial_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "financial_accounts_tenant_isolation" ON public.financial_accounts;
CREATE POLICY "financial_accounts_tenant_isolation"
    ON public.financial_accounts
    FOR ALL
    TO authenticated
    USING (
        tenant_id = (SELECT public.get_auth_tenant_id())
        OR (SELECT public.is_super_admin())
    )
    WITH CHECK (
        tenant_id = (SELECT public.get_auth_tenant_id())
        OR (SELECT public.is_super_admin())
    );

-- 3. Livro-Caixa / Lançamentos Financeiros (Extrato único sem duplicação)
CREATE TABLE IF NOT EXISTS public.financial_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    entry_type TEXT NOT NULL CHECK (entry_type IN ('income', 'expense', 'transfer')),
    status TEXT NOT NULL DEFAULT 'paid' CHECK (status IN ('paid', 'pending')),
    description TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'Outros',
    amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
    account_code TEXT NOT NULL CHECK (account_code IN ('drawer', 'safe', 'bank')),
    target_account_code TEXT CHECK (target_account_code IS NULL OR target_account_code IN ('drawer', 'safe', 'bank')),
    due_date DATE NOT NULL DEFAULT CURRENT_DATE,
    paid_at TIMESTAMPTZ,
    operator_name TEXT NOT NULL DEFAULT 'Sistema',
    notes TEXT NOT NULL DEFAULT '',
    source_type TEXT,
    source_id UUID,
    idempotency_key TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_financial_entries_tenant_date
    ON public.financial_entries (tenant_id, due_date DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_financial_entries_tenant_status
    ON public.financial_entries (tenant_id, status, due_date ASC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_financial_entries_idempotency
    ON public.financial_entries (tenant_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_financial_entries_source
    ON public.financial_entries (tenant_id, source_type, source_id)
    WHERE source_type IS NOT NULL AND source_id IS NOT NULL;

ALTER TABLE public.financial_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "financial_entries_tenant_isolation" ON public.financial_entries;
CREATE POLICY "financial_entries_tenant_isolation"
    ON public.financial_entries
    FOR ALL
    TO authenticated
    USING (
        tenant_id = (SELECT public.get_auth_tenant_id())
        OR (SELECT public.is_super_admin())
    )
    WITH CHECK (
        tenant_id = (SELECT public.get_auth_tenant_id())
        OR (SELECT public.is_super_admin())
    );

-- 4. Helper interno: garante contas padrão Cofre e Banco para a loja
CREATE OR REPLACE FUNCTION public.ensure_tenant_financial_accounts(p_tenant_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    INSERT INTO public.financial_accounts (tenant_id, code, name, balance)
    VALUES
        (p_tenant_id, 'safe', 'Cofre (Dinheiro Guardado)', 0),
        (p_tenant_id, 'bank', 'Banco / Conta Digital', 0)
    ON CONFLICT (tenant_id, code) DO NOTHING;
END;
$function$;

-- 5. Helper interno: aplica ou reverte impacto de saldo nas contas persistentes (safe/bank)
CREATE OR REPLACE FUNCTION public.apply_financial_entry_balance_effect(
    p_tenant_id UUID,
    p_entry_type TEXT,
    p_amount NUMERIC,
    p_account_code TEXT,
    p_target_account_code TEXT,
    p_multiplier NUMERIC DEFAULT 1
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_signed NUMERIC(12,2) := ROUND(p_amount * p_multiplier, 2);
BEGIN
    PERFORM public.ensure_tenant_financial_accounts(p_tenant_id);

    IF p_entry_type = 'income' THEN
        IF p_account_code IN ('safe', 'bank') THEN
            UPDATE public.financial_accounts
            SET balance = balance + v_signed, updated_at = NOW()
            WHERE tenant_id = p_tenant_id AND code = p_account_code;
        END IF;
    ELSIF p_entry_type = 'expense' THEN
        IF p_account_code IN ('safe', 'bank') THEN
            UPDATE public.financial_accounts
            SET balance = balance - v_signed, updated_at = NOW()
            WHERE tenant_id = p_tenant_id AND code = p_account_code;
        END IF;
    ELSIF p_entry_type = 'transfer' THEN
        IF p_account_code IN ('safe', 'bank') THEN
            UPDATE public.financial_accounts
            SET balance = balance - v_signed, updated_at = NOW()
            WHERE tenant_id = p_tenant_id AND code = p_account_code;
        END IF;
        IF p_target_account_code IN ('safe', 'bank') THEN
            UPDATE public.financial_accounts
            SET balance = balance + v_signed, updated_at = NOW()
            WHERE tenant_id = p_tenant_id AND code = p_target_account_code;
        END IF;
    END IF;
END;
$function$;

-- 6. RPC Atômica e Idempotente: Criar Lançamento / Despesa / Transferência
CREATE OR REPLACE FUNCTION public.create_financial_entry(
    p_tenant_id UUID,
    p_entry_type TEXT,
    p_description TEXT,
    p_category TEXT DEFAULT 'Outros',
    p_amount NUMERIC DEFAULT 0,
    p_account_code TEXT DEFAULT 'safe',
    p_target_account_code TEXT DEFAULT NULL,
    p_status TEXT DEFAULT 'paid',
    p_due_date DATE DEFAULT CURRENT_DATE,
    p_operator_name TEXT DEFAULT 'Operador',
    p_notes TEXT DEFAULT '',
    p_source_type TEXT DEFAULT 'manual',
    p_source_id UUID DEFAULT NULL,
    p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_existing public.financial_entries%ROWTYPE;
    v_inserted public.financial_entries%ROWTYPE;
    v_desc TEXT := NULLIF(TRIM(COALESCE(p_description, '')), '');
    v_cat TEXT := COALESCE(NULLIF(TRIM(COALESCE(p_category, '')), ''), 'Outros');
    v_op TEXT := COALESCE(NULLIF(TRIM(COALESCE(p_operator_name, '')), ''), 'Operador');
    v_notes TEXT := COALESCE(TRIM(COALESCE(p_notes, '')), '');
    v_amount NUMERIC(12,2) := ROUND(COALESCE(p_amount, 0), 2);
    v_status TEXT := COALESCE(NULLIF(TRIM(COALESCE(p_status, '')), ''), 'paid');
    v_source_type TEXT := NULLIF(TRIM(COALESCE(p_source_type, '')), '');
    v_idem TEXT := NULLIF(TRIM(COALESCE(p_idempotency_key, '')), '');
BEGIN
    IF public.is_authorized_for_tenant(p_tenant_id) IS NOT TRUE THEN
        RAISE EXCEPTION 'Acesso negado: Sem permissão para registrar lançamentos nesta loja.';
    END IF;

    IF p_entry_type NOT IN ('income', 'expense', 'transfer') THEN
        RAISE EXCEPTION 'Tipo de lançamento inválido.';
    END IF;

    IF v_status NOT IN ('paid', 'pending') THEN
        RAISE EXCEPTION 'Status de lançamento inválido.';
    END IF;

    IF v_desc IS NULL THEN
        RAISE EXCEPTION 'Informe uma descrição para o lançamento.';
    END IF;

    IF v_amount <= 0 THEN
        RAISE EXCEPTION 'O valor do lançamento deve ser maior que zero.';
    END IF;

    IF p_account_code NOT IN ('drawer', 'safe', 'bank') THEN
        RAISE EXCEPTION 'Conta de origem inválida.';
    END IF;

    IF p_entry_type = 'transfer' THEN
        IF p_target_account_code IS NULL OR p_target_account_code NOT IN ('drawer', 'safe', 'bank') THEN
            RAISE EXCEPTION 'Informe a conta de destino da transferência.';
        END IF;
        IF p_target_account_code = p_account_code THEN
            RAISE EXCEPTION 'A conta de origem e destino devem ser diferentes.';
        END IF;
        v_status := 'paid';
    END IF;

    IF v_idem IS NOT NULL THEN
        SELECT * INTO v_existing
        FROM public.financial_entries
        WHERE tenant_id = p_tenant_id AND idempotency_key = v_idem
        LIMIT 1;
        IF v_existing.id IS NOT NULL THEN
            RETURN jsonb_build_object('entry', to_jsonb(v_existing), 'deduplicated', true);
        END IF;
    END IF;

    IF v_source_type IS NOT NULL AND p_source_id IS NOT NULL THEN
        SELECT * INTO v_existing
        FROM public.financial_entries
        WHERE tenant_id = p_tenant_id AND source_type = v_source_type AND source_id = p_source_id
        LIMIT 1;
        IF v_existing.id IS NOT NULL THEN
            RETURN jsonb_build_object('entry', to_jsonb(v_existing), 'deduplicated', true);
        END IF;
    END IF;

    PERFORM public.ensure_tenant_financial_accounts(p_tenant_id);

    -- Lock das contas persistentes envolvidas antes de atualizar saldo
    PERFORM 1 FROM public.financial_accounts
    WHERE tenant_id = p_tenant_id AND code IN (p_account_code, COALESCE(p_target_account_code, ''))
    FOR UPDATE;

    INSERT INTO public.financial_entries (
        tenant_id, entry_type, status, description, category, amount,
        account_code, target_account_code, due_date, paid_at,
        operator_name, notes, source_type, source_id, idempotency_key
    )
    VALUES (
        p_tenant_id,
        p_entry_type,
        v_status,
        v_desc,
        v_cat,
        v_amount,
        p_account_code,
        CASE WHEN p_entry_type = 'transfer' THEN p_target_account_code ELSE NULL END,
        COALESCE(p_due_date, CURRENT_DATE),
        CASE WHEN v_status = 'paid' THEN NOW() ELSE NULL END,
        v_op,
        v_notes,
        COALESCE(v_source_type, 'manual'),
        p_source_id,
        v_idem
    )
    RETURNING * INTO v_inserted;

    IF v_status = 'paid' THEN
        PERFORM public.apply_financial_entry_balance_effect(
            p_tenant_id,
            v_inserted.entry_type,
            v_inserted.amount,
            v_inserted.account_code,
            v_inserted.target_account_code,
            1
        );
    END IF;

    RETURN jsonb_build_object('entry', to_jsonb(v_inserted), 'deduplicated', false);
END;
$function$;

-- 7. RPC Atômica: Dar baixa em conta a pagar / pendente
CREATE OR REPLACE FUNCTION public.mark_financial_entry_paid(
    p_tenant_id UUID,
    p_entry_id UUID,
    p_account_code TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_entry public.financial_entries%ROWTYPE;
    v_account TEXT;
BEGIN
    IF public.is_authorized_for_tenant(p_tenant_id) IS NOT TRUE THEN
        RAISE EXCEPTION 'Acesso negado.';
    END IF;

    SELECT * INTO v_entry
    FROM public.financial_entries
    WHERE id = p_entry_id AND tenant_id = p_tenant_id
    FOR UPDATE;

    IF v_entry.id IS NULL THEN
        RAISE EXCEPTION 'Lançamento não encontrado.';
    END IF;

    IF v_entry.status = 'paid' THEN
        RETURN jsonb_build_object('entry', to_jsonb(v_entry), 'already_paid', true);
    END IF;

    v_account := COALESCE(NULLIF(TRIM(COALESCE(p_account_code, '')), ''), v_entry.account_code);
    IF v_account NOT IN ('drawer', 'safe', 'bank') THEN
        RAISE EXCEPTION 'Conta inválida para baixa.';
    END IF;

    PERFORM 1 FROM public.financial_accounts
    WHERE tenant_id = p_tenant_id AND code = v_account
    FOR UPDATE;

    UPDATE public.financial_entries
    SET status = 'paid',
        account_code = v_account,
        paid_at = NOW(),
        updated_at = NOW()
    WHERE id = v_entry.id
    RETURNING * INTO v_entry;

    PERFORM public.apply_financial_entry_balance_effect(
        p_tenant_id,
        v_entry.entry_type,
        v_entry.amount,
        v_entry.account_code,
        v_entry.target_account_code,
        1
    );

    RETURN jsonb_build_object('entry', to_jsonb(v_entry), 'already_paid', false);
END;
$function$;

-- 8. RPC Atômica: Excluir lançamento manual revertendo saldo com segurança
CREATE OR REPLACE FUNCTION public.delete_financial_entry(
    p_tenant_id UUID,
    p_entry_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_entry public.financial_entries%ROWTYPE;
BEGIN
    IF public.is_authorized_for_tenant(p_tenant_id) IS NOT TRUE THEN
        RAISE EXCEPTION 'Acesso negado.';
    END IF;

    SELECT * INTO v_entry
    FROM public.financial_entries
    WHERE id = p_entry_id AND tenant_id = p_tenant_id
    FOR UPDATE;

    IF v_entry.id IS NULL THEN
        RAISE EXCEPTION 'Lançamento não encontrado.';
    END IF;

    IF COALESCE(v_entry.source_type, 'manual') <> 'manual' THEN
        RAISE EXCEPTION 'Lançamentos automáticos do caixa/turno não podem ser excluídos manualmente.';
    END IF;

    IF v_entry.status = 'paid' THEN
        PERFORM 1 FROM public.financial_accounts
        WHERE tenant_id = p_tenant_id AND code IN (v_entry.account_code, COALESCE(v_entry.target_account_code, ''))
        FOR UPDATE;

        PERFORM public.apply_financial_entry_balance_effect(
            p_tenant_id,
            v_entry.entry_type,
            v_entry.amount,
            v_entry.account_code,
            v_entry.target_account_code,
            -1
        );
    END IF;

    DELETE FROM public.financial_entries WHERE id = v_entry.id;

    RETURN jsonb_build_object('deleted', true, 'id', v_entry.id);
END;
$function$;

-- 9. RPC Consolidada: Visão Financeira da Loja (Contas + Extrato + Resumo do Período)
CREATE OR REPLACE FUNCTION public.get_financial_overview(
    p_tenant_id UUID,
    p_start_date DATE DEFAULT (date_trunc('month', CURRENT_DATE))::DATE,
    p_end_date DATE DEFAULT CURRENT_DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_safe_balance NUMERIC(12,2) := 0;
    v_bank_balance NUMERIC(12,2) := 0;
    v_drawer_balance NUMERIC(12,2) := 0;
    v_drawer_open BOOLEAN := false;
    v_open_session public.cash_sessions%ROWTYPE;
    v_cash_sales NUMERIC(12,2) := 0;
    v_mov_in NUMERIC(12,2) := 0;
    v_mov_out NUMERIC(12,2) := 0;
    v_income_total NUMERIC(12,2) := 0;
    v_expense_total NUMERIC(12,2) := 0;
    v_pending_expense_total NUMERIC(12,2) := 0;
    v_entries JSONB := '[]'::JSONB;
BEGIN
    IF public.is_authorized_for_tenant(p_tenant_id) IS NOT TRUE THEN
        RAISE EXCEPTION 'Acesso negado.';
    END IF;

    PERFORM public.ensure_tenant_financial_accounts(p_tenant_id);

    SELECT COALESCE(balance, 0) INTO v_safe_balance
    FROM public.financial_accounts
    WHERE tenant_id = p_tenant_id AND code = 'safe';

    SELECT COALESCE(balance, 0) INTO v_bank_balance
    FROM public.financial_accounts
    WHERE tenant_id = p_tenant_id AND code = 'bank';

    -- Saldo ao vivo da Gaveta (sessão aberta atual)
    SELECT * INTO v_open_session
    FROM public.cash_sessions
    WHERE tenant_id = p_tenant_id AND status = 'open'
    ORDER BY opened_at DESC
    LIMIT 1;

    IF v_open_session.id IS NOT NULL THEN
        v_drawer_open := true;
        SELECT COALESCE(SUM(total_amount), 0) INTO v_cash_sales
        FROM public.orders
        WHERE tenant_id = p_tenant_id
          AND cash_session_id = v_open_session.id
          AND status <> 'cancelled'
          AND (
            LOWER(COALESCE(payment_method, '')) LIKE '%dinheiro%'
            OR LOWER(COALESCE(payment_method, '')) = 'cash'
          );

        SELECT
            COALESCE(SUM(CASE WHEN type = 'supply' AND direction = 'in' THEN amount ELSE 0 END), 0),
            COALESCE(SUM(CASE WHEN type IN ('bleed', 'expense') AND direction = 'out' THEN amount ELSE 0 END), 0)
        INTO v_mov_in, v_mov_out
        FROM public.cash_movements
        WHERE cash_session_id = v_open_session.id;

        v_drawer_balance := ROUND(COALESCE(v_open_session.initial_float, 0) + v_cash_sales + v_mov_in - v_mov_out, 2);
    END IF;

    SELECT
        COALESCE(SUM(CASE WHEN entry_type = 'income' AND status = 'paid' THEN amount ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN entry_type = 'expense' AND status = 'paid' THEN amount ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN entry_type = 'expense' AND status = 'pending' THEN amount ELSE 0 END), 0)
    INTO v_income_total, v_expense_total, v_pending_expense_total
    FROM public.financial_entries
    WHERE tenant_id = p_tenant_id
      AND due_date BETWEEN p_start_date AND p_end_date;

    SELECT COALESCE(jsonb_agg(to_jsonb(e) ORDER BY e.due_date DESC, e.created_at DESC), '[]'::JSONB)
    INTO v_entries
    FROM (
        SELECT *
        FROM public.financial_entries
        WHERE tenant_id = p_tenant_id
          AND due_date BETWEEN p_start_date AND p_end_date
        ORDER BY due_date DESC, created_at DESC
        LIMIT 300
    ) e;

    RETURN jsonb_build_object(
        'accounts', jsonb_build_object(
            'drawer', jsonb_build_object('balance', v_drawer_balance, 'is_open', v_drawer_open),
            'safe', jsonb_build_object('balance', v_safe_balance),
            'bank', jsonb_build_object('balance', v_bank_balance)
        ),
        'summary', jsonb_build_object(
            'income_total', v_income_total,
            'expense_total', v_expense_total,
            'net_total', ROUND(v_income_total - v_expense_total, 2),
            'pending_expense_total', v_pending_expense_total
        ),
        'entries', v_entries
    );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.ensure_tenant_financial_accounts(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_financial_entry(UUID, TEXT, TEXT, TEXT, NUMERIC, TEXT, TEXT, TEXT, DATE, TEXT, TEXT, TEXT, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_financial_entry_paid(UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_financial_entry(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_financial_overview(UUID, DATE, DATE) TO authenticated;



-- >>> MIGRATION: 20261112_fix_entry_idempotency_concurrency.sql
-- Garante deduplicação atômica sem erro sob rajada simultânea em create_financial_entry
CREATE OR REPLACE FUNCTION public.create_financial_entry(
    p_tenant_id UUID,
    p_entry_type TEXT,
    p_description TEXT,
    p_category TEXT DEFAULT 'Outros',
    p_amount NUMERIC DEFAULT 0,
    p_account_code TEXT DEFAULT 'safe',
    p_target_account_code TEXT DEFAULT NULL,
    p_status TEXT DEFAULT 'paid',
    p_due_date DATE DEFAULT CURRENT_DATE,
    p_operator_name TEXT DEFAULT 'Operador',
    p_notes TEXT DEFAULT '',
    p_source_type TEXT DEFAULT 'manual',
    p_source_id UUID DEFAULT NULL,
    p_idempotency_key TEXT DEFAULT NULL,
    p_account_id UUID DEFAULT NULL,
    p_target_account_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_existing public.financial_entries%ROWTYPE;
    v_inserted public.financial_entries%ROWTYPE;
    v_desc TEXT := NULLIF(TRIM(COALESCE(p_description, '')), '');
    v_cat TEXT := COALESCE(NULLIF(TRIM(COALESCE(p_category, '')), ''), 'Outros');
    v_op TEXT := COALESCE(NULLIF(TRIM(COALESCE(p_operator_name, '')), ''), 'Operador');
    v_notes TEXT := COALESCE(TRIM(COALESCE(p_notes, '')), '');
    v_amount NUMERIC(12,2) := ROUND(COALESCE(p_amount, 0), 2);
    v_status TEXT := COALESCE(NULLIF(TRIM(COALESCE(p_status, '')), ''), 'paid');
    v_source_type TEXT := NULLIF(TRIM(COALESCE(p_source_type, '')), '');
    v_idem TEXT := NULLIF(TRIM(COALESCE(p_idempotency_key, '')), '');
    v_src_acc_id UUID;
    v_tgt_acc_id UUID;
BEGIN
    IF public.is_authorized_for_tenant(p_tenant_id) IS NOT TRUE THEN
        RAISE EXCEPTION 'Acesso negado: Sem permissão para registrar lançamentos nesta loja.';
    END IF;

    IF p_entry_type NOT IN ('income', 'expense', 'transfer') THEN
        RAISE EXCEPTION 'Tipo de lançamento inválido.';
    END IF;

    IF v_status NOT IN ('paid', 'pending') THEN
        RAISE EXCEPTION 'Status de lançamento inválido.';
    END IF;

    IF v_desc IS NULL THEN
        RAISE EXCEPTION 'Informe uma descrição para o lançamento.';
    END IF;

    IF v_amount <= 0 THEN
        RAISE EXCEPTION 'O valor do lançamento deve ser maior que zero.';
    END IF;

    IF p_account_code NOT IN ('drawer', 'safe', 'bank') THEN
        RAISE EXCEPTION 'Conta de origem inválida.';
    END IF;

    v_src_acc_id := public.resolve_financial_account_id(p_tenant_id, p_account_code, p_account_id);

    IF p_entry_type = 'transfer' THEN
        IF p_target_account_code IS NULL OR p_target_account_code NOT IN ('drawer', 'safe', 'bank') THEN
            RAISE EXCEPTION 'Informe a conta de destino da transferência.';
        END IF;

        v_tgt_acc_id := public.resolve_financial_account_id(p_tenant_id, p_target_account_code, p_target_account_id);

        IF p_account_code = p_target_account_code THEN
            IF p_account_code <> 'bank' OR v_src_acc_id IS NOT DISTINCT FROM v_tgt_acc_id THEN
                RAISE EXCEPTION 'A conta de origem e destino devem ser diferentes.';
            END IF;
        END IF;
        v_status := 'paid';
    END IF;

    -- Lock das contas persistentes envolvidas ANTES da checagem de idempotência para serializar rajadas
    PERFORM 1 FROM public.financial_accounts
    WHERE tenant_id = p_tenant_id
      AND id IN (v_src_acc_id, v_tgt_acc_id)
    FOR UPDATE;

    IF v_idem IS NOT NULL THEN
        SELECT * INTO v_existing
        FROM public.financial_entries
        WHERE tenant_id = p_tenant_id AND idempotency_key = v_idem
        LIMIT 1;
        IF v_existing.id IS NOT NULL THEN
            RETURN jsonb_build_object('entry', to_jsonb(v_existing), 'deduplicated', true);
        END IF;
    END IF;

    IF v_source_type IS NOT NULL AND p_source_id IS NOT NULL THEN
        SELECT * INTO v_existing
        FROM public.financial_entries
        WHERE tenant_id = p_tenant_id AND source_type = v_source_type AND source_id = p_source_id
        LIMIT 1;
        IF v_existing.id IS NOT NULL THEN
            RETURN jsonb_build_object('entry', to_jsonb(v_existing), 'deduplicated', true);
        END IF;
    END IF;

    BEGIN
        INSERT INTO public.financial_entries (
            tenant_id, entry_type, status, description, category, amount,
            account_code, account_id, target_account_code, target_account_id,
            due_date, paid_at, operator_name, notes, source_type, source_id, idempotency_key
        )
        VALUES (
            p_tenant_id,
            p_entry_type,
            v_status,
            v_desc,
            v_cat,
            v_amount,
            p_account_code,
            v_src_acc_id,
            CASE WHEN p_entry_type = 'transfer' THEN p_target_account_code ELSE NULL END,
            CASE WHEN p_entry_type = 'transfer' THEN v_tgt_acc_id ELSE NULL END,
            COALESCE(p_due_date, CURRENT_DATE),
            CASE WHEN v_status = 'paid' THEN NOW() ELSE NULL END,
            v_op,
            v_notes,
            COALESCE(v_source_type, 'manual'),
            p_source_id,
            v_idem
        )
        RETURNING * INTO v_inserted;
    EXCEPTION WHEN unique_violation THEN
        IF v_idem IS NOT NULL THEN
            SELECT * INTO v_existing
            FROM public.financial_entries
            WHERE tenant_id = p_tenant_id AND idempotency_key = v_idem
            LIMIT 1;
            IF v_existing.id IS NOT NULL THEN
                RETURN jsonb_build_object('entry', to_jsonb(v_existing), 'deduplicated', true);
            END IF;
        END IF;
        IF v_source_type IS NOT NULL AND p_source_id IS NOT NULL THEN
            SELECT * INTO v_existing
            FROM public.financial_entries
            WHERE tenant_id = p_tenant_id AND source_type = v_source_type AND source_id = p_source_id
            LIMIT 1;
            IF v_existing.id IS NOT NULL THEN
                RETURN jsonb_build_object('entry', to_jsonb(v_existing), 'deduplicated', true);
            END IF;
        END IF;
        RAISE;
    END;

    IF v_status = 'paid' THEN
        PERFORM public.apply_financial_entry_balance_effect(
            p_tenant_id,
            v_inserted.entry_type,
            v_inserted.amount,
            v_inserted.account_code,
            v_inserted.target_account_code,
            1,
            v_inserted.account_id,
            v_inserted.target_account_id
        );
    END IF;

    RETURN jsonb_build_object('entry', to_jsonb(v_inserted), 'deduplicated', false);
END;
$function$;



-- >>> MIGRATION: 20261112_multiple_bank_accounts.sql
-- ============================================================================
-- Migration: Múltiplos Bancos / Contas Digitais por Loja
-- Mantém 100% de compatibilidade com RPCs existentes e Caixa (Gaveta/Cofre)
-- ============================================================================

-- 1. Evoluir financial_accounts para permitir múltiplos bancos por loja
ALTER TABLE public.financial_accounts
    DROP CONSTRAINT IF EXISTS financial_accounts_tenant_id_code_key;

ALTER TABLE public.financial_accounts
    ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS account_kind TEXT NOT NULL DEFAULT 'checking';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'financial_accounts_account_kind_check'
    ) THEN
        ALTER TABLE public.financial_accounts
            ADD CONSTRAINT financial_accounts_account_kind_check
            CHECK (account_kind IN ('checking', 'digital', 'acquirer'));
    END IF;
END $$;

-- Apenas 1 Cofre por loja
CREATE UNIQUE INDEX IF NOT EXISTS uq_financial_accounts_single_safe
    ON public.financial_accounts (tenant_id)
    WHERE code = 'safe';

-- Garantir que todo banco existente seja marcado como ativo e padrão (se não houver outro padrão)
WITH ranked_banks AS (
    SELECT id, tenant_id,
           ROW_NUMBER() OVER (PARTITION BY tenant_id ORDER BY created_at ASC, id ASC) AS rn
    FROM public.financial_accounts
    WHERE code = 'bank' AND is_active = true
)
UPDATE public.financial_accounts fa
SET is_default = (rb.rn = 1)
FROM ranked_banks rb
WHERE fa.id = rb.id
  AND NOT EXISTS (
      SELECT 1 FROM public.financial_accounts x
      WHERE x.tenant_id = fa.tenant_id AND x.code = 'bank' AND x.is_default = true AND x.is_active = true
  );

-- Apenas 1 Banco padrão ativo por loja
CREATE UNIQUE INDEX IF NOT EXISTS uq_financial_accounts_default_bank
    ON public.financial_accounts (tenant_id)
    WHERE code = 'bank' AND is_default = true AND is_active = true;

-- 2. Vincular lançamentos ao ID exato da conta (account_id / target_account_id)
ALTER TABLE public.financial_entries
    ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES public.financial_accounts(id) ON DELETE RESTRICT,
    ADD COLUMN IF NOT EXISTS target_account_id UUID REFERENCES public.financial_accounts(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_financial_entries_account_id
    ON public.financial_entries (tenant_id, account_id)
    WHERE account_id IS NOT NULL;

-- Backfill de lançamentos antigos
UPDATE public.financial_entries fe
SET account_id = fa.id
FROM public.financial_accounts fa
WHERE fe.account_id IS NULL
  AND fe.tenant_id = fa.tenant_id
  AND fe.account_code = fa.code
  AND (fa.code = 'safe' OR (fa.code = 'bank' AND fa.is_default = true));

UPDATE public.financial_entries fe
SET target_account_id = fa.id
FROM public.financial_accounts fa
WHERE fe.target_account_id IS NULL
  AND fe.tenant_id = fa.tenant_id
  AND fe.target_account_code = fa.code
  AND (fa.code = 'safe' OR (fa.code = 'bank' AND fa.is_default = true));

-- 3. Atualizar ensure_tenant_financial_accounts para trabalhar com índices parciais
CREATE OR REPLACE FUNCTION public.ensure_tenant_financial_accounts(p_tenant_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    INSERT INTO public.financial_accounts (tenant_id, code, name, balance, is_default, is_active)
    SELECT p_tenant_id, 'safe', 'Cofre (Dinheiro Guardado)', 0, false, true
    WHERE NOT EXISTS (
        SELECT 1 FROM public.financial_accounts
        WHERE tenant_id = p_tenant_id AND code = 'safe'
    );

    INSERT INTO public.financial_accounts (tenant_id, code, name, balance, is_default, is_active, account_kind)
    SELECT p_tenant_id, 'bank', 'Banco / Conta Digital', 0, true, true, 'checking'
    WHERE NOT EXISTS (
        SELECT 1 FROM public.financial_accounts
        WHERE tenant_id = p_tenant_id AND code = 'bank' AND is_active = true
    );
END;
$function$;

-- 4. Helper interno: resolver account_id a partir de code ou id explícito
CREATE OR REPLACE FUNCTION public.resolve_financial_account_id(
    p_tenant_id UUID,
    p_code TEXT,
    p_account_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_found_id UUID;
BEGIN
    IF p_code = 'drawer' THEN
        RETURN NULL;
    END IF;

    PERFORM public.ensure_tenant_financial_accounts(p_tenant_id);

    IF p_account_id IS NOT NULL THEN
        SELECT id INTO v_found_id
        FROM public.financial_accounts
        WHERE id = p_account_id
          AND tenant_id = p_tenant_id
          AND code = p_code
          AND is_active = true
        LIMIT 1;

        IF v_found_id IS NULL THEN
            RAISE EXCEPTION 'Conta financeira informada não encontrada ou inativa.';
        END IF;
        RETURN v_found_id;
    END IF;

    SELECT id INTO v_found_id
    FROM public.financial_accounts
    WHERE tenant_id = p_tenant_id
      AND code = p_code
      AND is_active = true
    ORDER BY is_default DESC, created_at ASC
    LIMIT 1;

    RETURN v_found_id;
END;
$function$;

-- 5. Atualizar apply_financial_entry_balance_effect para usar account_id quando disponível
DROP FUNCTION IF EXISTS public.apply_financial_entry_balance_effect(UUID, TEXT, NUMERIC, TEXT, TEXT, NUMERIC);
CREATE OR REPLACE FUNCTION public.apply_financial_entry_balance_effect(
    p_tenant_id UUID,
    p_entry_type TEXT,
    p_amount NUMERIC,
    p_account_code TEXT,
    p_target_account_code TEXT,
    p_multiplier NUMERIC DEFAULT 1,
    p_account_id UUID DEFAULT NULL,
    p_target_account_id UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_signed NUMERIC(12,2) := ROUND(p_amount * p_multiplier, 2);
    v_src_id UUID;
    v_tgt_id UUID;
BEGIN
    PERFORM public.ensure_tenant_financial_accounts(p_tenant_id);

    IF p_account_code IN ('safe', 'bank') THEN
        v_src_id := COALESCE(
            p_account_id,
            (
                SELECT id FROM public.financial_accounts
                WHERE tenant_id = p_tenant_id AND code = p_account_code
                ORDER BY is_active DESC, is_default DESC, created_at ASC
                LIMIT 1
            )
        );
    END IF;

    IF p_target_account_code IN ('safe', 'bank') THEN
        v_tgt_id := COALESCE(
            p_target_account_id,
            (
                SELECT id FROM public.financial_accounts
                WHERE tenant_id = p_tenant_id AND code = p_target_account_code
                ORDER BY is_active DESC, is_default DESC, created_at ASC
                LIMIT 1
            )
        );
    END IF;

    IF p_entry_type = 'income' THEN
        IF v_src_id IS NOT NULL THEN
            UPDATE public.financial_accounts
            SET balance = balance + v_signed, updated_at = NOW()
            WHERE id = v_src_id AND tenant_id = p_tenant_id;
        END IF;
    ELSIF p_entry_type = 'expense' THEN
        IF v_src_id IS NOT NULL THEN
            UPDATE public.financial_accounts
            SET balance = balance - v_signed, updated_at = NOW()
            WHERE id = v_src_id AND tenant_id = p_tenant_id;
        END IF;
    ELSIF p_entry_type = 'transfer' THEN
        IF v_src_id IS NOT NULL THEN
            UPDATE public.financial_accounts
            SET balance = balance - v_signed, updated_at = NOW()
            WHERE id = v_src_id AND tenant_id = p_tenant_id;
        END IF;
        IF v_tgt_id IS NOT NULL THEN
            UPDATE public.financial_accounts
            SET balance = balance + v_signed, updated_at = NOW()
            WHERE id = v_tgt_id AND tenant_id = p_tenant_id;
        END IF;
    END IF;
END;
$function$;

-- 6. Atualizar create_financial_entry com suporte a p_account_id e p_target_account_id (inclusive Banco A -> Banco B)
DROP FUNCTION IF EXISTS public.create_financial_entry(UUID, TEXT, TEXT, TEXT, NUMERIC, TEXT, TEXT, TEXT, DATE, TEXT, TEXT, TEXT, UUID, TEXT);
CREATE OR REPLACE FUNCTION public.create_financial_entry(
    p_tenant_id UUID,
    p_entry_type TEXT,
    p_description TEXT,
    p_category TEXT DEFAULT 'Outros',
    p_amount NUMERIC DEFAULT 0,
    p_account_code TEXT DEFAULT 'safe',
    p_target_account_code TEXT DEFAULT NULL,
    p_status TEXT DEFAULT 'paid',
    p_due_date DATE DEFAULT CURRENT_DATE,
    p_operator_name TEXT DEFAULT 'Operador',
    p_notes TEXT DEFAULT '',
    p_source_type TEXT DEFAULT 'manual',
    p_source_id UUID DEFAULT NULL,
    p_idempotency_key TEXT DEFAULT NULL,
    p_account_id UUID DEFAULT NULL,
    p_target_account_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_existing public.financial_entries%ROWTYPE;
    v_inserted public.financial_entries%ROWTYPE;
    v_desc TEXT := NULLIF(TRIM(COALESCE(p_description, '')), '');
    v_cat TEXT := COALESCE(NULLIF(TRIM(COALESCE(p_category, '')), ''), 'Outros');
    v_op TEXT := COALESCE(NULLIF(TRIM(COALESCE(p_operator_name, '')), ''), 'Operador');
    v_notes TEXT := COALESCE(TRIM(COALESCE(p_notes, '')), '');
    v_amount NUMERIC(12,2) := ROUND(COALESCE(p_amount, 0), 2);
    v_status TEXT := COALESCE(NULLIF(TRIM(COALESCE(p_status, '')), ''), 'paid');
    v_source_type TEXT := NULLIF(TRIM(COALESCE(p_source_type, '')), '');
    v_idem TEXT := NULLIF(TRIM(COALESCE(p_idempotency_key, '')), '');
    v_src_acc_id UUID;
    v_tgt_acc_id UUID;
BEGIN
    IF public.is_authorized_for_tenant(p_tenant_id) IS NOT TRUE THEN
        RAISE EXCEPTION 'Acesso negado: Sem permissão para registrar lançamentos nesta loja.';
    END IF;

    IF p_entry_type NOT IN ('income', 'expense', 'transfer') THEN
        RAISE EXCEPTION 'Tipo de lançamento inválido.';
    END IF;

    IF v_status NOT IN ('paid', 'pending') THEN
        RAISE EXCEPTION 'Status de lançamento inválido.';
    END IF;

    IF v_desc IS NULL THEN
        RAISE EXCEPTION 'Informe uma descrição para o lançamento.';
    END IF;

    IF v_amount <= 0 THEN
        RAISE EXCEPTION 'O valor do lançamento deve ser maior que zero.';
    END IF;

    IF p_account_code NOT IN ('drawer', 'safe', 'bank') THEN
        RAISE EXCEPTION 'Conta de origem inválida.';
    END IF;

    v_src_acc_id := public.resolve_financial_account_id(p_tenant_id, p_account_code, p_account_id);

    IF p_entry_type = 'transfer' THEN
        IF p_target_account_code IS NULL OR p_target_account_code NOT IN ('drawer', 'safe', 'bank') THEN
            RAISE EXCEPTION 'Informe a conta de destino da transferência.';
        END IF;

        v_tgt_acc_id := public.resolve_financial_account_id(p_tenant_id, p_target_account_code, p_target_account_id);

        IF p_account_code = p_target_account_code THEN
            IF p_account_code <> 'bank' OR v_src_acc_id IS NOT DISTINCT FROM v_tgt_acc_id THEN
                RAISE EXCEPTION 'A conta de origem e destino devem ser diferentes.';
            END IF;
        END IF;
        v_status := 'paid';
    END IF;

    IF v_idem IS NOT NULL THEN
        SELECT * INTO v_existing
        FROM public.financial_entries
        WHERE tenant_id = p_tenant_id AND idempotency_key = v_idem
        LIMIT 1;
        IF v_existing.id IS NOT NULL THEN
            RETURN jsonb_build_object('entry', to_jsonb(v_existing), 'deduplicated', true);
        END IF;
    END IF;

    IF v_source_type IS NOT NULL AND p_source_id IS NOT NULL THEN
        SELECT * INTO v_existing
        FROM public.financial_entries
        WHERE tenant_id = p_tenant_id AND source_type = v_source_type AND source_id = p_source_id
        LIMIT 1;
        IF v_existing.id IS NOT NULL THEN
            RETURN jsonb_build_object('entry', to_jsonb(v_existing), 'deduplicated', true);
        END IF;
    END IF;

    -- Lock das contas persistentes envolvidas antes de atualizar saldo
    PERFORM 1 FROM public.financial_accounts
    WHERE tenant_id = p_tenant_id
      AND id IN (v_src_acc_id, v_tgt_acc_id)
    FOR UPDATE;

    INSERT INTO public.financial_entries (
        tenant_id, entry_type, status, description, category, amount,
        account_code, account_id, target_account_code, target_account_id,
        due_date, paid_at, operator_name, notes, source_type, source_id, idempotency_key
    )
    VALUES (
        p_tenant_id,
        p_entry_type,
        v_status,
        v_desc,
        v_cat,
        v_amount,
        p_account_code,
        v_src_acc_id,
        CASE WHEN p_entry_type = 'transfer' THEN p_target_account_code ELSE NULL END,
        CASE WHEN p_entry_type = 'transfer' THEN v_tgt_acc_id ELSE NULL END,
        COALESCE(p_due_date, CURRENT_DATE),
        CASE WHEN v_status = 'paid' THEN NOW() ELSE NULL END,
        v_op,
        v_notes,
        COALESCE(v_source_type, 'manual'),
        p_source_id,
        v_idem
    )
    RETURNING * INTO v_inserted;

    IF v_status = 'paid' THEN
        PERFORM public.apply_financial_entry_balance_effect(
            p_tenant_id,
            v_inserted.entry_type,
            v_inserted.amount,
            v_inserted.account_code,
            v_inserted.target_account_code,
            1,
            v_inserted.account_id,
            v_inserted.target_account_id
        );
    END IF;

    RETURN jsonb_build_object('entry', to_jsonb(v_inserted), 'deduplicated', false);
END;
$function$;

-- 7. Atualizar create_financial_installments com p_account_id
DROP FUNCTION IF EXISTS public.create_financial_installments(UUID, TEXT, TEXT, TEXT, TEXT, NUMERIC, TEXT, DATE, INTEGER, BOOLEAN, TEXT, TEXT);
CREATE OR REPLACE FUNCTION public.create_financial_installments(
    p_tenant_id UUID,
    p_entry_type TEXT,
    p_description TEXT,
    p_counterparty TEXT DEFAULT '',
    p_category TEXT DEFAULT 'Outros',
    p_amount NUMERIC DEFAULT 0,
    p_account_code TEXT DEFAULT 'bank',
    p_first_due_date DATE DEFAULT CURRENT_DATE,
    p_installments INTEGER DEFAULT 1,
    p_mark_first_paid BOOLEAN DEFAULT false,
    p_operator_name TEXT DEFAULT 'Operador',
    p_notes TEXT DEFAULT '',
    p_account_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_desc TEXT := NULLIF(TRIM(COALESCE(p_description, '')), '');
    v_cp TEXT := COALESCE(TRIM(COALESCE(p_counterparty, '')), '');
    v_cat TEXT := COALESCE(NULLIF(TRIM(COALESCE(p_category, '')), ''), 'Outros');
    v_op TEXT := COALESCE(NULLIF(TRIM(COALESCE(p_operator_name, '')), ''), 'Operador');
    v_notes TEXT := COALESCE(TRIM(COALESCE(p_notes, '')), '');
    v_amount NUMERIC(12,2) := ROUND(COALESCE(p_amount, 0), 2);
    v_count INTEGER := GREATEST(1, LEAST(24, COALESCE(p_installments, 1)));
    v_group_id UUID := CASE WHEN v_count > 1 THEN gen_random_uuid() ELSE NULL END;
    v_first_date DATE := COALESCE(p_first_due_date, (NOW() AT TIME ZONE 'America/Sao_Paulo')::DATE);
    v_i INTEGER;
    v_due DATE;
    v_status TEXT;
    v_item_desc TEXT;
    v_acc_id UUID;
    v_inserted public.financial_entries%ROWTYPE;
    v_created JSONB := '[]'::JSONB;
BEGIN
    IF public.is_authorized_for_tenant(p_tenant_id) IS NOT TRUE THEN
        RAISE EXCEPTION 'Acesso negado: Sem permissão para registrar contas nesta loja.';
    END IF;

    IF p_entry_type NOT IN ('income', 'expense') THEN
        RAISE EXCEPTION 'Tipo inválido para Contas a Pagar/Receber.';
    END IF;

    IF p_account_code NOT IN ('safe', 'bank') THEN
        RAISE EXCEPTION 'Conta inválida. Escolha Cofre ou Banco.';
    END IF;

    IF v_desc IS NULL THEN
        RAISE EXCEPTION 'Informe a descrição da conta.';
    END IF;

    IF v_amount <= 0 THEN
        RAISE EXCEPTION 'O valor deve ser maior que zero.';
    END IF;

    v_acc_id := public.resolve_financial_account_id(p_tenant_id, p_account_code, p_account_id);

    IF p_mark_first_paid THEN
        PERFORM 1 FROM public.financial_accounts
        WHERE id = v_acc_id AND tenant_id = p_tenant_id
        FOR UPDATE;
    END IF;

    FOR v_i IN 1..v_count LOOP
        v_due := (v_first_date + ((v_i - 1) * INTERVAL '1 month'))::DATE;
        v_status := CASE WHEN (v_i = 1 AND p_mark_first_paid) THEN 'paid' ELSE 'pending' END;
        v_item_desc := CASE WHEN v_count > 1 THEN v_desc || ' (' || v_i || '/' || v_count || ')' ELSE v_desc END;

        INSERT INTO public.financial_entries (
            tenant_id, entry_type, status, description, counterparty, category, amount,
            account_code, account_id, due_date, paid_at, operator_name, notes, source_type,
            installment_group_id, installment_number, installment_total
        )
        VALUES (
            p_tenant_id,
            p_entry_type,
            v_status,
            v_item_desc,
            v_cp,
            v_cat,
            v_amount,
            p_account_code,
            v_acc_id,
            v_due,
            CASE WHEN v_status = 'paid' THEN NOW() ELSE NULL END,
            v_op,
            v_notes,
            'manual',
            v_group_id,
            v_i,
            v_count
        )
        RETURNING * INTO v_inserted;

        IF v_status = 'paid' THEN
            PERFORM public.apply_financial_entry_balance_effect(
                p_tenant_id,
                v_inserted.entry_type,
                v_inserted.amount,
                v_inserted.account_code,
                NULL,
                1,
                v_inserted.account_id,
                NULL
            );
        END IF;

        v_created := v_created || jsonb_build_array(to_jsonb(v_inserted));
    END LOOP;

    RETURN jsonb_build_object('count', v_count, 'items', v_created);
END;
$function$;

-- 8. Atualizar mark_financial_entry_paid com p_account_id
DROP FUNCTION IF EXISTS public.mark_financial_entry_paid(UUID, UUID, TEXT);
CREATE OR REPLACE FUNCTION public.mark_financial_entry_paid(
    p_tenant_id UUID,
    p_entry_id UUID,
    p_account_code TEXT DEFAULT NULL,
    p_account_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_entry public.financial_entries%ROWTYPE;
    v_account TEXT;
    v_acc_id UUID;
BEGIN
    IF public.is_authorized_for_tenant(p_tenant_id) IS NOT TRUE THEN
        RAISE EXCEPTION 'Acesso negado.';
    END IF;

    SELECT * INTO v_entry
    FROM public.financial_entries
    WHERE id = p_entry_id AND tenant_id = p_tenant_id
    FOR UPDATE;

    IF v_entry.id IS NULL THEN
        RAISE EXCEPTION 'Lançamento não encontrado.';
    END IF;

    IF v_entry.status = 'paid' THEN
        RETURN jsonb_build_object('entry', to_jsonb(v_entry), 'already_paid', true);
    END IF;

    v_account := COALESCE(NULLIF(TRIM(COALESCE(p_account_code, '')), ''), v_entry.account_code);
    IF v_account NOT IN ('drawer', 'safe', 'bank') THEN
        RAISE EXCEPTION 'Conta inválida para baixa.';
    END IF;

    v_acc_id := public.resolve_financial_account_id(
        p_tenant_id,
        v_account,
        COALESCE(p_account_id, CASE WHEN v_account = v_entry.account_code THEN v_entry.account_id ELSE NULL END)
    );

    IF v_acc_id IS NOT NULL THEN
        PERFORM 1 FROM public.financial_accounts
        WHERE id = v_acc_id AND tenant_id = p_tenant_id
        FOR UPDATE;
    END IF;

    UPDATE public.financial_entries
    SET status = 'paid',
        account_code = v_account,
        account_id = v_acc_id,
        paid_at = NOW(),
        updated_at = NOW()
    WHERE id = v_entry.id
    RETURNING * INTO v_entry;

    PERFORM public.apply_financial_entry_balance_effect(
        p_tenant_id,
        v_entry.entry_type,
        v_entry.amount,
        v_entry.account_code,
        v_entry.target_account_code,
        1,
        v_entry.account_id,
        v_entry.target_account_id
    );

    RETURN jsonb_build_object('entry', to_jsonb(v_entry), 'already_paid', false);
END;
$function$;

-- 9. Atualizar delete_financial_entry para estornar usando account_id / target_account_id
CREATE OR REPLACE FUNCTION public.delete_financial_entry(
    p_tenant_id UUID,
    p_entry_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_entry public.financial_entries%ROWTYPE;
BEGIN
    IF public.is_authorized_for_tenant(p_tenant_id) IS NOT TRUE THEN
        RAISE EXCEPTION 'Acesso negado.';
    END IF;

    SELECT * INTO v_entry
    FROM public.financial_entries
    WHERE id = p_entry_id AND tenant_id = p_tenant_id
    FOR UPDATE;

    IF v_entry.id IS NULL THEN
        RAISE EXCEPTION 'Lançamento não encontrado.';
    END IF;

    IF COALESCE(v_entry.source_type, 'manual') <> 'manual' THEN
        RAISE EXCEPTION 'Lançamentos automáticos do caixa/turno não podem ser excluídos manualmente.';
    END IF;

    IF v_entry.status = 'paid' THEN
        PERFORM 1 FROM public.financial_accounts
        WHERE tenant_id = p_tenant_id
          AND id IN (v_entry.account_id, v_entry.target_account_id)
        FOR UPDATE;

        PERFORM public.apply_financial_entry_balance_effect(
            p_tenant_id,
            v_entry.entry_type,
            v_entry.amount,
            v_entry.account_code,
            v_entry.target_account_code,
            -1,
            v_entry.account_id,
            v_entry.target_account_id
        );
    END IF;

    DELETE FROM public.financial_entries WHERE id = v_entry.id;

    RETURN jsonb_build_object('deleted', true, 'id', v_entry.id);
END;
$function$;

-- 10. Atualizar get_financial_overview e get_payables_receivables_overview com lista de bancos + account_name
CREATE OR REPLACE FUNCTION public.get_financial_overview(
    p_tenant_id UUID,
    p_start_date DATE DEFAULT (date_trunc('month', CURRENT_DATE))::DATE,
    p_end_date DATE DEFAULT CURRENT_DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_safe_id UUID;
    v_safe_balance NUMERIC(12,2) := 0;
    v_safe_name TEXT := 'Cofre (Dinheiro Guardado)';
    v_bank_balance NUMERIC(12,2) := 0;
    v_bank_name TEXT := 'Banco / Conta Digital';
    v_banks JSONB := '[]'::JSONB;
    v_drawer_balance NUMERIC(12,2) := 0;
    v_drawer_open BOOLEAN := false;
    v_open_session public.cash_sessions%ROWTYPE;
    v_cash_sales NUMERIC(12,2) := 0;
    v_mov_in NUMERIC(12,2) := 0;
    v_mov_out NUMERIC(12,2) := 0;
    v_income_total NUMERIC(12,2) := 0;
    v_expense_total NUMERIC(12,2) := 0;
    v_pending_expense_total NUMERIC(12,2) := 0;
    v_entries JSONB := '[]'::JSONB;
BEGIN
    IF public.is_authorized_for_tenant(p_tenant_id) IS NOT TRUE THEN
        RAISE EXCEPTION 'Acesso negado.';
    END IF;

    PERFORM public.ensure_tenant_financial_accounts(p_tenant_id);

    SELECT id, COALESCE(balance, 0), COALESCE(NULLIF(TRIM(name), ''), 'Cofre (Dinheiro Guardado)')
    INTO v_safe_id, v_safe_balance, v_safe_name
    FROM public.financial_accounts
    WHERE tenant_id = p_tenant_id AND code = 'safe'
    LIMIT 1;

    SELECT COALESCE(SUM(balance), 0)
    INTO v_bank_balance
    FROM public.financial_accounts
    WHERE tenant_id = p_tenant_id AND code = 'bank' AND is_active = true;

    SELECT COALESCE(NULLIF(TRIM(name), ''), 'Banco / Conta Digital')
    INTO v_bank_name
    FROM public.financial_accounts
    WHERE tenant_id = p_tenant_id AND code = 'bank' AND is_active = true
    ORDER BY is_default DESC, created_at ASC
    LIMIT 1;

    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'id', fa.id,
                'name', fa.name,
                'balance', fa.balance,
                'is_default', fa.is_default,
                'account_kind', fa.account_kind
            )
            ORDER BY fa.is_default DESC, fa.created_at ASC
        ),
        '[]'::JSONB
    )
    INTO v_banks
    FROM public.financial_accounts fa
    WHERE fa.tenant_id = p_tenant_id AND fa.code = 'bank' AND fa.is_active = true;

    -- Saldo ao vivo da Gaveta (sessão aberta atual)
    SELECT * INTO v_open_session
    FROM public.cash_sessions
    WHERE tenant_id = p_tenant_id AND status = 'open'
    ORDER BY opened_at DESC
    LIMIT 1;

    IF v_open_session.id IS NOT NULL THEN
        v_drawer_open := true;
        SELECT COALESCE(SUM(total_amount), 0) INTO v_cash_sales
        FROM public.orders
        WHERE tenant_id = p_tenant_id
          AND cash_session_id = v_open_session.id
          AND status <> 'cancelled'
          AND (
            LOWER(COALESCE(payment_method, '')) LIKE '%dinheiro%'
            OR LOWER(COALESCE(payment_method, '')) = 'cash'
          );

        SELECT
            COALESCE(SUM(CASE WHEN type = 'supply' AND direction = 'in' THEN amount ELSE 0 END), 0),
            COALESCE(SUM(CASE WHEN type IN ('bleed', 'expense') AND direction = 'out' THEN amount ELSE 0 END), 0)
        INTO v_mov_in, v_mov_out
        FROM public.cash_movements
        WHERE cash_session_id = v_open_session.id;

        v_drawer_balance := ROUND(COALESCE(v_open_session.initial_float, 0) + v_cash_sales + v_mov_in - v_mov_out, 2);
    END IF;

    SELECT
        COALESCE(SUM(CASE WHEN entry_type = 'income' AND status = 'paid' THEN amount ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN entry_type = 'expense' AND status = 'paid' THEN amount ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN entry_type = 'expense' AND status = 'pending' THEN amount ELSE 0 END), 0)
    INTO v_income_total, v_expense_total, v_pending_expense_total
    FROM public.financial_entries
    WHERE tenant_id = p_tenant_id
      AND due_date BETWEEN p_start_date AND p_end_date;

    SELECT COALESCE(jsonb_agg(e.payload ORDER BY e.due_date DESC, e.created_at DESC), '[]'::JSONB)
    INTO v_entries
    FROM (
        SELECT
            fe.due_date,
            fe.created_at,
            to_jsonb(fe) || jsonb_build_object(
                'account_name', COALESCE(
                    src_acc.name,
                    CASE fe.account_code
                        WHEN 'drawer' THEN 'Gaveta do Caixa'
                        WHEN 'safe' THEN 'Cofre'
                        ELSE 'Banco'
                    END
                ),
                'target_account_name', CASE
                    WHEN fe.target_account_code IS NULL THEN NULL
                    ELSE COALESCE(
                        tgt_acc.name,
                        CASE fe.target_account_code
                            WHEN 'drawer' THEN 'Gaveta do Caixa'
                            WHEN 'safe' THEN 'Cofre'
                            ELSE 'Banco'
                        END
                    )
                END
            ) AS payload
        FROM public.financial_entries fe
        LEFT JOIN public.financial_accounts src_acc ON src_acc.id = fe.account_id
        LEFT JOIN public.financial_accounts tgt_acc ON tgt_acc.id = fe.target_account_id
        WHERE fe.tenant_id = p_tenant_id
          AND fe.due_date BETWEEN p_start_date AND p_end_date
        ORDER BY fe.due_date DESC, fe.created_at DESC
        LIMIT 300
    ) e;

    RETURN jsonb_build_object(
        'accounts', jsonb_build_object(
            'drawer', jsonb_build_object('balance', v_drawer_balance, 'is_open', v_drawer_open),
            'safe', jsonb_build_object('id', v_safe_id, 'balance', v_safe_balance, 'name', v_safe_name),
            'bank', jsonb_build_object('balance', v_bank_balance, 'name', v_bank_name),
            'banks', v_banks
        ),
        'summary', jsonb_build_object(
            'income_total', v_income_total,
            'expense_total', v_expense_total,
            'net_total', ROUND(v_income_total - v_expense_total, 2),
            'pending_expense_total', v_pending_expense_total
        ),
        'entries', v_entries
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_payables_receivables_overview(p_tenant_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_today DATE := (NOW() AT TIME ZONE 'America/Sao_Paulo')::DATE;
    v_overdue_total NUMERIC(12,2) := 0;
    v_overdue_count INTEGER := 0;
    v_today_total NUMERIC(12,2) := 0;
    v_today_count INTEGER := 0;
    v_upcoming_total NUMERIC(12,2) := 0;
    v_upcoming_count INTEGER := 0;
    v_receivable_total NUMERIC(12,2) := 0;
    v_receivable_count INTEGER := 0;
    v_items JSONB := '[]'::JSONB;
BEGIN
    IF public.is_authorized_for_tenant(p_tenant_id) IS NOT TRUE THEN
        RAISE EXCEPTION 'Acesso negado.';
    END IF;

    SELECT
        COALESCE(SUM(CASE WHEN entry_type = 'expense' AND status = 'pending' AND due_date < v_today THEN amount ELSE 0 END), 0),
        COUNT(*) FILTER (WHERE entry_type = 'expense' AND status = 'pending' AND due_date < v_today),
        COALESCE(SUM(CASE WHEN entry_type = 'expense' AND status = 'pending' AND due_date = v_today THEN amount ELSE 0 END), 0),
        COUNT(*) FILTER (WHERE entry_type = 'expense' AND status = 'pending' AND due_date = v_today),
        COALESCE(SUM(CASE WHEN entry_type = 'expense' AND status = 'pending' AND due_date BETWEEN v_today AND (v_today + 30) THEN amount ELSE 0 END), 0),
        COUNT(*) FILTER (WHERE entry_type = 'expense' AND status = 'pending' AND due_date BETWEEN v_today AND (v_today + 30)),
        COALESCE(SUM(CASE WHEN entry_type = 'income' AND status = 'pending' THEN amount ELSE 0 END), 0),
        COUNT(*) FILTER (WHERE entry_type = 'income' AND status = 'pending')
    INTO
        v_overdue_total, v_overdue_count,
        v_today_total, v_today_count,
        v_upcoming_total, v_upcoming_count,
        v_receivable_total, v_receivable_count
    FROM public.financial_entries
    WHERE tenant_id = p_tenant_id
      AND entry_type IN ('income', 'expense');

    SELECT COALESCE(
        jsonb_agg(
            e.payload
            ORDER BY
                CASE WHEN e.status = 'pending' THEN 0 ELSE 1 END ASC,
                e.due_date ASC,
                e.created_at DESC
        ),
        '[]'::JSONB
    )
    INTO v_items
    FROM (
        SELECT
            fe.status,
            fe.due_date,
            fe.created_at,
            to_jsonb(fe) || jsonb_build_object(
                'account_name', COALESCE(
                    acc.name,
                    CASE fe.account_code
                        WHEN 'drawer' THEN 'Gaveta do Caixa'
                        WHEN 'safe' THEN 'Cofre'
                        ELSE 'Banco'
                    END
                )
            ) AS payload
        FROM public.financial_entries fe
        LEFT JOIN public.financial_accounts acc ON acc.id = fe.account_id
        WHERE fe.tenant_id = p_tenant_id
          AND fe.entry_type IN ('income', 'expense')
          AND (
              fe.status = 'pending'
              OR fe.due_date >= (v_today - 60)
          )
        ORDER BY
            CASE WHEN fe.status = 'pending' THEN 0 ELSE 1 END ASC,
            fe.due_date ASC,
            fe.created_at DESC
        LIMIT 300
    ) e;

    RETURN jsonb_build_object(
        'today', v_today,
        'kpis', jsonb_build_object(
            'overdue_payable_total', v_overdue_total,
            'overdue_payable_count', v_overdue_count,
            'due_today_payable_total', v_today_total,
            'due_today_payable_count', v_today_count,
            'upcoming_30d_payable_total', v_upcoming_total,
            'upcoming_30d_payable_count', v_upcoming_count,
            'pending_receivable_total', v_receivable_total,
            'pending_receivable_count', v_receivable_count
        ),
        'items', v_items
    );
END;
$function$;

-- 11. RPCs de Gestão de Bancos no Financeiro
CREATE OR REPLACE FUNCTION public.create_financial_bank_account(
    p_tenant_id UUID,
    p_name TEXT,
    p_account_kind TEXT DEFAULT 'checking',
    p_initial_balance NUMERIC DEFAULT 0,
    p_is_default BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_clean_name TEXT := LEFT(TRIM(COALESCE(p_name, '')), 60);
    v_kind TEXT := COALESCE(NULLIF(TRIM(COALESCE(p_account_kind, '')), ''), 'checking');
    v_init NUMERIC(12,2) := ROUND(COALESCE(p_initial_balance, 0), 2);
    v_has_active BOOLEAN;
    v_make_default BOOLEAN;
    v_created public.financial_accounts%ROWTYPE;
BEGIN
    IF public.is_authorized_for_tenant(p_tenant_id) IS NOT TRUE THEN
        RAISE EXCEPTION 'Acesso negado: Sem permissão para gerenciar bancos desta loja.';
    END IF;

    IF NULLIF(v_clean_name, '') IS NULL THEN
        RAISE EXCEPTION 'Informe o nome do banco.';
    END IF;

    IF v_kind NOT IN ('checking', 'digital', 'acquirer') THEN
        RAISE EXCEPTION 'Tipo de conta inválido.';
    END IF;

    PERFORM public.ensure_tenant_financial_accounts(p_tenant_id);

    SELECT EXISTS(
        SELECT 1 FROM public.financial_accounts
        WHERE tenant_id = p_tenant_id AND code = 'bank' AND is_active = true
    ) INTO v_has_active;

    v_make_default := COALESCE(p_is_default, false) OR NOT v_has_active;

    IF v_make_default THEN
        UPDATE public.financial_accounts
        SET is_default = false, updated_at = NOW()
        WHERE tenant_id = p_tenant_id AND code = 'bank' AND is_default = true;
    END IF;

    INSERT INTO public.financial_accounts (
        tenant_id, code, name, balance, is_default, is_active, account_kind
    )
    VALUES (
        p_tenant_id, 'bank', v_clean_name, v_init, v_make_default, true, v_kind
    )
    RETURNING * INTO v_created;

    RETURN jsonb_build_object('bank', to_jsonb(v_created));
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_financial_bank_account(
    p_tenant_id UUID,
    p_account_id UUID,
    p_name TEXT,
    p_account_kind TEXT DEFAULT NULL,
    p_is_default BOOLEAN DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_clean_name TEXT := LEFT(TRIM(COALESCE(p_name, '')), 60);
    v_target public.financial_accounts%ROWTYPE;
BEGIN
    IF public.is_authorized_for_tenant(p_tenant_id) IS NOT TRUE THEN
        RAISE EXCEPTION 'Acesso negado.';
    END IF;

    IF NULLIF(v_clean_name, '') IS NULL THEN
        RAISE EXCEPTION 'Informe um nome válido para o banco.';
    END IF;

    SELECT * INTO v_target
    FROM public.financial_accounts
    WHERE id = p_account_id AND tenant_id = p_tenant_id AND code = 'bank' AND is_active = true
    FOR UPDATE;

    IF v_target.id IS NULL THEN
        RAISE EXCEPTION 'Banco não encontrado.';
    END IF;

    IF p_account_kind IS NOT NULL AND p_account_kind NOT IN ('checking', 'digital', 'acquirer') THEN
        RAISE EXCEPTION 'Tipo de conta inválido.';
    END IF;

    IF p_is_default IS TRUE AND NOT v_target.is_default THEN
        UPDATE public.financial_accounts
        SET is_default = false, updated_at = NOW()
        WHERE tenant_id = p_tenant_id AND code = 'bank' AND is_default = true AND id <> p_account_id;
    END IF;

    UPDATE public.financial_accounts
    SET name = v_clean_name,
        account_kind = COALESCE(p_account_kind, account_kind),
        is_default = CASE WHEN p_is_default IS TRUE THEN true ELSE is_default END,
        updated_at = NOW()
    WHERE id = p_account_id
    RETURNING * INTO v_target;

    RETURN jsonb_build_object('bank', to_jsonb(v_target));
END;
$function$;

CREATE OR REPLACE FUNCTION public.archive_financial_bank_account(
    p_tenant_id UUID,
    p_account_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_active_count INTEGER;
    v_target public.financial_accounts%ROWTYPE;
    v_next_id UUID;
BEGIN
    IF public.is_authorized_for_tenant(p_tenant_id) IS NOT TRUE THEN
        RAISE EXCEPTION 'Acesso negado.';
    END IF;

    SELECT COUNT(*) INTO v_active_count
    FROM public.financial_accounts
    WHERE tenant_id = p_tenant_id AND code = 'bank' AND is_active = true;

    IF v_active_count <= 1 THEN
        RAISE EXCEPTION 'Você precisa manter pelo menos 1 banco ativo cadastrado.';
    END IF;

    SELECT * INTO v_target
    FROM public.financial_accounts
    WHERE id = p_account_id AND tenant_id = p_tenant_id AND code = 'bank' AND is_active = true
    FOR UPDATE;

    IF v_target.id IS NULL THEN
        RAISE EXCEPTION 'Banco não encontrado.';
    END IF;

    UPDATE public.financial_accounts
    SET is_active = false, is_default = false, updated_at = NOW()
    WHERE id = p_account_id;

    IF v_target.is_default THEN
        SELECT id INTO v_next_id
        FROM public.financial_accounts
        WHERE tenant_id = p_tenant_id AND code = 'bank' AND is_active = true
        ORDER BY created_at ASC
        LIMIT 1;

        IF v_next_id IS NOT NULL THEN
            UPDATE public.financial_accounts
            SET is_default = true, updated_at = NOW()
            WHERE id = v_next_id;
        END IF;
    END IF;

    RETURN jsonb_build_object('archived', true, 'id', p_account_id);
END;
$function$;

-- Permissões estritas (sem anon/PUBLIC)
REVOKE ALL ON FUNCTION public.resolve_financial_account_id(UUID, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resolve_financial_account_id(UUID, TEXT, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.resolve_financial_account_id(UUID, TEXT, UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.apply_financial_entry_balance_effect(UUID, TEXT, NUMERIC, TEXT, TEXT, NUMERIC, UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_financial_entry_balance_effect(UUID, TEXT, NUMERIC, TEXT, TEXT, NUMERIC, UUID, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.apply_financial_entry_balance_effect(UUID, TEXT, NUMERIC, TEXT, TEXT, NUMERIC, UUID, UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.create_financial_entry(UUID, TEXT, TEXT, TEXT, NUMERIC, TEXT, TEXT, TEXT, DATE, TEXT, TEXT, TEXT, UUID, TEXT, UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_financial_entry(UUID, TEXT, TEXT, TEXT, NUMERIC, TEXT, TEXT, TEXT, DATE, TEXT, TEXT, TEXT, UUID, TEXT, UUID, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_financial_entry(UUID, TEXT, TEXT, TEXT, NUMERIC, TEXT, TEXT, TEXT, DATE, TEXT, TEXT, TEXT, UUID, TEXT, UUID, UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.create_financial_installments(UUID, TEXT, TEXT, TEXT, TEXT, NUMERIC, TEXT, DATE, INTEGER, BOOLEAN, TEXT, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_financial_installments(UUID, TEXT, TEXT, TEXT, TEXT, NUMERIC, TEXT, DATE, INTEGER, BOOLEAN, TEXT, TEXT, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_financial_installments(UUID, TEXT, TEXT, TEXT, TEXT, NUMERIC, TEXT, DATE, INTEGER, BOOLEAN, TEXT, TEXT, UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.mark_financial_entry_paid(UUID, UUID, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_financial_entry_paid(UUID, UUID, TEXT, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.mark_financial_entry_paid(UUID, UUID, TEXT, UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.create_financial_bank_account(UUID, TEXT, TEXT, NUMERIC, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_financial_bank_account(UUID, TEXT, TEXT, NUMERIC, BOOLEAN) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_financial_bank_account(UUID, TEXT, TEXT, NUMERIC, BOOLEAN) TO authenticated;

REVOKE ALL ON FUNCTION public.update_financial_bank_account(UUID, UUID, TEXT, TEXT, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_financial_bank_account(UUID, UUID, TEXT, TEXT, BOOLEAN) FROM anon;
GRANT EXECUTE ON FUNCTION public.update_financial_bank_account(UUID, UUID, TEXT, TEXT, BOOLEAN) TO authenticated;

REVOKE ALL ON FUNCTION public.archive_financial_bank_account(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.archive_financial_bank_account(UUID, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.archive_financial_bank_account(UUID, UUID) TO authenticated;



-- >>> MIGRATION: 20261112_payables_receivables_installments.sql
-- ============================================================================
-- Migration: Contas a Pagar e Receber (Fornecedor/Cliente, Parcelas & KPIs)
-- ============================================================================

ALTER TABLE public.financial_entries
    ADD COLUMN IF NOT EXISTS counterparty TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS installment_group_id UUID,
    ADD COLUMN IF NOT EXISTS installment_number INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS installment_total INTEGER NOT NULL DEFAULT 1;

-- RPC: Criar conta única ou parcelada/recorrente (1 a 24 meses) de forma atômica
CREATE OR REPLACE FUNCTION public.create_financial_installments(
    p_tenant_id UUID,
    p_entry_type TEXT,
    p_description TEXT,
    p_counterparty TEXT DEFAULT '',
    p_category TEXT DEFAULT 'Outros',
    p_amount NUMERIC DEFAULT 0,
    p_account_code TEXT DEFAULT 'bank',
    p_first_due_date DATE DEFAULT CURRENT_DATE,
    p_installments INTEGER DEFAULT 1,
    p_mark_first_paid BOOLEAN DEFAULT false,
    p_operator_name TEXT DEFAULT 'Operador',
    p_notes TEXT DEFAULT ''
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_desc TEXT := NULLIF(TRIM(COALESCE(p_description, '')), '');
    v_cp TEXT := COALESCE(TRIM(COALESCE(p_counterparty, '')), '');
    v_cat TEXT := COALESCE(NULLIF(TRIM(COALESCE(p_category, '')), ''), 'Outros');
    v_op TEXT := COALESCE(NULLIF(TRIM(COALESCE(p_operator_name, '')), ''), 'Operador');
    v_notes TEXT := COALESCE(TRIM(COALESCE(p_notes, '')), '');
    v_amount NUMERIC(12,2) := ROUND(COALESCE(p_amount, 0), 2);
    v_count INTEGER := GREATEST(1, LEAST(24, COALESCE(p_installments, 1)));
    v_group_id UUID := CASE WHEN v_count > 1 THEN gen_random_uuid() ELSE NULL END;
    v_first_date DATE := COALESCE(p_first_due_date, (NOW() AT TIME ZONE 'America/Sao_Paulo')::DATE);
    v_i INTEGER;
    v_due DATE;
    v_status TEXT;
    v_item_desc TEXT;
    v_inserted public.financial_entries%ROWTYPE;
    v_created JSONB := '[]'::JSONB;
BEGIN
    IF public.is_authorized_for_tenant(p_tenant_id) IS NOT TRUE THEN
        RAISE EXCEPTION 'Acesso negado: Sem permissão para registrar contas nesta loja.';
    END IF;

    IF p_entry_type NOT IN ('income', 'expense') THEN
        RAISE EXCEPTION 'Tipo inválido para Contas a Pagar/Receber.';
    END IF;

    IF p_account_code NOT IN ('safe', 'bank') THEN
        RAISE EXCEPTION 'Conta inválida. Escolha Cofre ou Banco.';
    END IF;

    IF v_desc IS NULL THEN
        RAISE EXCEPTION 'Informe a descrição da conta.';
    END IF;

    IF v_amount <= 0 THEN
        RAISE EXCEPTION 'O valor deve ser maior que zero.';
    END IF;

    PERFORM public.ensure_tenant_financial_accounts(p_tenant_id);

    IF p_mark_first_paid THEN
        PERFORM 1 FROM public.financial_accounts
        WHERE tenant_id = p_tenant_id AND code = p_account_code
        FOR UPDATE;
    END IF;

    FOR v_i IN 1..v_count LOOP
        v_due := (v_first_date + ((v_i - 1) * INTERVAL '1 month'))::DATE;
        v_status := CASE WHEN (v_i = 1 AND p_mark_first_paid) THEN 'paid' ELSE 'pending' END;
        v_item_desc := CASE WHEN v_count > 1 THEN v_desc || ' (' || v_i || '/' || v_count || ')' ELSE v_desc END;

        INSERT INTO public.financial_entries (
            tenant_id, entry_type, status, description, counterparty, category, amount,
            account_code, due_date, paid_at, operator_name, notes, source_type,
            installment_group_id, installment_number, installment_total
        )
        VALUES (
            p_tenant_id,
            p_entry_type,
            v_status,
            v_item_desc,
            v_cp,
            v_cat,
            v_amount,
            p_account_code,
            v_due,
            CASE WHEN v_status = 'paid' THEN NOW() ELSE NULL END,
            v_op,
            v_notes,
            'manual',
            v_group_id,
            v_i,
            v_count
        )
        RETURNING * INTO v_inserted;

        IF v_status = 'paid' THEN
            PERFORM public.apply_financial_entry_balance_effect(
                p_tenant_id,
                v_inserted.entry_type,
                v_inserted.amount,
                v_inserted.account_code,
                NULL,
                1
            );
        END IF;

        v_created := v_created || jsonb_build_array(to_jsonb(v_inserted));
    END LOOP;

    RETURN jsonb_build_object('count', v_count, 'items', v_created);
END;
$function$;

-- RPC: Painel de Contas a Pagar e Receber (KPIs por vencimento em Brasília + Lista)
CREATE OR REPLACE FUNCTION public.get_payables_receivables_overview(p_tenant_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_today DATE := (NOW() AT TIME ZONE 'America/Sao_Paulo')::DATE;
    v_overdue_total NUMERIC(12,2) := 0;
    v_overdue_count INTEGER := 0;
    v_today_total NUMERIC(12,2) := 0;
    v_today_count INTEGER := 0;
    v_upcoming_total NUMERIC(12,2) := 0;
    v_upcoming_count INTEGER := 0;
    v_receivable_total NUMERIC(12,2) := 0;
    v_receivable_count INTEGER := 0;
    v_items JSONB := '[]'::JSONB;
BEGIN
    IF public.is_authorized_for_tenant(p_tenant_id) IS NOT TRUE THEN
        RAISE EXCEPTION 'Acesso negado.';
    END IF;

    SELECT
        COALESCE(SUM(CASE WHEN entry_type = 'expense' AND status = 'pending' AND due_date < v_today THEN amount ELSE 0 END), 0),
        COUNT(*) FILTER (WHERE entry_type = 'expense' AND status = 'pending' AND due_date < v_today),
        COALESCE(SUM(CASE WHEN entry_type = 'expense' AND status = 'pending' AND due_date = v_today THEN amount ELSE 0 END), 0),
        COUNT(*) FILTER (WHERE entry_type = 'expense' AND status = 'pending' AND due_date = v_today),
        COALESCE(SUM(CASE WHEN entry_type = 'expense' AND status = 'pending' AND due_date BETWEEN v_today AND (v_today + 30) THEN amount ELSE 0 END), 0),
        COUNT(*) FILTER (WHERE entry_type = 'expense' AND status = 'pending' AND due_date BETWEEN v_today AND (v_today + 30)),
        COALESCE(SUM(CASE WHEN entry_type = 'income' AND status = 'pending' THEN amount ELSE 0 END), 0),
        COUNT(*) FILTER (WHERE entry_type = 'income' AND status = 'pending')
    INTO
        v_overdue_total, v_overdue_count,
        v_today_total, v_today_count,
        v_upcoming_total, v_upcoming_count,
        v_receivable_total, v_receivable_count
    FROM public.financial_entries
    WHERE tenant_id = p_tenant_id
      AND entry_type IN ('expense', 'income');

    SELECT COALESCE(jsonb_agg(to_jsonb(e) ORDER BY (e.status = 'pending') DESC, e.due_date ASC, e.created_at DESC), '[]'::JSONB)
    INTO v_items
    FROM (
        SELECT *
        FROM public.financial_entries
        WHERE tenant_id = p_tenant_id
          AND entry_type IN ('expense', 'income')
          AND source_type = 'manual'
          AND (
              status = 'pending'
              OR due_date >= (v_today - 60)
          )
        ORDER BY (status = 'pending') DESC, due_date ASC, created_at DESC
        LIMIT 300
    ) e;

    RETURN jsonb_build_object(
        'today', v_today,
        'kpis', jsonb_build_object(
            'overdue_payable_total', v_overdue_total,
            'overdue_payable_count', v_overdue_count,
            'due_today_payable_total', v_today_total,
            'due_today_payable_count', v_today_count,
            'upcoming_30d_payable_total', v_upcoming_total,
            'upcoming_30d_payable_count', v_upcoming_count,
            'pending_receivable_total', v_receivable_total,
            'pending_receivable_count', v_receivable_count
        ),
        'items', v_items
    );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.create_financial_installments(UUID, TEXT, TEXT, TEXT, TEXT, NUMERIC, TEXT, DATE, INTEGER, BOOLEAN, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_payables_receivables_overview(UUID) TO authenticated;



-- >>> MIGRATION: 20261113_business_day_cutoff_time.sql
-- Migration: Suporte ao Horário de Corte do Dia Comercial (Virada da Madrugada / Cutoff)
-- Define até que horário da madrugada os pedidos pertencem ao turno/expediente da noite anterior.
-- Padrão: '04:00' (Madrugada até 03:59:59 vinculada à noite anterior).

-- 1. ADICIONAR COLUNA business_day_cutoff_time NA TABELA tenants
ALTER TABLE public.tenants 
ADD COLUMN IF NOT EXISTS business_day_cutoff_time TEXT DEFAULT '04:00';

-- 2. ATUALIZAR VIEW tenants_public
DROP VIEW IF EXISTS public.tenants_public;
CREATE VIEW public.tenants_public AS
SELECT 
    t.id,
    t.slug,
    t.name,
    t.plan,
    t.custom_domain,
    t.is_active,
    t.logo_url,
    t.banner_url,
    t.theme_config,
    t.phone,
    t.whatsapp,
    t.address,
    t.instagram,
    t.delivery_fee,
    t.min_order_value,
    t.delivery_time,
    t.opening_time,
    t.closing_time,
    t.open_days,
    t.manual_store_open,
    t.manual_override_date,
    t.created_date,
    t.updated_date,
    t.cep,
    t.address_number,
    t.address_street,
    t.address_neighborhood,
    t.address_city,
    t.address_state,
    t.address_complement,
    t.delivery_fee_type,
    t.delivery_neighborhoods,
    t.delivery_unlisted_policy,
    t.delivery_fallback_fee,
    t.free_delivery_threshold,
    t.subscription_status,
    t.next_due_date,
    t.code,
    t.custom_template,
    t.salon_mode,
    t.accepts_delivery,
    t.accepts_takeaway,
    t.accepts_dine_in,
    t.pizza_pricing_rule,
    t.table_service_fee_enabled,
    t.table_service_fee_rate,
    t.cashback_enabled,
    t.cashback_rate,
    t.cashback_validity_days,
    t.cashback_max_discount_percentage,
    t.auto_accept_delivery,
    t.business_day_cutoff_time,
    (
        (COALESCE(t.payment_methods, '{}'::jsonb) - 'mp_access_token')
        || jsonb_build_object(
            'has_online_mp',
            COALESCE(t.payment_methods->>'mp_access_token', '') <> ''
        )
    ) AS payment_methods
FROM public.tenants t;

GRANT SELECT ON public.tenants_public TO anon, authenticated;

-- 3. ATUALIZAR RPC update_tenant_settings PARA PERSISTIR business_day_cutoff_time
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
        blind_cash_closing = CASE WHEN p_data ? 'blind_cash_closing' THEN (p_data->>'blind_cash_closing')::boolean ELSE blind_cash_closing END,
        business_day_cutoff_time = COALESCE(p_data->>'business_day_cutoff_time', business_day_cutoff_time),
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

REVOKE ALL ON FUNCTION public.update_tenant_settings(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_tenant_settings(uuid, jsonb) TO authenticated, service_role;

-- 4. ATUALIZAR get_master_tenants COM business_day_cutoff_time
DROP FUNCTION IF EXISTS public.get_master_tenants();

CREATE OR REPLACE FUNCTION public.get_master_tenants()
RETURNS TABLE(
    id UUID,
    code INTEGER,
    slug TEXT,
    name TEXT,
    plan TEXT,
    is_active BOOLEAN,
    logo_url TEXT,
    created_date TIMESTAMPTZ,
    total_orders BIGINT,
    total_revenue NUMERIC,
    admin_username TEXT,
    admin_email TEXT,
    subscription_status TEXT,
    monthly_price NUMERIC,
    payment_link TEXT,
    next_due_date DATE,
    phone TEXT,
    email TEXT,
    cpf_cnpj TEXT,
    asaas_customer_id TEXT,
    asaas_subscription_id TEXT,
    custom_template TEXT,
    salon_mode TEXT,
    accepts_delivery BOOLEAN,
    accepts_takeaway BOOLEAN,
    business_day_cutoff_time TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
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
            (SELECT ta.username FROM public.tenant_admins ta WHERE ta.tenant_id = t.id ORDER BY ta.created_at ASC LIMIT 1),
            (SELECT u.username FROM public.admin_users u WHERE u.tenant_id = t.id LIMIT 1)
        ) AS admin_username,
        (
            SELECT u.email::TEXT
            FROM public.tenant_admins ta
            JOIN auth.users u ON u.id = ta.user_id
            WHERE ta.tenant_id = t.id
            ORDER BY ta.created_at ASC
            LIMIT 1
        ) AS admin_email,
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
        COALESCE(t.accepts_takeaway, true) AS accepts_takeaway,
        COALESCE(t.business_day_cutoff_time, '04:00') AS business_day_cutoff_time
    FROM public.tenants t
    LEFT JOIN public.orders o ON o.tenant_id = t.id
    GROUP BY t.id
    ORDER BY t.created_date DESC;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_master_tenants() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_master_tenants() TO authenticated, service_role;




-- =====================================================================================
-- MIGRATION: 20261113_order_routing_kanban_kds.sql
-- =====================================================================================

ALTER TABLE public.tenants
ADD COLUMN IF NOT EXISTS kanban_show_dine_in BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS kanban_show_pos BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS kds_show_dine_in BOOLEAN DEFAULT true;

DROP VIEW IF EXISTS public.tenants_public;
CREATE VIEW public.tenants_public AS
SELECT 
    t.id,
    t.slug,
    t.name,
    t.plan,
    t.custom_domain,
    t.is_active,
    t.logo_url,
    t.banner_url,
    t.theme_config,
    t.phone,
    t.whatsapp,
    t.address,
    t.instagram,
    t.delivery_fee,
    t.min_order_value,
    t.delivery_time,
    t.opening_time,
    t.closing_time,
    t.open_days,
    t.manual_store_open,
    t.manual_override_date,
    t.created_date,
    t.updated_date,
    t.cep,
    t.address_number,
    t.address_street,
    t.address_neighborhood,
    t.address_city,
    t.address_state,
    t.address_complement,
    t.delivery_fee_type,
    t.delivery_neighborhoods,
    t.delivery_unlisted_policy,
    t.delivery_fallback_fee,
    t.free_delivery_threshold,
    t.subscription_status,
    t.next_due_date,
    t.code,
    t.custom_template,
    t.salon_mode,
    t.accepts_delivery,
    t.accepts_takeaway,
    t.accepts_dine_in,
    t.pizza_pricing_rule,
    t.table_service_fee_enabled,
    t.table_service_fee_rate,
    t.cashback_enabled,
    t.cashback_rate,
    t.cashback_validity_days,
    t.cashback_max_discount_percentage,
    t.auto_accept_delivery,
    t.business_day_cutoff_time,
    t.kanban_show_dine_in,
    t.kanban_show_pos,
    t.kds_show_dine_in,
    (
        (COALESCE(t.payment_methods, '{}'::jsonb) - 'mp_access_token')
        || jsonb_build_object(
            'has_online_mp',
            COALESCE(t.payment_methods->>'mp_access_token', '') <> ''
        )
    ) AS payment_methods
FROM public.tenants t;

GRANT SELECT ON public.tenants_public TO anon, authenticated;

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
        blind_cash_closing = CASE WHEN p_data ? 'blind_cash_closing' THEN (p_data->>'blind_cash_closing')::boolean ELSE blind_cash_closing END,
        business_day_cutoff_time = COALESCE(p_data->>'business_day_cutoff_time', business_day_cutoff_time),
        kanban_show_dine_in = CASE WHEN p_data ? 'kanban_show_dine_in' THEN (p_data->>'kanban_show_dine_in')::boolean ELSE kanban_show_dine_in END,
        kanban_show_pos = CASE WHEN p_data ? 'kanban_show_pos' THEN (p_data->>'kanban_show_pos')::boolean ELSE kanban_show_pos END,
        kds_show_dine_in = CASE WHEN p_data ? 'kds_show_dine_in' THEN (p_data->>'kds_show_dine_in')::boolean ELSE kds_show_dine_in END,
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

REVOKE ALL ON FUNCTION public.update_tenant_settings(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_tenant_settings(uuid, jsonb) TO authenticated, service_role;
