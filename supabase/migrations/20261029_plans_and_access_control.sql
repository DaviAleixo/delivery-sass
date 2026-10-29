-- ==============================================================================
-- MIGRATION: 20261029_plans_and_access_control.sql
-- OBJETIVO: Governança de Planos (Visual / Autoatendimento / Completo)
--           Sincronização estrita de salon_mode e canais de atendimento por plano
-- ==============================================================================

-- 1. Atualizar RPC create_new_tenant para gravar salon_mode e canais de atendimento
CREATE OR REPLACE FUNCTION public.create_new_tenant(
    p_name TEXT,
    p_slug TEXT,
    p_plan TEXT DEFAULT 'basic'::TEXT,
    p_admin_username TEXT DEFAULT 'admin'::TEXT,
    p_admin_password TEXT DEFAULT 'admin123'::TEXT,
    p_primary_color TEXT DEFAULT '#E11D48'::TEXT,
    p_admin_email TEXT DEFAULT NULL::TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_tenant_id UUID := gen_random_uuid();
    v_clean_slug TEXT := LOWER(REGEXP_REPLACE(TRIM(p_slug), '[^a-zA-Z0-9\-]', '-', 'g'));
    v_auth_user_id UUID := gen_random_uuid();
    v_admin_email TEXT;
    v_hashed_password TEXT;
    v_salon_mode TEXT;
    v_accepts_delivery BOOLEAN;
    v_accepts_takeaway BOOLEAN;
    v_plan TEXT := LOWER(TRIM(COALESCE(p_plan, 'basic')));
BEGIN
    IF NOT (public.is_super_admin() OR auth.role() = 'service_role') THEN
        RAISE EXCEPTION 'Acesso negado: Apenas o SuperAdmin pode cadastrar novos restaurantes.';
    END IF;

    IF p_admin_password IS NULL OR length(trim(p_admin_password)) < 6 THEN
        RETURN jsonb_build_object('success', false, 'message', 'A senha do administrador deve ter no mínimo 6 caracteres.');
    END IF;

    IF EXISTS (SELECT 1 FROM public.tenants WHERE slug = v_clean_slug) THEN
        RETURN jsonb_build_object('success', false, 'message', 'Este slug/endereço já está em uso por outro restaurante.');
    END IF;

    -- Define salon_mode e canais conforme o plano contratado
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

    v_admin_email := COALESCE(
        NULLIF(LOWER(TRIM(p_admin_email)), ''),
        LOWER(TRIM(p_admin_username)) || '@' || v_clean_slug || '.delivery.internal'
    );

    IF EXISTS (SELECT 1 FROM auth.users WHERE email = v_admin_email) THEN
        RETURN jsonb_build_object('success', false, 'message', 'O e-mail ' || v_admin_email || ' já está em uso no sistema de autenticação.');
    END IF;

    -- 1. Inserir Tenant com salon_mode e canais consistentes
    INSERT INTO public.tenants (
        id, slug, name, plan, salon_mode, accepts_delivery, accepts_takeaway,
        logo_url, banner_url, theme_config, is_active,
        phone, whatsapp, address, instagram, delivery_fee, min_order_value
    )
    VALUES (
        v_tenant_id,
        v_clean_slug,
        TRIM(p_name),
        v_plan,
        v_salon_mode,
        v_accepts_delivery,
        v_accepts_takeaway,
        NULL,
        NULL,
        jsonb_build_object(
            'primary_color', p_primary_color,
            'secondary_color', '#111827',
            'layout_style', CASE WHEN v_plan = 'custom' THEN 'premium' ELSE 'standard' END
        ),
        TRUE,
        NULL,
        NULL,
        NULL,
        NULL,
        0.00,
        0.00
    );

    -- 2. Criptografar Senha com Blowfish/bcrypt
    v_hashed_password := extensions.crypt(p_admin_password, extensions.gen_salt('bf', 10));

    -- 3. Inserir em auth.users
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

    -- 4. Inserir em auth.identities
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

    -- 5. Vincular em tenant_admins
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

    -- 6. Sincronizar em public.admin_users
    INSERT INTO public.admin_users (
        id, tenant_id, username, password, role, permissions, active
    )
    VALUES (
        v_auth_user_id,
        v_tenant_id,
        LOWER(TRIM(p_admin_username)),
        v_hashed_password,
        'admin',
        '["*"]'::jsonb,
        TRUE
    );

    RETURN jsonb_build_object(
        'success', true,
        'tenant_id', v_tenant_id,
        'slug', v_clean_slug,
        'name', TRIM(p_name),
        'plan', v_plan,
        'salon_mode', v_salon_mode,
        'admin_username', LOWER(TRIM(p_admin_username)),
        'admin_email', v_admin_email,
        'message', 'Restaurante criado com perfil de plano configurado com sucesso!'
    );
END;
$$;

-- 2. Atualizar RPC update_tenant_info para sincronizar salon_mode e canais ao alterar plano
CREATE OR REPLACE FUNCTION public.update_tenant_info(
    p_tenant_id UUID, 
    p_name TEXT, 
    p_slug TEXT, 
    p_plan TEXT DEFAULT NULL::TEXT, 
    p_logo_url TEXT DEFAULT NULL::TEXT, 
    p_admin_username TEXT DEFAULT NULL::TEXT, 
    p_admin_password TEXT DEFAULT NULL::TEXT, 
    p_custom_template TEXT DEFAULT NULL::TEXT
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
            updated_date = NOW()
        WHERE id = p_tenant_id;
    ELSE
        UPDATE public.tenants
        SET 
            name = TRIM(p_name),
            slug = v_clean_slug,
            logo_url = NULLIF(TRIM(p_logo_url), ''),
            custom_template = NULLIF(TRIM(p_custom_template), ''),
            updated_date = NOW()
        WHERE id = p_tenant_id;
    END IF;

    -- Se nova senha foi informada, atualiza em auth.users e nas tabelas locais
    IF p_admin_password IS NOT NULL AND TRIM(p_admin_password) != '' THEN
        v_hashed_password := extensions.crypt(p_admin_password, extensions.gen_salt('bf', 10));

        UPDATE auth.users
        SET encrypted_password = v_hashed_password,
            updated_at = NOW()
        WHERE id IN (SELECT user_id FROM public.tenant_admins WHERE tenant_id = p_tenant_id);

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
        'plan', v_plan,
        'salon_mode', v_salon_mode,
        'custom_template', NULLIF(TRIM(p_custom_template), ''),
        'message', 'Restaurante e plano atualizados com sucesso!'
    );
END;
$$;

-- 3. Atualizar a empresa 'visual' e alinhar o salon_mode com o plano contratado
UPDATE public.tenants
SET plan = 'showcase',
    salon_mode = 'showcase',
    accepts_delivery = FALSE,
    accepts_takeaway = FALSE
WHERE slug = 'visual' OR name ILIKE '%visual%';

