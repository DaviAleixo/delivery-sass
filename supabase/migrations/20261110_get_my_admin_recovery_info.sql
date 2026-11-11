-- ==============================================================================
-- MIGRATION: 20261110_get_my_admin_recovery_info.sql
-- OBJETIVO: Retornar Código da Loja e Usuário do administrador autenticado
--           durante a sessão de recuperação de senha (PASSWORD_RECOVERY)
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.get_my_admin_recovery_info()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_username TEXT;
    v_role TEXT;
    v_tenant_id UUID;
    v_code INTEGER;
    v_slug TEXT;
    v_name TEXT;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('found', false);
    END IF;

    SELECT ta.username, ta.role, ta.tenant_id
    INTO v_username, v_role, v_tenant_id
    FROM public.tenant_admins ta
    WHERE ta.user_id = v_user_id
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('found', false);
    END IF;

    IF v_tenant_id IS NOT NULL THEN
        SELECT t.code, t.slug, t.name
        INTO v_code, v_slug, v_name
        FROM public.tenants t
        WHERE t.id = v_tenant_id;
    END IF;

    RETURN jsonb_build_object(
        'found', true,
        'username', v_username,
        'role', v_role,
        'store_code', CASE
            WHEN v_role = 'super_admin' AND v_tenant_id IS NULL THEN 'superadmin'
            WHEN v_code IS NOT NULL THEN v_code::TEXT
            ELSE COALESCE(v_slug, '')
        END,
        'store_slug', v_slug,
        'store_name', v_name
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_admin_recovery_info() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_admin_recovery_info() TO authenticated, service_role;

