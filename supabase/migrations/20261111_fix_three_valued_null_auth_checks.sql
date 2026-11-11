-- Cleanup temporary test address probe rows created while uncovering 3-valued NULL logic
DELETE FROM public.user_addresses WHERE street = 'Hack';

-- Strict boolean helper that NEVER returns NULL (prevents SQL 3-valued OR NULL bypass in IF NOT checks)
CREATE OR REPLACE FUNCTION public.is_authorized_for_tenant(p_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
    SELECT COALESCE(
        public.is_super_admin()
        OR auth.role() = 'service_role'
        OR (p_tenant_id IS NOT NULL AND public.get_auth_tenant_id() IS NOT NULL AND p_tenant_id = public.get_auth_tenant_id()),
        FALSE
    );
$function$;

REVOKE ALL ON FUNCTION public.is_authorized_for_tenant(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_authorized_for_tenant(uuid) TO authenticated, service_role;

-- Customer address & lookup functions (now with strict COALESCE(..., FALSE) and IS NOT TRUE)
CREATE OR REPLACE FUNCTION public.get_customer_addresses(
    p_tenant_id uuid,
    p_phone text,
    p_customer_token text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_clean_phone TEXT := regexp_replace(COALESCE(p_phone, ''), '\D', '', 'g');
    v_rows JSONB := '[]'::jsonb;
    v_is_authorized BOOLEAN := FALSE;
BEGIN
    IF LENGTH(v_clean_phone) < 8 THEN
        RETURN '[]'::jsonb;
    END IF;

    v_is_authorized := public.is_authorized_for_tenant(p_tenant_id)
        OR COALESCE(public.validate_customer_session_token(p_tenant_id, v_clean_phone, p_customer_token), FALSE);

    IF v_is_authorized IS NOT TRUE THEN
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

CREATE OR REPLACE FUNCTION public.save_customer_address(
    p_tenant_id uuid,
    p_phone text,
    p_data jsonb,
    p_customer_token text DEFAULT NULL::text
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
    v_is_authorized BOOLEAN := FALSE;
BEGIN
    IF LENGTH(v_clean_phone) < 8 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Telefone inválido.');
    END IF;

    v_is_authorized := public.is_authorized_for_tenant(p_tenant_id)
        OR COALESCE(public.validate_customer_session_token(p_tenant_id, v_clean_phone, p_customer_token), FALSE);

    IF v_is_authorized IS NOT TRUE THEN
        RETURN jsonb_build_object('success', false, 'error', 'Autenticação WhatsApp necessária para gerenciar endereços.');
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

CREATE OR REPLACE FUNCTION public.delete_customer_address(
    p_tenant_id uuid,
    p_phone text,
    p_address_id text,
    p_customer_token text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_clean_phone TEXT := regexp_replace(COALESCE(p_phone, ''), '\D', '', 'g');
    v_is_authorized BOOLEAN := FALSE;
BEGIN
    v_is_authorized := public.is_authorized_for_tenant(p_tenant_id)
        OR COALESCE(public.validate_customer_session_token(p_tenant_id, v_clean_phone, p_customer_token), FALSE);

    IF v_is_authorized IS NOT TRUE THEN
        RETURN jsonb_build_object('success', false, 'error', 'Autenticação WhatsApp necessária para excluir endereço.');
    END IF;

    DELETE FROM public.user_addresses
    WHERE id = p_address_id
      AND tenant_id = p_tenant_id
      AND regexp_replace(COALESCE(user_phone, ''), '\D', '', 'g') = v_clean_phone;

    RETURN jsonb_build_object('success', true);
END;
$function$;

-- Harden admin RPCs against 3-valued NULL when called by non-admin authenticated sessions
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
    IF public.is_authorized_for_tenant(p_tenant_id) IS NOT TRUE THEN
        RAISE EXCEPTION 'Acesso negado para parear esta loja.';
    END IF;

    FOR v_i IN 1..6 LOOP
        v_part := v_part || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
    END LOOP;

    v_code := 'PM-' || substr(v_part, 1, 3) || '-' || substr(v_part, 4, 3);
    v_token := encode(extensions.gen_random_bytes(24), 'hex');

    UPDATE public.tenants
    SET spooler_pairing_code = v_code, spooler_station_token = v_token, updated_date = NOW()
    WHERE id = p_tenant_id;

    RETURN jsonb_build_object('pairing_code', v_code, 'station_token', v_token);
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_tenant_payment_methods(p_tenant_id uuid, p_payment_methods jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    IF public.is_authorized_for_tenant(p_tenant_id) IS NOT TRUE THEN
        RAISE EXCEPTION 'Acesso negado: Sem permissão para alterar métodos de pagamento desta loja.';
    END IF;

    UPDATE public.tenants SET payment_methods = p_payment_methods, updated_date = NOW() WHERE id = p_tenant_id;
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
    IF public.is_authorized_for_tenant(p_tenant_id) IS NOT TRUE THEN
        RAISE EXCEPTION 'Acesso negado: Sem permissão para alterar entregadores desta loja.';
    END IF;

    UPDATE public.tenants SET delivery_drivers = p_drivers, updated_date = now() WHERE id = p_tenant_id RETURNING delivery_drivers INTO v_result;
    RETURN jsonb_build_object('success', true, 'delivery_drivers', v_result);
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
  IF public.is_authorized_for_tenant(p_tenant_id) IS NOT TRUE THEN
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
  IF public.is_authorized_for_tenant(p_tenant_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'Acesso negado para abrir mesa nesta loja.';
  END IF;

  SELECT * INTO v_table FROM public.restaurant_tables WHERE id = p_table_id AND tenant_id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Mesa não encontrada'); END IF;

  SELECT * INTO v_existing FROM public.table_sessions WHERE table_id = p_table_id AND tenant_id = p_tenant_id AND status IN ('open', 'bill_requested') LIMIT 1;
  IF FOUND THEN RETURN jsonb_build_object('success', true, 'already_open', true, 'session', to_jsonb(v_existing)); END IF;

  INSERT INTO public.table_sessions (tenant_id, table_id, table_number, customer_name, customer_phone, people_count, status)
  VALUES (p_tenant_id, p_table_id, v_table.table_number, p_customer_name, p_customer_phone, p_people_count, 'open')
  RETURNING id INTO v_session_id;

  UPDATE public.restaurant_tables SET status = 'occupied', updated_at = now() WHERE id = p_table_id;
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
  IF public.is_authorized_for_tenant(p_tenant_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'Acesso negado para fechar mesa nesta loja.';
  END IF;

  SELECT * INTO v_session FROM public.table_sessions WHERE id = p_session_id AND tenant_id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Sessão não encontrada'); END IF;

  SELECT COALESCE(SUM(total_amount), 0) INTO v_subtotal FROM public.orders WHERE table_session_id = p_session_id AND status != 'cancelado';
  v_total := GREATEST(0, v_subtotal + COALESCE(p_service_fee, 0) - COALESCE(p_discount, 0));

  UPDATE public.table_sessions
  SET subtotal = v_subtotal, service_fee = COALESCE(p_service_fee, 0), discount = COALESCE(p_discount, 0),
      total_amount = v_total, status = 'closed', closed_at = now(), payment_method = p_payment_method,
      payment_details = p_payment_details, updated_at = now()
  WHERE id = p_session_id;

  UPDATE public.restaurant_tables SET status = 'available', updated_at = now() WHERE id = v_session.table_id;
  UPDATE public.orders SET payment_status = 'paid', status = 'entregue' WHERE table_session_id = p_session_id AND status != 'cancelado';

  RETURN jsonb_build_object('success', true, 'total_amount', v_total);
END;
$function$;

