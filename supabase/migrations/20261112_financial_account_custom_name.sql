-- Permite personalizar o nome da conta Banco (ex: Nubank PJ, Itaú) e do Cofre, retornando o nome no overview.

CREATE OR REPLACE FUNCTION public.get_financial_overview(
    p_tenant_id UUID,
    p_start_date DATE DEFAULT (date_trunc('month', CURRENT_DATE))::DATE,
    p_end_date DATE DEFAULT CURRENT_DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_safe_balance NUMERIC(12,2) := 0;
    v_safe_name TEXT := 'Cofre da Loja';
    v_bank_balance NUMERIC(12,2) := 0;
    v_bank_name TEXT := 'Banco / Conta Digital';
    v_drawer_balance NUMERIC(12,2) := 0;
    v_drawer_open BOOLEAN := false;
    v_open_session public.cash_sessions%ROWTYPE;
    v_cash_sales NUMERIC(12,2) := 0;
    v_mov_in NUMERIC(12,2) := 0;
    v_mov_out NUMERIC(12,2) := 0;
    v_income_total NUMERIC(12,2) := 0;
    v_expense_total NUMERIC(12,2) := 0;
    v_pending_expense_total NUMERIC(12,2) := 0;
    v_entries JSONB := '[]'::JSONB;
BEGIN
    IF public.is_authorized_for_tenant(p_tenant_id) IS NOT TRUE THEN
        RAISE EXCEPTION 'Acesso negado.';
    END IF;

    PERFORM public.ensure_tenant_financial_accounts(p_tenant_id);

    SELECT COALESCE(balance, 0), COALESCE(NULLIF(TRIM(name), ''), 'Cofre da Loja')
    INTO v_safe_balance, v_safe_name
    FROM public.financial_accounts
    WHERE tenant_id = p_tenant_id AND code = 'safe';

    SELECT COALESCE(balance, 0), COALESCE(NULLIF(TRIM(name), ''), 'Banco / Conta Digital')
    INTO v_bank_balance, v_bank_name
    FROM public.financial_accounts
    WHERE tenant_id = p_tenant_id AND code = 'bank';

    -- Saldo ao vivo da Gaveta (sessão aberta atual)
    SELECT * INTO v_open_session
    FROM public.cash_sessions
    WHERE tenant_id = p_tenant_id AND status = 'open'
    ORDER BY opened_at DESC
    LIMIT 1;

    IF v_open_session.id IS NOT NULL THEN
        v_drawer_open := true;
        SELECT COALESCE(SUM(total_amount), 0) INTO v_cash_sales
        FROM public.orders
        WHERE tenant_id = p_tenant_id
          AND cash_session_id = v_open_session.id
          AND status <> 'cancelled'
          AND (
            LOWER(COALESCE(payment_method, '')) LIKE '%dinheiro%'
            OR LOWER(COALESCE(payment_method, '')) = 'cash'
          );

        SELECT
            COALESCE(SUM(CASE WHEN type = 'supply' AND direction = 'in' THEN amount ELSE 0 END), 0),
            COALESCE(SUM(CASE WHEN type IN ('bleed', 'expense') AND direction = 'out' THEN amount ELSE 0 END), 0)
        INTO v_mov_in, v_mov_out
        FROM public.cash_movements
        WHERE cash_session_id = v_open_session.id;

        v_drawer_balance := ROUND(COALESCE(v_open_session.initial_float, 0) + v_cash_sales + v_mov_in - v_mov_out, 2);
    END IF;

    SELECT
        COALESCE(SUM(CASE WHEN entry_type = 'income' AND status = 'paid' THEN amount ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN entry_type = 'expense' AND status = 'paid' THEN amount ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN entry_type = 'expense' AND status = 'pending' THEN amount ELSE 0 END), 0)
    INTO v_income_total, v_expense_total, v_pending_expense_total
    FROM public.financial_entries
    WHERE tenant_id = p_tenant_id
      AND due_date BETWEEN p_start_date AND p_end_date;

    SELECT COALESCE(jsonb_agg(to_jsonb(e) ORDER BY e.due_date DESC, e.created_at DESC), '[]'::JSONB)
    INTO v_entries
    FROM (
        SELECT *
        FROM public.financial_entries
        WHERE tenant_id = p_tenant_id
          AND due_date BETWEEN p_start_date AND p_end_date
        ORDER BY due_date DESC, created_at DESC
        LIMIT 300
    ) e;

    RETURN jsonb_build_object(
        'accounts', jsonb_build_object(
            'drawer', jsonb_build_object('balance', v_drawer_balance, 'is_open', v_drawer_open),
            'safe', jsonb_build_object('balance', v_safe_balance, 'name', v_safe_name),
            'bank', jsonb_build_object('balance', v_bank_balance, 'name', v_bank_name)
        ),
        'summary', jsonb_build_object(
            'income_total', v_income_total,
            'expense_total', v_expense_total,
            'net_total', ROUND(v_income_total - v_expense_total, 2),
            'pending_expense_total', v_pending_expense_total
        ),
        'entries', v_entries
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_financial_account_name(
    p_tenant_id UUID,
    p_code TEXT,
    p_name TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_clean_name TEXT := LEFT(TRIM(COALESCE(p_name, '')), 60);
    v_updated public.financial_accounts%ROWTYPE;
BEGIN
    IF public.is_authorized_for_tenant(p_tenant_id) IS NOT TRUE THEN
        RAISE EXCEPTION 'Acesso negado: Sem permissão para editar contas desta loja.';
    END IF;

    IF p_code NOT IN ('safe', 'bank') THEN
        RAISE EXCEPTION 'Conta inválida para renomeação.';
    END IF;

    IF NULLIF(v_clean_name, '') IS NULL THEN
        RAISE EXCEPTION 'Informe um nome válido para a conta.';
    END IF;

    PERFORM public.ensure_tenant_financial_accounts(p_tenant_id);

    UPDATE public.financial_accounts
    SET name = v_clean_name,
        updated_at = NOW()
    WHERE tenant_id = p_tenant_id AND code = p_code
    RETURNING * INTO v_updated;

    RETURN jsonb_build_object('account', to_jsonb(v_updated));
END;
$function$;

REVOKE ALL ON FUNCTION public.update_financial_account_name(UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_financial_account_name(UUID, TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.update_financial_account_name(UUID, TEXT, TEXT) TO authenticated;

