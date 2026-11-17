-- ============================================================================
-- Migration: Múltiplos Bancos / Contas Digitais por Loja
-- Mantém 100% de compatibilidade com RPCs existentes e Caixa (Gaveta/Cofre)
-- ============================================================================

-- 1. Evoluir financial_accounts para permitir múltiplos bancos por loja
ALTER TABLE public.financial_accounts
    DROP CONSTRAINT IF EXISTS financial_accounts_tenant_id_code_key;

ALTER TABLE public.financial_accounts
    ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS account_kind TEXT NOT NULL DEFAULT 'checking';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'financial_accounts_account_kind_check'
    ) THEN
        ALTER TABLE public.financial_accounts
            ADD CONSTRAINT financial_accounts_account_kind_check
            CHECK (account_kind IN ('checking', 'digital', 'acquirer'));
    END IF;
END $$;

-- Apenas 1 Cofre por loja
CREATE UNIQUE INDEX IF NOT EXISTS uq_financial_accounts_single_safe
    ON public.financial_accounts (tenant_id)
    WHERE code = 'safe';

-- Garantir que todo banco existente seja marcado como ativo e padrão (se não houver outro padrão)
WITH ranked_banks AS (
    SELECT id, tenant_id,
           ROW_NUMBER() OVER (PARTITION BY tenant_id ORDER BY created_at ASC, id ASC) AS rn
    FROM public.financial_accounts
    WHERE code = 'bank' AND is_active = true
)
UPDATE public.financial_accounts fa
SET is_default = (rb.rn = 1)
FROM ranked_banks rb
WHERE fa.id = rb.id
  AND NOT EXISTS (
      SELECT 1 FROM public.financial_accounts x
      WHERE x.tenant_id = fa.tenant_id AND x.code = 'bank' AND x.is_default = true AND x.is_active = true
  );

-- Apenas 1 Banco padrão ativo por loja
CREATE UNIQUE INDEX IF NOT EXISTS uq_financial_accounts_default_bank
    ON public.financial_accounts (tenant_id)
    WHERE code = 'bank' AND is_default = true AND is_active = true;

-- 2. Vincular lançamentos ao ID exato da conta (account_id / target_account_id)
ALTER TABLE public.financial_entries
    ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES public.financial_accounts(id) ON DELETE RESTRICT,
    ADD COLUMN IF NOT EXISTS target_account_id UUID REFERENCES public.financial_accounts(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_financial_entries_account_id
    ON public.financial_entries (tenant_id, account_id)
    WHERE account_id IS NOT NULL;

-- Backfill de lançamentos antigos
UPDATE public.financial_entries fe
SET account_id = fa.id
FROM public.financial_accounts fa
WHERE fe.account_id IS NULL
  AND fe.tenant_id = fa.tenant_id
  AND fe.account_code = fa.code
  AND (fa.code = 'safe' OR (fa.code = 'bank' AND fa.is_default = true));

UPDATE public.financial_entries fe
SET target_account_id = fa.id
FROM public.financial_accounts fa
WHERE fe.target_account_id IS NULL
  AND fe.tenant_id = fa.tenant_id
  AND fe.target_account_code = fa.code
  AND (fa.code = 'safe' OR (fa.code = 'bank' AND fa.is_default = true));

-- 3. Atualizar ensure_tenant_financial_accounts para trabalhar com índices parciais
CREATE OR REPLACE FUNCTION public.ensure_tenant_financial_accounts(p_tenant_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    INSERT INTO public.financial_accounts (tenant_id, code, name, balance, is_default, is_active)
    SELECT p_tenant_id, 'safe', 'Cofre (Dinheiro Guardado)', 0, false, true
    WHERE NOT EXISTS (
        SELECT 1 FROM public.financial_accounts
        WHERE tenant_id = p_tenant_id AND code = 'safe'
    );

    INSERT INTO public.financial_accounts (tenant_id, code, name, balance, is_default, is_active, account_kind)
    SELECT p_tenant_id, 'bank', 'Banco / Conta Digital', 0, true, true, 'checking'
    WHERE NOT EXISTS (
        SELECT 1 FROM public.financial_accounts
        WHERE tenant_id = p_tenant_id AND code = 'bank' AND is_active = true
    );
END;
$function$;

-- 4. Helper interno: resolver account_id a partir de code ou id explícito
CREATE OR REPLACE FUNCTION public.resolve_financial_account_id(
    p_tenant_id UUID,
    p_code TEXT,
    p_account_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_found_id UUID;
BEGIN
    IF p_code = 'drawer' THEN
        RETURN NULL;
    END IF;

    PERFORM public.ensure_tenant_financial_accounts(p_tenant_id);

    IF p_account_id IS NOT NULL THEN
        SELECT id INTO v_found_id
        FROM public.financial_accounts
        WHERE id = p_account_id
          AND tenant_id = p_tenant_id
          AND code = p_code
          AND is_active = true
        LIMIT 1;

        IF v_found_id IS NULL THEN
            RAISE EXCEPTION 'Conta financeira informada não encontrada ou inativa.';
        END IF;
        RETURN v_found_id;
    END IF;

    SELECT id INTO v_found_id
    FROM public.financial_accounts
    WHERE tenant_id = p_tenant_id
      AND code = p_code
      AND is_active = true
    ORDER BY is_default DESC, created_at ASC
    LIMIT 1;

    RETURN v_found_id;
END;
$function$;

-- 5. Atualizar apply_financial_entry_balance_effect para usar account_id quando disponível
DROP FUNCTION IF EXISTS public.apply_financial_entry_balance_effect(UUID, TEXT, NUMERIC, TEXT, TEXT, NUMERIC);
CREATE OR REPLACE FUNCTION public.apply_financial_entry_balance_effect(
    p_tenant_id UUID,
    p_entry_type TEXT,
    p_amount NUMERIC,
    p_account_code TEXT,
    p_target_account_code TEXT,
    p_multiplier NUMERIC DEFAULT 1,
    p_account_id UUID DEFAULT NULL,
    p_target_account_id UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_signed NUMERIC(12,2) := ROUND(p_amount * p_multiplier, 2);
    v_src_id UUID;
    v_tgt_id UUID;
BEGIN
    PERFORM public.ensure_tenant_financial_accounts(p_tenant_id);

    IF p_account_code IN ('safe', 'bank') THEN
        v_src_id := COALESCE(
            p_account_id,
            (
                SELECT id FROM public.financial_accounts
                WHERE tenant_id = p_tenant_id AND code = p_account_code
                ORDER BY is_active DESC, is_default DESC, created_at ASC
                LIMIT 1
            )
        );
    END IF;

    IF p_target_account_code IN ('safe', 'bank') THEN
        v_tgt_id := COALESCE(
            p_target_account_id,
            (
                SELECT id FROM public.financial_accounts
                WHERE tenant_id = p_tenant_id AND code = p_target_account_code
                ORDER BY is_active DESC, is_default DESC, created_at ASC
                LIMIT 1
            )
        );
    END IF;

    IF p_entry_type = 'income' THEN
        IF v_src_id IS NOT NULL THEN
            UPDATE public.financial_accounts
            SET balance = balance + v_signed, updated_at = NOW()
            WHERE id = v_src_id AND tenant_id = p_tenant_id;
        END IF;
    ELSIF p_entry_type = 'expense' THEN
        IF v_src_id IS NOT NULL THEN
            UPDATE public.financial_accounts
            SET balance = balance - v_signed, updated_at = NOW()
            WHERE id = v_src_id AND tenant_id = p_tenant_id;
        END IF;
    ELSIF p_entry_type = 'transfer' THEN
        IF v_src_id IS NOT NULL THEN
            UPDATE public.financial_accounts
            SET balance = balance - v_signed, updated_at = NOW()
            WHERE id = v_src_id AND tenant_id = p_tenant_id;
        END IF;
        IF v_tgt_id IS NOT NULL THEN
            UPDATE public.financial_accounts
            SET balance = balance + v_signed, updated_at = NOW()
            WHERE id = v_tgt_id AND tenant_id = p_tenant_id;
        END IF;
    END IF;
END;
$function$;

-- 6. Atualizar create_financial_entry com suporte a p_account_id e p_target_account_id (inclusive Banco A -> Banco B)
DROP FUNCTION IF EXISTS public.create_financial_entry(UUID, TEXT, TEXT, TEXT, NUMERIC, TEXT, TEXT, TEXT, DATE, TEXT, TEXT, TEXT, UUID, TEXT);
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
    p_idempotency_key TEXT DEFAULT NULL,
    p_account_id UUID DEFAULT NULL,
    p_target_account_id UUID DEFAULT NULL
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
    v_src_acc_id UUID;
    v_tgt_acc_id UUID;
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

    v_src_acc_id := public.resolve_financial_account_id(p_tenant_id, p_account_code, p_account_id);

    IF p_entry_type = 'transfer' THEN
        IF p_target_account_code IS NULL OR p_target_account_code NOT IN ('drawer', 'safe', 'bank') THEN
            RAISE EXCEPTION 'Informe a conta de destino da transferência.';
        END IF;

        v_tgt_acc_id := public.resolve_financial_account_id(p_tenant_id, p_target_account_code, p_target_account_id);

        IF p_account_code = p_target_account_code THEN
            IF p_account_code <> 'bank' OR v_src_acc_id IS NOT DISTINCT FROM v_tgt_acc_id THEN
                RAISE EXCEPTION 'A conta de origem e destino devem ser diferentes.';
            END IF;
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

    -- Lock das contas persistentes envolvidas antes de atualizar saldo
    PERFORM 1 FROM public.financial_accounts
    WHERE tenant_id = p_tenant_id
      AND id IN (v_src_acc_id, v_tgt_acc_id)
    FOR UPDATE;

    INSERT INTO public.financial_entries (
        tenant_id, entry_type, status, description, category, amount,
        account_code, account_id, target_account_code, target_account_id,
        due_date, paid_at, operator_name, notes, source_type, source_id, idempotency_key
    )
    VALUES (
        p_tenant_id,
        p_entry_type,
        v_status,
        v_desc,
        v_cat,
        v_amount,
        p_account_code,
        v_src_acc_id,
        CASE WHEN p_entry_type = 'transfer' THEN p_target_account_code ELSE NULL END,
        CASE WHEN p_entry_type = 'transfer' THEN v_tgt_acc_id ELSE NULL END,
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
            1,
            v_inserted.account_id,
            v_inserted.target_account_id
        );
    END IF;

    RETURN jsonb_build_object('entry', to_jsonb(v_inserted), 'deduplicated', false);
END;
$function$;

-- 7. Atualizar create_financial_installments com p_account_id
DROP FUNCTION IF EXISTS public.create_financial_installments(UUID, TEXT, TEXT, TEXT, TEXT, NUMERIC, TEXT, DATE, INTEGER, BOOLEAN, TEXT, TEXT);
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
    p_notes TEXT DEFAULT '',
    p_account_id UUID DEFAULT NULL
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
    v_acc_id UUID;
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

    v_acc_id := public.resolve_financial_account_id(p_tenant_id, p_account_code, p_account_id);

    IF p_mark_first_paid THEN
        PERFORM 1 FROM public.financial_accounts
        WHERE id = v_acc_id AND tenant_id = p_tenant_id
        FOR UPDATE;
    END IF;

    FOR v_i IN 1..v_count LOOP
        v_due := (v_first_date + ((v_i - 1) * INTERVAL '1 month'))::DATE;
        v_status := CASE WHEN (v_i = 1 AND p_mark_first_paid) THEN 'paid' ELSE 'pending' END;
        v_item_desc := CASE WHEN v_count > 1 THEN v_desc || ' (' || v_i || '/' || v_count || ')' ELSE v_desc END;

        INSERT INTO public.financial_entries (
            tenant_id, entry_type, status, description, counterparty, category, amount,
            account_code, account_id, due_date, paid_at, operator_name, notes, source_type,
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
            v_acc_id,
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
                1,
                v_inserted.account_id,
                NULL
            );
        END IF;

        v_created := v_created || jsonb_build_array(to_jsonb(v_inserted));
    END LOOP;

    RETURN jsonb_build_object('count', v_count, 'items', v_created);
END;
$function$;

-- 8. Atualizar mark_financial_entry_paid com p_account_id
DROP FUNCTION IF EXISTS public.mark_financial_entry_paid(UUID, UUID, TEXT);
CREATE OR REPLACE FUNCTION public.mark_financial_entry_paid(
    p_tenant_id UUID,
    p_entry_id UUID,
    p_account_code TEXT DEFAULT NULL,
    p_account_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_entry public.financial_entries%ROWTYPE;
    v_account TEXT;
    v_acc_id UUID;
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

    v_acc_id := public.resolve_financial_account_id(
        p_tenant_id,
        v_account,
        COALESCE(p_account_id, CASE WHEN v_account = v_entry.account_code THEN v_entry.account_id ELSE NULL END)
    );

    IF v_acc_id IS NOT NULL THEN
        PERFORM 1 FROM public.financial_accounts
        WHERE id = v_acc_id AND tenant_id = p_tenant_id
        FOR UPDATE;
    END IF;

    UPDATE public.financial_entries
    SET status = 'paid',
        account_code = v_account,
        account_id = v_acc_id,
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
        1,
        v_entry.account_id,
        v_entry.target_account_id
    );

    RETURN jsonb_build_object('entry', to_jsonb(v_entry), 'already_paid', false);
END;
$function$;

-- 9. Atualizar delete_financial_entry para estornar usando account_id / target_account_id
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
        WHERE tenant_id = p_tenant_id
          AND id IN (v_entry.account_id, v_entry.target_account_id)
        FOR UPDATE;

        PERFORM public.apply_financial_entry_balance_effect(
            p_tenant_id,
            v_entry.entry_type,
            v_entry.amount,
            v_entry.account_code,
            v_entry.target_account_code,
            -1,
            v_entry.account_id,
            v_entry.target_account_id
        );
    END IF;

    DELETE FROM public.financial_entries WHERE id = v_entry.id;

    RETURN jsonb_build_object('deleted', true, 'id', v_entry.id);
END;
$function$;

-- 10. Atualizar get_financial_overview e get_payables_receivables_overview com lista de bancos + account_name
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
    v_safe_id UUID;
    v_safe_balance NUMERIC(12,2) := 0;
    v_safe_name TEXT := 'Cofre (Dinheiro Guardado)';
    v_bank_balance NUMERIC(12,2) := 0;
    v_bank_name TEXT := 'Banco / Conta Digital';
    v_banks JSONB := '[]'::JSONB;
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

    SELECT id, COALESCE(balance, 0), COALESCE(NULLIF(TRIM(name), ''), 'Cofre (Dinheiro Guardado)')
    INTO v_safe_id, v_safe_balance, v_safe_name
    FROM public.financial_accounts
    WHERE tenant_id = p_tenant_id AND code = 'safe'
    LIMIT 1;

    SELECT COALESCE(SUM(balance), 0)
    INTO v_bank_balance
    FROM public.financial_accounts
    WHERE tenant_id = p_tenant_id AND code = 'bank' AND is_active = true;

    SELECT COALESCE(NULLIF(TRIM(name), ''), 'Banco / Conta Digital')
    INTO v_bank_name
    FROM public.financial_accounts
    WHERE tenant_id = p_tenant_id AND code = 'bank' AND is_active = true
    ORDER BY is_default DESC, created_at ASC
    LIMIT 1;

    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'id', fa.id,
                'name', fa.name,
                'balance', fa.balance,
                'is_default', fa.is_default,
                'account_kind', fa.account_kind
            )
            ORDER BY fa.is_default DESC, fa.created_at ASC
        ),
        '[]'::JSONB
    )
    INTO v_banks
    FROM public.financial_accounts fa
    WHERE fa.tenant_id = p_tenant_id AND fa.code = 'bank' AND fa.is_active = true;

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

    SELECT COALESCE(jsonb_agg(e.payload ORDER BY e.due_date DESC, e.created_at DESC), '[]'::JSONB)
    INTO v_entries
    FROM (
        SELECT
            fe.due_date,
            fe.created_at,
            to_jsonb(fe) || jsonb_build_object(
                'account_name', COALESCE(
                    src_acc.name,
                    CASE fe.account_code
                        WHEN 'drawer' THEN 'Gaveta do Caixa'
                        WHEN 'safe' THEN 'Cofre'
                        ELSE 'Banco'
                    END
                ),
                'target_account_name', CASE
                    WHEN fe.target_account_code IS NULL THEN NULL
                    ELSE COALESCE(
                        tgt_acc.name,
                        CASE fe.target_account_code
                            WHEN 'drawer' THEN 'Gaveta do Caixa'
                            WHEN 'safe' THEN 'Cofre'
                            ELSE 'Banco'
                        END
                    )
                END
            ) AS payload
        FROM public.financial_entries fe
        LEFT JOIN public.financial_accounts src_acc ON src_acc.id = fe.account_id
        LEFT JOIN public.financial_accounts tgt_acc ON tgt_acc.id = fe.target_account_id
        WHERE fe.tenant_id = p_tenant_id
          AND fe.due_date BETWEEN p_start_date AND p_end_date
        ORDER BY fe.due_date DESC, fe.created_at DESC
        LIMIT 300
    ) e;

    RETURN jsonb_build_object(
        'accounts', jsonb_build_object(
            'drawer', jsonb_build_object('balance', v_drawer_balance, 'is_open', v_drawer_open),
            'safe', jsonb_build_object('id', v_safe_id, 'balance', v_safe_balance, 'name', v_safe_name),
            'bank', jsonb_build_object('balance', v_bank_balance, 'name', v_bank_name),
            'banks', v_banks
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
      AND entry_type IN ('income', 'expense');

    SELECT COALESCE(
        jsonb_agg(
            e.payload
            ORDER BY
                CASE WHEN e.status = 'pending' THEN 0 ELSE 1 END ASC,
                e.due_date ASC,
                e.created_at DESC
        ),
        '[]'::JSONB
    )
    INTO v_items
    FROM (
        SELECT
            fe.status,
            fe.due_date,
            fe.created_at,
            to_jsonb(fe) || jsonb_build_object(
                'account_name', COALESCE(
                    acc.name,
                    CASE fe.account_code
                        WHEN 'drawer' THEN 'Gaveta do Caixa'
                        WHEN 'safe' THEN 'Cofre'
                        ELSE 'Banco'
                    END
                )
            ) AS payload
        FROM public.financial_entries fe
        LEFT JOIN public.financial_accounts acc ON acc.id = fe.account_id
        WHERE fe.tenant_id = p_tenant_id
          AND fe.entry_type IN ('income', 'expense')
          AND (
              fe.status = 'pending'
              OR fe.due_date >= (v_today - 60)
          )
        ORDER BY
            CASE WHEN fe.status = 'pending' THEN 0 ELSE 1 END ASC,
            fe.due_date ASC,
            fe.created_at DESC
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

-- 11. RPCs de Gestão de Bancos no Financeiro
CREATE OR REPLACE FUNCTION public.create_financial_bank_account(
    p_tenant_id UUID,
    p_name TEXT,
    p_account_kind TEXT DEFAULT 'checking',
    p_initial_balance NUMERIC DEFAULT 0,
    p_is_default BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_clean_name TEXT := LEFT(TRIM(COALESCE(p_name, '')), 60);
    v_kind TEXT := COALESCE(NULLIF(TRIM(COALESCE(p_account_kind, '')), ''), 'checking');
    v_init NUMERIC(12,2) := ROUND(COALESCE(p_initial_balance, 0), 2);
    v_has_active BOOLEAN;
    v_make_default BOOLEAN;
    v_created public.financial_accounts%ROWTYPE;
BEGIN
    IF public.is_authorized_for_tenant(p_tenant_id) IS NOT TRUE THEN
        RAISE EXCEPTION 'Acesso negado: Sem permissão para gerenciar bancos desta loja.';
    END IF;

    IF NULLIF(v_clean_name, '') IS NULL THEN
        RAISE EXCEPTION 'Informe o nome do banco.';
    END IF;

    IF v_kind NOT IN ('checking', 'digital', 'acquirer') THEN
        RAISE EXCEPTION 'Tipo de conta inválido.';
    END IF;

    PERFORM public.ensure_tenant_financial_accounts(p_tenant_id);

    SELECT EXISTS(
        SELECT 1 FROM public.financial_accounts
        WHERE tenant_id = p_tenant_id AND code = 'bank' AND is_active = true
    ) INTO v_has_active;

    v_make_default := COALESCE(p_is_default, false) OR NOT v_has_active;

    IF v_make_default THEN
        UPDATE public.financial_accounts
        SET is_default = false, updated_at = NOW()
        WHERE tenant_id = p_tenant_id AND code = 'bank' AND is_default = true;
    END IF;

    INSERT INTO public.financial_accounts (
        tenant_id, code, name, balance, is_default, is_active, account_kind
    )
    VALUES (
        p_tenant_id, 'bank', v_clean_name, v_init, v_make_default, true, v_kind
    )
    RETURNING * INTO v_created;

    RETURN jsonb_build_object('bank', to_jsonb(v_created));
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_financial_bank_account(
    p_tenant_id UUID,
    p_account_id UUID,
    p_name TEXT,
    p_account_kind TEXT DEFAULT NULL,
    p_is_default BOOLEAN DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_clean_name TEXT := LEFT(TRIM(COALESCE(p_name, '')), 60);
    v_target public.financial_accounts%ROWTYPE;
BEGIN
    IF public.is_authorized_for_tenant(p_tenant_id) IS NOT TRUE THEN
        RAISE EXCEPTION 'Acesso negado.';
    END IF;

    IF NULLIF(v_clean_name, '') IS NULL THEN
        RAISE EXCEPTION 'Informe um nome válido para o banco.';
    END IF;

    SELECT * INTO v_target
    FROM public.financial_accounts
    WHERE id = p_account_id AND tenant_id = p_tenant_id AND code = 'bank' AND is_active = true
    FOR UPDATE;

    IF v_target.id IS NULL THEN
        RAISE EXCEPTION 'Banco não encontrado.';
    END IF;

    IF p_account_kind IS NOT NULL AND p_account_kind NOT IN ('checking', 'digital', 'acquirer') THEN
        RAISE EXCEPTION 'Tipo de conta inválido.';
    END IF;

    IF p_is_default IS TRUE AND NOT v_target.is_default THEN
        UPDATE public.financial_accounts
        SET is_default = false, updated_at = NOW()
        WHERE tenant_id = p_tenant_id AND code = 'bank' AND is_default = true AND id <> p_account_id;
    END IF;

    UPDATE public.financial_accounts
    SET name = v_clean_name,
        account_kind = COALESCE(p_account_kind, account_kind),
        is_default = CASE WHEN p_is_default IS TRUE THEN true ELSE is_default END,
        updated_at = NOW()
    WHERE id = p_account_id
    RETURNING * INTO v_target;

    RETURN jsonb_build_object('bank', to_jsonb(v_target));
END;
$function$;

CREATE OR REPLACE FUNCTION public.archive_financial_bank_account(
    p_tenant_id UUID,
    p_account_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_active_count INTEGER;
    v_target public.financial_accounts%ROWTYPE;
    v_next_id UUID;
BEGIN
    IF public.is_authorized_for_tenant(p_tenant_id) IS NOT TRUE THEN
        RAISE EXCEPTION 'Acesso negado.';
    END IF;

    SELECT COUNT(*) INTO v_active_count
    FROM public.financial_accounts
    WHERE tenant_id = p_tenant_id AND code = 'bank' AND is_active = true;

    IF v_active_count <= 1 THEN
        RAISE EXCEPTION 'Você precisa manter pelo menos 1 banco ativo cadastrado.';
    END IF;

    SELECT * INTO v_target
    FROM public.financial_accounts
    WHERE id = p_account_id AND tenant_id = p_tenant_id AND code = 'bank' AND is_active = true
    FOR UPDATE;

    IF v_target.id IS NULL THEN
        RAISE EXCEPTION 'Banco não encontrado.';
    END IF;

    UPDATE public.financial_accounts
    SET is_active = false, is_default = false, updated_at = NOW()
    WHERE id = p_account_id;

    IF v_target.is_default THEN
        SELECT id INTO v_next_id
        FROM public.financial_accounts
        WHERE tenant_id = p_tenant_id AND code = 'bank' AND is_active = true
        ORDER BY created_at ASC
        LIMIT 1;

        IF v_next_id IS NOT NULL THEN
            UPDATE public.financial_accounts
            SET is_default = true, updated_at = NOW()
            WHERE id = v_next_id;
        END IF;
    END IF;

    RETURN jsonb_build_object('archived', true, 'id', p_account_id);
END;
$function$;

-- Permissões estritas (sem anon/PUBLIC)
REVOKE ALL ON FUNCTION public.resolve_financial_account_id(UUID, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resolve_financial_account_id(UUID, TEXT, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.resolve_financial_account_id(UUID, TEXT, UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.apply_financial_entry_balance_effect(UUID, TEXT, NUMERIC, TEXT, TEXT, NUMERIC, UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_financial_entry_balance_effect(UUID, TEXT, NUMERIC, TEXT, TEXT, NUMERIC, UUID, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.apply_financial_entry_balance_effect(UUID, TEXT, NUMERIC, TEXT, TEXT, NUMERIC, UUID, UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.create_financial_entry(UUID, TEXT, TEXT, TEXT, NUMERIC, TEXT, TEXT, TEXT, DATE, TEXT, TEXT, TEXT, UUID, TEXT, UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_financial_entry(UUID, TEXT, TEXT, TEXT, NUMERIC, TEXT, TEXT, TEXT, DATE, TEXT, TEXT, TEXT, UUID, TEXT, UUID, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_financial_entry(UUID, TEXT, TEXT, TEXT, NUMERIC, TEXT, TEXT, TEXT, DATE, TEXT, TEXT, TEXT, UUID, TEXT, UUID, UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.create_financial_installments(UUID, TEXT, TEXT, TEXT, TEXT, NUMERIC, TEXT, DATE, INTEGER, BOOLEAN, TEXT, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_financial_installments(UUID, TEXT, TEXT, TEXT, TEXT, NUMERIC, TEXT, DATE, INTEGER, BOOLEAN, TEXT, TEXT, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_financial_installments(UUID, TEXT, TEXT, TEXT, TEXT, NUMERIC, TEXT, DATE, INTEGER, BOOLEAN, TEXT, TEXT, UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.mark_financial_entry_paid(UUID, UUID, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_financial_entry_paid(UUID, UUID, TEXT, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.mark_financial_entry_paid(UUID, UUID, TEXT, UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.create_financial_bank_account(UUID, TEXT, TEXT, NUMERIC, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_financial_bank_account(UUID, TEXT, TEXT, NUMERIC, BOOLEAN) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_financial_bank_account(UUID, TEXT, TEXT, NUMERIC, BOOLEAN) TO authenticated;

REVOKE ALL ON FUNCTION public.update_financial_bank_account(UUID, UUID, TEXT, TEXT, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_financial_bank_account(UUID, UUID, TEXT, TEXT, BOOLEAN) FROM anon;
GRANT EXECUTE ON FUNCTION public.update_financial_bank_account(UUID, UUID, TEXT, TEXT, BOOLEAN) TO authenticated;

REVOKE ALL ON FUNCTION public.archive_financial_bank_account(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.archive_financial_bank_account(UUID, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.archive_financial_bank_account(UUID, UUID) TO authenticated;

