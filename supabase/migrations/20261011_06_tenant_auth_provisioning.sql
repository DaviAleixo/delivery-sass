-- ==============================================================================
-- MIGRATION: PROVISIONAMENTO AUTOMÁTICO DE LOJISTAS NO SUPABASE AUTH
-- Arquivo: supabase/migrations/20261011_06_tenant_auth_provisioning.sql
-- Objetivo: Vincular nativamente novos lojistas em auth.users, auth.identities e tenant_admins
-- ==============================================================================

-- 1. RESOLVER EMAIL DO ADMINISTRADOR (com suporte opcional a slug de loja)
DROP FUNCTION IF EXISTS public.resolve_admin_login_email(text);
DROP FUNCTION IF EXISTS public.resolve_admin_login_email(text, text);

CREATE OR REPLACE FUNCTION public.resolve_admin_login_email(
    p_username TEXT,
    p_tenant_slug TEXT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
    SELECT u.email::TEXT
    FROM auth.users u
    JOIN public.tenant_admins ta ON ta.user_id = u.id
    LEFT JOIN public.tenants t ON t.id = ta.tenant_id
    WHERE LOWER(ta.username) = LOWER(TRIM(p_username))
      AND ta.is_active = true
      AND (
          p_tenant_slug IS NULL 
          OR ta.tenant_id IS NULL 
          OR LOWER(t.slug) = LOWER(TRIM(p_tenant_slug))
      )
    ORDER BY ta.tenant_id NULLS FIRST -- super_admin tem precedência se username coincidir
    LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_admin_login_email(TEXT, TEXT) TO anon, authenticated, service_role;


-- 2. CADASTRO DE NOVO RESTAURANTE COM PROVISIONAMENTO NATIVO NO SUPABASE AUTH
CREATE OR REPLACE FUNCTION public.create_new_tenant(
    p_name TEXT,
    p_slug TEXT,
    p_plan TEXT DEFAULT 'basic'::TEXT,
    p_admin_username TEXT DEFAULT 'admin'::TEXT,
    p_admin_password TEXT DEFAULT NULL::TEXT,
    p_primary_color TEXT DEFAULT '#E11D48'::TEXT,
    p_admin_email TEXT DEFAULT NULL::TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions, pg_temp
AS $$
DECLARE
    v_tenant_id UUID := gen_random_uuid();
    v_clean_slug TEXT := LOWER(REGEXP_REPLACE(TRIM(p_slug), '[^a-zA-Z0-9\-]', '-', 'g'));
    v_auth_user_id UUID := gen_random_uuid();
    v_admin_email TEXT;
    v_hashed_password TEXT;
BEGIN
    -- Restrito a SuperAdmin ou service_role
    IF NOT (public.is_super_admin() OR auth.role() = 'service_role') THEN
        RAISE EXCEPTION 'Acesso negado: Apenas o SuperAdmin pode cadastrar novos restaurantes.';
    END IF;

    IF p_admin_password IS NULL OR length(trim(p_admin_password)) < 6 THEN
        RETURN jsonb_build_object('success', false, 'message', 'A senha do administrador deve ter no mínimo 6 caracteres.');
    END IF;

    IF EXISTS (SELECT 1 FROM public.tenants WHERE slug = v_clean_slug) THEN
        RETURN jsonb_build_object('success', false, 'message', 'Este slug/endereço já está em uso por outro restaurante.');
    END IF;

    -- Gera e-mail corporativo interno do restaurante se nenhum e-mail externo for informado
    v_admin_email := COALESCE(
        NULLIF(LOWER(TRIM(p_admin_email)), ''),
        LOWER(TRIM(p_admin_username)) || '@' || v_clean_slug || '.delivery.internal'
    );

    IF EXISTS (SELECT 1 FROM auth.users WHERE email = v_admin_email) THEN
        RETURN jsonb_build_object('success', false, 'message', 'O e-mail ' || v_admin_email || ' já está em uso no sistema de autenticação.');
    END IF;

    -- 1. Cria o registro da empresa na tabela tenants
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

    -- 2. Criação direta no Supabase Auth (auth.users) com hash Bcrypt
    v_hashed_password := extensions.crypt(p_admin_password, extensions.gen_salt('bf', 10));

    INSERT INTO auth.users (
        id,
        instance_id,
        aud,
        role,
        email,
        encrypted_password,
        email_confirmed_at,
        raw_app_meta_data,
        raw_user_meta_data,
        created_at,
        updated_at
    )
    VALUES (
        v_auth_user_id,
        '00000000-0000-0000-0000-000000000000',
        'authenticated',
        'authenticated',
        v_admin_email,
        v_hashed_password,
        NOW(),
        '{"provider": "email", "providers": ["email"]}'::jsonb,
        jsonb_build_object(
            'username', LOWER(TRIM(p_admin_username)),
            'tenant_id', v_tenant_id,
            'tenant_slug', v_clean_slug
        ),
        NOW(),
        NOW()
    );

    -- 3. Identidade de login por e-mail no GoTrue
    INSERT INTO auth.identities (
        id,
        provider_id,
        user_id,
        identity_data,
        provider,
        last_sign_in_at,
        created_at,
        updated_at
    )
    VALUES (
        gen_random_uuid(),
        v_auth_user_id::text,
        v_auth_user_id,
        jsonb_build_object('sub', v_auth_user_id::text, 'email', v_admin_email),
        'email',
        NOW(),
        NOW(),
        NOW()
    );

    -- 4. Associação de segurança na tabela tenant_admins
    INSERT INTO public.tenant_admins (
        tenant_id,
        user_id,
        username,
        role,
        is_active
    )
    VALUES (
        v_tenant_id,
        v_auth_user_id,
        LOWER(TRIM(p_admin_username)),
        'admin',
        TRUE
    );

    -- 5. Sincronização retrocompatível em admin_users
    INSERT INTO public.admin_users (
        tenant_id, username, password, initial_password, role, permissions, active
    )
    VALUES (
        v_tenant_id,
        LOWER(TRIM(p_admin_username)),
        v_hashed_password,
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
        'admin_username', LOWER(TRIM(p_admin_username)),
        'admin_email', v_admin_email,
        'message', 'Restaurante criado com conta Supabase Auth ativa com sucesso!'
    );
END;
$$;


-- 3. EXCLUSÃO DE RESTAURANTE COM LIMPEZA DE CONTAS AUTH EM CASCATA
CREATE OR REPLACE FUNCTION public.delete_tenant(p_tenant_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_slug TEXT;
    v_name TEXT;
    v_auth_user_ids UUID[];
BEGIN
    IF NOT (public.is_super_admin() OR auth.role() = 'service_role') THEN
        RAISE EXCEPTION 'Acesso negado: Apenas o SuperAdmin pode excluir estabelecimentos.';
    END IF;

    SELECT slug, name INTO v_slug, v_name 
    FROM public.tenants 
    WHERE id = p_tenant_id;

    IF v_slug IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Empresa não encontrada.');
    END IF;

    -- Coleta os IDs de usuários no Supabase Auth pertencentes a este tenant
    SELECT ARRAY_AGG(user_id) INTO v_auth_user_ids
    FROM public.tenant_admins
    WHERE tenant_id = p_tenant_id AND user_id IS NOT NULL;

    -- Exclusão ordenada em cascata das tabelas do SaaS
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

    -- Exclusão das contas do Supabase Auth associadas
    IF v_auth_user_ids IS NOT NULL AND array_length(v_auth_user_ids, 1) > 0 THEN
        DELETE FROM auth.identities WHERE user_id = ANY(v_auth_user_ids);
        DELETE FROM auth.users WHERE id = ANY(v_auth_user_ids);
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'tenant_id', p_tenant_id,
        'deleted_name', v_name,
        'message', 'Restaurante ' || v_name || ' e todas as suas contas de acesso foram removidos com sucesso!'
    );
END;
$$;


-- 4. ATUALIZAÇÃO DE INFORMAÇÕES E REDEFINIÇÃO DE SENHA NATIVAMENTE NO AUTH
CREATE OR REPLACE FUNCTION public.update_tenant_info(
    p_tenant_id UUID,
    p_name TEXT,
    p_slug TEXT,
    p_plan TEXT DEFAULT NULL,
    p_logo_url TEXT DEFAULT NULL,
    p_admin_username TEXT DEFAULT NULL,
    p_admin_password TEXT DEFAULT NULL
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
        'message', 'Restaurante e credenciais atualizados com sucesso!'
    );
END;
$$;


-- 5. PERMISSÕES E PRIVILÉGIOS (REVOKE / GRANT)
REVOKE EXECUTE ON FUNCTION public.create_new_tenant(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.delete_tenant(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.update_tenant_info(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.create_new_tenant(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_tenant(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_tenant_info(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated, service_role;
