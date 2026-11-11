-- ==============================================================================
-- MIGRATION: 20261110_verify_admin_reset_email.sql
-- OBJETIVO: Validar se o e-mail informado na recuperação de senha pertence a um
--           lojista ativo da empresa informada (por código numérico ou slug)
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.verify_admin_reset_email(
    p_tenant_slug TEXT,
    p_email TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM auth.users u
        JOIN public.tenant_admins ta ON ta.user_id = u.id
        LEFT JOIN public.tenants t ON t.id = ta.tenant_id
        WHERE LOWER(u.email) = LOWER(TRIM(p_email))
          AND ta.is_active = true
          AND LOWER(u.email) NOT LIKE '%.delivery.internal'
          AND (
              (LOWER(TRIM(COALESCE(p_tenant_slug, ''))) IN ('superadmin', 'master') AND ta.tenant_id IS NULL AND ta.role = 'super_admin')
              OR (
                  LOWER(TRIM(COALESCE(p_tenant_slug, ''))) NOT IN ('superadmin', 'master')
                  AND TRIM(COALESCE(p_tenant_slug, '')) <> ''
                  AND (LOWER(t.slug) = LOWER(TRIM(p_tenant_slug)) OR t.code::text = TRIM(p_tenant_slug))
              )
          )
    );
$$;

REVOKE ALL ON FUNCTION public.verify_admin_reset_email(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_admin_reset_email(TEXT, TEXT) TO anon, authenticated, service_role;

