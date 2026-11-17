-- ============================================================================
-- Migration: Contas a Pagar e Receber (Fornecedor/Cliente, Parcelas & KPIs)
-- ============================================================================

ALTER TABLE public.financial_entries
    ADD COLUMN IF NOT EXISTS counterparty TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS installment_group_id UUID,
    ADD COLUMN IF NOT EXISTS installment_number INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS installment_total INTEGER NOT NULL DEFAULT 1;

-- RPC: Criar conta única ou parcelada/recorrente (1 a 24 meses) de forma atômica
CREATE OR REPLACE FUNCTION public.create_financial_installments(
    p_tenant_id UUID,
    p_entry_type TEXT,
    p_description TEXT,
    p_counterparty TEXT DEFAULT '',
    p_category TEXT DEFAULT 'Outros',
    p_amount NUMERIC DEFAULT 0,
    p_account_code TEXT DEFAULT 'bank',
    p_first_due_date DATE DEFAULT CURRENT_DATE,
    p_installments INTEGER DEFAULT 1,
    p_mark_first_paid BOOLEAN DEFAULT false,
    p_operator_name TEXT DEFAULT 'Operador',
    p_notes TEXT DEFAULT ''
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_desc TEXT := NULLIF(TRIM(COALESCE(p_description, '')), '');
    v_cp TEXT := COALESCE(TRIM(COALESCE(p_counterparty, '')), '');
    v_cat TEXT := COALESCE(NULLIF(TRIM(COALESCE(p_category, '')), ''), 'Outros');
    v_op TEXT := COALESCE(NULLIF(TRIM(COALESCE(p_operator_name, '')), ''), 'Operador');
    v_notes TEXT := COALESCE(TRIM(COALESCE(p_notes, '')), '');
    v_amount NUMERIC(12,2) := ROUND(COALESCE(p_amount, 0), 2);
    v_count INTEGER := GREATEST(1, LEAST(24, COALESCE(p_installments, 1)));
    v_group_id UUID := CASE WHEN v_count > 1 THEN gen_random_uuid() ELSE NULL END;
    v_first_date DATE := COALESCE(p_first_due_date, (NOW() AT TIME ZONE 'America/Sao_Paulo')::DATE);
    v_i INTEGER;
    v_due DATE;
    v_status TEXT;
    v_item_desc TEXT;
    v_inserted public.financial_entries%ROWTYPE;
    v_created JSONB := '[]'::JSONB;
BEGIN
    IF public.is_authorized_for_tenant(p_tenant_id) IS NOT TRUE THEN
        RAISE EXCEPTION 'Acesso negado: Sem permissão para registrar contas nesta loja.';
    END IF;

    IF p_entry_type NOT IN ('income', 'expense') THEN
        RAISE EXCEPTION 'Tipo inválido para Contas a Pagar/Receber.';
    END IF;

    IF p_account_code NOT IN ('safe', 'bank') THEN
        RAISE EXCEPTION 'Conta inválida. Escolha Cofre ou Banco.';
    END IF;

    IF v_desc IS NULL THEN
        RAISE EXCEPTION 'Informe a descrição da conta.';
    END IF;

    IF v_amount <= 0 THEN
        RAISE EXCEPTION 'O valor deve ser maior que zero.';
    END IF;

    PERFORM public.ensure_tenant_financial_accounts(p_tenant_id);

    IF p_mark_first_paid THEN
        PERFORM 1 FROM public.financial_accounts
        WHERE tenant_id = p_tenant_id AND code = p_account_code
        FOR UPDATE;
    END IF;

    FOR v_i IN 1..v_count LOOP
        v_due := (v_first_date + ((v_i - 1) * INTERVAL '1 month'))::DATE;
        v_status := CASE WHEN (v_i = 1 AND p_mark_first_paid) THEN 'paid' ELSE 'pending' END;
        v_item_desc := CASE WHEN v_count > 1 THEN v_desc || ' (' || v_i || '/' || v_count || ')' ELSE v_desc END;

        INSERT INTO public.financial_entries (
            tenant_id, entry_type, status, description, counterparty, category, amount,
            account_code, due_date, paid_at, operator_name, notes, source_type,
            installment_group_id, installment_number, installment_total
        )
        VALUES (
            p_tenant_id,
            p_entry_type,
            v_status,
            v_item_desc,
            v_cp,
            v_cat,
            v_amount,
            p_account_code,
            v_due,
            CASE WHEN v_status = 'paid' THEN NOW() ELSE NULL END,
            v_op,
            v_notes,
            'manual',
            v_group_id,
            v_i,
            v_count
        )
        RETURNING * INTO v_inserted;

        IF v_status = 'paid' THEN
            PERFORM public.apply_financial_entry_balance_effect(
                p_tenant_id,
                v_inserted.entry_type,
                v_inserted.amount,
                v_inserted.account_code,
                NULL,
                1
            );
        END IF;

        v_created := v_created || jsonb_build_array(to_jsonb(v_inserted));
    END LOOP;

    RETURN jsonb_build_object('count', v_count, 'items', v_created);
END;
$function$;

-- RPC: Painel de Contas a Pagar e Receber (KPIs por vencimento em Brasília + Lista)
CREATE OR REPLACE FUNCTION public.get_payables_receivables_overview(p_tenant_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_today DATE := (NOW() AT TIME ZONE 'America/Sao_Paulo')::DATE;
    v_overdue_total NUMERIC(12,2) := 0;
    v_overdue_count INTEGER := 0;
    v_today_total NUMERIC(12,2) := 0;
    v_today_count INTEGER := 0;
    v_upcoming_total NUMERIC(12,2) := 0;
    v_upcoming_count INTEGER := 0;
    v_receivable_total NUMERIC(12,2) := 0;
    v_receivable_count INTEGER := 0;
    v_items JSONB := '[]'::JSONB;
BEGIN
    IF public.is_authorized_for_tenant(p_tenant_id) IS NOT TRUE THEN
        RAISE EXCEPTION 'Acesso negado.';
    END IF;

    SELECT
        COALESCE(SUM(CASE WHEN entry_type = 'expense' AND status = 'pending' AND due_date < v_today THEN amount ELSE 0 END), 0),
        COUNT(*) FILTER (WHERE entry_type = 'expense' AND status = 'pending' AND due_date < v_today),
        COALESCE(SUM(CASE WHEN entry_type = 'expense' AND status = 'pending' AND due_date = v_today THEN amount ELSE 0 END), 0),
        COUNT(*) FILTER (WHERE entry_type = 'expense' AND status = 'pending' AND due_date = v_today),
        COALESCE(SUM(CASE WHEN entry_type = 'expense' AND status = 'pending' AND due_date BETWEEN v_today AND (v_today + 30) THEN amount ELSE 0 END), 0),
        COUNT(*) FILTER (WHERE entry_type = 'expense' AND status = 'pending' AND due_date BETWEEN v_today AND (v_today + 30)),
        COALESCE(SUM(CASE WHEN entry_type = 'income' AND status = 'pending' THEN amount ELSE 0 END), 0),
        COUNT(*) FILTER (WHERE entry_type = 'income' AND status = 'pending')
    INTO
        v_overdue_total, v_overdue_count,
        v_today_total, v_today_count,
        v_upcoming_total, v_upcoming_count,
        v_receivable_total, v_receivable_count
    FROM public.financial_entries
    WHERE tenant_id = p_tenant_id
      AND entry_type IN ('expense', 'income');

    SELECT COALESCE(jsonb_agg(to_jsonb(e) ORDER BY (e.status = 'pending') DESC, e.due_date ASC, e.created_at DESC), '[]'::JSONB)
    INTO v_items
    FROM (
        SELECT *
        FROM public.financial_entries
        WHERE tenant_id = p_tenant_id
          AND entry_type IN ('expense', 'income')
          AND source_type = 'manual'
          AND (
              status = 'pending'
              OR due_date >= (v_today - 60)
          )
        ORDER BY (status = 'pending') DESC, due_date ASC, created_at DESC
        LIMIT 300
    ) e;

    RETURN jsonb_build_object(
        'today', v_today,
        'kpis', jsonb_build_object(
            'overdue_payable_total', v_overdue_total,
            'overdue_payable_count', v_overdue_count,
            'due_today_payable_total', v_today_total,
            'due_today_payable_count', v_today_count,
            'upcoming_30d_payable_total', v_upcoming_total,
            'upcoming_30d_payable_count', v_upcoming_count,
            'pending_receivable_total', v_receivable_total,
            'pending_receivable_count', v_receivable_count
        ),
        'items', v_items
    );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.create_financial_installments(UUID, TEXT, TEXT, TEXT, TEXT, NUMERIC, TEXT, DATE, INTEGER, BOOLEAN, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_payables_receivables_overview(UUID) TO authenticated;

