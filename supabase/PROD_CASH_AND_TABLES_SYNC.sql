-- ==============================================================================
-- 🚀 PEDEMULEKE — SINCRONIZAÇÃO COMPLETA DE CAIXA, MESAS E PEDIDOS ÓRFÃOS (PROD)
-- Projeto Alvo: jqwtnzdsaivbjudvjhld (PedeMuleke Prod)
-- ==============================================================================

-- 1. Helper de Autorização Multi-Tenant
CREATE OR REPLACE FUNCTION public.is_authorized_for_tenant(p_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
    SELECT COALESCE(
        current_user = 'postgres'
        OR auth.role() = 'service_role'
        OR public.is_super_admin()
        OR (p_tenant_id IS NOT NULL AND public.get_auth_tenant_id() IS NOT NULL AND p_tenant_id = public.get_auth_tenant_id()),
        FALSE
    );
$function$;

GRANT EXECUTE ON FUNCTION public.is_authorized_for_tenant(uuid) TO authenticated, service_role;

-- 2. Colunas essenciais em tenants, cash_sessions e orders
ALTER TABLE public.tenants
    ADD COLUMN IF NOT EXISTS blind_cash_closing BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.cash_sessions
    ADD COLUMN IF NOT EXISTS shift_closing_id UUID REFERENCES public.shift_closings(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS retained_float NUMERIC(10,2),
    ADD COLUMN IF NOT EXISTS collected_to_safe NUMERIC(10,2);

ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS cash_session_id UUID REFERENCES public.cash_sessions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_orders_cash_session_id ON public.orders (cash_session_id);
CREATE INDEX IF NOT EXISTS idx_orders_tenant_cash_session ON public.orders (tenant_id, cash_session_id);
CREATE INDEX IF NOT EXISTS idx_orders_tenant_unlinked_recent ON public.orders (tenant_id, created_date DESC) WHERE cash_session_id IS NULL;

-- 3. Trigger para vincular novos pedidos ao caixa aberto automaticamente
CREATE OR REPLACE FUNCTION public.fn_orders_attach_cash_session()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_open_session_id UUID;
    v_status TEXT := LOWER(COALESCE(NEW.status, ''));
    v_pay_status TEXT := LOWER(COALESCE(NEW.payment_status, ''));
BEGIN
    IF NEW.cash_session_id IS NOT NULL OR NEW.tenant_id IS NULL THEN
        RETURN NEW;
    END IF;

    IF v_status = 'cancelado' THEN
        RETURN NEW;
    END IF;

    IF TG_OP = 'INSERT' THEN
        SELECT id INTO v_open_session_id
        FROM public.cash_sessions
        WHERE tenant_id = NEW.tenant_id
          AND status = 'open'
        LIMIT 1;

        IF v_open_session_id IS NOT NULL THEN
            NEW.cash_session_id := v_open_session_id;
        END IF;

        RETURN NEW;
    END IF;

    IF TG_OP = 'UPDATE' AND OLD.cash_session_id IS NULL THEN
        IF v_status IN ('confirmado', 'preparando', 'enviado', 'entregue') OR v_pay_status = 'paid' THEN
            SELECT id INTO v_open_session_id
            FROM public.cash_sessions
            WHERE tenant_id = NEW.tenant_id
              AND status = 'open'
            LIMIT 1;

            IF v_open_session_id IS NOT NULL THEN
                NEW.cash_session_id := v_open_session_id;
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_orders_attach_cash_session ON public.orders;
CREATE TRIGGER trg_orders_attach_cash_session
    BEFORE INSERT OR UPDATE ON public.orders
    FOR EACH ROW
    WHEN (NEW.cash_session_id IS NULL)
    EXECUTE FUNCTION public.fn_orders_attach_cash_session();

-- 4. RPCs de Gestão de Caixa (open, close, orphan orders)
CREATE OR REPLACE FUNCTION public.open_cash_session(
    p_tenant_id uuid,
    p_initial_float numeric DEFAULT 0,
    p_operator text DEFAULT 'Operador Principal'::text,
    p_notes text DEFAULT ''::text,
    p_attach_order_ids text[] DEFAULT NULL::text[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_existing_id UUID;
    v_blind_closing BOOLEAN := false;
    v_session public.cash_sessions%ROWTYPE;
    v_movement public.cash_movements%ROWTYPE;
    v_operator TEXT := COALESCE(NULLIF(TRIM(p_operator), ''), 'Operador Principal');
    v_notes TEXT := COALESCE(TRIM(p_notes), '');
    v_attached_ids TEXT[] := '{}';
    v_attached_total NUMERIC(12,2) := 0;
BEGIN
    IF public.is_authorized_for_tenant(p_tenant_id) IS NOT TRUE THEN
        RAISE EXCEPTION 'Acesso negado: Sem permissão para abrir o caixa desta loja.';
    END IF;

    IF p_initial_float IS NULL OR p_initial_float < 0 THEN
        RAISE EXCEPTION 'Valor de troco inicial inválido.';
    END IF;

    SELECT id INTO v_existing_id
    FROM public.cash_sessions
    WHERE tenant_id = p_tenant_id AND status = 'open'
    FOR UPDATE;

    IF v_existing_id IS NOT NULL THEN
        RAISE EXCEPTION 'Já existe um caixa aberto para esta loja.';
    END IF;

    SELECT COALESCE(blind_cash_closing, false) INTO v_blind_closing
    FROM public.tenants
    WHERE id = p_tenant_id;

    INSERT INTO public.cash_sessions (
        tenant_id, status, opened_at, opened_by, initial_float, notes, blind_closing
    )
    VALUES (
        p_tenant_id, 'open', NOW(), v_operator, ROUND(p_initial_float, 2), v_notes, COALESCE(v_blind_closing, false)
    )
    RETURNING * INTO v_session;

    INSERT INTO public.cash_movements (
        tenant_id, cash_session_id, type, title, category, amount, direction, operator_name, notes
    )
    VALUES (
        p_tenant_id, v_session.id, 'open', 'Abertura de Caixa (Troco Inicial)', 'abertura', ROUND(p_initial_float, 2), 'in', v_operator, v_notes
    )
    RETURNING * INTO v_movement;

    IF p_attach_order_ids IS NOT NULL AND COALESCE(array_length(p_attach_order_ids, 1), 0) > 0 THEN
        WITH attached AS (
            UPDATE public.orders
            SET cash_session_id = v_session.id
            WHERE tenant_id = p_tenant_id
              AND cash_session_id IS NULL
              AND LOWER(COALESCE(status, '')) <> 'cancelado'
              AND id = ANY(p_attach_order_ids)
            RETURNING id, COALESCE(total_amount, total, 0) AS amt
        )
        SELECT
            COALESCE(ARRAY_AGG(id), '{}'),
            COALESCE(SUM(amt), 0)
        INTO v_attached_ids, v_attached_total
        FROM attached;
    END IF;

    RETURN jsonb_build_object(
        'session', to_jsonb(v_session),
        'movements', jsonb_build_array(to_jsonb(v_movement)),
        'attached_orders_count', COALESCE(array_length(v_attached_ids, 1), 0),
        'attached_orders_total', ROUND(v_attached_total, 2),
        'attached_order_ids', to_jsonb(v_attached_ids)
    );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.open_cash_session(uuid, numeric, text, text, text[]) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.close_cash_session(
    p_tenant_id uuid,
    p_session_id uuid,
    p_expected_cash numeric,
    p_counted_cash numeric,
    p_difference numeric,
    p_justification text DEFAULT ''::text,
    p_closed_by text DEFAULT 'Operador Principal'::text,
    p_blind_closing boolean DEFAULT false,
    p_shift_closing_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_session public.cash_sessions%ROWTYPE;
    v_trimmed_just TEXT := COALESCE(TRIM(p_justification), '');
    v_closed_by TEXT := COALESCE(NULLIF(TRIM(p_closed_by), ''), 'Operador Principal');
    v_diff NUMERIC(10,2) := ROUND(COALESCE(p_counted_cash, 0) - COALESCE(p_expected_cash, 0), 2);
BEGIN
    IF public.is_authorized_for_tenant(p_tenant_id) IS NOT TRUE THEN
        RAISE EXCEPTION 'Acesso negado: Sem permissão para fechar o caixa desta loja.';
    END IF;

    IF p_counted_cash IS NULL OR p_counted_cash < 0 THEN
        RAISE EXCEPTION 'Informe um valor contado na gaveta válido (maior ou igual a zero).';
    END IF;

    IF ABS(v_diff) >= 0.01 AND LENGTH(v_trimmed_just) = 0 THEN
        RAISE EXCEPTION 'Justificativa obrigatória quando houver sobra ou falta no fechamento.';
    END IF;

    SELECT * INTO v_session
    FROM public.cash_sessions
    WHERE id = p_session_id AND tenant_id = p_tenant_id AND status = 'open'
    FOR UPDATE;

    IF v_session.id IS NULL THEN
        RAISE EXCEPTION 'Sessão de caixa aberta não encontrada ou já fechada.';
    END IF;

    UPDATE public.cash_sessions
    SET
        status = 'closed',
        closed_at = NOW(),
        closed_by = v_closed_by,
        expected_cash = ROUND(COALESCE(p_expected_cash, 0), 2),
        counted_cash = ROUND(p_counted_cash, 2),
        difference_amount = v_diff,
        justification = v_trimmed_just,
        blind_closing = COALESCE(p_blind_closing, v_session.blind_closing, false),
        shift_closing_id = p_shift_closing_id,
        updated_at = NOW()
    WHERE id = p_session_id
    RETURNING * INTO v_session;

    RETURN to_jsonb(v_session);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.close_cash_session(uuid, uuid, numeric, numeric, numeric, text, text, boolean, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_orphan_orders_for_tenant(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_last_closed_at TIMESTAMPTZ;
    v_window_floor TIMESTAMPTZ;
    v_orders JSONB := '[]'::jsonb;
    v_count INTEGER := 0;
    v_total NUMERIC(12,2) := 0;
    v_cash_total NUMERIC(12,2) := 0;
BEGIN
    IF public.is_authorized_for_tenant(p_tenant_id) IS NOT TRUE THEN
        RAISE EXCEPTION 'Acesso negado: Sem permissão para consultar pedidos órfãos desta loja.';
    END IF;

    SELECT MAX(closed_at) INTO v_last_closed_at
    FROM public.cash_sessions
    WHERE tenant_id = p_tenant_id AND status = 'closed';

    v_window_floor := GREATEST(
        NOW() - INTERVAL '36 hours',
        COALESCE(v_last_closed_at, NOW() - INTERVAL '36 hours')
    );

    SELECT
        COUNT(*),
        COALESCE(SUM(COALESCE(total_amount, total, 0)), 0),
        COALESCE(SUM(
            CASE
                WHEN LOWER(COALESCE(payment_method, '')) LIKE '%dinheiro%'
                  OR LOWER(COALESCE(payment_method, '')) = 'cash'
                THEN COALESCE(total_amount, total, 0)
                ELSE 0
            END
        ), 0),
        COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'id', id,
                    'order_number', order_number,
                    'customer_name', customer_name,
                    'order_type', order_type,
                    'payment_method', payment_method,
                    'status', status,
                    'total_amount', COALESCE(total_amount, total, 0),
                    'created_date', created_date
                )
                ORDER BY created_date ASC
            ),
            '[]'::jsonb
        )
    INTO v_count, v_total, v_cash_total, v_orders
    FROM public.orders
    WHERE tenant_id = p_tenant_id
      AND cash_session_id IS NULL
      AND LOWER(COALESCE(status, '')) <> 'cancelado'
      AND created_date >= v_window_floor;

    RETURN jsonb_build_object(
        'count', v_count,
        'total_amount', ROUND(v_total, 2),
        'cash_total', ROUND(v_cash_total, 2),
        'window_floor', v_window_floor,
        'orders', v_orders
    );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_orphan_orders_for_tenant(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.attach_orphan_orders_to_session(
    p_tenant_id uuid,
    p_session_id uuid DEFAULT NULL::uuid,
    p_order_ids text[] DEFAULT NULL::text[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_target_session_id UUID;
    v_last_closed_at TIMESTAMPTZ;
    v_window_floor TIMESTAMPTZ;
    v_attached_ids TEXT[] := '{}';
    v_attached_total NUMERIC(12,2) := 0;
BEGIN
    IF public.is_authorized_for_tenant(p_tenant_id) IS NOT TRUE THEN
        RAISE EXCEPTION 'Acesso negado: Sem permissão para vincular pedidos ao caixa desta loja.';
    END IF;

    IF p_session_id IS NOT NULL THEN
        SELECT id INTO v_target_session_id
        FROM public.cash_sessions
        WHERE id = p_session_id AND tenant_id = p_tenant_id AND status = 'open'
        FOR UPDATE;
    ELSE
        SELECT id INTO v_target_session_id
        FROM public.cash_sessions
        WHERE tenant_id = p_tenant_id AND status = 'open'
        LIMIT 1
        FOR UPDATE;
    END IF;

    IF v_target_session_id IS NULL THEN
        RAISE EXCEPTION 'Nenhuma sessão de caixa aberta encontrada para vincular os pedidos.';
    END IF;

    SELECT MAX(closed_at) INTO v_last_closed_at
    FROM public.cash_sessions
    WHERE tenant_id = p_tenant_id AND status = 'closed';

    v_window_floor := GREATEST(
        NOW() - INTERVAL '36 hours',
        COALESCE(v_last_closed_at, NOW() - INTERVAL '36 hours')
    );

    WITH updated AS (
        UPDATE public.orders
        SET cash_session_id = v_target_session_id
        WHERE tenant_id = p_tenant_id
          AND cash_session_id IS NULL
          AND LOWER(COALESCE(status, '')) <> 'cancelado'
          AND (
              (p_order_ids IS NOT NULL AND id = ANY(p_order_ids))
              OR (p_order_ids IS NULL AND created_date >= v_window_floor)
          )
        RETURNING id, COALESCE(total_amount, total, 0) AS amt
    )
    SELECT
        COALESCE(ARRAY_AGG(id), '{}'),
        COALESCE(SUM(amt), 0)
    INTO v_attached_ids, v_attached_total
    FROM updated;

    RETURN jsonb_build_object(
        'success', true,
        'session_id', v_target_session_id,
        'attached_count', COALESCE(array_length(v_attached_ids, 1), 0),
        'attached_total', ROUND(v_attached_total, 2),
        'attached_order_ids', to_jsonb(v_attached_ids)
    );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.attach_orphan_orders_to_session(uuid, uuid, text[]) TO authenticated, service_role;

-- 5. RPCs de Mesas & Salão (open, close, partial payments)
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

GRANT EXECUTE ON FUNCTION public.open_table_session(uuid, uuid, text, text, integer) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.add_table_session_partial_payment(
    p_session_id uuid,
    p_payment jsonb,
    p_service_fee_included boolean DEFAULT NULL::boolean,
    p_discount numeric DEFAULT NULL::numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_session RECORD;
    v_details JSONB;
    v_payments JSONB;
    v_pay_id TEXT;
    v_exists BOOLEAN := FALSE;
    v_updated RECORD;
BEGIN
    SELECT *
    INTO v_session
    FROM public.table_sessions
    WHERE id = p_session_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Sessão da mesa não encontrada.');
    END IF;

    IF public.is_authorized_for_tenant(v_session.tenant_id) IS NOT TRUE THEN
        RAISE EXCEPTION 'Acesso negado para registrar pagamento nesta mesa.';
    END IF;

    IF v_session.status NOT IN ('open', 'bill_requested') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Esta comanda já foi encerrada.');
    END IF;

    IF p_payment IS NULL OR jsonb_typeof(p_payment) <> 'object' OR COALESCE((p_payment->>'amount')::numeric, 0) <= 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Dados de pagamento parcial inválidos.');
    END IF;

    v_details := CASE
        WHEN v_session.payment_details IS NOT NULL AND jsonb_typeof(v_session.payment_details) = 'object'
        THEN v_session.payment_details
        ELSE '{}'::jsonb
    END;

    v_payments := CASE
        WHEN v_details->'payments' IS NOT NULL AND jsonb_typeof(v_details->'payments') = 'array'
        THEN v_details->'payments'
        ELSE '[]'::jsonb
    END;

    v_pay_id := NULLIF(TRIM(COALESCE(p_payment->>'id', '')), '');
    IF v_pay_id IS NOT NULL THEN
        SELECT EXISTS (
            SELECT 1 FROM jsonb_array_elements(v_payments) elem
            WHERE elem->>'id' = v_pay_id
        ) INTO v_exists;
    END IF;

    IF NOT v_exists THEN
        v_payments := v_payments || jsonb_build_array(p_payment);
    END IF;

    v_details := jsonb_set(v_details, '{payments}', v_payments, true);
    IF p_service_fee_included IS NOT NULL THEN
        v_details := jsonb_set(v_details, '{service_fee_included}', to_jsonb(p_service_fee_included), true);
    END IF;
    IF p_discount IS NOT NULL THEN
        v_details := jsonb_set(v_details, '{discount}', to_jsonb(GREATEST(0, p_discount)), true);
    END IF;

    UPDATE public.table_sessions
    SET payment_details = v_details,
        updated_at = NOW()
    WHERE id = p_session_id
    RETURNING * INTO v_updated;

    RETURN jsonb_build_object(
        'success', true,
        'duplicate_ignored', v_exists,
        'session', to_jsonb(v_updated)
    );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.add_table_session_partial_payment(uuid, jsonb, boolean, numeric) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.remove_table_session_partial_payment(
    p_session_id uuid,
    p_payment_id text,
    p_service_fee_included boolean DEFAULT NULL::boolean,
    p_discount numeric DEFAULT NULL::numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_session RECORD;
    v_details JSONB;
    v_payments JSONB;
    v_filtered JSONB;
    v_updated RECORD;
BEGIN
    SELECT *
    INTO v_session
    FROM public.table_sessions
    WHERE id = p_session_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Sessão da mesa não encontrada.');
    END IF;

    IF public.is_authorized_for_tenant(v_session.tenant_id) IS NOT TRUE THEN
        RAISE EXCEPTION 'Acesso negado para estornar pagamento nesta mesa.';
    END IF;

    IF v_session.status NOT IN ('open', 'bill_requested') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Esta comanda já foi encerrada.');
    END IF;

    v_details := CASE
        WHEN v_session.payment_details IS NOT NULL AND jsonb_typeof(v_session.payment_details) = 'object'
        THEN v_session.payment_details
        ELSE '{}'::jsonb
    END;

    v_payments := CASE
        WHEN v_details->'payments' IS NOT NULL AND jsonb_typeof(v_details->'payments') = 'array'
        THEN v_details->'payments'
        ELSE '[]'::jsonb
    END;

    SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb)
    INTO v_filtered
    FROM jsonb_array_elements(v_payments) elem
    WHERE COALESCE(elem->>'id', '') <> COALESCE(p_payment_id, '');

    v_details := jsonb_set(v_details, '{payments}', v_filtered, true);
    IF p_service_fee_included IS NOT NULL THEN
        v_details := jsonb_set(v_details, '{service_fee_included}', to_jsonb(p_service_fee_included), true);
    END IF;
    IF p_discount IS NOT NULL THEN
        v_details := jsonb_set(v_details, '{discount}', to_jsonb(GREATEST(0, p_discount)), true);
    END IF;

    UPDATE public.table_sessions
    SET payment_details = v_details,
        updated_at = NOW()
    WHERE id = p_session_id
    RETURNING * INTO v_updated;

    RETURN jsonb_build_object(
        'success', true,
        'session', to_jsonb(v_updated)
    );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.remove_table_session_partial_payment(uuid, text, boolean, numeric) TO authenticated, service_role;

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
  v_open_cash_session_id UUID;
BEGIN
  IF public.is_authorized_for_tenant(p_tenant_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'Acesso negado para fechar mesa nesta loja.';
  END IF;

  SELECT * INTO v_session FROM public.table_sessions WHERE id = p_session_id AND tenant_id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Sessão não encontrada'); END IF;

  SELECT id INTO v_open_cash_session_id
  FROM public.cash_sessions
  WHERE tenant_id = p_tenant_id AND status = 'open'
  LIMIT 1;

  SELECT COALESCE(SUM(total_amount), 0) INTO v_subtotal FROM public.orders WHERE table_session_id = p_session_id AND status != 'cancelado';
  v_total := GREATEST(0, v_subtotal + COALESCE(p_service_fee, 0) - COALESCE(p_discount, 0));

  UPDATE public.table_sessions
  SET subtotal = v_subtotal, service_fee = COALESCE(p_service_fee, 0), discount = COALESCE(p_discount, 0),
      total_amount = v_total, status = 'closed', closed_at = now(), payment_method = p_payment_method,
      payment_details = p_payment_details, updated_at = now()
  WHERE id = p_session_id;

  UPDATE public.restaurant_tables SET status = 'available', updated_at = now() WHERE id = v_session.table_id;

  UPDATE public.orders
  SET payment_status = 'paid',
      status = 'entregue',
      cash_session_id = COALESCE(cash_session_id, v_open_cash_session_id)
  WHERE table_session_id = p_session_id AND status != 'cancelado';

  RETURN jsonb_build_object('success', true, 'total_amount', v_total, 'cash_session_id', v_open_cash_session_id);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.close_table_session(uuid, uuid, text, jsonb, numeric, numeric) TO authenticated, service_role;
