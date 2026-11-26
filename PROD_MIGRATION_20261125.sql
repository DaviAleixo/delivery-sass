-- ==============================================================================
-- MIGRAÇÃO DE BANCO DE PRODUÇÃO (Supabase: jqwtnzdsaivbjudvjhld)
-- Data: 25/11/2026
-- Conteúdo:
-- 1. Permissões de superusuário e postgres em is_authorized_for_tenant
-- 2. Motor de Cashback com Suporte a Saldo Vitalício (sem expiração)
-- 3. RPC get_clients_summary_paged: Paginação, Filtros e Métricas do CRM
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- PARTE 1: Atualização de autorização multi-tenant (suporte a postgres/admin)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_authorized_for_tenant(p_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
    SELECT COALESCE(
        current_user = 'postgres'
        OR auth.role() = 'service_role'
        OR public.is_super_admin()
        OR (p_tenant_id IS NOT NULL AND public.get_auth_tenant_id() IS NOT NULL AND p_tenant_id = public.get_auth_tenant_id()),
        FALSE
    );
$function$;

-- ------------------------------------------------------------------------------
-- PARTE 2: Suporte a Cashback Vitalício (Sem expiração quando dias <= 0 ou NULL)
-- ------------------------------------------------------------------------------
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

-- ------------------------------------------------------------------------------
-- PARTE 3: RPC de Paginação e Métricas do Mini-CRM de Clientes
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_clients_summary_paged(
    p_tenant_id UUID,
    p_page INT DEFAULT 1,
    p_page_size INT DEFAULT 25,
    p_search TEXT DEFAULT NULL,
    p_segment TEXT DEFAULT 'all',
    p_sort_by TEXT DEFAULT 'last_order_at',
    p_sort_dir TEXT DEFAULT 'desc'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_clean_search TEXT := REGEXP_REPLACE(COALESCE(p_search, ''), '\D', '', 'g');
    v_raw_search TEXT := LOWER(TRIM(COALESCE(p_search, '')));
    v_vip_threshold NUMERIC := 150;
    v_page INT := GREATEST(COALESCE(p_page, 1), 1);
    v_page_size INT := LEAST(GREATEST(COALESCE(p_page_size, 25), 1), 100);
    v_offset INT := (v_page - 1) * v_page_size;
    v_sort_col TEXT := LOWER(COALESCE(p_sort_by, 'last_order_at'));
    v_sort_asc BOOLEAN := (LOWER(COALESCE(p_sort_dir, 'desc')) = 'asc');
    v_total_clients INT := 0;
    v_total_orders BIGINT := 0;
    v_total_spent NUMERIC := 0;
    v_vip_count INT := 0;
    v_recurring_count INT := 0;
    v_at_risk_count INT := 0;
    v_new_count INT := 0;
    v_active_30d_count INT := 0;
    v_filtered_count INT := 0;
    v_total_pages INT := 1;
    v_items JSONB := '[]'::jsonb;
BEGIN
    IF public.is_authorized_for_tenant(p_tenant_id) IS NOT TRUE THEN
        RAISE EXCEPTION 'Acesso negado: Você não possui autorização para consultar clientes deste restaurante.';
    END IF;

    -- Tabela temporária dos dados consolidados
    CREATE TEMP TABLE tmp_client_summary ON COMMIT DROP AS
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
    )
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
    WHERE COALESCE(so.total_ord, 0) > 0 OR sc.cust_id IS NOT NULL;

    -- Calcula VIP Threshold: percentil 80 dos clientes com compras, mínimo R$ 150
    SELECT GREATEST(150, COALESCE(percentile_cont(0.8) WITHIN GROUP (ORDER BY total_spent), 150))
    INTO v_vip_threshold
    FROM tmp_client_summary
    WHERE total_spent > 0;

    -- Métricas globais da base do restaurante
    SELECT
        COUNT(*)::INT,
        COALESCE(SUM(total_orders), 0)::BIGINT,
        COALESCE(SUM(total_spent), 0)::NUMERIC,
        COUNT(*) FILTER (WHERE total_orders >= 10 OR (total_spent >= v_vip_threshold AND total_orders >= 2))::INT,
        COUNT(*) FILTER (WHERE total_orders >= 3)::INT,
        COUNT(*) FILTER (WHERE (last_order_at IS NULL OR last_order_at < NOW() - INTERVAL '30 days') AND total_orders > 0)::INT,
        COUNT(*) FILTER (WHERE first_order_at >= NOW() - INTERVAL '7 days' AND total_orders <= 2)::INT,
        COUNT(*) FILTER (WHERE last_order_at >= NOW() - INTERVAL '30 days' AND total_orders > 0)::INT
    INTO
        v_total_clients,
        v_total_orders,
        v_total_spent,
        v_vip_count,
        v_recurring_count,
        v_at_risk_count,
        v_new_count,
        v_active_30d_count
    FROM tmp_client_summary;

    -- Tabela temporária filtrada e com flags de segmentação
    CREATE TEMP TABLE tmp_filtered_clients ON COMMIT DROP AS
    SELECT
        t.*,
        (t.total_orders >= 10 OR (t.total_spent >= v_vip_threshold AND t.total_orders >= 2)) AS is_vip,
        (t.total_orders >= 3) AS is_recurring,
        ((t.last_order_at IS NULL OR t.last_order_at < NOW() - INTERVAL '30 days') AND t.total_orders > 0) AS is_at_risk,
        (t.first_order_at >= NOW() - INTERVAL '7 days' AND t.total_orders <= 2) AS is_new
    FROM tmp_client_summary t
    WHERE
        -- Filtro por busca
        (
            v_raw_search = ''
            OR LOWER(t.customer_name) LIKE '%' || v_raw_search || '%'
            OR LOWER(t.customer_email) LIKE '%' || v_raw_search || '%'
            OR (LENGTH(v_clean_search) > 0 AND t.phone_clean LIKE '%' || v_clean_search || '%')
        )
        -- Filtro por segmento
        AND (
            p_segment IS NULL
            OR p_segment = 'all'
            OR (p_segment = 'vip' AND (t.total_orders >= 10 OR (t.total_spent >= v_vip_threshold AND t.total_orders >= 2)))
            OR (p_segment = 'recurring' AND t.total_orders >= 3)
            OR (p_segment = 'at_risk' AND (t.last_order_at IS NULL OR t.last_order_at < NOW() - INTERVAL '30 days') AND t.total_orders > 0)
            OR (p_segment = 'new' AND t.first_order_at >= NOW() - INTERVAL '7 days' AND t.total_orders <= 2)
        );

    SELECT COUNT(*)::INT INTO v_filtered_count FROM tmp_filtered_clients;
    v_total_pages := GREATEST(CEIL(v_filtered_count::NUMERIC / v_page_size)::INT, 1);

    -- Busca a página com cashback e notas CRM associadas
    SELECT COALESCE(jsonb_agg(row_data), '[]'::jsonb)
    INTO v_items
    FROM (
        SELECT jsonb_build_object(
            'id', f.id,
            'customer_phone', f.customer_phone,
            'customer_name', f.customer_name,
            'customer_email', f.customer_email,
            'last_address', f.last_address,
            'total_orders', f.total_orders,
            'total_spent', f.total_spent,
            'first_order_at', f.first_order_at,
            'last_order_at', f.last_order_at,
            'cashback_balance', CASE
                WHEN w.expires_at IS NOT NULL AND w.expires_at <= NOW() THEN 0
                ELSE COALESCE(w.balance, 0)
            END,
            'cashback_expires_at', CASE
                WHEN w.expires_at IS NOT NULL AND w.expires_at <= NOW() THEN NULL
                ELSE w.expires_at
            END,
            'crm_notes', COALESCE(n.notes, ''),
            'last_order_type', f.last_order_type,
            'last_payment_method', f.last_payment_method,
            'is_vip', f.is_vip,
            'is_recurring', f.is_recurring,
            'is_at_risk', f.is_at_risk,
            'is_new', f.is_new
        ) AS row_data
        FROM (
            SELECT *
            FROM tmp_filtered_clients
            ORDER BY
                CASE WHEN v_sort_col IN ('totalorders', 'total_orders') AND v_sort_asc THEN total_orders END ASC,
                CASE WHEN v_sort_col IN ('totalorders', 'total_orders') AND NOT v_sort_asc THEN total_orders END DESC,
                CASE WHEN v_sort_col IN ('totalspent', 'total_spent') AND v_sort_asc THEN total_spent END ASC,
                CASE WHEN v_sort_col IN ('totalspent', 'total_spent') AND NOT v_sort_asc THEN total_spent END DESC,
                CASE WHEN v_sort_col IN ('name', 'customer_name') AND v_sort_asc THEN customer_name END ASC,
                CASE WHEN v_sort_col IN ('name', 'customer_name') AND NOT v_sort_asc THEN customer_name END DESC,
                CASE WHEN v_sort_asc THEN sort_date END ASC NULLS LAST,
                sort_date DESC NULLS LAST
            LIMIT v_page_size
            OFFSET v_offset
        ) f
        LEFT JOIN public.customer_cashback_wallets w
            ON w.tenant_id = p_tenant_id
           AND REGEXP_REPLACE(w.phone, '\D', '', 'g') = f.phone_clean
        LEFT JOIN public.customer_crm_notes n
            ON n.tenant_id = p_tenant_id
           AND n.phone_clean = f.phone_clean
    ) q;

    RETURN jsonb_build_object(
        'page', v_page,
        'page_size', v_page_size,
        'total_count', v_filtered_count,
        'total_pages', v_total_pages,
        'vip_threshold', v_vip_threshold,
        'metrics', jsonb_build_object(
            'total_clients', v_total_clients,
            'total_orders', v_total_orders,
            'total_spent', v_total_spent,
            'vip_count', v_vip_count,
            'recurring_count', v_recurring_count,
            'at_risk_count', v_at_risk_count,
            'new_count', v_new_count,
            'active_30d_count', v_active_30d_count
        ),
        'items', v_items
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_clients_summary_paged(UUID, INT, INT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_clients_summary_paged(UUID, INT, INT, TEXT, TEXT, TEXT, TEXT) TO authenticated, service_role;
