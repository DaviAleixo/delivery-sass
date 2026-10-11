-- ==============================================================================
-- SCRIPT: VÍNCULO SEGURO DO SUPERADMIN NO SUPABASE AUTH
-- Arquivo: supabase/scripts/setup_superadmin.sql
-- Objetivo: Vincular o usuário criado no Supabase Auth como super_admin em tenant_admins
-- SEM SENHAS NO CÓDIGO OU LOGS
-- ==============================================================================

DO $$
DECLARE
    v_user_id UUID;
    v_email TEXT := 'davi@delivery.internal';
BEGIN
    -- Localiza o UID do usuário no Supabase Auth
    SELECT id INTO v_user_id 
    FROM auth.users 
    WHERE email = LOWER(TRIM(v_email)) OR email LIKE 'davi@%'
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Usuário "davi" não foi encontrado no Supabase Auth. Crie o usuário com o identificador "davi@delivery.internal" no painel Authentication -> Users do Supabase.';
    END IF;


    -- Vincula com segurança na tabela tenant_admins
    INSERT INTO public.tenant_admins (
        user_id,
        role,
        username,
        tenant_id,
        is_active
    ) VALUES (
        v_user_id,
        'super_admin',
        'davi',
        NULL,
        true
    )
    ON CONFLICT (user_id) DO UPDATE SET
        role = 'super_admin',
        username = 'davi',
        tenant_id = NULL,
        is_active = true,
        updated_at = NOW();

    RAISE NOTICE 'Conta SuperAdmin vinculada com sucesso para o email % (UID: %)!', v_email, v_user_id;
END $$;
