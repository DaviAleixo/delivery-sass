-- ============================================================================
-- Migration: Integridade Contábil de Pedidos x Sessões de Caixa (Combo ERP)
-- 1. Coluna orders.cash_session_id ligada a public.cash_sessions
-- 2. Trigger automática para vincular novos pedidos ao caixa aberto (sem nunca
--    bloquear vendas online quando o caixa estiver fechado)
-- 3. Auto-vínculo ao aceitar/pagar pedido online órfão quando houver caixa aberto
-- 4. RPCs para listar e resgatar pedidos órfãos + suporte na abertura de caixa
-- ============================================================================

-- 1. Adiciona coluna cash_session_id em public.orders
ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS cash_session_id UUID REFERENCES public.cash_sessions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_orders_cash_session_id
    ON public.orders (cash_session_id);

CREATE INDEX IF NOT EXISTS idx_orders_tenant_cash_session
    ON public.orders (tenant_id, cash_session_id);

CREATE INDEX IF NOT EXISTS idx_orders_tenant_unlinked_recent
    ON public.orders (tenant_id, created_date DESC)
    WHERE cash_session_id IS NULL;

-- 2. Backfill seguro para pedidos existentes cuja criação ocorreu estritamente
-- dentro da janela de uma sessão já registrada em cash_sessions
UPDATE public.orders o
SET cash_session_id = s.id
FROM public.cash_sessions s
WHERE o.cash_session_id IS NULL
  AND o.tenant_id = s.tenant_id
  AND LOWER(COALESCE(o.status, '')) <> 'cancelado'
  AND o.created_date >= s.opened_at
  AND o.created_date <= COALESCE(s.closed_at, NOW());

-- 3. Trigger para carimbar cash_session_id automaticamente em INSERT/UPDATE
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
        -- Quando um pedido órfão é aceito/operado ou quitado enquanto existe um caixa aberto,
        -- vincula automaticamente ao turno aberto.
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

REVOKE ALL ON FUNCTION public.fn_orders_attach_cash_session() FROM PUBLIC, anon, authenticated;

-- 4. Atualiza close_table_session para garantir vínculo dos pedidos da comanda ao caixa aberto
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

-- 5. RPC: Listar pedidos órfãos (criados com caixa fechado desde o último fechamento / 36h)
CREATE OR REPLACE FUNCTION public.get_orphan_orders_for_tenant(p_tenant_id UUID)
RETURNS JSONB
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

REVOKE ALL ON FUNCTION public.get_orphan_orders_for_tenant(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_orphan_orders_for_tenant(UUID) TO authenticated;

-- 6. RPC: Vincular pedidos órfãos à sessão de caixa aberta
CREATE OR REPLACE FUNCTION public.attach_orphan_orders_to_session(
    p_tenant_id UUID,
    p_session_id UUID DEFAULT NULL,
    p_order_ids TEXT[] DEFAULT NULL
)
RETURNS JSONB
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

REVOKE ALL ON FUNCTION public.attach_orphan_orders_to_session(UUID, UUID, TEXT[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.attach_orphan_orders_to_session(UUID, UUID, TEXT[]) TO authenticated;

-- 7. Atualiza open_cash_session para permitir resgate atômico de pedidos órfãos na abertura
DROP FUNCTION IF EXISTS public.open_cash_session(UUID, NUMERIC, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.open_cash_session(
    p_tenant_id UUID,
    p_initial_float NUMERIC DEFAULT 0,
    p_operator TEXT DEFAULT 'Operador Principal',
    p_notes TEXT DEFAULT '',
    p_attach_order_ids TEXT[] DEFAULT NULL
)
RETURNS JSONB
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

REVOKE ALL ON FUNCTION public.open_cash_session(UUID, NUMERIC, TEXT, TEXT, TEXT[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.open_cash_session(UUID, NUMERIC, TEXT, TEXT, TEXT[]) TO authenticated;
