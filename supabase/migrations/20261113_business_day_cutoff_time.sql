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

