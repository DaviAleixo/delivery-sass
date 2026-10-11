-- ==============================================================================
-- SCRIPT: VÍNCULO SEGURO DO SUPERADMIN NO SUPABASE AUTH
-- Arquivo: supabase/scripts/setup_superadmin.sql
-- Objetivo: Vincular o usuário criado no Supabase Auth como super_admin em tenant_admins
-- SEM SENHAS NO CÓDIGO OU LOGS
-- ==============================================================================

DO $$
DECLARE
    v_user_id UUID;
    v_email TEXT := 'SEU_EMAIL_AQUI'; -- << Substitua pelo email criado no Supabase Auth
BEGIN
    -- Localiza o UID do usuário gerado pelo Supabase Auth
    SELECT id INTO v_user_id 
    FROM auth.users 
    WHERE email = LOWER(TRIM(v_email));

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Usuário com o email "%" não foi encontrado no Supabase Auth. Crie o usuário no Supabase Dashboard (Authentication -> Users -> Add User) antes de executar este script.', v_email;
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
