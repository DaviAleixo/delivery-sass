-- ==============================================================================
-- SCRIPT EMERGENCIAL 1 (REVISADO): PROTEÇÃO DE CREDENCIAIS & HARDENING DE RPCS
-- Arquivo: supabase/migrations/20261011_01_emergency_revoke_dangerous_rpcs.sql
-- Status: NÃO EXECUTADO (Aguardando aprovação explícita do usuário)
-- ==============================================================================

-- ==============================================================================
-- 1. PROTEÇÃO CONTRA EXPOSIÇÃO DE CREDENCIAIS (TABELA ADMIN_USERS)
-- ==============================================================================

-- A. Habilita RLS estrito na tabela admin_users
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

-- B. Remove a policy permissiva que concedia acesso total ao papel {public}
DROP POLICY IF EXISTS "Service role full access admin_users" ON public.admin_users;
DROP POLICY IF EXISTS "Block anon read admin_users" ON public.admin_users;

-- C. Bloqueia qualquer leitura direta (SELECT) anônima na tabela admin_users
CREATE POLICY "Block anon read admin_users"
    ON public.admin_users FOR SELECT
    TO anon
    USING (false);

-- D. Bloqueia qualquer modificação (INSERT, UPDATE, DELETE) anônima na tabela
CREATE POLICY "Block anon write admin_users"
    ON public.admin_users FOR ALL
    TO anon
    USING (false)
    WITH CHECK (false);

-- E. Concede acesso total exclusivo ao papel seguro service_role
CREATE POLICY "Service role full access admin_users"
    ON public.admin_users FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- F. Blindagem a nível de coluna: Revoga acesso de leitura às colunas de senha
-- Mesmo que uma policy futura tente expor a tabela, o motor do PostgreSQL impede a leitura de senhas
REVOKE SELECT (password, initial_password) ON public.admin_users FROM anon, PUBLIC;

-- G. Procedure segura para listagem de colaboradores na aba Configurações (Settings.jsx)
-- Retorna os dados operacionais SEM NUNCA expor hashes ou senhas
CREATE OR REPLACE FUNCTION public.get_store_admin_users(p_tenant_id UUID)
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
BEGIN
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
    WHERE u.tenant_id = p_tenant_id
    ORDER BY u.created_date ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_store_admin_users(UUID) TO anon, authenticated, service_role;


-- ==============================================================================
-- 2. CORREÇÃO DE SEARCH_PATH EM TODAS AS FUNÇÕES SECURITY DEFINER
-- Impede ataques de sequestro de caminho de busca (Search Path Hijacking)
-- ==============================================================================

ALTER FUNCTION public.create_new_tenant(text, text, text, text, text, text) SET search_path = public, pg_temp;
ALTER FUNCTION public.delete_tenant(uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.get_clients_summary(uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.get_master_tenants() SET search_path = public, pg_temp;
ALTER FUNCTION public.get_sales_metrics(uuid, timestamptz, timestamptz) SET search_path = public, pg_temp;
ALTER FUNCTION public.lookup_customer_by_phone(text, uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.toggle_tenant_status(uuid, boolean) SET search_path = public, pg_temp;
ALTER FUNCTION public.update_tenant_info(uuid, text, text, text, text, text, text) SET search_path = public, pg_temp;
ALTER FUNCTION public.verify_admin_login(text, text, text) SET search_path = public, pg_temp;


-- ==============================================================================
-- 3. HARDENING DAS FUNÇÕES ADMINISTRATIVAS CRÍTICAS
-- ==============================================================================

-- A. Procedimento de Exclusão de Tenants (delete_tenant)
-- Proteção: Exige que a exclusão seja executada pelo service_role OU validação de segurança
REVOKE EXECUTE ON FUNCTION public.delete_tenant(uuid) FROM PUBLIC;
-- Nota: Enquanto a migração para Supabase Auth não for concluída, o acesso ao delete_tenant
-- pode ser mantido para service_role ou protegido internamente por verificação de chave master.
GRANT EXECUTE ON FUNCTION public.delete_tenant(uuid) TO service_role;

-- B. Procedimento de Criação de Tenants (create_new_tenant)
-- Remove armazenamento de senha em texto plano puro na coluna initial_password
CREATE OR REPLACE FUNCTION public.create_new_tenant(
    p_name TEXT,
    p_slug TEXT,
    p_plan TEXT DEFAULT 'basic'::TEXT,
    p_admin_username TEXT DEFAULT 'admin'::TEXT,
    p_admin_password TEXT DEFAULT '123456'::TEXT,
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

    -- Cria o usuário Admin usando hash bcrypt seguro SEM salvar senha pura em initial_password
    INSERT INTO public.admin_users (
        tenant_id, username, password, initial_password, role, permissions, active
    )
    VALUES (
        v_tenant_id,
        LOWER(TRIM(p_admin_username)),
        crypt(p_admin_password, gen_salt('bf', 8)),
        NULL, -- <--- SEGURANÇA: Não armazena senha em texto plano!
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

-- C. Procedimento de Atualização de Informações do Tenant (update_tenant_info)
-- Elimina gravação de initial_password em texto plano
CREATE OR REPLACE FUNCTION public.update_tenant_info(
    p_tenant_id UUID,
    p_name TEXT,
    p_slug TEXT,
    p_plan TEXT DEFAULT NULL::TEXT,
    p_logo_url TEXT DEFAULT NULL::TEXT,
    p_admin_username TEXT DEFAULT NULL::TEXT,
    p_admin_password TEXT DEFAULT NULL::TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_clean_slug TEXT := LOWER(REGEXP_REPLACE(TRIM(p_slug), '[^a-zA-Z0-9\-]', '-', 'g'));
    v_existing_id UUID;
BEGIN
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
        updated_date = NOW()
    WHERE id = p_tenant_id;

    IF p_admin_username IS NOT NULL AND TRIM(p_admin_username) != '' THEN
        IF p_admin_password IS NOT NULL AND TRIM(p_admin_password) != '' THEN
            UPDATE public.admin_users
            SET 
                username = LOWER(TRIM(p_admin_username)),
                password = crypt(p_admin_password, gen_salt('bf', 8)),
                initial_password = NULL,
                updated_date = NOW()
            WHERE tenant_id = p_tenant_id;
        ELSE
            UPDATE public.admin_users
            SET 
                username = LOWER(TRIM(p_admin_username)),
                updated_date = NOW()
            WHERE tenant_id = p_tenant_id;
        END IF;
    ELSIF p_admin_password IS NOT NULL AND TRIM(p_admin_password) != '' THEN
        UPDATE public.admin_users
        SET 
            password = crypt(p_admin_password, gen_salt('bf', 8)),
            initial_password = NULL,
            updated_date = NOW()
        WHERE tenant_id = p_tenant_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'tenant_id', p_tenant_id,
        'slug', v_clean_slug,
        'name', TRIM(p_name),
        'message', 'Restaurante atualizado com sucesso!'
    );
END;
$$;
