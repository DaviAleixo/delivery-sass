-- ==============================================================================
-- MIGRATION 01: HARDENING EMERGENCIAL DE CREDENCIAIS & SEARCH_PATH
-- Arquivo: supabase/migrations/20261011_01_emergency_revoke_dangerous_rpcs.sql
-- Status: PREPARADO PARA AMBIENTE DE HOMOLOGAÇÃO
-- ==============================================================================

-- 1. BLINDAGEM COMPLETA DA TABELA ADMIN_USERS
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

-- Remove policies permissivas legadas
DROP POLICY IF EXISTS "Service role full access admin_users" ON public.admin_users;
DROP POLICY IF EXISTS "Block anon read admin_users" ON public.admin_users;
DROP POLICY IF EXISTS "Block anon write admin_users" ON public.admin_users;

-- Revoga privilégios a nível de tabela para os papéis anon e PUBLIC
-- (No PostgreSQL, revogar a tabela inteira é necessário para garantir que nenhum SELECT passe)
REVOKE ALL ON public.admin_users FROM anon, PUBLIC;

-- Políticas de RLS fechadas
CREATE POLICY "Block anon read admin_users"
    ON public.admin_users FOR SELECT
    TO anon
    USING (false);

CREATE POLICY "Block anon write admin_users"
    ON public.admin_users FOR ALL
    TO anon
    USING (false)
    WITH CHECK (false);

CREATE POLICY "Service role full access admin_users"
    ON public.admin_users FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Revoga leitura explícita das colunas de senha para reforço de defesa em profundidade
REVOKE SELECT (password, initial_password) ON public.admin_users FROM anon, PUBLIC;


-- 2. FIXAÇÃO DE SEARCH_PATH EM TODAS AS FUNÇÕES SECURITY DEFINER
-- Previne vulnerabilidade de Search Path Hijacking
ALTER FUNCTION public.create_new_tenant(text, text, text, text, text, text) SET search_path = public, pg_temp;
ALTER FUNCTION public.delete_tenant(uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.get_clients_summary(uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.get_master_tenants() SET search_path = public, pg_temp;
ALTER FUNCTION public.get_sales_metrics(uuid, timestamptz, timestamptz) SET search_path = public, pg_temp;
ALTER FUNCTION public.lookup_customer_by_phone(text, uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.toggle_tenant_status(uuid, boolean) SET search_path = public, pg_temp;
ALTER FUNCTION public.update_tenant_info(uuid, text, text, text, text, text, text) SET search_path = public, pg_temp;
ALTER FUNCTION public.verify_admin_login(text, text, text) SET search_path = public, pg_temp;


-- 3. REVOGAÇÃO DE PRIVILÉGIOS DE EXECUÇÃO PÚBLICA EM PROCEDURES DESTRUTIVAS
REVOKE EXECUTE ON FUNCTION public.delete_tenant(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_tenant(uuid) TO service_role;


-- 4. ATUALIZAÇÃO DE CREATE_NEW_TENANT (SEM SENHA PADRÃO E SEM TEXTO PLANO)
CREATE OR REPLACE FUNCTION public.create_new_tenant(
    p_name TEXT,
    p_slug TEXT,
    p_plan TEXT DEFAULT 'basic'::TEXT,
    p_admin_username TEXT DEFAULT 'admin'::TEXT,
    p_admin_password TEXT DEFAULT NULL::TEXT,
    p_primary_color TEXT DEFAULT '#E11D48'::TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_tenant_id UUID := gen_random_uuid();
    v_clean_slug TEXT := LOWER(REGEXP_REPLACE(TRIM(p_slug), '[^a-zA-Z0-9\-]', '-', 'g'));
BEGIN
    -- Validação: Impede cadastro com senha vazia ou fraca
    IF p_admin_password IS NULL OR length(trim(p_admin_password)) < 6 THEN
        RETURN jsonb_build_object('success', false, 'message', 'A senha do administrador deve ter no mínimo 6 caracteres.');
    END IF;

    IF EXISTS (SELECT 1 FROM public.tenants WHERE slug = v_clean_slug) THEN
        RETURN jsonb_build_object('success', false, 'message', 'Este slug/endereço já está em uso por outro restaurante.');
    END IF;

    -- Cria o Tenant
    INSERT INTO public.tenants (
        id, slug, name, plan, logo_url, banner_url, theme_config, is_active,
        phone, whatsapp, address, instagram, delivery_fee, min_order_value
    )
    VALUES (
        v_tenant_id,
        v_clean_slug,
        TRIM(p_name),
        COALESCE(p_plan, 'basic'),
        NULL,
        NULL,
        jsonb_build_object(
            'primary_color', p_primary_color,
            'secondary_color', '#111827',
            'layout_style', CASE WHEN p_plan = 'premium' THEN 'premium' ELSE 'standard' END
        ),
        TRUE,
        NULL,
        NULL,
        NULL,
        NULL,
        0.00,
        0.00
    );

    -- Cria o usuário Admin exclusivamente com hash bcrypt e initial_password = NULL
    INSERT INTO public.admin_users (
        tenant_id, username, password, initial_password, role, permissions, active
    )
    VALUES (
        v_tenant_id,
        LOWER(TRIM(p_admin_username)),
        crypt(p_admin_password, gen_salt('bf', 8)),
        NULL,
        'admin',
        '["*"]'::jsonb,
        TRUE
    );

    RETURN jsonb_build_object(
        'success', true,
        'tenant_id', v_tenant_id,
        'slug', v_clean_slug,
        'name', TRIM(p_name),
        'message', 'Restaurante criado com sucesso!'
    );
END;
$$;
