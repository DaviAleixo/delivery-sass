-- ==============================================================================
-- MIGRATION: AUTORIZAÇÃO ESTRITA EM RPCS ADMINISTRATIVAS
-- Arquivo: supabase/migrations/20261011_05_admin_rpcs_authorization.sql
-- Status: NÃO EXECUTADO (Aguardando aprovação explícita)
-- Objetivo: Garantir que cada procedure valide auth.uid() e pertença de tenant
-- ==============================================================================

-- 1. DELETE_TENANT (Restrito exclusivamente ao SuperAdmin autenticado)
CREATE OR REPLACE FUNCTION public.delete_tenant(p_tenant_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_slug TEXT;
    v_name TEXT;
BEGIN
    -- Validação de Autorização: Apenas o SuperAdmin pode excluir estabelecimentos
    IF NOT public.is_super_admin() THEN
        RAISE EXCEPTION 'Acesso negado: Apenas o SuperAdmin pode excluir estabelecimentos.';
    END IF;

    SELECT slug, name INTO v_slug, v_name 
    FROM public.tenants 
    WHERE id = p_tenant_id;

    IF v_slug IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Empresa não encontrada.');
    END IF;

    -- Exclusão ordenada em cascata
    DELETE FROM public.order_items WHERE tenant_id = p_tenant_id;
    DELETE FROM public.orders WHERE tenant_id = p_tenant_id;
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
    DELETE FROM public.tenant_admins WHERE tenant_id = p_tenant_id;
    DELETE FROM public.admin_users WHERE tenant_id = p_tenant_id;
    DELETE FROM public.tenants WHERE id = p_tenant_id;

    RETURN jsonb_build_object(
        'success', true,
        'tenant_id', p_tenant_id,
        'deleted_name', v_name,
        'message', 'Restaurante ' || v_name || ' e todos os seus dados foram excluídos com sucesso!'
    );
END;
$$;


-- 2. GET_MASTER_TENANTS (Restrito ao SuperAdmin)
CREATE OR REPLACE FUNCTION public.get_master_tenants()
RETURNS TABLE(
    id UUID,
    slug TEXT,
    name TEXT,
    plan TEXT,
    is_active BOOLEAN,
    logo_url TEXT,
    created_date TIMESTAMPTZ,
    total_orders BIGINT,
    total_revenue NUMERIC,
    admin_username TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NOT public.is_super_admin() THEN
        RAISE EXCEPTION 'Acesso negado: Visualização restrita ao SuperAdmin.';
    END IF;

    RETURN QUERY
    SELECT 
        t.id,
        t.slug,
        t.name,
        t.plan,
        t.is_active,
        t.logo_url,
        t.created_date,
        COUNT(o.id)::BIGINT AS total_orders,
        COALESCE(SUM(COALESCE(o.total, o.total_amount, 0)), 0)::NUMERIC AS total_revenue,
        COALESCE(
            (SELECT ta.username FROM public.tenant_admins ta WHERE ta.tenant_id = t.id LIMIT 1),
            (SELECT u.username FROM public.admin_users u WHERE u.tenant_id = t.id LIMIT 1)
        ) AS admin_username
    FROM public.tenants t
    LEFT JOIN public.orders o ON o.tenant_id = t.id
    GROUP BY t.id
    ORDER BY t.created_date DESC;
END;
$$;


-- 3. TOGGLE_TENANT_STATUS (SuperAdmin ou próprio Tenant Admin)
CREATE OR REPLACE FUNCTION public.toggle_tenant_status(p_tenant_id UUID, p_is_active BOOLEAN)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NOT (public.is_super_admin() OR p_tenant_id = public.get_auth_tenant_id()) THEN
        RAISE EXCEPTION 'Acesso negado: Sem permissão para alterar o status deste estabelecimento.';
    END IF;

    UPDATE public.tenants
    SET is_active = p_is_active,
        updated_date = NOW()
    WHERE id = p_tenant_id;

    RETURN jsonb_build_object('success', true, 'is_active', p_is_active);
END;
$$;


-- 4. GET_SALES_METRICS (SuperAdmin ou próprio Tenant Admin)
CREATE OR REPLACE FUNCTION public.get_sales_metrics(
    p_tenant_id UUID,
    p_start_date TIMESTAMPTZ DEFAULT NULL,
    p_end_date TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_start TIMESTAMPTZ := COALESCE(p_start_date, (NOW() AT TIME ZONE 'UTC' - INTERVAL '30 days'));
    v_end   TIMESTAMPTZ := COALESCE(p_end_date, NOW() AT TIME ZONE 'UTC');
    v_total_revenue NUMERIC(10,2) := 0;
    v_total_orders  INT := 0;
    v_avg_ticket    NUMERIC(10,2) := 0;
    v_pending       INT := 0;
    v_confirmed     INT := 0;
    v_preparing     INT := 0;
    v_sent          INT := 0;
    v_delivered     INT := 0;
    v_cancelled     INT := 0;
BEGIN
    -- Isolamento estrito: Impede que um restaurante consulte métricas de outro
    IF NOT (public.is_super_admin() OR p_tenant_id = public.get_auth_tenant_id()) THEN
        RAISE EXCEPTION 'Acesso negado: Você não possui autorização para consultar relatórios deste restaurante.';
    END IF;

    SELECT 
        COALESCE(SUM(COALESCE(total, total_amount, 0)), 0),
        COUNT(*),
        CASE WHEN COUNT(*) > 0 THEN COALESCE(SUM(COALESCE(total, total_amount, 0)), 0) / COUNT(*) ELSE 0 END,
        COUNT(*) FILTER (WHERE status = 'pendente'),
        COUNT(*) FILTER (WHERE status = 'confirmado'),
        COUNT(*) FILTER (WHERE status = 'preparando'),
        COUNT(*) FILTER (WHERE status = 'enviado'),
        COUNT(*) FILTER (WHERE status = 'entregue'),
        COUNT(*) FILTER (WHERE status = 'cancelado')
    INTO 
        v_total_revenue, v_total_orders, v_avg_ticket,
        v_pending, v_confirmed, v_preparing, v_sent, v_delivered, v_cancelled
    FROM public.orders
    WHERE tenant_id = p_tenant_id
      AND created_date >= v_start
      AND created_date <= v_end;

    RETURN jsonb_build_object(
        'period_start',   v_start,
        'period_end',     v_end,
        'total_revenue',  v_total_revenue,
        'total_orders',   v_total_orders,
        'average_ticket', ROUND(v_avg_ticket, 2),
        'by_status', jsonb_build_object(
            'pendente',   v_pending,
            'confirmado', v_confirmed,
            'preparando', v_preparing,
            'enviado',    v_sent,
            'entregue',   v_delivered,
            'cancelado',  v_cancelled
        )
    );
END;
$$;


-- 5. GET_CLIENTS_SUMMARY (SuperAdmin ou próprio Tenant Admin)
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
    last_order_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NOT (public.is_super_admin() OR p_tenant_id = public.get_auth_tenant_id()) THEN
        RAISE EXCEPTION 'Acesso negado: Você não possui autorização para consultar clientes deste restaurante.';
    END IF;

    RETURN QUERY
    WITH store_orders AS (
        SELECT 
            o.customer_phone,
            (ARRAY_AGG(o.customer_name ORDER BY o.created_date DESC))[1] AS cust_name,
            (ARRAY_AGG(o.customer_email ORDER BY o.created_date DESC) FILTER (WHERE o.customer_email IS NOT NULL AND o.customer_email <> ''))[1] AS cust_email,
            (ARRAY_AGG(COALESCE(o.delivery_address, o.customer_address) ORDER BY o.created_date DESC) FILTER (WHERE COALESCE(o.delivery_address, o.customer_address) IS NOT NULL))[1] AS last_addr,
            COUNT(*)::BIGINT AS total_ord,
            COALESCE(SUM(COALESCE(o.total, o.total_amount, 0)), 0)::NUMERIC AS spent,
            MIN(o.created_date) AS first_ord,
            MAX(o.created_date) AS last_ord
        FROM public.orders o
        WHERE o.tenant_id = p_tenant_id
          AND o.customer_phone IS NOT NULL 
          AND TRIM(o.customer_phone) <> ''
        GROUP BY o.customer_phone
    ),
    store_customers AS (
        SELECT 
            c.id::text AS cust_id,
            c.phone,
            c.full_name,
            c.email,
            c.created_date
        FROM public.customers c
        WHERE c.tenant_id = p_tenant_id
    )
    SELECT 
        COALESCE(sc.cust_id, so.customer_phone) AS id,
        COALESCE(sc.phone, so.customer_phone) AS customer_phone,
        COALESCE(sc.full_name, so.cust_name, 'Cliente') AS customer_name,
        COALESCE(sc.email, so.cust_email, '') AS customer_email,
        COALESCE(so.last_addr, '') AS last_address,
        COALESCE(so.total_ord, 0)::BIGINT AS total_orders,
        COALESCE(so.spent, 0)::NUMERIC AS total_spent,
        COALESCE(so.first_ord, sc.created_date) AS first_order_at,
        so.last_ord AS last_order_at
    FROM store_customers sc
    FULL OUTER JOIN store_orders so ON (
        REGEXP_REPLACE(sc.phone, '\D', '', 'g') = REGEXP_REPLACE(so.customer_phone, '\D', '', 'g')
    )
    ORDER BY COALESCE(so.last_ord, sc.created_date) DESC;
END;
$$;

-- Revoga execução pública e anônima de todas as procedures administrativas
REVOKE EXECUTE ON FUNCTION public.delete_tenant(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_master_tenants() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.toggle_tenant_status(UUID, BOOLEAN) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_sales_metrics(UUID, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_clients_summary(UUID) FROM PUBLIC, anon;

-- Concede execução exclusivamente a usuários autenticados e service_role
GRANT EXECUTE ON FUNCTION public.delete_tenant(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_master_tenants() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.toggle_tenant_status(UUID, BOOLEAN) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_sales_metrics(UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_clients_summary(UUID) TO authenticated, service_role;
