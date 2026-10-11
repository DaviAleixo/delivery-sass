-- ==============================================================================
-- MIGRATION: VÍNCULO SEGURO ENTRE SUPABASE AUTH (auth.users) E TENANTS
-- Arquivo: supabase/migrations/20261011_02_auth_tenant_bridge.sql
-- Status: NÃO EXECUTADO (Aguardando autorização explícita)
-- Objetivo: Estruturar autorização robusta baseada em JWT sem confiar em localStorage/URL
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
-- Essas funções leem auth.uid() emitido pelo JWT assinado do Supabase.
-- É criptograficamente impossível forjar este valor a partir de parâmetros de URL ou localStorage.

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

-- Revogar acesso público às funções de contexto e conceder apenas a authenticated
REVOKE EXECUTE ON FUNCTION public.get_auth_tenant_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_auth_tenant_id() TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.is_super_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.get_auth_admin_role() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_auth_admin_role() TO authenticated, service_role;

-- 3. POLÍTICA DE LEITURA DA TABELA TENANT_ADMINS
-- Operador autenticado pode consultar apenas seu próprio registro de permissão
CREATE POLICY "Admin view own membership"
    ON public.tenant_admins FOR SELECT
    TO authenticated
    USING (user_id = auth.uid() OR public.is_super_admin());

-- Modificações restritas a service_role
CREATE POLICY "Service role manage tenant_admins"
    ON public.tenant_admins FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);
