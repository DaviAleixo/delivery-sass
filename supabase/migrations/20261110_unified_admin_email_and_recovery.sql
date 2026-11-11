-- ==============================================================================
-- MIGRATION: 20261110_unified_admin_email_and_recovery.sql
-- OBJETIVO: Unificar e-mail do lojista (Login / Recuperação de Senha / Cobrança)
--           na edição via SuperAdmin (update_tenant_info + get_master_tenants)
-- ==============================================================================

-- 1. Atualizar get_master_tenants para retornar também admin_email de auth.users
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
    accepts_takeaway BOOLEAN
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
        COALESCE(t.accepts_takeaway, true) AS accepts_takeaway
    FROM public.tenants t
    LEFT JOIN public.orders o ON o.tenant_id = t.id
    GROUP BY t.id, t.code
    ORDER BY t.code ASC;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_master_tenants() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_master_tenants() TO authenticated, service_role;


-- 2. Atualizar update_tenant_info para aceitar p_admin_email e sincronizar auth.users + auth.identities + tenants.email
DROP FUNCTION IF EXISTS public.update_tenant_info(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.update_tenant_info(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.update_tenant_info(
    p_tenant_id UUID,
    p_name TEXT,
    p_slug TEXT,
    p_plan TEXT DEFAULT NULL::TEXT,
    p_logo_url TEXT DEFAULT NULL::TEXT,
    p_admin_username TEXT DEFAULT NULL::TEXT,
    p_admin_password TEXT DEFAULT NULL::TEXT,
    p_custom_template TEXT DEFAULT NULL::TEXT,
    p_admin_email TEXT DEFAULT NULL::TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth', 'extensions', 'pg_temp'
AS $$
DECLARE
    v_clean_slug TEXT := LOWER(REGEXP_REPLACE(TRIM(p_slug), '[^a-zA-Z0-9\-]', '-', 'g'));
    v_existing_id UUID;
    v_hashed_password TEXT;
    v_plan TEXT := LOWER(TRIM(p_plan));
    v_salon_mode TEXT;
    v_accepts_delivery BOOLEAN;
    v_accepts_takeaway BOOLEAN;
    v_clean_email TEXT := NULLIF(LOWER(TRIM(p_admin_email)), '');
    v_clear_email BOOLEAN := (p_admin_email IS NOT NULL AND TRIM(p_admin_email) = '');
    v_clean_username TEXT := NULLIF(LOWER(TRIM(p_admin_username)), '');
    v_primary_user_id UUID;
    v_primary_username TEXT;
    v_fallback_email TEXT;
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

    -- Localiza o usuário administrador principal da loja
    SELECT ta.user_id, ta.username INTO v_primary_user_id, v_primary_username
    FROM public.tenant_admins ta
    WHERE ta.tenant_id = p_tenant_id
    ORDER BY ta.created_at ASC
    LIMIT 1;

    -- Valida unicidade do e-mail no Supabase Auth antes de atualizar
    IF v_clean_email IS NOT NULL THEN
        IF EXISTS (
            SELECT 1 FROM auth.users
            WHERE LOWER(email) = v_clean_email
              AND id IS DISTINCT FROM v_primary_user_id
        ) THEN
            RETURN jsonb_build_object('success', false, 'message', 'O e-mail ' || v_clean_email || ' já está em uso por outro usuário.');
        END IF;
    END IF;

    -- Se o plano foi alterado, sincroniza automaticamente o salon_mode e canais
    IF v_plan IS NOT NULL THEN
        IF v_plan = 'showcase' THEN
            v_salon_mode := 'showcase';
            v_accepts_delivery := FALSE;
            v_accepts_takeaway := FALSE;
        ELSIF v_plan = 'table' THEN
            v_salon_mode := 'table_only';
            v_accepts_delivery := FALSE;
            v_accepts_takeaway := TRUE;
        ELSE
            v_salon_mode := 'full';
            v_accepts_delivery := TRUE;
            v_accepts_takeaway := TRUE;
        END IF;

        UPDATE public.tenants
        SET
            name = TRIM(p_name),
            slug = v_clean_slug,
            plan = v_plan,
            salon_mode = v_salon_mode,
            accepts_delivery = v_accepts_delivery,
            accepts_takeaway = v_accepts_takeaway,
            logo_url = NULLIF(TRIM(p_logo_url), ''),
            custom_template = NULLIF(TRIM(p_custom_template), ''),
            email = CASE WHEN v_clear_email THEN NULL ELSE COALESCE(v_clean_email, email) END,
            updated_date = NOW()
        WHERE id = p_tenant_id;
    ELSE
        UPDATE public.tenants
        SET
            name = TRIM(p_name),
            slug = v_clean_slug,
            logo_url = NULLIF(TRIM(p_logo_url), ''),
            custom_template = NULLIF(TRIM(p_custom_template), ''),
            email = CASE WHEN v_clear_email THEN NULL ELSE COALESCE(v_clean_email, email) END,
            updated_date = NOW()
        WHERE id = p_tenant_id;
    END IF;

    -- Sincroniza (ou limpa para o domínio interno) o e-mail de login/recuperação no Supabase Auth
    IF v_clear_email AND v_primary_user_id IS NOT NULL THEN
        v_fallback_email := COALESCE(NULLIF(LOWER(TRIM(p_admin_username)), ''), NULLIF(LOWER(TRIM(v_primary_username)), ''), 'admin')
            || '@' || v_clean_slug || '.delivery.internal';

        IF EXISTS (
            SELECT 1 FROM auth.users
            WHERE LOWER(email) = v_fallback_email
              AND id IS DISTINCT FROM v_primary_user_id
        ) THEN
            v_fallback_email := COALESCE(NULLIF(LOWER(TRIM(p_admin_username)), ''), NULLIF(LOWER(TRIM(v_primary_username)), ''), 'admin')
                || '.' || LEFT(v_primary_user_id::text, 6) || '@' || v_clean_slug || '.delivery.internal';
        END IF;

        UPDATE auth.users
        SET email = v_fallback_email,
            updated_at = NOW()
        WHERE id = v_primary_user_id;

        UPDATE auth.identities
        SET identity_data = COALESCE(identity_data, '{}'::jsonb) || jsonb_build_object('email', v_fallback_email),
            updated_at = NOW()
        WHERE user_id = v_primary_user_id
          AND provider = 'email';
    ELSIF v_clean_email IS NOT NULL AND v_primary_user_id IS NOT NULL THEN
        UPDATE auth.users
        SET email = v_clean_email,
            email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
            updated_at = NOW()
        WHERE id = v_primary_user_id;

        UPDATE auth.identities
        SET identity_data = COALESCE(identity_data, '{}'::jsonb) || jsonb_build_object('email', v_clean_email),
            updated_at = NOW()
        WHERE user_id = v_primary_user_id
          AND provider = 'email';
    END IF;

    -- Valida unicidade do username dentro da própria loja (caso esteja sendo alterado)
    IF v_clean_username IS NOT NULL AND v_clean_username IS DISTINCT FROM LOWER(COALESCE(v_primary_username, '')) THEN
        IF EXISTS (
            SELECT 1 FROM public.tenant_admins
            WHERE tenant_id = p_tenant_id
              AND LOWER(username) = v_clean_username
              AND user_id IS DISTINCT FROM v_primary_user_id
        ) OR EXISTS (
            SELECT 1 FROM public.admin_users
            WHERE tenant_id = p_tenant_id
              AND LOWER(username) = v_clean_username
              AND id IS DISTINCT FROM v_primary_user_id
        ) THEN
            RETURN jsonb_build_object('success', false, 'message', 'O usuário "' || v_clean_username || '" já está em uso nesta loja.');
        END IF;
    END IF;

    -- Se nova senha foi informada, atualiza apenas o administrador principal em auth.users e nas tabelas locais
    IF p_admin_password IS NOT NULL AND TRIM(p_admin_password) != '' THEN
        v_hashed_password := extensions.crypt(p_admin_password, extensions.gen_salt('bf', 10));

        IF v_primary_user_id IS NOT NULL THEN
            UPDATE auth.users
            SET encrypted_password = v_hashed_password,
                updated_at = NOW()
            WHERE id = v_primary_user_id;
        END IF;

        IF v_clean_username IS NOT NULL THEN
            IF v_primary_user_id IS NOT NULL THEN
                UPDATE public.tenant_admins
                SET username = v_clean_username,
                    updated_at = NOW()
                WHERE tenant_id = p_tenant_id
                  AND user_id = v_primary_user_id;
            END IF;

            UPDATE public.admin_users
            SET username = v_clean_username,
                password = v_hashed_password,
                updated_date = NOW()
            WHERE tenant_id = p_tenant_id
              AND (
                  (v_primary_user_id IS NOT NULL AND id = v_primary_user_id)
                  OR (v_primary_username IS NOT NULL AND LOWER(username) = LOWER(v_primary_username))
              );
        ELSE
            UPDATE public.admin_users
            SET password = v_hashed_password,
                updated_date = NOW()
            WHERE tenant_id = p_tenant_id
              AND (
                  (v_primary_user_id IS NOT NULL AND id = v_primary_user_id)
                  OR (v_primary_username IS NOT NULL AND LOWER(username) = LOWER(v_primary_username))
              );
        END IF;
    ELSIF v_clean_username IS NOT NULL THEN
        IF v_primary_user_id IS NOT NULL THEN
            UPDATE public.tenant_admins
            SET username = v_clean_username,
                updated_at = NOW()
            WHERE tenant_id = p_tenant_id
              AND user_id = v_primary_user_id;
        END IF;

        UPDATE public.admin_users
        SET username = v_clean_username,
            updated_date = NOW()
        WHERE tenant_id = p_tenant_id
          AND (
              (v_primary_user_id IS NOT NULL AND id = v_primary_user_id)
              OR (v_primary_username IS NOT NULL AND LOWER(username) = LOWER(v_primary_username))
          );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'tenant_id', p_tenant_id,
        'slug', v_clean_slug,
        'name', TRIM(p_name),
        'plan', v_plan,
        'salon_mode', v_salon_mode,
        'custom_template', NULLIF(TRIM(p_custom_template), ''),
        'admin_email', v_clean_email,
        'message', 'Restaurante, e-mail de acesso e plano atualizados com sucesso!'
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.update_tenant_info(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_tenant_info(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated, service_role;

