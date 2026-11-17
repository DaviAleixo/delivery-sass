-- ============================================================================
-- Migration: Financeiro Simplão + Conta Cofre + Troco Retido no Fechamento
-- Padrão: RLS multi-tenant, RPCs atômicas com FOR UPDATE e idempotência
-- ============================================================================

-- 1. Colunas na sessão de caixa para troco retido (próximo turno) e recolhimento ao cofre
ALTER TABLE public.cash_sessions
    ADD COLUMN IF NOT EXISTS retained_float NUMERIC(10,2),
    ADD COLUMN IF NOT EXISTS collected_to_safe NUMERIC(10,2) NOT NULL DEFAULT 0;

-- 2. Contas Financeiras por loja (Cofre e Banco; Gaveta é lida ao vivo de cash_sessions)
CREATE TABLE IF NOT EXISTS public.financial_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    code TEXT NOT NULL CHECK (code IN ('safe', 'bank')),
    name TEXT NOT NULL,
    balance NUMERIC(12,2) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, code)
);

CREATE INDEX IF NOT EXISTS idx_financial_accounts_tenant
    ON public.financial_accounts (tenant_id, code);

ALTER TABLE public.financial_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "financial_accounts_tenant_isolation" ON public.financial_accounts;
CREATE POLICY "financial_accounts_tenant_isolation"
    ON public.financial_accounts
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

-- 3. Livro-Caixa / Lançamentos Financeiros (Extrato único sem duplicação)
CREATE TABLE IF NOT EXISTS public.financial_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    entry_type TEXT NOT NULL CHECK (entry_type IN ('income', 'expense', 'transfer')),
    status TEXT NOT NULL DEFAULT 'paid' CHECK (status IN ('paid', 'pending')),
    description TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'Outros',
    amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
    account_code TEXT NOT NULL CHECK (account_code IN ('drawer', 'safe', 'bank')),
    target_account_code TEXT CHECK (target_account_code IS NULL OR target_account_code IN ('drawer', 'safe', 'bank')),
    due_date DATE NOT NULL DEFAULT CURRENT_DATE,
    paid_at TIMESTAMPTZ,
    operator_name TEXT NOT NULL DEFAULT 'Sistema',
    notes TEXT NOT NULL DEFAULT '',
    source_type TEXT,
    source_id UUID,
    idempotency_key TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_financial_entries_tenant_date
    ON public.financial_entries (tenant_id, due_date DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_financial_entries_tenant_status
    ON public.financial_entries (tenant_id, status, due_date ASC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_financial_entries_idempotency
    ON public.financial_entries (tenant_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_financial_entries_source
    ON public.financial_entries (tenant_id, source_type, source_id)
    WHERE source_type IS NOT NULL AND source_id IS NOT NULL;

ALTER TABLE public.financial_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "financial_entries_tenant_isolation" ON public.financial_entries;
CREATE POLICY "financial_entries_tenant_isolation"
    ON public.financial_entries
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

-- 4. Helper interno: garante contas padrão Cofre e Banco para a loja
CREATE OR REPLACE FUNCTION public.ensure_tenant_financial_accounts(p_tenant_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    INSERT INTO public.financial_accounts (tenant_id, code, name, balance)
    VALUES
        (p_tenant_id, 'safe', 'Cofre (Dinheiro Guardado)', 0),
        (p_tenant_id, 'bank', 'Banco / Conta Digital', 0)
    ON CONFLICT (tenant_id, code) DO NOTHING;
END;
$function$;

-- 5. Helper interno: aplica ou reverte impacto de saldo nas contas persistentes (safe/bank)
CREATE OR REPLACE FUNCTION public.apply_financial_entry_balance_effect(
    p_tenant_id UUID,
    p_entry_type TEXT,
    p_amount NUMERIC,
    p_account_code TEXT,
    p_target_account_code TEXT,
    p_multiplier NUMERIC DEFAULT 1
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_signed NUMERIC(12,2) := ROUND(p_amount * p_multiplier, 2);
BEGIN
    PERFORM public.ensure_tenant_financial_accounts(p_tenant_id);

    IF p_entry_type = 'income' THEN
        IF p_account_code IN ('safe', 'bank') THEN
            UPDATE public.financial_accounts
            SET balance = balance + v_signed, updated_at = NOW()
            WHERE tenant_id = p_tenant_id AND code = p_account_code;
        END IF;
    ELSIF p_entry_type = 'expense' THEN
        IF p_account_code IN ('safe', 'bank') THEN
            UPDATE public.financial_accounts
            SET balance = balance - v_signed, updated_at = NOW()
            WHERE tenant_id = p_tenant_id AND code = p_account_code;
        END IF;
    ELSIF p_entry_type = 'transfer' THEN
        IF p_account_code IN ('safe', 'bank') THEN
            UPDATE public.financial_accounts
            SET balance = balance - v_signed, updated_at = NOW()
            WHERE tenant_id = p_tenant_id AND code = p_account_code;
        END IF;
        IF p_target_account_code IN ('safe', 'bank') THEN
            UPDATE public.financial_accounts
            SET balance = balance + v_signed, updated_at = NOW()
            WHERE tenant_id = p_tenant_id AND code = p_target_account_code;
        END IF;
    END IF;
END;
$function$;

-- 6. RPC Atômica e Idempotente: Criar Lançamento / Despesa / Transferência
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

    IF v_idem IS NOT NULL THEN
        SELECT * INTO v_existing
        FROM public.financial_entries
        WHERE tenant_id = p_tenant_id AND idempotency_key = v_idem
        LIMIT 1;
        IF v_existing.id IS NOT NULL THEN
            RETURN jsonb_build_object('entry', to_jsonb(v_existing), 'deduplicated', true);
        END IF;
    END IF;

    IF v_source_type IS NOT NULL AND p_source_id IS NOT NULL THEN
        SELECT * INTO v_existing
        FROM public.financial_entries
        WHERE tenant_id = p_tenant_id AND source_type = v_source_type AND source_id = p_source_id
        LIMIT 1;
        IF v_existing.id IS NOT NULL THEN
            RETURN jsonb_build_object('entry', to_jsonb(v_existing), 'deduplicated', true);
        END IF;
    END IF;

    PERFORM public.ensure_tenant_financial_accounts(p_tenant_id);

    -- Lock das contas persistentes envolvidas antes de atualizar saldo
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

-- 7. RPC Atômica: Dar baixa em conta a pagar / pendente
CREATE OR REPLACE FUNCTION public.mark_financial_entry_paid(
    p_tenant_id UUID,
    p_entry_id UUID,
    p_account_code TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_entry public.financial_entries%ROWTYPE;
    v_account TEXT;
BEGIN
    IF public.is_authorized_for_tenant(p_tenant_id) IS NOT TRUE THEN
        RAISE EXCEPTION 'Acesso negado.';
    END IF;

    SELECT * INTO v_entry
    FROM public.financial_entries
    WHERE id = p_entry_id AND tenant_id = p_tenant_id
    FOR UPDATE;

    IF v_entry.id IS NULL THEN
        RAISE EXCEPTION 'Lançamento não encontrado.';
    END IF;

    IF v_entry.status = 'paid' THEN
        RETURN jsonb_build_object('entry', to_jsonb(v_entry), 'already_paid', true);
    END IF;

    v_account := COALESCE(NULLIF(TRIM(COALESCE(p_account_code, '')), ''), v_entry.account_code);
    IF v_account NOT IN ('drawer', 'safe', 'bank') THEN
        RAISE EXCEPTION 'Conta inválida para baixa.';
    END IF;

    PERFORM 1 FROM public.financial_accounts
    WHERE tenant_id = p_tenant_id AND code = v_account
    FOR UPDATE;

    UPDATE public.financial_entries
    SET status = 'paid',
        account_code = v_account,
        paid_at = NOW(),
        updated_at = NOW()
    WHERE id = v_entry.id
    RETURNING * INTO v_entry;

    PERFORM public.apply_financial_entry_balance_effect(
        p_tenant_id,
        v_entry.entry_type,
        v_entry.amount,
        v_entry.account_code,
        v_entry.target_account_code,
        1
    );

    RETURN jsonb_build_object('entry', to_jsonb(v_entry), 'already_paid', false);
END;
$function$;

-- 8. RPC Atômica: Excluir lançamento manual revertendo saldo com segurança
CREATE OR REPLACE FUNCTION public.delete_financial_entry(
    p_tenant_id UUID,
    p_entry_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_entry public.financial_entries%ROWTYPE;
BEGIN
    IF public.is_authorized_for_tenant(p_tenant_id) IS NOT TRUE THEN
        RAISE EXCEPTION 'Acesso negado.';
    END IF;

    SELECT * INTO v_entry
    FROM public.financial_entries
    WHERE id = p_entry_id AND tenant_id = p_tenant_id
    FOR UPDATE;

    IF v_entry.id IS NULL THEN
        RAISE EXCEPTION 'Lançamento não encontrado.';
    END IF;

    IF COALESCE(v_entry.source_type, 'manual') <> 'manual' THEN
        RAISE EXCEPTION 'Lançamentos automáticos do caixa/turno não podem ser excluídos manualmente.';
    END IF;

    IF v_entry.status = 'paid' THEN
        PERFORM 1 FROM public.financial_accounts
        WHERE tenant_id = p_tenant_id AND code IN (v_entry.account_code, COALESCE(v_entry.target_account_code, ''))
        FOR UPDATE;

        PERFORM public.apply_financial_entry_balance_effect(
            p_tenant_id,
            v_entry.entry_type,
            v_entry.amount,
            v_entry.account_code,
            v_entry.target_account_code,
            -1
        );
    END IF;

    DELETE FROM public.financial_entries WHERE id = v_entry.id;

    RETURN jsonb_build_object('deleted', true, 'id', v_entry.id);
END;
$function$;

-- 9. RPC Consolidada: Visão Financeira da Loja (Contas + Extrato + Resumo do Período)
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
    v_bank_balance NUMERIC(12,2) := 0;
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

    SELECT COALESCE(balance, 0) INTO v_safe_balance
    FROM public.financial_accounts
    WHERE tenant_id = p_tenant_id AND code = 'safe';

    SELECT COALESCE(balance, 0) INTO v_bank_balance
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
            'safe', jsonb_build_object('balance', v_safe_balance),
            'bank', jsonb_build_object('balance', v_bank_balance)
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

GRANT EXECUTE ON FUNCTION public.ensure_tenant_financial_accounts(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_financial_entry(UUID, TEXT, TEXT, TEXT, NUMERIC, TEXT, TEXT, TEXT, DATE, TEXT, TEXT, TEXT, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_financial_entry_paid(UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_financial_entry(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_financial_overview(UUID, DATE, DATE) TO authenticated;

