-- ============================================================================
-- Migration: Gestão de Caixa Padrão Ouro (cash_sessions, cash_movements,
-- Fechamento Cego por loja e RPCs atômicas com RLS)
-- ============================================================================

-- 1. Configuração por loja de Fechamento Cego
ALTER TABLE public.tenants
    ADD COLUMN IF NOT EXISTS blind_cash_closing BOOLEAN NOT NULL DEFAULT false;

-- 2. Sessões de Caixa (Persistência multi-dispositivo e trilha de auditoria)
CREATE TABLE IF NOT EXISTS public.cash_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
    opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    closed_at TIMESTAMPTZ,
    opened_by TEXT NOT NULL DEFAULT 'Operador Principal',
    closed_by TEXT,
    initial_float NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (initial_float >= 0),
    notes TEXT NOT NULL DEFAULT '',
    expected_cash NUMERIC(10,2),
    counted_cash NUMERIC(10,2),
    difference_amount NUMERIC(10,2),
    justification TEXT NOT NULL DEFAULT '',
    blind_closing BOOLEAN NOT NULL DEFAULT false,
    shift_closing_id UUID REFERENCES public.shift_closings(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_cash_sessions_open_tenant
    ON public.cash_sessions (tenant_id)
    WHERE status = 'open';

CREATE INDEX IF NOT EXISTS idx_cash_sessions_tenant_opened
    ON public.cash_sessions (tenant_id, opened_at DESC);

CREATE INDEX IF NOT EXISTS idx_cash_sessions_shift_closing_id
    ON public.cash_sessions (shift_closing_id);

ALTER TABLE public.cash_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cash_sessions_tenant_isolation" ON public.cash_sessions;
CREATE POLICY "cash_sessions_tenant_isolation"
    ON public.cash_sessions
    FOR ALL
    TO authenticated
    USING (
        tenant_id = (SELECT public.get_auth_tenant_id())
        OR (SELECT public.is_super_admin())
    )
    WITH CHECK (
        tenant_id = (SELECT public.get_auth_tenant_id())
        OR (SELECT public.is_super_admin())
    );

-- 3. Movimentações da Gaveta (Abertura, Suprimentos, Sangrias e Despesas)
CREATE TABLE IF NOT EXISTS public.cash_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    cash_session_id UUID NOT NULL REFERENCES public.cash_sessions(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('open', 'supply', 'bleed', 'expense')),
    title TEXT NOT NULL,
    category TEXT,
    amount NUMERIC(10,2) NOT NULL CHECK (amount >= 0),
    direction TEXT NOT NULL CHECK (direction IN ('in', 'out')),
    operator_name TEXT NOT NULL DEFAULT 'Operador Principal',
    notes TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cash_movements_tenant_created
    ON public.cash_movements (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_cash_movements_session_created
    ON public.cash_movements (cash_session_id, created_at ASC);

ALTER TABLE public.cash_movements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cash_movements_tenant_isolation" ON public.cash_movements;
CREATE POLICY "cash_movements_tenant_isolation"
    ON public.cash_movements
    FOR ALL
    TO authenticated
    USING (
        tenant_id = (SELECT public.get_auth_tenant_id())
        OR (SELECT public.is_super_admin())
    )
    WITH CHECK (
        tenant_id = (SELECT public.get_auth_tenant_id())
        OR (SELECT public.is_super_admin())
    );

-- 4. RPC: Abrir Sessão de Caixa com trava contra duplicidade
CREATE OR REPLACE FUNCTION public.open_cash_session(
    p_tenant_id UUID,
    p_initial_float NUMERIC DEFAULT 0,
    p_operator TEXT DEFAULT 'Operador Principal',
    p_notes TEXT DEFAULT ''
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

    RETURN jsonb_build_object(
        'session', to_jsonb(v_session),
        'movements', jsonb_build_array(to_jsonb(v_movement))
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.open_cash_session(UUID, NUMERIC, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.open_cash_session(UUID, NUMERIC, TEXT, TEXT) TO authenticated;

-- 5. RPC: Registrar Suprimento, Sangria ou Despesa na Sessão Aberta
CREATE OR REPLACE FUNCTION public.add_cash_movement(
    p_tenant_id UUID,
    p_session_id UUID,
    p_type TEXT,
    p_title TEXT,
    p_amount NUMERIC,
    p_operator TEXT DEFAULT 'Operador Principal',
    p_category TEXT DEFAULT NULL,
    p_notes TEXT DEFAULT ''
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_session_status TEXT;
    v_direction TEXT;
    v_movement public.cash_movements%ROWTYPE;
    v_operator TEXT := COALESCE(NULLIF(TRIM(p_operator), ''), 'Operador Principal');
    v_title TEXT := COALESCE(NULLIF(TRIM(p_title), ''), 'Movimentação de Caixa');
BEGIN
    IF public.is_authorized_for_tenant(p_tenant_id) IS NOT TRUE THEN
        RAISE EXCEPTION 'Acesso negado: Sem permissão para movimentar o caixa desta loja.';
    END IF;

    IF p_type NOT IN ('supply', 'bleed', 'expense') THEN
        RAISE EXCEPTION 'Tipo de movimentação inválido: %.', p_type;
    END IF;

    IF p_amount IS NULL OR p_amount <= 0 THEN
        RAISE EXCEPTION 'O valor da movimentação deve ser maior que zero.';
    END IF;

    SELECT status INTO v_session_status
    FROM public.cash_sessions
    WHERE id = p_session_id AND tenant_id = p_tenant_id
    FOR UPDATE;

    IF v_session_status IS NULL OR v_session_status <> 'open' THEN
        RAISE EXCEPTION 'Nenhuma sessão de caixa aberta encontrada para registrar a movimentação.';
    END IF;

    v_direction := CASE WHEN p_type = 'supply' THEN 'in' ELSE 'out' END;

    INSERT INTO public.cash_movements (
        tenant_id, cash_session_id, type, title, category, amount, direction, operator_name, notes
    )
    VALUES (
        p_tenant_id, p_session_id, p_type, v_title, p_category, ROUND(p_amount, 2), v_direction, v_operator, COALESCE(TRIM(p_notes), '')
    )
    RETURNING * INTO v_movement;

    UPDATE public.cash_sessions
    SET updated_at = NOW()
    WHERE id = p_session_id;

    RETURN to_jsonb(v_movement);
END;
$function$;

REVOKE ALL ON FUNCTION public.add_cash_movement(UUID, UUID, TEXT, TEXT, NUMERIC, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_cash_movement(UUID, UUID, TEXT, TEXT, NUMERIC, TEXT, TEXT, TEXT) TO authenticated;

-- 6. RPC: Fechar Sessão de Caixa com Validação de Justificativa em Divergências
CREATE OR REPLACE FUNCTION public.close_cash_session(
    p_tenant_id UUID,
    p_session_id UUID,
    p_expected_cash NUMERIC,
    p_counted_cash NUMERIC,
    p_difference NUMERIC,
    p_justification TEXT DEFAULT '',
    p_closed_by TEXT DEFAULT 'Operador Principal',
    p_blind_closing BOOLEAN DEFAULT false,
    p_shift_closing_id UUID DEFAULT NULL
)
RETURNS JSONB
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

REVOKE ALL ON FUNCTION public.close_cash_session(UUID, UUID, NUMERIC, NUMERIC, NUMERIC, TEXT, TEXT, BOOLEAN, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.close_cash_session(UUID, UUID, NUMERIC, NUMERIC, NUMERIC, TEXT, TEXT, BOOLEAN, UUID) TO authenticated;

-- 7. Atualizar update_tenant_settings para persistir blind_cash_closing
CREATE OR REPLACE FUNCTION public.update_tenant_settings(p_tenant_id uuid, p_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_updated_tenant JSONB;
BEGIN
    IF public.is_authorized_for_tenant(p_tenant_id) IS NOT TRUE THEN
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
        blind_cash_closing = CASE WHEN p_data ? 'blind_cash_closing' THEN (p_data->>'blind_cash_closing')::boolean ELSE blind_cash_closing END,
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

-- 8. Atualizar delete_tenant para remover cash_movements e cash_sessions
CREATE OR REPLACE FUNCTION public.delete_tenant(p_tenant_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
DECLARE
    v_slug TEXT;
    v_name TEXT;
    v_auth_user_ids UUID[];
BEGIN
    IF NOT (public.is_super_admin() IS TRUE OR auth.role() = 'service_role') THEN
        RAISE EXCEPTION 'Acesso negado: Apenas o SuperAdmin pode excluir estabelecimentos.';
    END IF;

    SELECT slug, name INTO v_slug, v_name
    FROM public.tenants
    WHERE id = p_tenant_id;

    IF v_slug IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Empresa não encontrada.');
    END IF;

    -- Coleta os IDs de contas Auth vinculadas ao tenant
    SELECT ARRAY(
        SELECT DISTINCT uid
        FROM (
            SELECT user_id AS uid FROM public.tenant_admins WHERE tenant_id = p_tenant_id AND user_id IS NOT NULL
            UNION
            SELECT id AS uid FROM public.admin_users WHERE tenant_id = p_tenant_id AND id IS NOT NULL
        ) sub
    ) INTO v_auth_user_ids;

    -- Exclusão explícita em ordem segura de dependências (system_issues preserva histórico via SET NULL)
    DELETE FROM public.print_jobs WHERE tenant_id = p_tenant_id;
    DELETE FROM public.customer_cashback_transactions WHERE tenant_id = p_tenant_id;
    DELETE FROM public.customer_cashback_wallets WHERE tenant_id = p_tenant_id;
    DELETE FROM public.customer_sessions WHERE tenant_id = p_tenant_id;
    DELETE FROM public.whatsapp_otp_codes WHERE tenant_id = p_tenant_id;
    DELETE FROM public.cash_movements WHERE tenant_id = p_tenant_id;
    DELETE FROM public.cash_sessions WHERE tenant_id = p_tenant_id;
    DELETE FROM public.shift_closings WHERE tenant_id = p_tenant_id;
    DELETE FROM public.order_items WHERE tenant_id = p_tenant_id;
    DELETE FROM public.orders WHERE tenant_id = p_tenant_id;
    DELETE FROM public.table_sessions WHERE tenant_id = p_tenant_id;
    DELETE FROM public.restaurant_tables WHERE tenant_id = p_tenant_id;
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
    DELETE FROM public.production_sectors WHERE tenant_id = p_tenant_id;
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
$function$;

