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

