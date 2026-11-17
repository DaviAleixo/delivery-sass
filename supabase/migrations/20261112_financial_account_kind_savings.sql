-- Alinha account_kind ao padrão Conta Azul / Bling / Omie (Conta Bancária, Maquininha/App de Repasse, Reserva/Poupança)
ALTER TABLE public.financial_accounts
    DROP CONSTRAINT IF EXISTS financial_accounts_account_kind_check;

ALTER TABLE public.financial_accounts
    ADD CONSTRAINT financial_accounts_account_kind_check
    CHECK (account_kind IN ('checking', 'acquirer', 'savings', 'digital'));

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

    IF v_kind NOT IN ('checking', 'acquirer', 'savings', 'digital') THEN
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

    IF p_account_kind IS NOT NULL AND p_account_kind NOT IN ('checking', 'acquirer', 'savings', 'digital') THEN
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

