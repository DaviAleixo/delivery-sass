-- ============================================================================
-- Hardening: Revoke PUBLIC/anon em funções financeiras + advisory lock contra corrida
-- ============================================================================

CREATE OR REPLACE FUNCTION public.create_financial_entry(
    p_tenant_id UUID,
    p_entry_type TEXT,
    p_description TEXT,
    p_category TEXT DEFAULT 'Outros',
    p_amount NUMERIC DEFAULT 0,
    p_account_code TEXT DEFAULT 'safe',
    p_target_account_code TEXT DEFAULT NULL,
    p_status TEXT DEFAULT 'paid',
    p_due_date DATE DEFAULT CURRENT_DATE,
    p_operator_name TEXT DEFAULT 'Operador',
    p_notes TEXT DEFAULT '',
    p_source_type TEXT DEFAULT 'manual',
    p_source_id UUID DEFAULT NULL,
    p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_existing public.financial_entries%ROWTYPE;
    v_inserted public.financial_entries%ROWTYPE;
    v_desc TEXT := NULLIF(TRIM(COALESCE(p_description, '')), '');
    v_cat TEXT := COALESCE(NULLIF(TRIM(COALESCE(p_category, '')), ''), 'Outros');
    v_op TEXT := COALESCE(NULLIF(TRIM(COALESCE(p_operator_name, '')), ''), 'Operador');
    v_notes TEXT := COALESCE(TRIM(COALESCE(p_notes, '')), '');
    v_amount NUMERIC(12,2) := ROUND(COALESCE(p_amount, 0), 2);
    v_status TEXT := COALESCE(NULLIF(TRIM(COALESCE(p_status, '')), ''), 'paid');
    v_source_type TEXT := NULLIF(TRIM(COALESCE(p_source_type, '')), '');
    v_idem TEXT := NULLIF(TRIM(COALESCE(p_idempotency_key, '')), '');
BEGIN
    IF public.is_authorized_for_tenant(p_tenant_id) IS NOT TRUE THEN
        RAISE EXCEPTION 'Acesso negado: Sem permissão para registrar lançamentos nesta loja.';
    END IF;

    IF p_entry_type NOT IN ('income', 'expense', 'transfer') THEN
        RAISE EXCEPTION 'Tipo de lançamento inválido.';
    END IF;

    IF v_status NOT IN ('paid', 'pending') THEN
        RAISE EXCEPTION 'Status de lançamento inválido.';
    END IF;

    IF v_desc IS NULL THEN
        RAISE EXCEPTION 'Informe uma descrição para o lançamento.';
    END IF;

    IF v_amount <= 0 THEN
        RAISE EXCEPTION 'O valor do lançamento deve ser maior que zero.';
    END IF;

    IF p_account_code NOT IN ('drawer', 'safe', 'bank') THEN
        RAISE EXCEPTION 'Conta de origem inválida.';
    END IF;

    IF p_entry_type = 'transfer' THEN
        IF p_target_account_code IS NULL OR p_target_account_code NOT IN ('drawer', 'safe', 'bank') THEN
            RAISE EXCEPTION 'Informe a conta de destino da transferência.';
        END IF;
        IF p_target_account_code = p_account_code THEN
            RAISE EXCEPTION 'A conta de origem e destino devem ser diferentes.';
        END IF;
        v_status := 'paid';
    END IF;

    -- Serializa requisições concorrentes com mesma chave de idempotência ou origem
    IF v_idem IS NOT NULL THEN
        PERFORM pg_advisory_xact_lock(hashtext('fin_idem:' || p_tenant_id::text || ':' || v_idem));
        SELECT * INTO v_existing
        FROM public.financial_entries
        WHERE tenant_id = p_tenant_id AND idempotency_key = v_idem
        LIMIT 1;
        IF v_existing.id IS NOT NULL THEN
            RETURN jsonb_build_object('entry', to_jsonb(v_existing), 'deduplicated', true);
        END IF;
    END IF;

    IF v_source_type IS NOT NULL AND p_source_id IS NOT NULL THEN
        PERFORM pg_advisory_xact_lock(hashtext('fin_src:' || p_tenant_id::text || ':' || v_source_type || ':' || p_source_id::text));
        SELECT * INTO v_existing
        FROM public.financial_entries
        WHERE tenant_id = p_tenant_id AND source_type = v_source_type AND source_id = p_source_id
        LIMIT 1;
        IF v_existing.id IS NOT NULL THEN
            RETURN jsonb_build_object('entry', to_jsonb(v_existing), 'deduplicated', true);
        END IF;
    END IF;

    PERFORM public.ensure_tenant_financial_accounts(p_tenant_id);

    PERFORM 1 FROM public.financial_accounts
    WHERE tenant_id = p_tenant_id AND code IN (p_account_code, COALESCE(p_target_account_code, ''))
    FOR UPDATE;

    INSERT INTO public.financial_entries (
        tenant_id, entry_type, status, description, category, amount,
        account_code, target_account_code, due_date, paid_at,
        operator_name, notes, source_type, source_id, idempotency_key
    )
    VALUES (
        p_tenant_id,
        p_entry_type,
        v_status,
        v_desc,
        v_cat,
        v_amount,
        p_account_code,
        CASE WHEN p_entry_type = 'transfer' THEN p_target_account_code ELSE NULL END,
        COALESCE(p_due_date, CURRENT_DATE),
        CASE WHEN v_status = 'paid' THEN NOW() ELSE NULL END,
        v_op,
        v_notes,
        COALESCE(v_source_type, 'manual'),
        p_source_id,
        v_idem
    )
    RETURNING * INTO v_inserted;

    IF v_status = 'paid' THEN
        PERFORM public.apply_financial_entry_balance_effect(
            p_tenant_id,
            v_inserted.entry_type,
            v_inserted.amount,
            v_inserted.account_code,
            v_inserted.target_account_code,
            1
        );
    END IF;

    RETURN jsonb_build_object('entry', to_jsonb(v_inserted), 'deduplicated', false);
END;
$function$;

REVOKE ALL ON FUNCTION public.ensure_tenant_financial_accounts(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.apply_financial_entry_balance_effect(UUID, TEXT, NUMERIC, TEXT, TEXT, NUMERIC) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_financial_entry(UUID, TEXT, TEXT, TEXT, NUMERIC, TEXT, TEXT, TEXT, DATE, TEXT, TEXT, TEXT, UUID, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mark_financial_entry_paid(UUID, UUID, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_financial_entry(UUID, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_financial_overview(UUID, DATE, DATE) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_financial_installments(UUID, TEXT, TEXT, TEXT, TEXT, NUMERIC, TEXT, DATE, INTEGER, BOOLEAN, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_payables_receivables_overview(UUID) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.ensure_tenant_financial_accounts(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_financial_entry(UUID, TEXT, TEXT, TEXT, NUMERIC, TEXT, TEXT, TEXT, DATE, TEXT, TEXT, TEXT, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_financial_entry_paid(UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_financial_entry(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_financial_overview(UUID, DATE, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_financial_installments(UUID, TEXT, TEXT, TEXT, TEXT, NUMERIC, TEXT, DATE, INTEGER, BOOLEAN, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_payables_receivables_overview(UUID) TO authenticated;

