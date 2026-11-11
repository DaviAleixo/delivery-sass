-- ============================================================================
-- MIGRATION: Hardening Completo de Segurança (RLS + RPCs), Concorrência,
-- Isolamento Multi-Tenant, Spooler, Cupons, Mesas, Cashback e Índices.
-- ============================================================================

-- 1. VIEW PÚBLICA SEGURA DE TENANTS (NUNCA expõe mp_access_token, cpf_cnpj, asaas_*, spooler_*)
DROP VIEW IF EXISTS public.tenants_public;
CREATE VIEW public.tenants_public AS
SELECT
    t.id,
    t.slug,
    t.name,
    t.plan,
    t.custom_domain,
    t.is_active,
    t.logo_url,
    t.banner_url,
    t.theme_config,
    t.phone,
    t.whatsapp,
    t.address,
    t.instagram,
    t.delivery_fee,
    t.min_order_value,
    t.delivery_time,
    t.opening_time,
    t.closing_time,
    t.open_days,
    t.manual_store_open,
    t.manual_override_date,
    t.created_date,
    t.updated_date,
    t.cep,
    t.address_number,
    t.address_street,
    t.address_neighborhood,
    t.address_city,
    t.address_state,
    t.address_complement,
    t.delivery_fee_type,
    t.delivery_neighborhoods,
    t.delivery_unlisted_policy,
    t.delivery_fallback_fee,
    t.free_delivery_threshold,
    t.subscription_status,
    t.next_due_date,
    t.code,
    t.custom_template,
    t.salon_mode,
    t.accepts_delivery,
    t.accepts_takeaway,
    t.accepts_dine_in,
    t.pizza_pricing_rule,
    t.table_service_fee_enabled,
    t.table_service_fee_rate,
    t.cashback_enabled,
    t.cashback_rate,
    t.cashback_validity_days,
    t.cashback_max_discount_percentage,
    t.auto_accept_delivery,
    (
        (COALESCE(t.payment_methods, '{}'::jsonb) - 'mp_access_token')
        || jsonb_build_object(
            'has_online_mp',
            COALESCE(t.payment_methods->>'mp_access_token', '') <> ''
        )
    ) AS payment_methods
FROM public.tenants t;

GRANT SELECT ON public.tenants_public TO anon, authenticated;

-- 2. CORRIGIR PAREMETRO DE SCHEMA & SEARCH_PATH EM FUNÇÕES EXISTENTES
CREATE OR REPLACE FUNCTION public.handle_updated_date()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    NEW.updated_date = NOW();
    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.generate_spooler_pairing_code(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
    v_code TEXT;
    v_token TEXT;
    v_alphabet TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    v_part TEXT := '';
    v_i INT;
BEGIN
    IF NOT (p_tenant_id = public.get_auth_tenant_id() OR public.is_super_admin()) THEN
        RAISE EXCEPTION 'Acesso negado para parear esta loja.';
    END IF;

    FOR v_i IN 1..6 LOOP
        v_part := v_part || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
    END LOOP;

    v_code := 'PM-' || substr(v_part, 1, 3) || '-' || substr(v_part, 4, 3);
    v_token := encode(extensions.gen_random_bytes(24), 'hex');

    UPDATE public.tenants
    SET
        spooler_pairing_code = v_code,
        spooler_station_token = v_token,
        updated_date = NOW()
    WHERE id = p_tenant_id;

    RETURN jsonb_build_object(
        'pairing_code', v_code,
        'station_token', v_token
    );
END;
$function$;

ALTER FUNCTION public.create_new_tenant(text, text, text, text, text, text, text)
SET search_path TO 'public', 'auth', 'extensions', 'pg_temp';

-- 3. REMOVER SOBRECARGA LEGADA INSEGURA DE CASHBACK E BLINDAR CONCORRÊNCIA (FOR UPDATE)
DROP FUNCTION IF EXISTS public.process_order_cashback(text);

CREATE OR REPLACE FUNCTION public.process_order_cashback(p_order_id text, p_action text DEFAULT 'all'::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_order RECORD;
    v_tenant RECORD;
    v_clean_phone TEXT;
    v_wallet_id UUID;
    v_validity_days INTEGER;
    v_new_expires_at TIMESTAMPTZ;
    v_discount_used NUMERIC := 0.00;
    v_earned_amount NUMERIC := 0.00;
    v_already_debited BOOLEAN := FALSE;
    v_already_credited BOOLEAN := FALSE;
    v_debited_now NUMERIC := 0.00;
    v_credited_now NUMERIC := 0.00;
BEGIN
    SELECT id, tenant_id, customer_phone, customer_name, total, total_amount, subtotal, cashback_discount, cashback_earned, status
    INTO v_order
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Pedido não encontrado.');
    END IF;

    IF NOT (public.is_super_admin() OR auth.role() = 'service_role' OR v_order.tenant_id = public.get_auth_tenant_id()) THEN
        RAISE EXCEPTION 'Acesso negado: Você não possui permissão para processar cashback deste pedido.';
    END IF;

    SELECT cashback_enabled, cashback_rate, cashback_validity_days, cashback_max_discount_percentage
    INTO v_tenant
    FROM public.tenants
    WHERE id = v_order.tenant_id;

    IF NOT FOUND OR v_tenant.cashback_enabled IS NOT TRUE THEN
        RETURN jsonb_build_object('success', true, 'message', 'Cashback desativado para esta loja.');
    END IF;

    v_clean_phone := REGEXP_REPLACE(COALESCE(v_order.customer_phone, ''), '\D', '', 'g');
    IF length(v_clean_phone) < 8 THEN
        RETURN jsonb_build_object('success', true, 'message', 'Telefone do cliente não elegível.');
    END IF;

    v_validity_days := COALESCE(v_tenant.cashback_validity_days, 15);
    v_new_expires_at := NOW() + (v_validity_days || ' days')::INTERVAL;
    v_discount_used := COALESCE(v_order.cashback_discount, 0.00);
    v_earned_amount := COALESCE(v_order.cashback_earned, 0.00);

    INSERT INTO public.customer_cashback_wallets (
        tenant_id, phone, customer_name, balance, expires_at
    )
    VALUES (
        v_order.tenant_id, v_clean_phone, v_order.customer_name, 0.00, v_new_expires_at
    )
    ON CONFLICT (tenant_id, phone) DO UPDATE
    SET customer_name = COALESCE(EXCLUDED.customer_name, customer_cashback_wallets.customer_name),
        updated_at = NOW()
    RETURNING id INTO v_wallet_id;

    -- Lock exclusivo na carteira para evitar corrida em chamadas concorrentes
    PERFORM 1 FROM public.customer_cashback_wallets WHERE id = v_wallet_id FOR UPDATE;

    IF (p_action IN ('all', 'debit_only')) AND v_discount_used > 0 THEN
        SELECT EXISTS (
            SELECT 1 FROM public.customer_cashback_transactions
            WHERE wallet_id = v_wallet_id AND order_id = v_order.id AND type = 'debit'
        ) INTO v_already_debited;

        IF NOT v_already_debited THEN
            UPDATE public.customer_cashback_wallets
            SET balance = GREATEST(0, balance - v_discount_used),
                updated_at = NOW()
            WHERE id = v_wallet_id;

            INSERT INTO public.customer_cashback_transactions (
                wallet_id, tenant_id, order_id, amount, type, description
            )
            VALUES (
                v_wallet_id, v_order.tenant_id, v_order.id, -v_discount_used, 'debit',
                'Abatimento no pedido #' || UPPER(SUBSTRING(v_order.id, 1, 6))
            );
            v_debited_now := v_discount_used;
        END IF;
    END IF;

    IF (p_action IN ('all', 'credit_only')) AND v_earned_amount > 0 THEN
        SELECT EXISTS (
            SELECT 1 FROM public.customer_cashback_transactions
            WHERE wallet_id = v_wallet_id AND order_id = v_order.id AND type = 'credit'
        ) INTO v_already_credited;

        IF NOT v_already_credited THEN
            UPDATE public.customer_cashback_wallets
            SET balance = balance + v_earned_amount,
                expires_at = v_new_expires_at,
                updated_at = NOW()
            WHERE id = v_wallet_id;

            INSERT INTO public.customer_cashback_transactions (
                wallet_id, tenant_id, order_id, amount, type, description
            )
            VALUES (
                v_wallet_id, v_order.tenant_id, v_order.id, v_earned_amount, 'credit',
                'Cashback ganho no pedido #' || UPPER(SUBSTRING(v_order.id, 1, 6))
            );
            v_credited_now := v_earned_amount;
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'wallet_id', v_wallet_id,
        'discount_applied', v_discount_used,
        'cashback_earned', v_earned_amount,
        'credited_now', v_credited_now,
        'debited_now', v_debited_now,
        'expires_at', v_new_expires_at
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.revert_order_cashback(p_order_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_order RECORD;
    v_clean_phone TEXT;
    v_wallet RECORD;
    v_discount_used NUMERIC := 0.00;
    v_earned_amount NUMERIC := 0.00;
    v_already_refunded BOOLEAN := FALSE;
    v_already_reversed BOOLEAN := FALSE;
    v_cashback_refunded NUMERIC := 0.00;
    v_cashback_reversed NUMERIC := 0.00;
BEGIN
    SELECT id, tenant_id, customer_phone, customer_name, cashback_discount, cashback_earned, coupon_code, status
    INTO v_order
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Pedido não encontrado.');
    END IF;

    IF NOT (public.is_super_admin() OR auth.role() = 'service_role' OR v_order.tenant_id = public.get_auth_tenant_id()) THEN
        RAISE EXCEPTION 'Acesso negado: Você não possui permissão para estornar cashback deste pedido.';
    END IF;

    v_clean_phone := REGEXP_REPLACE(COALESCE(v_order.customer_phone, ''), '\D', '', 'g');
    IF length(v_clean_phone) < 8 THEN
        RETURN jsonb_build_object('success', true, 'message', 'Telefone do cliente não elegível.');
    END IF;

    SELECT id, balance, expires_at
    INTO v_wallet
    FROM public.customer_cashback_wallets
    WHERE tenant_id = v_order.tenant_id AND phone = v_clean_phone
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', true, 'message', 'Carteira não encontrada.');
    END IF;

    v_discount_used := COALESCE(v_order.cashback_discount, 0.00);
    v_earned_amount := COALESCE(v_order.cashback_earned, 0.00);

    SELECT EXISTS (
        SELECT 1 FROM public.customer_cashback_transactions
        WHERE wallet_id = v_wallet.id AND order_id = v_order.id AND type = 'refund'
    ) INTO v_already_refunded;

    IF v_discount_used > 0 AND NOT v_already_refunded THEN
        UPDATE public.customer_cashback_wallets
        SET balance = balance + v_discount_used,
            updated_at = NOW()
        WHERE id = v_wallet.id;

        INSERT INTO public.customer_cashback_transactions (
            wallet_id, tenant_id, order_id, amount, type, description
        )
        VALUES (
            v_wallet.id, v_order.tenant_id, v_order.id, v_discount_used, 'refund',
            'Devolução de saldo por cancelamento do pedido #' || UPPER(SUBSTRING(v_order.id, 1, 6))
        );
        v_cashback_refunded := v_discount_used;
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM public.customer_cashback_transactions
        WHERE wallet_id = v_wallet.id AND order_id = v_order.id AND type = 'reversal'
    ) INTO v_already_reversed;

    IF v_earned_amount > 0 AND NOT v_already_reversed THEN
        UPDATE public.customer_cashback_wallets
        SET balance = GREATEST(0, balance - v_earned_amount),
            updated_at = NOW()
        WHERE id = v_wallet.id;

        INSERT INTO public.customer_cashback_transactions (
            wallet_id, tenant_id, order_id, amount, type, description
        )
        VALUES (
            v_wallet.id, v_order.tenant_id, v_order.id, -v_earned_amount, 'reversal',
            'Estorno de bônus por cancelamento do pedido #' || UPPER(SUBSTRING(v_order.id, 1, 6))
        );
        v_cashback_reversed := v_earned_amount;
    END IF;

    IF v_order.coupon_code IS NOT NULL AND length(v_order.coupon_code) > 0 THEN
        DELETE FROM public.coupon_usages WHERE order_id = v_order.id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'cashback_refunded', v_cashback_refunded,
        'cashback_reversed', v_cashback_reversed
    );
END;
$function$;

-- 4. BLINDAR TODAS AS RPCs ADMINISTRATIVAS CONTRA CHAMADAS ANÔNIMAS OU CROSS-TENANT
CREATE OR REPLACE FUNCTION public.create_store_admin_user(
    p_tenant_id uuid,
    p_username text,
    p_password text,
    p_role text DEFAULT 'admin'::text,
    p_permissions jsonb DEFAULT '["*"]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth', 'extensions', 'pg_temp'
AS $function$
DECLARE
    v_tenant_slug TEXT;
    v_clean_username TEXT;
    v_email TEXT;
    v_user_id UUID;
    v_encrypted_pw TEXT;
    v_existing_id UUID;
BEGIN
    IF NOT (public.is_super_admin() OR auth.role() = 'service_role' OR (p_tenant_id = public.get_auth_tenant_id() AND public.get_auth_admin_role() IN ('admin', 'super_admin'))) THEN
        RAISE EXCEPTION 'Acesso negado: Apenas administradores da loja ou SuperAdmin podem criar usuários.';
    END IF;

    IF p_role = 'super_admin' AND NOT public.is_super_admin() THEN
        RAISE EXCEPTION 'Acesso negado: Apenas o SuperAdmin pode criar outro SuperAdmin.';
    END IF;

    SELECT slug INTO v_tenant_slug
    FROM public.tenants
    WHERE id = p_tenant_id;

    IF v_tenant_slug IS NULL THEN
        RAISE EXCEPTION 'Restaurante não encontrado para o ID informado.';
    END IF;

    v_clean_username := LOWER(TRIM(p_username));
    IF LENGTH(v_clean_username) < 2 THEN
        RAISE EXCEPTION 'O nome de usuário deve ter pelo menos 2 caracteres.';
    END IF;

    IF LENGTH(p_password) < 4 THEN
        RAISE EXCEPTION 'A senha deve ter pelo menos 4 caracteres.';
    END IF;

    v_email := v_clean_username || '@' || LOWER(TRIM(v_tenant_slug)) || '.delivery.internal';

    SELECT id INTO v_existing_id
    FROM public.tenant_admins
    WHERE tenant_id = p_tenant_id AND LOWER(username) = v_clean_username;

    IF v_existing_id IS NOT NULL THEN
        RAISE EXCEPTION 'O usuário "%" já existe neste restaurante.', p_username;
    END IF;

    v_encrypted_pw := extensions.crypt(p_password, extensions.gen_salt('bf', 10));
    v_user_id := gen_random_uuid();

    INSERT INTO auth.users (
        instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data,
        confirmation_token, recovery_token, email_change_token_new, email_change,
        phone_change, phone_change_token, email_change_token_current, reauthentication_token,
        email_change_confirm_status, is_sso_user, is_anonymous, created_at, updated_at
    ) VALUES (
        '00000000-0000-0000-0000-000000000000'::uuid, v_user_id, 'authenticated', 'authenticated',
        v_email, v_encrypted_pw, now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        jsonb_build_object('username', p_username, 'tenant_id', p_tenant_id, 'tenant_slug', v_tenant_slug, 'email_verified', true),
        '', '', '', '', '', '', '', '', 0, false, false, now(), now()
    );

    INSERT INTO auth.identities (
        id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
    ) VALUES (
        gen_random_uuid(), v_user_id,
        jsonb_build_object('sub', v_user_id::text, 'email', v_email, 'email_verified', true, 'phone_verified', false),
        'email', v_user_id::text, now(), now(), now()
    );

    INSERT INTO public.tenant_admins (id, user_id, tenant_id, role, username, is_active, created_at, updated_at)
    VALUES (gen_random_uuid(), v_user_id, p_tenant_id, p_role, p_username, true, now(), now());

    INSERT INTO public.admin_users (id, tenant_id, username, password, role, permissions, active, created_date, updated_date)
    VALUES (v_user_id, p_tenant_id, p_username, v_encrypted_pw, p_role, p_permissions, true, now(), now())
    ON CONFLICT (id) DO UPDATE SET
        username = EXCLUDED.username,
        password = EXCLUDED.password,
        role = EXCLUDED.role,
        permissions = EXCLUDED.permissions,
        updated_date = now();

    RETURN jsonb_build_object(
        'success', true,
        'user_id', v_user_id,
        'email', v_email,
        'username', p_username,
        'tenant_slug', v_tenant_slug
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_store_admin_user(
    p_user_id uuid,
    p_username text DEFAULT NULL::text,
    p_password text DEFAULT NULL::text,
    p_role text DEFAULT NULL::text,
    p_permissions jsonb DEFAULT NULL::jsonb,
    p_active boolean DEFAULT NULL::boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth', 'extensions', 'pg_temp'
AS $function$
DECLARE
    v_hashed_pw TEXT;
    v_target_tenant_id UUID;
BEGIN
    SELECT tenant_id INTO v_target_tenant_id FROM public.tenant_admins WHERE user_id = p_user_id LIMIT 1;
    IF v_target_tenant_id IS NULL THEN
        SELECT tenant_id INTO v_target_tenant_id FROM public.admin_users WHERE id = p_user_id LIMIT 1;
    END IF;

    IF NOT (public.is_super_admin() OR auth.role() = 'service_role' OR (v_target_tenant_id IS NOT NULL AND v_target_tenant_id = public.get_auth_tenant_id() AND public.get_auth_admin_role() IN ('admin', 'super_admin'))) THEN
        RAISE EXCEPTION 'Acesso negado: Você não possui permissão para alterar este usuário.';
    END IF;

    IF p_role = 'super_admin' AND NOT public.is_super_admin() THEN
        RAISE EXCEPTION 'Acesso negado: Não é permitido promover para super_admin.';
    END IF;

    IF p_password IS NOT NULL AND LENGTH(TRIM(p_password)) >= 4 THEN
        v_hashed_pw := extensions.crypt(TRIM(p_password), extensions.gen_salt('bf', 10));
        UPDATE auth.users SET encrypted_password = v_hashed_pw, updated_at = now() WHERE id = p_user_id;
        UPDATE public.admin_users SET password = v_hashed_pw, updated_date = now() WHERE id = p_user_id;
    END IF;

    IF p_username IS NOT NULL AND LENGTH(TRIM(p_username)) >= 2 THEN
        UPDATE public.tenant_admins SET username = LOWER(TRIM(p_username)), updated_at = now() WHERE user_id = p_user_id;
        UPDATE public.admin_users SET username = LOWER(TRIM(p_username)), updated_date = now() WHERE id = p_user_id;
    END IF;

    IF p_role IS NOT NULL THEN
        UPDATE public.tenant_admins SET role = p_role, updated_at = now() WHERE user_id = p_user_id;
        UPDATE public.admin_users SET role = p_role, updated_date = now() WHERE id = p_user_id;
    END IF;

    IF p_active IS NOT NULL THEN
        UPDATE public.tenant_admins SET is_active = p_active, updated_at = now() WHERE user_id = p_user_id;
        UPDATE public.admin_users SET active = p_active, updated_date = now() WHERE id = p_user_id;
    END IF;

    IF p_permissions IS NOT NULL THEN
        UPDATE public.admin_users SET permissions = p_permissions, updated_date = now() WHERE id = p_user_id;
    END IF;

    RETURN jsonb_build_object('success', true);
END;
$function$;

CREATE OR REPLACE FUNCTION public.delete_store_admin_user(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth', 'extensions', 'pg_temp'
AS $function$
DECLARE
    v_target_tenant_id UUID;
BEGIN
    SELECT tenant_id INTO v_target_tenant_id FROM public.tenant_admins WHERE user_id = p_user_id LIMIT 1;
    IF v_target_tenant_id IS NULL THEN
        SELECT tenant_id INTO v_target_tenant_id FROM public.admin_users WHERE id = p_user_id LIMIT 1;
    END IF;

    IF NOT (public.is_super_admin() OR auth.role() = 'service_role' OR (v_target_tenant_id IS NOT NULL AND v_target_tenant_id = public.get_auth_tenant_id() AND public.get_auth_admin_role() IN ('admin', 'super_admin'))) THEN
        RAISE EXCEPTION 'Acesso negado: Você não possui permissão para excluir este usuário.';
    END IF;

    IF p_user_id = auth.uid() THEN
        RAISE EXCEPTION 'Não é possível excluir seu próprio usuário logado.';
    END IF;

    DELETE FROM public.tenant_admins WHERE user_id = p_user_id;
    DELETE FROM public.admin_users WHERE id = p_user_id;
    DELETE FROM auth.identities WHERE user_id = p_user_id;
    DELETE FROM auth.users WHERE id = p_user_id;

    RETURN jsonb_build_object('success', true);
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_tenant_payment_methods(p_tenant_id uuid, p_payment_methods jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    IF NOT (public.is_super_admin() OR auth.role() = 'service_role' OR p_tenant_id = public.get_auth_tenant_id()) THEN
        RAISE EXCEPTION 'Acesso negado: Sem permissão para alterar métodos de pagamento desta loja.';
    END IF;

    UPDATE public.tenants
    SET payment_methods = p_payment_methods,
        updated_date = NOW()
    WHERE id = p_tenant_id;

    RETURN jsonb_build_object('success', true, 'tenant_id', p_tenant_id, 'payment_methods', p_payment_methods);
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_tenant_delivery_drivers(p_tenant_id uuid, p_drivers jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_result jsonb;
BEGIN
    IF NOT (public.is_super_admin() OR auth.role() = 'service_role' OR p_tenant_id = public.get_auth_tenant_id()) THEN
        RAISE EXCEPTION 'Acesso negado: Sem permissão para alterar entregadores desta loja.';
    END IF;

    UPDATE public.tenants
    SET delivery_drivers = p_drivers,
        updated_date = now()
    WHERE id = p_tenant_id
    RETURNING delivery_drivers INTO v_result;

    RETURN jsonb_build_object('success', true, 'delivery_drivers', v_result);
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_tenant_settings(p_tenant_id uuid, p_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_updated_tenant JSONB;
BEGIN
    IF NOT (public.is_super_admin() OR auth.role() = 'service_role' OR p_tenant_id = public.get_auth_tenant_id()) THEN
        RAISE EXCEPTION 'Acesso negado: Sem permissão para alterar configurações desta loja.';
    END IF;

    UPDATE public.tenants
    SET 
        name = COALESCE(p_data->>'name', name),
        logo_url = CASE WHEN p_data ? 'logo_url' THEN p_data->>'logo_url' ELSE logo_url END,
        opening_time = COALESCE(p_data->>'opening_time', opening_time),
        closing_time = COALESCE(p_data->>'closing_time', closing_time),
        open_days = CASE WHEN p_data ? 'open_days' THEN p_data->'open_days' ELSE open_days END,
        delivery_time = CASE WHEN p_data ? 'delivery_time' THEN p_data->>'delivery_time' ELSE delivery_time END,
        salon_mode = CASE WHEN p_data ? 'salon_mode' THEN p_data->>'salon_mode' ELSE salon_mode END,
        auto_accept_delivery = CASE WHEN p_data ? 'auto_accept_delivery' THEN (p_data->>'auto_accept_delivery')::boolean ELSE auto_accept_delivery END,
        cashback_enabled = CASE WHEN p_data ? 'cashback_enabled' THEN (p_data->>'cashback_enabled')::boolean ELSE cashback_enabled END,
        cashback_rate = CASE WHEN p_data ? 'cashback_rate' THEN (p_data->>'cashback_rate')::numeric ELSE cashback_rate END,
        cashback_validity_days = CASE WHEN p_data ? 'cashback_validity_days' THEN (p_data->>'cashback_validity_days')::integer ELSE cashback_validity_days END,
        cashback_max_discount_percentage = CASE WHEN p_data ? 'cashback_max_discount_percentage' THEN (p_data->>'cashback_max_discount_percentage')::numeric ELSE cashback_max_discount_percentage END,
        manual_store_open = CASE 
            WHEN p_data ? 'manual_store_open' THEN 
                CASE WHEN (p_data->>'manual_store_open') IS NULL THEN NULL ELSE (p_data->>'manual_store_open')::boolean END
            ELSE manual_store_open 
        END,
        manual_override_date = CASE 
            WHEN p_data ? 'manual_override_date' THEN 
                CASE WHEN (p_data->>'manual_override_date') IS NULL THEN NULL ELSE p_data->>'manual_override_date' END
            ELSE manual_override_date 
        END,
        address = COALESCE(p_data->>'address', address),
        cep = CASE WHEN p_data ? 'cep' THEN p_data->>'cep' ELSE cep END,
        address_street = CASE WHEN p_data ? 'address_street' THEN p_data->>'address_street' ELSE address_street END,
        address_number = CASE WHEN p_data ? 'address_number' THEN p_data->>'address_number' ELSE address_number END,
        address_neighborhood = CASE WHEN p_data ? 'address_neighborhood' THEN p_data->>'address_neighborhood' ELSE address_neighborhood END,
        address_city = CASE WHEN p_data ? 'address_city' THEN p_data->>'address_city' ELSE address_city END,
        address_state = CASE WHEN p_data ? 'address_state' THEN p_data->>'address_state' ELSE address_state END,
        address_complement = CASE WHEN p_data ? 'address_complement' THEN p_data->>'address_complement' ELSE address_complement END,
        instagram = CASE WHEN p_data ? 'instagram' THEN p_data->>'instagram' ELSE instagram END,
        whatsapp = CASE WHEN p_data ? 'whatsapp' THEN p_data->>'whatsapp' ELSE whatsapp END,
        delivery_fee = CASE WHEN p_data ? 'delivery_fee' THEN (p_data->>'delivery_fee')::numeric ELSE delivery_fee END,
        min_order_value = CASE WHEN p_data ? 'min_order_value' THEN (p_data->>'min_order_value')::numeric ELSE min_order_value END,
        delivery_fee_type = COALESCE(p_data->>'delivery_fee_type', delivery_fee_type),
        delivery_neighborhoods = CASE WHEN p_data ? 'delivery_neighborhoods' THEN p_data->'delivery_neighborhoods' ELSE delivery_neighborhoods END,
        delivery_unlisted_policy = COALESCE(p_data->>'delivery_unlisted_policy', delivery_unlisted_policy),
        delivery_fallback_fee = CASE WHEN p_data ? 'delivery_fallback_fee' THEN (p_data->>'delivery_fallback_fee')::numeric ELSE delivery_fallback_fee END,
        free_delivery_threshold = CASE WHEN p_data ? 'free_delivery_threshold' AND (p_data->>'free_delivery_threshold') IS NOT NULL AND (p_data->>'free_delivery_threshold') != '' THEN (p_data->>'free_delivery_threshold')::numeric ELSE free_delivery_threshold END,
        payment_methods = CASE WHEN p_data ? 'payment_methods' THEN p_data->'payment_methods' ELSE payment_methods END,
        accepts_delivery = CASE WHEN p_data ? 'accepts_delivery' THEN (p_data->>'accepts_delivery')::boolean ELSE accepts_delivery END,
        accepts_takeaway = CASE WHEN p_data ? 'accepts_takeaway' THEN (p_data->>'accepts_takeaway')::boolean ELSE accepts_takeaway END,
        accepts_dine_in = CASE WHEN p_data ? 'accepts_dine_in' THEN (p_data->>'accepts_dine_in')::boolean ELSE accepts_dine_in END,
        pizza_pricing_rule = COALESCE(p_data->>'pizza_pricing_rule', pizza_pricing_rule),
        table_service_fee_enabled = CASE WHEN p_data ? 'table_service_fee_enabled' THEN (p_data->>'table_service_fee_enabled')::boolean ELSE table_service_fee_enabled END,
        table_service_fee_rate = CASE WHEN p_data ? 'table_service_fee_rate' THEN (p_data->>'table_service_fee_rate')::numeric ELSE table_service_fee_rate END,
        updated_date = NOW()
    WHERE id = p_tenant_id;

    SELECT to_jsonb(t.*) INTO v_updated_tenant FROM public.tenants t WHERE t.id = p_tenant_id;
    RETURN v_updated_tenant;
END;
$function$;

CREATE OR REPLACE FUNCTION public.generate_default_tables(p_tenant_id uuid, p_count integer DEFAULT 10)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_i INT;
  v_created INT := 0;
BEGIN
  IF NOT (public.is_super_admin() OR auth.role() = 'service_role' OR p_tenant_id = public.get_auth_tenant_id()) THEN
    RAISE EXCEPTION 'Acesso negado para gerar mesas nesta loja.';
  END IF;

  FOR v_i IN 1..p_count LOOP
    INSERT INTO public.restaurant_tables (tenant_id, table_number, label, capacity, status)
    VALUES (p_tenant_id, v_i::TEXT, 'Salão Principal', 4, 'available')
    ON CONFLICT (tenant_id, table_number) DO NOTHING;
    IF FOUND THEN v_created := v_created + 1; END IF;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'created', v_created);
END;
$function$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_table_sessions_active_table
ON public.table_sessions (table_id)
WHERE (status IN ('open', 'bill_requested'));

CREATE OR REPLACE FUNCTION public.open_table_session(
    p_tenant_id uuid,
    p_table_id uuid,
    p_customer_name text DEFAULT NULL::text,
    p_customer_phone text DEFAULT NULL::text,
    p_people_count integer DEFAULT 1
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_table RECORD;
  v_existing RECORD;
  v_session_id UUID;
  v_result JSONB;
BEGIN
  IF NOT (public.is_super_admin() OR auth.role() = 'service_role' OR p_tenant_id = public.get_auth_tenant_id()) THEN
    RAISE EXCEPTION 'Acesso negado para abrir mesa nesta loja.';
  END IF;

  -- Lock exclusivo na mesa física para impedir sessões duplicadas em chamadas simultâneas
  SELECT * INTO v_table FROM public.restaurant_tables 
  WHERE id = p_table_id AND tenant_id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Mesa não encontrada');
  END IF;

  SELECT * INTO v_existing
  FROM public.table_sessions
  WHERE table_id = p_table_id AND tenant_id = p_tenant_id AND status IN ('open', 'bill_requested')
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object('success', true, 'already_open', true, 'session', to_jsonb(v_existing));
  END IF;

  INSERT INTO public.table_sessions (
    tenant_id, table_id, table_number, customer_name, customer_phone, people_count, status
  ) VALUES (
    p_tenant_id, p_table_id, v_table.table_number, p_customer_name, p_customer_phone, p_people_count, 'open'
  ) RETURNING id INTO v_session_id;

  UPDATE public.restaurant_tables 
  SET status = 'occupied', updated_at = now()
  WHERE id = p_table_id;

  SELECT to_jsonb(s.*) INTO v_result FROM public.table_sessions s WHERE s.id = v_session_id;
  RETURN jsonb_build_object('success', true, 'session', v_result);
END;
$function$;

CREATE OR REPLACE FUNCTION public.close_table_session(
    p_tenant_id uuid,
    p_session_id uuid,
    p_payment_method text DEFAULT 'money'::text,
    p_payment_details jsonb DEFAULT '[]'::jsonb,
    p_service_fee numeric DEFAULT 0,
    p_discount numeric DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_session RECORD;
  v_subtotal NUMERIC := 0;
  v_total NUMERIC := 0;
BEGIN
  IF NOT (public.is_super_admin() OR auth.role() = 'service_role' OR p_tenant_id = public.get_auth_tenant_id()) THEN
    RAISE EXCEPTION 'Acesso negado para fechar mesa nesta loja.';
  END IF;

  SELECT * INTO v_session FROM public.table_sessions 
  WHERE id = p_session_id AND tenant_id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sessão não encontrada');
  END IF;

  SELECT COALESCE(SUM(total_amount), 0) INTO v_subtotal
  FROM public.orders 
  WHERE table_session_id = p_session_id AND status != 'cancelado';

  v_total := v_subtotal + COALESCE(p_service_fee, 0) - COALESCE(p_discount, 0);
  IF v_total < 0 THEN v_total := 0; END IF;

  UPDATE public.table_sessions
  SET 
    subtotal = v_subtotal,
    service_fee = COALESCE(p_service_fee, 0),
    discount = COALESCE(p_discount, 0),
    total_amount = v_total,
    status = 'closed',
    closed_at = now(),
    payment_method = p_payment_method,
    payment_details = p_payment_details,
    updated_at = now()
  WHERE id = p_session_id;

  UPDATE public.restaurant_tables
  SET status = 'available', updated_at = now()
  WHERE id = v_session.table_id;

  UPDATE public.orders
  SET payment_status = 'paid', status = 'entregue'
  WHERE table_session_id = p_session_id AND status != 'cancelado';

  RETURN jsonb_build_object('success', true, 'total_amount', v_total);
END;
$function$;

CREATE OR REPLACE FUNCTION public.auto_deliver_stale_orders(p_tenant_id uuid DEFAULT NULL::uuid, p_timeout_hours integer DEFAULT 2)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_stale_order RECORD;
    v_auto_count INTEGER := 0;
    v_order_ids TEXT[] := ARRAY[]::TEXT[];
    v_effective_tenant UUID;
BEGIN
    IF public.is_super_admin() OR auth.role() = 'service_role' THEN
        v_effective_tenant := p_tenant_id;
    ELSIF public.get_auth_tenant_id() IS NOT NULL THEN
        v_effective_tenant := public.get_auth_tenant_id();
    ELSE
        RAISE EXCEPTION 'Acesso negado: Apenas lojistas autenticados podem finalizar pedidos.';
    END IF;

    FOR v_stale_order IN
        SELECT id, order_number, tenant_id, cashback_earned, dispatched_at, created_date
        FROM public.orders
        WHERE status = 'enviado'
          AND (v_effective_tenant IS NULL OR tenant_id = v_effective_tenant)
          AND (
            (dispatched_at IS NOT NULL AND dispatched_at < NOW() - (p_timeout_hours || ' hours')::INTERVAL)
            OR
            (dispatched_at IS NULL AND created_date < NOW() - ((p_timeout_hours + 1) || ' hours')::INTERVAL)
          )
    LOOP
        UPDATE public.orders
        SET status = 'entregue',
            delivered_at = NOW(),
            updated_date = NOW()
        WHERE id = v_stale_order.id;

        IF COALESCE(v_stale_order.cashback_earned, 0) > 0 THEN
            PERFORM public.process_order_cashback(v_stale_order.id, 'credit_only');
        END IF;

        v_auto_count := v_auto_count + 1;
        v_order_ids := array_append(v_order_ids, v_stale_order.id);
    END LOOP;

    RETURN jsonb_build_object('success', true, 'auto_delivered_count', v_auto_count, 'order_ids', v_order_ids);
END;
$function$;

CREATE OR REPLACE FUNCTION public.resolve_system_issue(p_issue_id uuid, p_resolved_by text DEFAULT 'SuperAdmin'::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_updated JSONB;
BEGIN
    IF NOT (public.is_super_admin() OR auth.role() = 'service_role') THEN
        RAISE EXCEPTION 'Acesso negado: Apenas SuperAdmin pode resolver pendências.';
    END IF;

    UPDATE public.system_issues
    SET status = 'resolved', resolved_at = NOW(), resolved_by = COALESCE(p_resolved_by, 'SuperAdmin')
    WHERE id = p_issue_id
    RETURNING to_jsonb(system_issues.*) INTO v_updated;
    RETURN v_updated;
END;
$function$;

CREATE OR REPLACE FUNCTION public.reopen_system_issue(p_issue_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_updated JSONB;
BEGIN
    IF NOT (public.is_super_admin() OR auth.role() = 'service_role') THEN
        RAISE EXCEPTION 'Acesso negado: Apenas SuperAdmin pode reabrir pendências.';
    END IF;

    UPDATE public.system_issues
    SET status = 'open', resolved_at = NULL, resolved_by = NULL
    WHERE id = p_issue_id
    RETURNING to_jsonb(system_issues.*) INTO v_updated;
    RETURN v_updated;
END;
$function$;

CREATE OR REPLACE FUNCTION public.report_system_issue(
    p_title text,
    p_description text DEFAULT NULL::text,
    p_severity text DEFAULT 'urgent'::text,
    p_source text DEFAULT 'manual'::text,
    p_path text DEFAULT NULL::text,
    p_tenant_id uuid DEFAULT NULL::uuid,
    p_tenant_name text DEFAULT NULL::text,
    p_sentry_event_id text DEFAULT NULL::text,
    p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_issue JSONB;
BEGIN
    INSERT INTO public.system_issues (
        title, description, severity, status, source, path, tenant_id, tenant_name, sentry_event_id, metadata
    ) VALUES (
        LEFT(COALESCE(p_title, 'Erro'), 200),
        LEFT(p_description, 4000),
        CASE WHEN p_severity IN ('urgent', 'warning', 'info') THEN p_severity ELSE 'urgent' END,
        'open',
        COALESCE(p_source, 'manual'),
        p_path,
        p_tenant_id,
        p_tenant_name,
        p_sentry_event_id,
        COALESCE(p_metadata, '{}'::jsonb)
    )
    RETURNING to_jsonb(system_issues.*) INTO v_issue;

    RETURN v_issue;
END;
$function$;

CREATE OR REPLACE FUNCTION public.request_whatsapp_otp(p_phone text, p_full_name text DEFAULT ''::text, p_tenant_id uuid DEFAULT NULL::uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_clean_phone TEXT;
    v_tenant_id UUID;
    v_code TEXT;
    v_expires_at TIMESTAMPTZ;
BEGIN
    v_clean_phone := regexp_replace(COALESCE(p_phone, ''), '\D', '', 'g');
    IF LENGTH(v_clean_phone) < 10 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Número de WhatsApp inválido (mínimo 10 dígitos com DDD).');
    END IF;

    v_tenant_id := COALESCE(p_tenant_id, 'a0000000-0000-0000-0000-000000000001'::uuid);
    v_code := LPAD(FLOOR(RANDOM() * 900000 + 100000)::TEXT, 6, '0');
    v_expires_at := NOW() + INTERVAL '10 minutes';

    UPDATE public.whatsapp_otp_codes SET verified = TRUE WHERE phone = v_clean_phone AND verified = FALSE;

    INSERT INTO public.whatsapp_otp_codes (tenant_id, phone, code, attempts, verified, expires_at, created_at)
    VALUES (v_tenant_id, v_clean_phone, v_code, 0, FALSE, v_expires_at, NOW());

    RETURN jsonb_build_object(
        'success', true,
        'phone', v_clean_phone,
        'code', v_code,
        'expires_in_seconds', 600,
        'message', 'Código de verificação gerado com sucesso.'
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.verify_whatsapp_otp(p_phone text, p_code text, p_full_name text DEFAULT ''::text, p_tenant_id uuid DEFAULT NULL::uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_clean_phone TEXT;
    v_clean_code TEXT;
    v_tenant_id UUID;
    v_otp RECORD;
    v_final_name TEXT;
    v_customer RECORD;
BEGIN
    v_clean_phone := regexp_replace(COALESCE(p_phone, ''), '\D', '', 'g');
    v_clean_code := TRIM(COALESCE(p_code, ''));
    v_tenant_id := COALESCE(p_tenant_id, 'a0000000-0000-0000-0000-000000000001'::uuid);

    IF LENGTH(v_clean_phone) < 10 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Número de WhatsApp inválido.');
    END IF;

    IF LENGTH(v_clean_code) < 4 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Informe o código recebido.');
    END IF;

    SELECT * INTO v_otp
    FROM public.whatsapp_otp_codes
    WHERE phone = v_clean_phone AND verified = FALSE AND expires_at > NOW()
    ORDER BY created_at DESC
    LIMIT 1
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Código expirado ou não encontrado. Solicite um novo código.');
    END IF;

    IF v_otp.attempts >= 5 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Muitas tentativas incorretas. Solicite um novo código.');
    END IF;

    IF v_otp.code <> v_clean_code THEN
        UPDATE public.whatsapp_otp_codes SET attempts = attempts + 1 WHERE id = v_otp.id;
        RETURN jsonb_build_object('success', false, 'error', 'Código incorreto. Verifique os dígitos digitados.');
    END IF;

    UPDATE public.whatsapp_otp_codes SET verified = TRUE WHERE id = v_otp.id;

    v_final_name := TRIM(COALESCE(p_full_name, ''));
    IF v_final_name = '' OR v_final_name = 'Cliente' THEN
        SELECT full_name INTO v_final_name
        FROM public.customers WHERE tenant_id = v_tenant_id AND phone = v_clean_phone LIMIT 1;
        IF v_final_name IS NULL OR v_final_name = '' THEN v_final_name := 'Cliente'; END IF;
    END IF;

    INSERT INTO public.customers (tenant_id, phone, full_name, created_date, updated_date)
    VALUES (v_tenant_id, v_clean_phone, v_final_name, NOW(), NOW())
    ON CONFLICT (tenant_id, phone) DO UPDATE
    SET full_name = CASE WHEN EXCLUDED.full_name <> 'Cliente' THEN EXCLUDED.full_name ELSE public.customers.full_name END,
        updated_date = NOW()
    RETURNING * INTO v_customer;

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Conta verificada com sucesso!',
        'customer', jsonb_build_object(
            'id', v_customer.id,
            'tenant_id', v_customer.tenant_id,
            'phone', v_customer.phone,
            'full_name', v_customer.full_name,
            'email', COALESCE(v_customer.email, ''),
            'role', 'user'
        )
    );
END;
$function$;

-- Revogar acesso anônimo às RPCs administrativas
REVOKE ALL ON FUNCTION public.create_store_admin_user(uuid, text, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_store_admin_user(uuid, text, text, text, jsonb) TO authenticated;

REVOKE ALL ON FUNCTION public.update_store_admin_user(uuid, text, text, text, jsonb, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_store_admin_user(uuid, text, text, text, jsonb, boolean) TO authenticated;

REVOKE ALL ON FUNCTION public.delete_store_admin_user(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_store_admin_user(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.update_tenant_payment_methods(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_tenant_payment_methods(uuid, jsonb) TO authenticated;

REVOKE ALL ON FUNCTION public.update_tenant_delivery_drivers(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_tenant_delivery_drivers(uuid, jsonb) TO authenticated;

REVOKE ALL ON FUNCTION public.update_tenant_settings(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_tenant_settings(uuid, jsonb) TO authenticated;

REVOKE ALL ON FUNCTION public.generate_default_tables(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_default_tables(uuid, integer) TO authenticated;

REVOKE ALL ON FUNCTION public.open_table_session(uuid, uuid, text, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.open_table_session(uuid, uuid, text, text, integer) TO authenticated;

REVOKE ALL ON FUNCTION public.close_table_session(uuid, uuid, text, jsonb, numeric, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.close_table_session(uuid, uuid, text, jsonb, numeric, numeric) TO authenticated;

REVOKE ALL ON FUNCTION public.auto_deliver_stale_orders(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.auto_deliver_stale_orders(uuid, integer) TO authenticated;

REVOKE ALL ON FUNCTION public.process_order_cashback(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.process_order_cashback(text, text) TO authenticated;

REVOKE ALL ON FUNCTION public.revert_order_cashback(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revert_order_cashback(text) TO authenticated;

REVOKE ALL ON FUNCTION public.resolve_system_issue(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_system_issue(uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION public.reopen_system_issue(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reopen_system_issue(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.generate_spooler_pairing_code(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_spooler_pairing_code(uuid) TO authenticated;

-- 5. TRIGGER DE NUMERAÇÃO ATÔMICA POR TENANT + OTIMIZAÇÃO DO PRINT JOBS TRIGGER
ALTER TABLE public.orders ALTER COLUMN order_number DROP DEFAULT;

CREATE OR REPLACE FUNCTION public.fn_orders_assign_tenant_order_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    IF NEW.order_number IS NULL AND NEW.tenant_id IS NOT NULL THEN
        PERFORM pg_advisory_xact_lock(hashtext('order_num_' || NEW.tenant_id::text));
        SELECT COALESCE(MAX(order_number), 0) + 1
        INTO NEW.order_number
        FROM public.orders
        WHERE tenant_id = NEW.tenant_id;
    END IF;
    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_orders_assign_tenant_order_number ON public.orders;
CREATE TRIGGER trg_orders_assign_tenant_order_number
BEFORE INSERT ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.fn_orders_assign_tenant_order_number();

-- Otimiza trigger de print_jobs para não disparar em updates de print_status / payment_status irrelevantes
DROP TRIGGER IF EXISTS trg_orders_sync_print_jobs ON public.orders;
CREATE TRIGGER trg_orders_sync_print_jobs
AFTER INSERT OR UPDATE OF status, items, order_type, table_number ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.fn_orders_sync_print_jobs();

-- 6. CHECKOUT PÚBLICO SERVIDOR-VALIDADO COMPLETO (ATÔMICO, COM LOCK DE ORDER_NUMBER, CUPOM, CASHBACK E MESA)
DROP FUNCTION IF EXISTS public.create_public_order(uuid, text, text, text, text, text, jsonb, text, text, text);

CREATE OR REPLACE FUNCTION public.create_public_order(
    p_tenant_id uuid,
    p_customer_name text,
    p_customer_phone text,
    p_delivery_type text,
    p_delivery_address text,
    p_payment_method text,
    p_items jsonb,
    p_coupon_code text DEFAULT NULL::text,
    p_notes text DEFAULT NULL::text,
    p_table_number text DEFAULT NULL::text,
    p_neighborhood text DEFAULT NULL::text,
    p_use_cashback boolean DEFAULT false,
    p_cashback_amount numeric DEFAULT NULL::numeric,
    p_card_brand text DEFAULT NULL::text,
    p_change_for text DEFAULT NULL::text,
    p_customer_email text DEFAULT NULL::text,
    p_order_id text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_tenant RECORD;
    v_order_id TEXT;
    v_order_number INT;
    v_tracking_token UUID := gen_random_uuid();
    v_subtotal NUMERIC(10,2) := 0;
    v_delivery_fee NUMERIC(10,2) := 0;
    v_discount NUMERIC(10,2) := 0;
    v_cashback_discount NUMERIC(10,2) := 0;
    v_cashback_earned NUMERIC(10,2) := 0;
    v_total NUMERIC(10,2) := 0;
    v_item JSONB;
    v_prod_id TEXT;
    v_qty NUMERIC(10,2);
    v_db_product RECORD;
    v_db_category RECORD;
    v_unit_price NUMERIC(10,2);
    v_add_total NUMERIC(10,2);
    v_add JSONB;
    v_add_price NUMERIC(10,2);
    v_verified_adds JSONB;
    v_item_subtotal NUMERIC(10,2);
    v_verified_items JSONB := '[]'::jsonb;
    v_coupon RECORD;
    v_clean_phone TEXT := regexp_replace(COALESCE(p_customer_phone, ''), '\D', '', 'g');
    v_coupon_usages_count INT := 0;
    v_wallet RECORD;
    v_after_coupon NUMERIC(10,2);
    v_max_cb_allowed NUMERIC(10,2);
    v_norm_type TEXT := LOWER(COALESCE(p_delivery_type, 'delivery'));
    v_is_dine_in BOOLEAN := FALSE;
    v_is_pickup BOOLEAN := FALSE;
    v_table_rec RECORD;
    v_table_session_id UUID := NULL;
    v_clean_table_num TEXT := NULL;
    v_initial_status TEXT := 'pendente';
    v_payment_status TEXT := 'pending_delivery';
    v_neigh_item JSONB;
    v_matched_neigh BOOLEAN := FALSE;
    v_flavors JSONB;
    v_flavor JSONB;
    v_flavor_price NUMERIC(10,2);
    v_flavor_sum NUMERIC(10,2);
    v_flavor_max NUMERIC(10,2);
    v_flavor_cnt INT;
    v_size_key TEXT;
    v_resolved_sector_id UUID;
BEGIN
    SELECT *
    INTO v_tenant
    FROM public.tenants
    WHERE id = p_tenant_id;

    IF NOT FOUND OR NOT v_tenant.is_active THEN
        RETURN jsonb_build_object('success', false, 'message', 'Restaurante indisponível no momento.');
    END IF;

    IF COALESCE(v_tenant.salon_mode, 'full') = 'showcase' OR COALESCE(v_tenant.plan, '') = 'showcase' THEN
        RETURN jsonb_build_object('success', false, 'message', 'Este cardápio funciona apenas em modo vitrine e não recebe pedidos online.');
    END IF;

    v_is_dine_in := v_norm_type IN ('dine_in', 'mesa') OR (NULLIF(TRIM(COALESCE(p_table_number, '')), '') IS NOT NULL AND LOWER(TRIM(p_table_number)) NOT LIKE '%balc%');
    v_is_pickup := NOT v_is_dine_in AND v_norm_type IN ('pickup', 'balcao', 'takeaway');

    IF v_is_dine_in AND COALESCE(v_tenant.accepts_dine_in, true) = false THEN
        RETURN jsonb_build_object('success', false, 'message', 'Pedidos na mesa estão desativados para esta loja.');
    ELSIF v_is_pickup AND COALESCE(v_tenant.accepts_takeaway, true) = false THEN
        RETURN jsonb_build_object('success', false, 'message', 'Retirada no balcão está desativada para esta loja.');
    ELSIF NOT v_is_dine_in AND NOT v_is_pickup THEN
        IF COALESCE(v_tenant.salon_mode, 'full') = 'table_only' OR COALESCE(v_tenant.accepts_delivery, true) = false THEN
            RETURN jsonb_build_object('success', false, 'message', 'Delivery não está disponível para este estabelecimento.');
        END IF;
    END IF;

    IF NOT v_is_dine_in AND (TRIM(COALESCE(p_customer_name, '')) = '' OR LENGTH(v_clean_phone) < 8) THEN
        RETURN jsonb_build_object('success', false, 'message', 'Nome e telefone válidos são obrigatórios.');
    END IF;

    IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
        RETURN jsonb_build_object('success', false, 'message', 'O pedido deve conter pelo menos um item.');
    END IF;

    -- Recalcular preços oficiais de cada item, pizza e adicional diretamente do banco
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_prod_id := v_item->>'product_id';
        v_qty := COALESCE((v_item->>'quantity')::numeric, 1);

        IF v_qty <= 0 OR v_qty > 200 THEN
            RETURN jsonb_build_object('success', false, 'message', 'Quantidade inválida para um dos itens.');
        END IF;

        SELECT id, name, price, available, category_id, category, pizza_prices, sector_id
        INTO v_db_product
        FROM public.products
        WHERE id = v_prod_id AND tenant_id = p_tenant_id;

        IF NOT FOUND THEN
            RETURN jsonb_build_object('success', false, 'message', 'Produto não encontrado no cardápio desta loja.');
        END IF;

        IF NOT v_db_product.available THEN
            RETURN jsonb_build_object('success', false, 'message', 'O item ' || v_db_product.name || ' não está disponível.');
        END IF;

        SELECT id, type, sector_id INTO v_db_category
        FROM public.categories
        WHERE id = COALESCE(v_db_product.category_id, v_db_product.category) AND tenant_id = p_tenant_id
        LIMIT 1;

        v_resolved_sector_id := COALESCE(v_db_product.sector_id, v_db_category.sector_id);
        v_unit_price := COALESCE(v_db_product.price, 0);

        -- Suporte a preços por tamanho de pizza
        v_size_key := NULLIF(TRIM(COALESCE(v_item->>'size_id', v_item->>'pizza_size_id', '')), '');
        v_flavors := v_item->'pizza_flavors';

        IF v_flavors IS NOT NULL AND jsonb_typeof(v_flavors) = 'array' AND jsonb_array_length(v_flavors) > 0 AND v_size_key IS NOT NULL THEN
            v_flavor_sum := 0;
            v_flavor_max := 0;
            v_flavor_cnt := 0;
            FOR v_flavor IN SELECT * FROM jsonb_array_elements(v_flavors) LOOP
                SELECT COALESCE((p.pizza_prices->>v_size_key)::numeric, p.price, 0)
                INTO v_flavor_price
                FROM public.products p
                WHERE p.id = COALESCE(v_flavor->>'product_id', v_flavor->>'id') AND p.tenant_id = p_tenant_id;
                IF FOUND THEN
                    v_flavor_sum := v_flavor_sum + v_flavor_price;
                    IF v_flavor_price > v_flavor_max THEN v_flavor_max := v_flavor_price; END IF;
                    v_flavor_cnt := v_flavor_cnt + 1;
                END IF;
            END LOOP;
            IF v_flavor_cnt > 0 THEN
                IF COALESCE(v_tenant.pizza_pricing_rule, 'highest_price') = 'average' THEN
                    v_unit_price := ROUND(v_flavor_sum / v_flavor_cnt, 2);
                ELSE
                    v_unit_price := v_flavor_max;
                END IF;
            END IF;
        ELSIF v_size_key IS NOT NULL AND v_db_product.pizza_prices IS NOT NULL AND (v_db_product.pizza_prices ? v_size_key) THEN
            v_unit_price := COALESCE((v_db_product.pizza_prices->>v_size_key)::numeric, v_unit_price);
        END IF;

        -- Adicionais e Complementos oficiais do banco
        v_add_total := 0;
        v_verified_adds := '[]'::jsonb;
        IF v_item->'additionals' IS NOT NULL AND jsonb_typeof(v_item->'additionals') = 'array' THEN
            FOR v_add IN SELECT * FROM jsonb_array_elements(v_item->'additionals') LOOP
                v_add_price := NULL;

                IF NULLIF(v_add->>'id', '') IS NOT NULL THEN
                    SELECT ci.price INTO v_add_price
                    FROM public.complement_items ci
                    WHERE ci.id = v_add->>'id' AND ci.tenant_id = p_tenant_id AND ci.active = true
                    LIMIT 1;
                END IF;

                IF v_add_price IS NULL AND NULLIF(v_add->>'name', '') IS NOT NULL THEN
                    SELECT ci.price INTO v_add_price
                    FROM public.complement_items ci
                    WHERE ci.tenant_id = p_tenant_id AND LOWER(TRIM(ci.name)) = LOWER(TRIM(v_add->>'name')) AND ci.active = true
                    LIMIT 1;
                END IF;

                IF v_add_price IS NULL AND NULLIF(v_add->>'name', '') IS NOT NULL THEN
                    SELECT pa.price INTO v_add_price
                    FROM public.product_additionals pa
                    WHERE pa.tenant_id = p_tenant_id AND pa.product_id = v_db_product.id AND LOWER(TRIM(pa.name)) = LOWER(TRIM(v_add->>'name')) AND pa.active = true
                    LIMIT 1;
                END IF;

                v_add_price := GREATEST(0, COALESCE(v_add_price, 0));
                v_add_total := v_add_total + (v_add_price * GREATEST(1, COALESCE((v_add->>'quantity')::numeric, 1)));
                v_verified_adds := v_verified_adds || jsonb_build_object(
                    'id', v_add->>'id',
                    'name', COALESCE(v_add->>'name', 'Adicional'),
                    'price', v_add_price,
                    'quantity', GREATEST(1, COALESCE((v_add->>'quantity')::numeric, 1))
                );
            END LOOP;
        END IF;

        v_item_subtotal := ROUND((v_unit_price + v_add_total) * v_qty, 2);
        v_subtotal := v_subtotal + v_item_subtotal;

        v_verified_items := v_verified_items || jsonb_build_object(
            'product_id', v_db_product.id,
            'product_name', COALESCE(NULLIF(v_item->>'product_name', ''), v_db_product.name),
            'product_price', v_unit_price,
            'category_id', COALESCE(v_db_product.category_id, v_db_product.category),
            'sector_id', v_resolved_sector_id,
            'quantity', v_qty,
            'subtotal', v_item_subtotal,
            'additionals', v_verified_adds,
            'notes', COALESCE(v_item->>'notes', '')
        );
    END LOOP;

    -- Taxa de entrega oficial
    IF NOT v_is_dine_in AND NOT v_is_pickup THEN
        IF v_tenant.free_delivery_threshold IS NOT NULL AND v_tenant.free_delivery_threshold > 0 AND v_subtotal >= v_tenant.free_delivery_threshold THEN
            v_delivery_fee := 0;
        ELSIF COALESCE(v_tenant.delivery_fee_type, 'fixed') = 'neighborhood' AND NULLIF(TRIM(COALESCE(p_neighborhood, '')), '') IS NOT NULL THEN
            v_matched_neigh := FALSE;
            IF jsonb_typeof(v_tenant.delivery_neighborhoods) = 'array' THEN
                FOR v_neigh_item IN SELECT * FROM jsonb_array_elements(v_tenant.delivery_neighborhoods) LOOP
                    IF LOWER(TRIM(COALESCE(v_neigh_item->>'name', ''))) = LOWER(TRIM(p_neighborhood)) THEN
                        v_delivery_fee := GREATEST(0, COALESCE((v_neigh_item->>'fee')::numeric, 0));
                        v_matched_neigh := TRUE;
                        EXIT;
                    END IF;
                END LOOP;
            END IF;
            IF NOT v_matched_neigh THEN
                IF COALESCE(v_tenant.delivery_unlisted_policy, 'block') = 'block' THEN
                    RETURN jsonb_build_object('success', false, 'message', 'Bairro fora da área de entrega desta loja.');
                ELSE
                    v_delivery_fee := GREATEST(0, COALESCE(v_tenant.delivery_fallback_fee, v_tenant.delivery_fee, 0));
                END IF;
            END IF;
        ELSE
            v_delivery_fee := GREATEST(0, COALESCE(v_tenant.delivery_fee, 0));
        END IF;
    ELSE
        v_delivery_fee := 0;
    END IF;

    -- Cupom de desconto com lock FOR UPDATE e respeito a usage_limit
    IF NOT v_is_dine_in AND p_coupon_code IS NOT NULL AND TRIM(p_coupon_code) <> '' THEN
        SELECT * INTO v_coupon
        FROM public.coupons
        WHERE tenant_id = p_tenant_id
          AND LOWER(code) = LOWER(TRIM(p_coupon_code))
          AND active = true
          AND (start_date IS NULL OR start_date <= now())
          AND (end_date IS NULL OR end_date >= now())
        FOR UPDATE;

        IF NOT FOUND THEN
            RETURN jsonb_build_object('success', false, 'message', 'Cupom inválido, expirado ou inativo.');
        END IF;

        IF v_coupon.usage_limit IS NOT NULL THEN
            SELECT COUNT(*) INTO v_coupon_usages_count
            FROM public.coupon_usages
            WHERE tenant_id = p_tenant_id AND coupon_id = v_coupon.id;

            IF v_coupon_usages_count >= v_coupon.usage_limit THEN
                RETURN jsonb_build_object('success', false, 'message', 'Este cupom atingiu o limite máximo de utilizações.');
            END IF;
        END IF;

        IF v_coupon.min_order_value IS NOT NULL AND (v_subtotal + v_delivery_fee) < v_coupon.min_order_value THEN
            RETURN jsonb_build_object('success', false, 'message', 'Pedido mínimo de R$ ' || v_coupon.min_order_value || ' necessário para este cupom.');
        END IF;

        IF v_coupon.discount_type = 'percentage' THEN
            v_discount := ROUND((v_subtotal * (v_coupon.discount_value / 100.0)), 2);
        ELSE
            v_discount := LEAST(v_coupon.discount_value, v_subtotal);
        END IF;
    END IF;

    IF NOT v_is_dine_in AND COALESCE(v_tenant.min_order_value, 0) > 0 AND (v_subtotal + v_delivery_fee - v_discount) < v_tenant.min_order_value THEN
        RETURN jsonb_build_object('success', false, 'message', 'Valor mínimo do pedido é R$ ' || v_tenant.min_order_value);
    END IF;

    -- Cashback: débito atômico e cálculo de ganho
    v_after_coupon := GREATEST(0, v_subtotal + v_delivery_fee - v_discount);
    IF NOT v_is_dine_in AND COALESCE(v_tenant.cashback_enabled, false) = true AND LENGTH(v_clean_phone) >= 8 THEN
        IF p_use_cashback = true OR COALESCE(p_cashback_amount, 0) > 0 THEN
            SELECT * INTO v_wallet
            FROM public.customer_cashback_wallets
            WHERE tenant_id = p_tenant_id AND phone = v_clean_phone
            FOR UPDATE;

            IF FOUND AND v_wallet.balance > 0 AND (v_wallet.expires_at IS NULL OR v_wallet.expires_at >= NOW()) THEN
                v_max_cb_allowed := ROUND(v_after_coupon * (COALESCE(v_tenant.cashback_max_discount_percentage, 50.0) / 100.0), 2);
                v_cashback_discount := LEAST(v_wallet.balance, v_max_cb_allowed);
                IF p_cashback_amount IS NOT NULL AND p_cashback_amount > 0 THEN
                    v_cashback_discount := LEAST(v_cashback_discount, p_cashback_amount);
                END IF;
                v_cashback_discount := GREATEST(0, ROUND(v_cashback_discount, 2));
            END IF;
        END IF;

        v_total := GREATEST(0, v_after_coupon - v_cashback_discount);
        IF v_total > 0 AND COALESCE(v_tenant.cashback_rate, 0) > 0 THEN
            v_cashback_earned := ROUND(GREATEST(0, v_subtotal - v_discount - v_cashback_discount) * (v_tenant.cashback_rate / 100.0), 2);
        END IF;
    ELSE
        v_total := v_after_coupon;
    END IF;

    -- Lock por tenant para numeração sequencial sem colisão
    PERFORM pg_advisory_xact_lock(hashtext('order_num_' || p_tenant_id::text));
    SELECT COALESCE(MAX(order_number), 0) + 1
    INTO v_order_number
    FROM public.orders
    WHERE tenant_id = p_tenant_id;

    v_order_id := COALESCE(
        NULLIF(TRIM(p_order_id), ''),
        'ord_' || to_char(now(), 'YYYYMMDD') || '_' || lpad(v_order_number::text, 4, '0') || '_' || substr(gen_random_uuid()::text, 1, 6)
    );

    -- Vinculação / abertura atômica de sessão de mesa se dine_in
    IF v_is_dine_in THEN
        v_clean_table_num := REGEXP_REPLACE(TRIM(COALESCE(p_table_number, '')), '^Mesa\s*', '', 'i');
        SELECT * INTO v_table_rec
        FROM public.restaurant_tables
        WHERE tenant_id = p_tenant_id AND LOWER(table_number) = LOWER(v_clean_table_num)
        FOR UPDATE;

        IF FOUND THEN
            SELECT id INTO v_table_session_id
            FROM public.table_sessions
            WHERE table_id = v_table_rec.id AND tenant_id = p_tenant_id AND status IN ('open', 'bill_requested')
            LIMIT 1;

            IF v_table_session_id IS NULL THEN
                INSERT INTO public.table_sessions (
                    tenant_id, table_id, table_number, customer_name, customer_phone, people_count, status
                ) VALUES (
                    p_tenant_id, v_table_rec.id, v_table_rec.table_number, COALESCE(NULLIF(TRIM(p_customer_name), ''), 'Mesa ' || v_table_rec.table_number), v_clean_phone, 2, 'open'
                ) RETURNING id INTO v_table_session_id;

                UPDATE public.restaurant_tables SET status = 'occupied', updated_at = now() WHERE id = v_table_rec.id;
            END IF;
        END IF;
    END IF;

    IF LOWER(COALESCE(p_payment_method, '')) = 'pix_online' THEN
        v_initial_status := 'aguardando_pagamento';
        v_payment_status := 'pending';
    ELSIF v_is_dine_in THEN
        v_initial_status := 'confirmado';
        v_payment_status := 'pending_cashier';
    ELSIF COALESCE(v_tenant.auto_accept_delivery, false) = true AND NOT v_is_pickup THEN
        v_initial_status := 'confirmado';
        v_payment_status := 'pending_delivery';
    ELSE
        v_initial_status := 'pendente';
        v_payment_status := 'pending_delivery';
    END IF;

    INSERT INTO public.orders (
        id, tenant_id, order_number, tracking_token, customer_name, customer_phone, customer_email,
        customer_address, delivery_address, total_amount, total, subtotal, delivery_fee,
        discount_amount, discount, cashback_discount, cashback_earned,
        status, payment_status, payment_method, card_brand, change_for,
        order_type, table_number, table_session_id,
        notes, coupon_code, items, created_date, updated_date
    ) VALUES (
        v_order_id, p_tenant_id, v_order_number, v_tracking_token,
        COALESCE(NULLIF(TRIM(p_customer_name), ''), 'Mesa ' || COALESCE(v_clean_table_num, 'Salão')),
        COALESCE(v_clean_phone, ''), NULLIF(TRIM(COALESCE(p_customer_email, '')), ''),
        p_delivery_address, p_delivery_address, v_total, v_total, v_subtotal, v_delivery_fee,
        v_discount, v_discount, v_cashback_discount, v_cashback_earned,
        v_initial_status, v_payment_status, p_payment_method, p_card_brand,
        CASE WHEN NULLIF(REGEXP_REPLACE(COALESCE(p_change_for, ''), '[^0-9.]', '', 'g'), '') IS NOT NULL
             THEN REGEXP_REPLACE(p_change_for, '[^0-9.]', '', 'g')::numeric
             ELSE NULL END,
        CASE WHEN v_is_dine_in THEN 'dine_in' WHEN v_is_pickup THEN 'pickup' ELSE 'delivery' END,
        CASE WHEN v_is_pickup THEN 'Balcão' WHEN v_is_dine_in THEN COALESCE('Mesa ' || v_clean_table_num, p_table_number) ELSE NULL END,
        v_table_session_id,
        p_notes, CASE WHEN v_discount > 0 THEN UPPER(TRIM(p_coupon_code)) ELSE NULL END,
        v_verified_items, now(), now()
    );

    FOR v_item IN SELECT * FROM jsonb_array_elements(v_verified_items)
    LOOP
        INSERT INTO public.order_items (
            id, tenant_id, order_id, product_id, product_name, product_price,
            quantity, subtotal, created_date, updated_date
        ) VALUES (
            gen_random_uuid()::text, p_tenant_id, v_order_id, v_item->>'product_id',
            v_item->>'product_name', (v_item->>'product_price')::numeric,
            (v_item->>'quantity')::numeric, (v_item->>'subtotal')::numeric, now(), now()
        );
    END LOOP;

    IF v_discount > 0 AND v_coupon.id IS NOT NULL THEN
        INSERT INTO public.coupon_usages (id, tenant_id, coupon_id, user_email, order_id, created_date, updated_date)
        VALUES (
            gen_random_uuid()::text,
            p_tenant_id,
            v_coupon.id,
            COALESCE(NULLIF(TRIM(p_customer_email), '') || ' ', '') || '[phone:' || COALESCE(v_clean_phone, 'guest') || ']',
            v_order_id,
            now(),
            now()
        );
    END IF;

    IF v_cashback_discount > 0 AND v_wallet.id IS NOT NULL THEN
        UPDATE public.customer_cashback_wallets
        SET balance = GREATEST(0, balance - v_cashback_discount), updated_at = NOW()
        WHERE id = v_wallet.id;

        INSERT INTO public.customer_cashback_transactions (wallet_id, tenant_id, order_id, amount, type, description)
        VALUES (v_wallet.id, p_tenant_id, v_order_id, -v_cashback_discount, 'debit', 'Abatimento no pedido #' || UPPER(SUBSTRING(v_order_id, 1, 6)));
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'id', v_order_id,
        'order_id', v_order_id,
        'order_number', v_order_number,
        'tracking_token', v_tracking_token,
        'total', v_total,
        'total_amount', v_total,
        'subtotal', v_subtotal,
        'delivery_fee', v_delivery_fee,
        'discount', v_discount,
        'cashback_discount', v_cashback_discount,
        'cashback_earned', v_cashback_earned,
        'status', v_initial_status,
        'payment_status', v_payment_status,
        'table_session_id', v_table_session_id,
        'items', v_verified_items,
        'created_date', now(),
        'message', 'Pedido criado com sucesso!'
    );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.create_public_order(uuid, text, text, text, text, text, jsonb, text, text, text, text, boolean, numeric, text, text, text, text) TO anon, authenticated;

-- 7. RPCs PÚBLICAS SEGURAS PARA CLIENTE (MyOrders por token, Endereços por telefone, Sessão de Mesa, PIX fallback, Cupom usage)
CREATE OR REPLACE FUNCTION public.get_public_orders_by_tokens(p_tokens jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_result JSONB := '[]'::jsonb;
BEGIN
    IF p_tokens IS NULL OR jsonb_typeof(p_tokens) <> 'array' THEN
        RETURN '[]'::jsonb;
    END IF;

    SELECT COALESCE(jsonb_agg(row_to_json(q) ORDER BY q.created_date DESC), '[]'::jsonb)
    INTO v_result
    FROM (
        SELECT
            o.id, o.tenant_id, o.order_number, o.tracking_token, o.customer_name, o.customer_phone,
            o.delivery_address, o.customer_address, o.total, o.total_amount, o.subtotal, o.delivery_fee,
            o.discount, o.discount_amount, o.cashback_discount, o.cashback_earned,
            o.status, o.payment_status, o.payment_method, o.order_type, o.table_number,
            o.notes, o.items, o.created_date, o.updated_date, o.cancel_reason
        FROM public.orders o
        JOIN jsonb_array_elements(p_tokens) tok
          ON o.id = tok->>'id'
         AND o.tracking_token::text = tok->>'tracking_token'
    ) q;

    RETURN v_result;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_public_orders_by_tokens(jsonb) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.convert_pix_order_to_delivery(p_order_id text, p_tracking_token uuid, p_payment_method text DEFAULT 'card_delivery'::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_order RECORD;
    v_next_status TEXT := 'pendente';
BEGIN
    SELECT o.*, t.auto_accept_delivery
    INTO v_order
    FROM public.orders o
    JOIN public.tenants t ON t.id = o.tenant_id
    WHERE o.id = p_order_id AND o.tracking_token = p_tracking_token
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Pedido não encontrado ou token inválido.');
    END IF;

    IF v_order.status NOT IN ('aguardando_pagamento', 'pendente') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Este pedido não pode mais alterar a forma de pagamento.');
    END IF;

    IF COALESCE(v_order.auto_accept_delivery, false) = true AND COALESCE(v_order.order_type, 'delivery') = 'delivery' THEN
        v_next_status := 'confirmado';
    END IF;

    UPDATE public.orders
    SET payment_method = p_payment_method,
        payment_status = 'pending_delivery',
        status = v_next_status,
        updated_date = NOW()
    WHERE id = p_order_id;

    RETURN jsonb_build_object('success', true, 'status', v_next_status, 'payment_status', 'pending_delivery');
END;
$function$;

GRANT EXECUTE ON FUNCTION public.convert_pix_order_to_delivery(text, uuid, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_public_table_session(p_tenant_id uuid, p_table_number text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_clean_num TEXT := REGEXP_REPLACE(TRIM(COALESCE(p_table_number, '')), '^Mesa\s*', '', 'i');
    v_session RECORD;
BEGIN
    SELECT id, table_id, table_number, status, opened_at, people_count, subtotal
    INTO v_session
    FROM public.table_sessions
    WHERE tenant_id = p_tenant_id
      AND LOWER(table_number) = LOWER(v_clean_num)
      AND status IN ('open', 'bill_requested')
    ORDER BY opened_at DESC
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('found', false);
    END IF;

    RETURN jsonb_build_object('found', true, 'session', to_jsonb(v_session));
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_public_table_session(uuid, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_customer_addresses(p_tenant_id uuid, p_phone text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_clean_phone TEXT := regexp_replace(COALESCE(p_phone, ''), '\D', '', 'g');
    v_rows JSONB := '[]'::jsonb;
BEGIN
    IF LENGTH(v_clean_phone) < 8 THEN
        RETURN '[]'::jsonb;
    END IF;

    SELECT COALESCE(jsonb_agg(to_jsonb(a) ORDER BY a.is_default DESC, a.created_date DESC), '[]'::jsonb)
    INTO v_rows
    FROM public.user_addresses a
    WHERE a.tenant_id = p_tenant_id
      AND regexp_replace(COALESCE(a.user_phone, ''), '\D', '', 'g') = v_clean_phone;

    RETURN v_rows;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_customer_addresses(uuid, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.save_customer_address(
    p_tenant_id uuid,
    p_phone text,
    p_data jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_clean_phone TEXT := regexp_replace(COALESCE(p_phone, ''), '\D', '', 'g');
    v_id TEXT := COALESCE(NULLIF(p_data->>'id', ''), gen_random_uuid()::text);
    v_saved JSONB;
BEGIN
    IF LENGTH(v_clean_phone) < 8 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Telefone inválido.');
    END IF;

    IF EXISTS (SELECT 1 FROM public.user_addresses WHERE id = v_id AND tenant_id = p_tenant_id AND regexp_replace(COALESCE(user_phone, ''), '\D', '', 'g') = v_clean_phone) THEN
        UPDATE public.user_addresses
        SET name = COALESCE(p_data->>'name', name),
            cep = COALESCE(p_data->>'cep', cep),
            street = COALESCE(p_data->>'street', street),
            number = COALESCE(p_data->>'number', number),
            complement = p_data->>'complement',
            neighborhood = COALESCE(p_data->>'neighborhood', neighborhood),
            city = COALESCE(p_data->>'city', city),
            state = COALESCE(p_data->>'state', state),
            reference = p_data->>'reference',
            is_default = COALESCE((p_data->>'is_default')::boolean, is_default),
            updated_date = NOW()
        WHERE id = v_id
        RETURNING to_jsonb(user_addresses.*) INTO v_saved;
    ELSE
        INSERT INTO public.user_addresses (
            id, tenant_id, user_phone, user_email, name, cep, street, number, complement, neighborhood, city, state, reference, is_default
        ) VALUES (
            v_id, p_tenant_id, v_clean_phone, p_data->>'user_email',
            COALESCE(p_data->>'name', 'Casa'), p_data->>'cep',
            COALESCE(p_data->>'street', ''), COALESCE(p_data->>'number', 'S/N'),
            p_data->>'complement', COALESCE(p_data->>'neighborhood', ''),
            COALESCE(p_data->>'city', ''), COALESCE(p_data->>'state', 'MG'),
            p_data->>'reference', COALESCE((p_data->>'is_default')::boolean, false)
        )
        RETURNING to_jsonb(user_addresses.*) INTO v_saved;
    END IF;

    RETURN jsonb_build_object('success', true, 'address', v_saved);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.save_customer_address(uuid, text, jsonb) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.delete_customer_address(p_tenant_id uuid, p_phone text, p_address_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_clean_phone TEXT := regexp_replace(COALESCE(p_phone, ''), '\D', '', 'g');
BEGIN
    DELETE FROM public.user_addresses
    WHERE id = p_address_id
      AND tenant_id = p_tenant_id
      AND regexp_replace(COALESCE(user_phone, ''), '\D', '', 'g') = v_clean_phone;

    RETURN jsonb_build_object('success', true);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.delete_customer_address(uuid, text, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_coupon_usage_count(p_tenant_id uuid, p_coupon_id text, p_phone text DEFAULT NULL::text)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
    SELECT COUNT(*)::integer
    FROM public.coupon_usages
    WHERE tenant_id = p_tenant_id
      AND coupon_id = p_coupon_id;
$function$;

GRANT EXECUTE ON FUNCTION public.get_coupon_usage_count(uuid, text, text) TO anon, authenticated;

-- 8. FECHAMENTO ESTRITO DE RLS EM TODAS AS TABELAS (FIM DO VAZAMENTO ANÔNIMO E CROSS-TENANT)
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT tablename, policyname
        FROM pg_policies
        WHERE schemaname = 'public'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
    END LOOP;
END $$;

-- tenants: apenas admin autenticado da loja ou super_admin (leitura pública vai via tenants_public!)
CREATE POLICY "tenants_select_auth" ON public.tenants FOR SELECT TO authenticated USING (id = public.get_auth_tenant_id() OR public.is_super_admin());
CREATE POLICY "tenants_update_auth" ON public.tenants FOR UPDATE TO authenticated USING (id = public.get_auth_tenant_id() OR public.is_super_admin()) WITH CHECK (id = public.get_auth_tenant_id() OR public.is_super_admin());
CREATE POLICY "tenants_manage_superadmin" ON public.tenants FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

-- tenant_admins (corrige auth_rls_initplan com SELECT auth.uid())
CREATE POLICY "tenant_admins_select_own" ON public.tenant_admins FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()) OR public.is_super_admin());
CREATE POLICY "tenant_admins_manage_super" ON public.tenant_admins FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

-- admin_users (sem acesso para anon!)
CREATE POLICY "admin_users_manage_auth" ON public.admin_users FOR ALL TO authenticated USING (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin()) WITH CHECK (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin());

-- Catálogo público: SELECT público, escrita restrita ao admin do tenant
CREATE POLICY "categories_public_select" ON public.categories FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "categories_admin_write" ON public.categories FOR INSERT TO authenticated WITH CHECK (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin());
CREATE POLICY "categories_admin_update" ON public.categories FOR UPDATE TO authenticated USING (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin()) WITH CHECK (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin());
CREATE POLICY "categories_admin_delete" ON public.categories FOR DELETE TO authenticated USING (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin());

CREATE POLICY "products_public_select" ON public.products FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "products_admin_write" ON public.products FOR INSERT TO authenticated WITH CHECK (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin());
CREATE POLICY "products_admin_update" ON public.products FOR UPDATE TO authenticated USING (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin()) WITH CHECK (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin());
CREATE POLICY "products_admin_delete" ON public.products FOR DELETE TO authenticated USING (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin());

CREATE POLICY "complement_groups_public_select" ON public.complement_groups FOR SELECT TO anon, authenticated USING (active = true OR tenant_id = public.get_auth_tenant_id() OR public.is_super_admin());
CREATE POLICY "complement_groups_admin_write" ON public.complement_groups FOR INSERT TO authenticated WITH CHECK (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin());
CREATE POLICY "complement_groups_admin_update" ON public.complement_groups FOR UPDATE TO authenticated USING (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin()) WITH CHECK (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin());
CREATE POLICY "complement_groups_admin_delete" ON public.complement_groups FOR DELETE TO authenticated USING (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin());

CREATE POLICY "complement_items_public_select" ON public.complement_items FOR SELECT TO anon, authenticated USING (active = true OR tenant_id = public.get_auth_tenant_id() OR public.is_super_admin());
CREATE POLICY "complement_items_admin_write" ON public.complement_items FOR INSERT TO authenticated WITH CHECK (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin());
CREATE POLICY "complement_items_admin_update" ON public.complement_items FOR UPDATE TO authenticated USING (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin()) WITH CHECK (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin());
CREATE POLICY "complement_items_admin_delete" ON public.complement_items FOR DELETE TO authenticated USING (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin());

CREATE POLICY "product_complement_groups_public_select" ON public.product_complement_groups FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "product_complement_groups_admin_write" ON public.product_complement_groups FOR INSERT TO authenticated WITH CHECK (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin());
CREATE POLICY "product_complement_groups_admin_update" ON public.product_complement_groups FOR UPDATE TO authenticated USING (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin()) WITH CHECK (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin());
CREATE POLICY "product_complement_groups_admin_delete" ON public.product_complement_groups FOR DELETE TO authenticated USING (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin());

CREATE POLICY "product_additionals_public_select" ON public.product_additionals FOR SELECT TO anon, authenticated USING (active = true OR tenant_id = public.get_auth_tenant_id() OR public.is_super_admin());
CREATE POLICY "product_additionals_admin_write" ON public.product_additionals FOR INSERT TO authenticated WITH CHECK (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin());
CREATE POLICY "product_additionals_admin_update" ON public.product_additionals FOR UPDATE TO authenticated USING (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin()) WITH CHECK (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin());
CREATE POLICY "product_additionals_admin_delete" ON public.product_additionals FOR DELETE TO authenticated USING (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin());

CREATE POLICY "banner_images_public_select" ON public.banner_images FOR SELECT TO anon, authenticated USING (active = true OR tenant_id = public.get_auth_tenant_id() OR public.is_super_admin());
CREATE POLICY "banner_images_admin_write" ON public.banner_images FOR INSERT TO authenticated WITH CHECK (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin());
CREATE POLICY "banner_images_admin_update" ON public.banner_images FOR UPDATE TO authenticated USING (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin()) WITH CHECK (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin());
CREATE POLICY "banner_images_admin_delete" ON public.banner_images FOR DELETE TO authenticated USING (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin());

CREATE POLICY "banners_public_select" ON public.banners FOR SELECT TO anon, authenticated USING (active = true OR tenant_id = public.get_auth_tenant_id() OR public.is_super_admin());
CREATE POLICY "banners_admin_write" ON public.banners FOR INSERT TO authenticated WITH CHECK (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin());
CREATE POLICY "banners_admin_update" ON public.banners FOR UPDATE TO authenticated USING (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin()) WITH CHECK (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin());
CREATE POLICY "banners_admin_delete" ON public.banners FOR DELETE TO authenticated USING (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin());

CREATE POLICY "coupons_public_select" ON public.coupons FOR SELECT TO anon, authenticated USING ((active = true AND (end_date IS NULL OR end_date >= now())) OR tenant_id = public.get_auth_tenant_id() OR public.is_super_admin());
CREATE POLICY "coupons_admin_write" ON public.coupons FOR INSERT TO authenticated WITH CHECK (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin());
CREATE POLICY "coupons_admin_update" ON public.coupons FOR UPDATE TO authenticated USING (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin()) WITH CHECK (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin());
CREATE POLICY "coupons_admin_delete" ON public.coupons FOR DELETE TO authenticated USING (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin());

CREATE POLICY "production_sectors_public_select" ON public.production_sectors FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "production_sectors_admin_write" ON public.production_sectors FOR INSERT TO authenticated WITH CHECK (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin());
CREATE POLICY "production_sectors_admin_update" ON public.production_sectors FOR UPDATE TO authenticated USING (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin()) WITH CHECK (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin());
CREATE POLICY "production_sectors_admin_delete" ON public.production_sectors FOR DELETE TO authenticated USING (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin());

CREATE POLICY "restaurant_tables_public_select" ON public.restaurant_tables FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "restaurant_tables_admin_write" ON public.restaurant_tables FOR INSERT TO authenticated WITH CHECK (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin());
CREATE POLICY "restaurant_tables_admin_update" ON public.restaurant_tables FOR UPDATE TO authenticated USING (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin()) WITH CHECK (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin());
CREATE POLICY "restaurant_tables_admin_delete" ON public.restaurant_tables FOR DELETE TO authenticated USING (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin());

-- Tabelas privadas / financeiras / operacionais: acesso direto estritamente por tenant autenticado ou SuperAdmin
CREATE POLICY "orders_tenant_isolation" ON public.orders FOR ALL TO authenticated USING (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin()) WITH CHECK (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin());
CREATE POLICY "order_items_tenant_isolation" ON public.order_items FOR ALL TO authenticated USING (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin()) WITH CHECK (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin());
CREATE POLICY "order_item_additionals_tenant_isolation" ON public.order_item_additionals FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.order_items oi WHERE oi.id = order_item_additionals.order_item_id AND (oi.tenant_id = public.get_auth_tenant_id() OR public.is_super_admin()))) WITH CHECK (EXISTS (SELECT 1 FROM public.order_items oi WHERE oi.id = order_item_additionals.order_item_id AND (oi.tenant_id = public.get_auth_tenant_id() OR public.is_super_admin())));
CREATE POLICY "coupon_usages_tenant_isolation" ON public.coupon_usages FOR ALL TO authenticated USING (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin()) WITH CHECK (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin());
CREATE POLICY "table_sessions_tenant_isolation" ON public.table_sessions FOR ALL TO authenticated USING (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin()) WITH CHECK (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin());
CREATE POLICY "shift_closings_tenant_isolation" ON public.shift_closings FOR ALL TO authenticated USING (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin()) WITH CHECK (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin());
CREATE POLICY "customers_tenant_isolation" ON public.customers FOR ALL TO authenticated USING (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin()) WITH CHECK (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin());
CREATE POLICY "user_addresses_tenant_isolation" ON public.user_addresses FOR ALL TO authenticated USING (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin()) WITH CHECK (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin());
CREATE POLICY "cashback_wallets_tenant_isolation" ON public.customer_cashback_wallets FOR ALL TO authenticated USING (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin()) WITH CHECK (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin());
CREATE POLICY "cashback_tx_tenant_isolation" ON public.customer_cashback_transactions FOR ALL TO authenticated USING (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin()) WITH CHECK (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin());
CREATE POLICY "print_jobs_tenant_isolation" ON public.print_jobs FOR ALL TO authenticated USING (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin()) WITH CHECK (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin());

-- system_issues: leitura/gestão exclusiva do SuperAdmin; inserção via report_system_issue RPC
CREATE POLICY "system_issues_superadmin_manage" ON public.system_issues FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
CREATE POLICY "system_issues_public_insert" ON public.system_issues FOR INSERT TO anon, authenticated WITH CHECK (true);

-- 9. ÍNDICES DE CHAVES ESTRANGEIRAS FALTANTES (Performance Advisor)
CREATE INDEX IF NOT EXISTS idx_banner_images_tenant_id ON public.banner_images (tenant_id);
CREATE INDEX IF NOT EXISTS idx_complement_items_group_id ON public.complement_items (group_id);
CREATE INDEX IF NOT EXISTS idx_coupon_usages_coupon_id ON public.coupon_usages (coupon_id);
CREATE INDEX IF NOT EXISTS idx_coupon_usages_tenant_id ON public.coupon_usages (tenant_id);
CREATE INDEX IF NOT EXISTS idx_cashback_tx_order_id ON public.customer_cashback_transactions (order_id);
CREATE INDEX IF NOT EXISTS idx_cashback_tx_tenant_id ON public.customer_cashback_transactions (tenant_id);
CREATE INDEX IF NOT EXISTS idx_order_item_additionals_item_id ON public.order_item_additionals (order_item_id);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON public.order_items (order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_tenant_id ON public.order_items (tenant_id);
CREATE INDEX IF NOT EXISTS idx_print_jobs_sector_id ON public.print_jobs (sector_id);
CREATE INDEX IF NOT EXISTS idx_product_additionals_product_id ON public.product_additionals (product_id);
CREATE INDEX IF NOT EXISTS idx_product_additionals_tenant_id ON public.product_additionals (tenant_id);
CREATE INDEX IF NOT EXISTS idx_product_complement_groups_group_id ON public.product_complement_groups (group_id);
CREATE INDEX IF NOT EXISTS idx_product_complement_groups_product_id ON public.product_complement_groups (product_id);
CREATE INDEX IF NOT EXISTS idx_products_category ON public.products (category);
CREATE INDEX IF NOT EXISTS idx_products_category_id ON public.products (category_id);
CREATE INDEX IF NOT EXISTS idx_user_addresses_tenant_id ON public.user_addresses (tenant_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_otp_codes_tenant_id ON public.whatsapp_otp_codes (tenant_id);
