-- ==============================================================================
-- MIGRATION: 20261013_custom_menu_templates.sql
-- OBJETIVO: Base arquitetural para Cardápios Personalizados (VIP Multi-Template Engine)
-- ==============================================================================

-- 1. ADICIONAR COLUNA custom_template NA TABELA tenants
ALTER TABLE public.tenants 
ADD COLUMN IF NOT EXISTS custom_template TEXT DEFAULT NULL;

COMMENT ON COLUMN public.tenants.custom_template IS 
'Identificador do template de cardápio personalizado exclusivo (ex: texas-burger, sushi-vip). Se NULL ou default, renderiza o Menu.jsx padrão.';

-- 2. ATUALIZAR RPC get_master_tenants (Para listar custom_template no SuperAdmin)
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
    subscription_status TEXT,
    monthly_price NUMERIC,
    payment_link TEXT,
    next_due_date DATE,
    phone TEXT,
    email TEXT,
    cpf_cnpj TEXT,
    asaas_customer_id TEXT,
    asaas_subscription_id TEXT,
    custom_template TEXT
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
            (SELECT ta.username FROM public.tenant_admins ta WHERE ta.tenant_id = t.id LIMIT 1),
            (SELECT u.username FROM public.admin_users u WHERE u.tenant_id = t.id LIMIT 1)
        ) AS admin_username,
        COALESCE(t.subscription_status, 'pending') AS subscription_status,
        COALESCE(t.monthly_price, 149.00) AS monthly_price,
        t.payment_link,
        t.next_due_date,
        COALESCE(t.phone, t.whatsapp) AS phone,
        t.email,
        t.cpf_cnpj,
        t.asaas_customer_id,
        t.asaas_subscription_id,
        t.custom_template
    FROM public.tenants t
    LEFT JOIN public.orders o ON o.tenant_id = t.id
    GROUP BY t.id, t.code
    ORDER BY t.code ASC;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_master_tenants() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_master_tenants() TO authenticated, service_role;

-- 3. ATUALIZAR RPC update_tenant_info (Para permitir salvar custom_template)
-- Drop da versão anterior com 7 parâmetros para evitar ambiguidade de assinatura
DROP FUNCTION IF EXISTS public.update_tenant_info(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.update_tenant_info(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.update_tenant_info(
    p_tenant_id UUID,
    p_name TEXT,
    p_slug TEXT,
    p_plan TEXT DEFAULT NULL,
    p_logo_url TEXT DEFAULT NULL,
    p_admin_username TEXT DEFAULT NULL,
    p_admin_password TEXT DEFAULT NULL,
    p_custom_template TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions, pg_temp
AS $$
DECLARE
    v_clean_slug TEXT := LOWER(REGEXP_REPLACE(TRIM(p_slug), '[^a-zA-Z0-9\-]', '-', 'g'));
    v_existing_id UUID;
    v_hashed_password TEXT;
BEGIN
    IF NOT (public.is_super_admin() OR (p_tenant_id = public.get_auth_tenant_id() AND public.get_auth_admin_role() IN ('super_admin', 'admin'))) THEN
        RAISE EXCEPTION 'Acesso negado: Você não possui autorização para editar este restaurante.';
    END IF;

    SELECT id INTO v_existing_id 
    FROM public.tenants 
    WHERE slug = v_clean_slug AND id != p_tenant_id;

    IF v_existing_id IS NOT NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Este slug/endereço já está em uso por outro restaurante.');
    END IF;

    UPDATE public.tenants
    SET 
        name = TRIM(p_name),
        slug = v_clean_slug,
        plan = COALESCE(p_plan, plan),
        logo_url = NULLIF(TRIM(p_logo_url), ''),
        custom_template = NULLIF(TRIM(p_custom_template), ''),
        updated_date = NOW()
    WHERE id = p_tenant_id;

    -- Se nova senha foi informada, atualiza em auth.users e nas tabelas locais
    IF p_admin_password IS NOT NULL AND TRIM(p_admin_password) != '' THEN
        v_hashed_password := extensions.crypt(p_admin_password, extensions.gen_salt('bf', 10));

        -- Atualiza no Supabase Auth
        UPDATE auth.users
        SET encrypted_password = v_hashed_password,
            updated_at = NOW()
        WHERE id IN (SELECT user_id FROM public.tenant_admins WHERE tenant_id = p_tenant_id);

        -- Atualiza em tenant_admins e admin_users
        IF p_admin_username IS NOT NULL AND TRIM(p_admin_username) != '' THEN
            UPDATE public.tenant_admins
            SET username = LOWER(TRIM(p_admin_username)),
                updated_at = NOW()
            WHERE tenant_id = p_tenant_id;

            UPDATE public.admin_users
            SET username = LOWER(TRIM(p_admin_username)),
                password = v_hashed_password,
                initial_password = NULL,
                updated_date = NOW()
            WHERE tenant_id = p_tenant_id;
        ELSE
            UPDATE public.admin_users
            SET password = v_hashed_password,
                initial_password = NULL,
                updated_date = NOW()
            WHERE tenant_id = p_tenant_id;
        END IF;
    ELSIF p_admin_username IS NOT NULL AND TRIM(p_admin_username) != '' THEN
        UPDATE public.tenant_admins
        SET username = LOWER(TRIM(p_admin_username)),
            updated_at = NOW()
        WHERE tenant_id = p_tenant_id;

        UPDATE public.admin_users
        SET username = LOWER(TRIM(p_admin_username)),
            updated_date = NOW()
        WHERE tenant_id = p_tenant_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'tenant_id', p_tenant_id,
        'slug', v_clean_slug,
        'name', TRIM(p_name),
        'custom_template', NULLIF(TRIM(p_custom_template), ''),
        'message', 'Restaurante e template atualizados com sucesso!'
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.update_tenant_info(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_tenant_info(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated, service_role;
