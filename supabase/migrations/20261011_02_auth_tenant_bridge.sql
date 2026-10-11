-- ==============================================================================
-- MIGRATION 02: VÍNCULO SEGURO SUPABASE AUTH (auth.users) E TENANTS
-- Arquivo: supabase/migrations/20261011_02_auth_tenant_bridge.sql
-- Status: PREPARADO PARA AMBIENTE DE HOMOLOGAÇÃO
-- ==============================================================================

-- 1. TABELA DE ASSOCIAÇÃO IMUTÁVEL DE ADMINISTRADORES
CREATE TABLE IF NOT EXISTS public.tenant_admins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('super_admin', 'admin', 'staff')),
    username TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_super_admin_tenant CHECK (
        (role = 'super_admin') OR (tenant_id IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_tenant_admins_user ON public.tenant_admins(user_id);
CREATE INDEX IF NOT EXISTS idx_tenant_admins_tenant ON public.tenant_admins(tenant_id);

-- RLS Habilitado em tenant_admins
ALTER TABLE public.tenant_admins ENABLE ROW LEVEL SECURITY;

-- 2. FUNÇÕES DE CONTEXTO E AUTORIZAÇÃO (STABLE & SECURITY DEFINER)
-- Criptograficamente amarradas a auth.uid() emitido pelo Supabase Auth JWT

CREATE OR REPLACE FUNCTION public.get_auth_tenant_id()
RETURNS UUID
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
LANGUAGE sql AS $$
    SELECT tenant_id 
    FROM public.tenant_admins 
    WHERE user_id = auth.uid() AND is_active = true 
    LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
LANGUAGE sql AS $$
    SELECT EXISTS (
        SELECT 1 
        FROM public.tenant_admins 
        WHERE user_id = auth.uid() AND role = 'super_admin' AND is_active = true
    );
$$;

CREATE OR REPLACE FUNCTION public.get_auth_admin_role()
RETURNS TEXT
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
LANGUAGE sql AS $$
    SELECT role 
    FROM public.tenant_admins 
    WHERE user_id = auth.uid() AND is_active = true 
    LIMIT 1;
$$;

-- Restrição estrita de execução das funções de contexto
REVOKE EXECUTE ON FUNCTION public.get_auth_tenant_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_auth_tenant_id() TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.is_super_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.get_auth_admin_role() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_auth_admin_role() TO authenticated, service_role;

-- 3. PROCEDURE SEGURA DE CONSULTA DE COLABORADORES DO PRÓPRIO RESTAURANTE
CREATE OR REPLACE FUNCTION public.get_store_admin_users()
RETURNS TABLE (
    id UUID,
    tenant_id UUID,
    username TEXT,
    role TEXT,
    permissions JSONB,
    active BOOLEAN,
    created_date TIMESTAMPTZ,
    updated_date TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_tenant_id UUID := public.get_auth_tenant_id();
BEGIN
    -- Bloqueia quem não possui restaurante e não é SuperAdmin
    IF NOT (public.is_super_admin() OR v_caller_tenant_id IS NOT NULL) THEN
        RAISE EXCEPTION 'Acesso negado: Usuário não associado a um restaurante.';
    END IF;

    RETURN QUERY
    SELECT 
        u.id,
        u.tenant_id,
        u.username,
        u.role,
        u.permissions,
        u.active,
        u.created_date,
        u.updated_date
    FROM public.admin_users u
    WHERE (public.is_super_admin() OR u.tenant_id = v_caller_tenant_id)
    ORDER BY u.created_date ASC;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_store_admin_users() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_store_admin_users() TO authenticated, service_role;

-- 4. POLÍTICAS RLS PARA TENANT_ADMINS
CREATE POLICY "Admin view own membership"
    ON public.tenant_admins FOR SELECT
    TO authenticated
    USING (user_id = auth.uid() OR public.is_super_admin());

CREATE POLICY "Superadmin manage tenant_admins"
    ON public.tenant_admins FOR ALL
    TO authenticated
    USING (public.is_super_admin())
    WITH CHECK (public.is_super_admin());

CREATE POLICY "Service role full tenant_admins"
    ON public.tenant_admins FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

