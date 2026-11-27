-- ==============================================================================
-- MIGRATION: MÓDULO PROFISSIONAL DE SALÃO, MESAS, COMANDAS E PAGAMENTOS
-- PEDEMULEKE - ARQUITETURA MULTI-TENANT ISOLADA E AUDITADA
-- ==============================================================================

-- 1. TABELA DE COMANDAS (table_comandas)
CREATE TABLE IF NOT EXISTS public.table_comandas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
    table_session_id UUID NOT NULL REFERENCES public.table_sessions(id) ON DELETE RESTRICT,
    name VARCHAR(100) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'cancelled')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    closed_at TIMESTAMPTZ,
    legacy_source_key VARCHAR(255),
    CONSTRAINT uq_table_comandas_session_legacy_key UNIQUE (tenant_id, table_session_id, legacy_source_key),
    CONSTRAINT uq_table_comandas_id_session_tenant UNIQUE (id, table_session_id, tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_table_comandas_session_tenant ON public.table_comandas(table_session_id, tenant_id);
CREATE INDEX IF NOT EXISTS idx_table_comandas_status ON public.table_comandas(status);

-- 2. VÍNCULO EM ORDERS (comanda_id)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'comanda_id'
    ) THEN
        ALTER TABLE public.orders ADD COLUMN comanda_id UUID REFERENCES public.table_comandas(id) ON DELETE SET NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_orders_comanda_id ON public.orders(comanda_id) WHERE comanda_id IS NOT NULL;

-- 3. TABELA DE PAGAMENTOS (table_payments)
CREATE TABLE IF NOT EXISTS public.table_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
    table_session_id UUID NOT NULL REFERENCES public.table_sessions(id) ON DELETE RESTRICT,
    cash_session_id UUID REFERENCES public.cash_sessions(id) ON DELETE RESTRICT,
    amount NUMERIC(10,2) NOT NULL CHECK (amount > 0),
    payment_method VARCHAR(50) NOT NULL,
    idempotency_key VARCHAR(100),
    idempotency_payload_hash CHAR(64),
    paid_by_name VARCHAR(100),
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    is_legacy_migrated BOOLEAN NOT NULL DEFAULT false,
    legacy_source_key VARCHAR(255),
    CONSTRAINT chk_table_payments_cash_session CHECK (is_legacy_migrated = true OR cash_session_id IS NOT NULL),
    CONSTRAINT uq_table_payments_idempotency UNIQUE (tenant_id, idempotency_key),
    CONSTRAINT uq_table_payments_legacy_source UNIQUE (tenant_id, table_session_id, legacy_source_key),
    CONSTRAINT uq_table_payments_id_session_tenant UNIQUE (id, table_session_id, tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_table_payments_session ON public.table_payments(table_session_id, tenant_id);

-- 4. TABELA DE ALOCAÇÕES DE PAGAMENTO (table_payment_allocations)
CREATE TABLE IF NOT EXISTS public.table_payment_allocations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
    table_payment_id UUID NOT NULL REFERENCES public.table_payments(id) ON DELETE RESTRICT,
    table_comanda_id UUID NOT NULL REFERENCES public.table_comandas(id) ON DELETE RESTRICT,
    table_session_id UUID NOT NULL REFERENCES public.table_sessions(id) ON DELETE RESTRICT,
    allocated_amount NUMERIC(10,2) NOT NULL CHECK (allocated_amount > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    legacy_source_key VARCHAR(255),
    CONSTRAINT uq_table_payment_allocations_legacy UNIQUE (tenant_id, table_session_id, legacy_source_key),
    CONSTRAINT fk_tpa_payment_session_tenant FOREIGN KEY (table_payment_id, table_session_id, tenant_id)
        REFERENCES public.table_payments(id, table_session_id, tenant_id) ON DELETE RESTRICT,
    CONSTRAINT fk_tpa_comanda_session_tenant FOREIGN KEY (table_comanda_id, table_session_id, tenant_id)
        REFERENCES public.table_comandas(id, table_session_id, tenant_id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_tpa_payment_id ON public.table_payment_allocations(table_payment_id);
CREATE INDEX IF NOT EXISTS idx_tpa_comanda_id ON public.table_payment_allocations(table_comanda_id);

-- 5. TABELA DE ESTORNOS (table_payment_refunds)
CREATE TABLE IF NOT EXISTS public.table_payment_refunds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
    table_payment_id UUID NOT NULL REFERENCES public.table_payments(id) ON DELETE RESTRICT,
    table_session_id UUID NOT NULL REFERENCES public.table_sessions(id) ON DELETE RESTRICT,
    cash_session_id UUID NOT NULL REFERENCES public.cash_sessions(id) ON DELETE RESTRICT,
    refund_amount NUMERIC(10,2) NOT NULL CHECK (refund_amount > 0),
    reason TEXT NOT NULL,
    idempotency_key VARCHAR(100),
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_table_payment_refunds_idempotency UNIQUE (tenant_id, idempotency_key),
    CONSTRAINT fk_tpr_payment_session_tenant FOREIGN KEY (table_payment_id, table_session_id, tenant_id)
        REFERENCES public.table_payments(id, table_session_id, tenant_id) ON DELETE RESTRICT
);

-- 6. TABELA DE ALOCAÇÕES DE ESTORNO (table_payment_refund_allocations)
CREATE TABLE IF NOT EXISTS public.table_payment_refund_allocations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
    table_payment_refund_id UUID NOT NULL REFERENCES public.table_payment_refunds(id) ON DELETE RESTRICT,
    table_payment_allocation_id UUID NOT NULL REFERENCES public.table_payment_allocations(id) ON DELETE RESTRICT,
    table_comanda_id UUID NOT NULL REFERENCES public.table_comandas(id) ON DELETE RESTRICT,
    refunded_amount NUMERIC(10,2) NOT NULL CHECK (refunded_amount > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT fk_tpra_refund FOREIGN KEY (table_payment_refund_id) REFERENCES public.table_payment_refunds(id) ON DELETE RESTRICT,
    CONSTRAINT fk_tpra_allocation FOREIGN KEY (table_payment_allocation_id) REFERENCES public.table_payment_allocations(id) ON DELETE RESTRICT,
    CONSTRAINT fk_tpra_comanda FOREIGN KEY (table_comanda_id) REFERENCES public.table_comandas(id) ON DELETE RESTRICT
);

-- 7. TABELAS DE AUDITORIA E LOGS DE DISCREPÂNCIA
CREATE TABLE IF NOT EXISTS public.migration_unlinked_orders_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    order_id UUID NOT NULL,
    table_session_id UUID NOT NULL,
    customer_name TEXT,
    reason TEXT NOT NULL,
    logged_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_migration_unlinked_orders UNIQUE (tenant_id, order_id)
);

CREATE TABLE IF NOT EXISTS public.migration_unallocated_payments_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    table_session_id UUID NOT NULL,
    legacy_payment_id TEXT,
    legacy_payment_index INT,
    amount NUMERIC(10,2),
    customer_name TEXT,
    reason TEXT NOT NULL,
    logged_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    legacy_source_key VARCHAR(255),
    CONSTRAINT uq_migration_unallocated_payments UNIQUE (tenant_id, table_session_id, legacy_source_key)
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'migration_unallocated_payments_log' AND column_name = 'legacy_source_key'
    ) THEN
        ALTER TABLE public.migration_unallocated_payments_log ADD COLUMN legacy_source_key VARCHAR(255);
        ALTER TABLE public.migration_unallocated_payments_log ADD CONSTRAINT uq_migration_unallocated_payments UNIQUE (tenant_id, table_session_id, legacy_source_key);
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.migration_divergent_records_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    table_session_id UUID NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    legacy_identifier TEXT NOT NULL,
    divergence_reason TEXT NOT NULL,
    payload JSONB,
    logged_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 8. TRIGGER DE PROTEÇÃO EM ORDERS
CREATE OR REPLACE FUNCTION public.fn_orders_session_comanda_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_session_status VARCHAR(20);
    v_comanda_status VARCHAR(20);
    v_comanda_session_id UUID;
    v_comanda_tenant_id UUID;
BEGIN
    -- Permitir que backfill/manutenção vincule comanda_id em pedidos históricos existentes
    IF TG_OP = 'UPDATE' AND OLD.table_session_id IS NOT DISTINCT FROM NEW.table_session_id AND OLD.comanda_id IS NULL AND NEW.comanda_id IS NOT NULL THEN
        -- Apenas valida que a comanda pertence à mesma sessão e ao mesmo tenant
        SELECT table_session_id, tenant_id INTO v_comanda_session_id, v_comanda_tenant_id
        FROM public.table_comandas
        WHERE id = NEW.comanda_id;

        IF v_comanda_session_id <> NEW.table_session_id THEN
            RAISE EXCEPTION 'A comanda informada não pertence à sessão de mesa do pedido.';
        END IF;

        IF v_comanda_tenant_id <> NEW.tenant_id THEN
            RAISE EXCEPTION 'Violação de isolamento multi-tenant da comanda.';
        END IF;

        RETURN NEW;
    END IF;

    IF NEW.table_session_id IS NOT NULL THEN
        SELECT status INTO v_session_status
        FROM public.table_sessions
        WHERE id = NEW.table_session_id;

        IF v_session_status IS NULL OR v_session_status <> 'open' THEN
            RAISE EXCEPTION 'Não é permitido lançar pedidos em uma sessão de mesa fechada ou inexistente.';
        END IF;

        IF NEW.comanda_id IS NOT NULL THEN
            SELECT status, table_session_id, tenant_id
            INTO v_comanda_status, v_comanda_session_id, v_comanda_tenant_id
            FROM public.table_comandas
            WHERE id = NEW.comanda_id;

            IF v_comanda_status IS NULL THEN
                RAISE EXCEPTION 'A comanda informada não existe.';
            END IF;

            IF v_comanda_status <> 'open' THEN
                RAISE EXCEPTION 'Não é permitido lançar pedidos em comanda encerrada ou cancelada.';
            END IF;

            IF v_comanda_session_id <> NEW.table_session_id THEN
                RAISE EXCEPTION 'A comanda informada não pertence à sessão de mesa do pedido.';
            END IF;

            IF v_comanda_tenant_id <> NEW.tenant_id THEN
                RAISE EXCEPTION 'Violação de isolamento multi-tenant da comanda.';
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_session_comanda_guard ON public.orders;
CREATE TRIGGER trg_orders_session_comanda_guard
BEFORE INSERT OR UPDATE OF table_session_id, comanda_id, status
ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.fn_orders_session_comanda_guard();

-- 9. RPC: create_table_comanda
CREATE OR REPLACE FUNCTION public.create_table_comanda(
    p_session_id UUID,
    p_name VARCHAR(100),
    p_tenant_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_table_id UUID;
    v_session_status VARCHAR(20);
    v_comanda_name VARCHAR(100);
    v_count INT;
    v_new_comanda_id UUID;
    v_comandas_json JSONB;
BEGIN
    IF NOT is_authorized_for_tenant(p_tenant_id) THEN
        RAISE EXCEPTION 'Acesso não autorizado para este tenant.';
    END IF;

    SELECT table_id, status INTO v_table_id, v_session_status
    FROM public.table_sessions
    WHERE id = p_session_id AND tenant_id = p_tenant_id;

    IF v_session_status IS NULL OR v_session_status <> 'open' THEN
        RAISE EXCEPTION 'Sessão da mesa inválida ou não está aberta.';
    END IF;

    PERFORM id FROM public.restaurant_tables
    WHERE id = v_table_id AND tenant_id = p_tenant_id
    FOR UPDATE;

    PERFORM id FROM public.table_sessions
    WHERE id = p_session_id AND tenant_id = p_tenant_id
    FOR UPDATE;

    IF p_name IS NULL OR trim(p_name) = '' THEN
        SELECT count(*) + 1 INTO v_count
        FROM public.table_comandas
        WHERE table_session_id = p_session_id AND tenant_id = p_tenant_id;

        v_comanda_name := 'Comanda ' || lpad(v_count::text, 2, '0');
    ELSE
        v_comanda_name := trim(p_name);
    END IF;

    INSERT INTO public.table_comandas (
        tenant_id,
        table_session_id,
        name,
        status
    ) VALUES (
        p_tenant_id,
        p_session_id,
        v_comanda_name,
        'open'
    )
    RETURNING id INTO v_new_comanda_id;

    SELECT COALESCE(
        jsonb_agg(name ORDER BY created_at ASC),
        '[]'::jsonb
    )
    INTO v_comandas_json
    FROM public.table_comandas
    WHERE table_session_id = p_session_id AND tenant_id = p_tenant_id AND status <> 'cancelled';

    UPDATE public.table_sessions
    SET payment_details = jsonb_set(
        COALESCE(payment_details, '{}'::jsonb),
        '{comandas}',
        v_comandas_json,
        true
    )
    WHERE id = p_session_id AND tenant_id = p_tenant_id;

    RETURN jsonb_build_object(
        'success', true,
        'comanda_id', v_new_comanda_id,
        'name', v_comanda_name
    );
END;
$$;

-- 10. RPC: update_table_comanda_name
CREATE OR REPLACE FUNCTION public.update_table_comanda_name(
    p_comanda_id UUID,
    p_name VARCHAR(100),
    p_tenant_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_session_id UUID;
    v_table_id UUID;
    v_status VARCHAR(20);
    v_new_name VARCHAR(100);
    v_comandas_json JSONB;
BEGIN
    IF NOT is_authorized_for_tenant(p_tenant_id) THEN
        RAISE EXCEPTION 'Acesso não autorizado para este tenant.';
    END IF;

    v_new_name := trim(p_name);
    IF v_new_name = '' THEN
        RAISE EXCEPTION 'O nome da comanda não pode ser vazio.';
    END IF;

    SELECT c.table_session_id, s.table_id, c.status
    INTO v_session_id, v_table_id, v_status
    FROM public.table_comandas c
    JOIN public.table_sessions s ON s.id = c.table_session_id
    WHERE c.id = p_comanda_id AND c.tenant_id = p_tenant_id;

    IF v_status IS NULL THEN
        RAISE EXCEPTION 'Comanda não encontrada.';
    END IF;

    IF v_status <> 'open' THEN
        RAISE EXCEPTION 'Não é possível renomear comanda fechada ou cancelada.';
    END IF;

    PERFORM id FROM public.restaurant_tables
    WHERE id = v_table_id AND tenant_id = p_tenant_id
    FOR UPDATE;

    PERFORM id FROM public.table_sessions
    WHERE id = v_session_id AND tenant_id = p_tenant_id
    FOR UPDATE;

    UPDATE public.table_comandas
    SET name = v_new_name, updated_at = timezone('utc'::text, now())
    WHERE id = p_comanda_id AND tenant_id = p_tenant_id;

    SELECT COALESCE(
        jsonb_agg(name ORDER BY created_at ASC),
        '[]'::jsonb
    )
    INTO v_comandas_json
    FROM public.table_comandas
    WHERE table_session_id = v_session_id AND tenant_id = p_tenant_id AND status <> 'cancelled';

    UPDATE public.table_sessions
    SET payment_details = jsonb_set(
        COALESCE(payment_details, '{}'::jsonb),
        '{comandas}',
        v_comandas_json,
        true
    )
    WHERE id = v_session_id AND tenant_id = p_tenant_id;

    RETURN jsonb_build_object('success', true, 'name', v_new_name);
END;
$$;

-- 11. RPC: process_table_payment
CREATE OR REPLACE FUNCTION public.process_table_payment(
    p_session_id UUID,
    p_tenant_id UUID,
    p_amount NUMERIC(10,2),
    p_payment_method VARCHAR(50),
    p_allocations JSONB,
    p_idempotency_key VARCHAR(100),
    p_paid_by_name VARCHAR(100) DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_existing_payment RECORD;
    v_canonical_allocations TEXT;
    v_payload_hash CHAR(64);
    v_table_id UUID;
    v_cash_session_id UUID;
    v_target_comanda_ids UUID[];
    v_locked_count INT;
    v_expected_count INT;
    v_allocation_sum NUMERIC(10,2) := 0;
    v_item JSONB;
    v_comanda_id UUID;
    v_item_amount NUMERIC(10,2);
    v_consumed NUMERIC(10,2);
    v_paid NUMERIC(10,2);
    v_refunded NUMERIC(10,2);
    v_balance NUMERIC(10,2);
    v_payment_id UUID;
    v_legacy_payment_obj JSONB;
    v_existing_payments JSONB;
    v_alloc_result JSONB := '[]'::jsonb;
    v_comanda_status VARCHAR(20);
    v_all_comandas_paid BOOLEAN := true;
    v_check_rec RECORD;
BEGIN
    IF NOT is_authorized_for_tenant(p_tenant_id) THEN
        RAISE EXCEPTION 'Acesso não autorizado para este tenant.';
    END IF;

    IF p_amount <= 0 THEN
        RAISE EXCEPTION 'O valor do pagamento deve ser estritamente positivo.';
    END IF;

    IF p_allocations IS NULL OR jsonb_array_length(p_allocations) = 0 THEN
        RAISE EXCEPTION 'É obrigatório informar ao menos uma alocação de comanda.';
    END IF;

    -- Canonicalização do JSON de alocações para hash consistente
    SELECT string_agg(
        (elem->>'comanda_id') || ':' || to_char((elem->>'amount')::numeric(10,2), 'FM999999990.00'),
        '|' ORDER BY (elem->>'comanda_id') ASC
    )
    INTO v_canonical_allocations
    FROM jsonb_array_elements(p_allocations) AS elem;

    v_payload_hash := encode(
        digest(
            p_session_id::text || '|' ||
            to_char(p_amount, 'FM999999990.00') || '|' ||
            p_payment_method || '|' ||
            COALESCE(p_paid_by_name, '') || '|' ||
            v_canonical_allocations,
            'sha256'
        ),
        'hex'
    );

    -- Verificação rápida de idempotência (antes dos locks)
    SELECT id, idempotency_payload_hash, amount
    INTO v_existing_payment
    FROM public.table_payments
    WHERE tenant_id = p_tenant_id AND idempotency_key = p_idempotency_key;

    IF v_existing_payment.id IS NOT NULL THEN
        IF v_existing_payment.idempotency_payload_hash = v_payload_hash THEN
            RETURN jsonb_build_object(
                'success', true,
                'payment_id', v_existing_payment.id,
                'replayed', true,
                'message', 'Pagamento recuperado via idempotência.'
            );
        ELSE
            RAISE EXCEPTION 'Chave de idempotência reutilizada com dados de pagamento diferentes.';
        END IF;
    END IF;

    -- Extração dos IDs das comandas envolvidas
    SELECT array_agg(DISTINCT (elem->>'comanda_id')::uuid)
    INTO v_target_comanda_ids
    FROM jsonb_array_elements(p_allocations) AS elem;

    v_expected_count := array_length(v_target_comanda_ids, 1);

    -- 1. Lock do Caixa Aberto
    SELECT id INTO v_cash_session_id
    FROM public.cash_sessions
    WHERE tenant_id = p_tenant_id AND status = 'open'
    LIMIT 1
    FOR UPDATE;

    IF v_cash_session_id IS NULL THEN
        RAISE EXCEPTION 'Não existe caixa aberto para receber este pagamento no salão.';
    END IF;

    -- 2. Lock da Mesa Física
    SELECT s.table_id INTO v_table_id
    FROM public.table_sessions s
    WHERE s.id = p_session_id AND s.tenant_id = p_tenant_id;

    IF v_table_id IS NULL THEN
        RAISE EXCEPTION 'Sessão de mesa não encontrada.';
    END IF;

    PERFORM id FROM public.restaurant_tables
    WHERE id = v_table_id AND tenant_id = p_tenant_id
    FOR UPDATE;

    -- 3. Lock da Sessão
    PERFORM id FROM public.table_sessions
    WHERE id = p_session_id AND tenant_id = p_tenant_id AND status = 'open'
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'A sessão de mesa informada não está aberta.';
    END IF;

    -- Segunda verificação de idempotência (após adquirir locks)
    SELECT id, idempotency_payload_hash, amount
    INTO v_existing_payment
    FROM public.table_payments
    WHERE tenant_id = p_tenant_id AND idempotency_key = p_idempotency_key;

    IF v_existing_payment.id IS NOT NULL THEN
        IF v_existing_payment.idempotency_payload_hash = v_payload_hash THEN
            RETURN jsonb_build_object(
                'success', true,
                'payment_id', v_existing_payment.id,
                'replayed', true,
                'message', 'Pagamento recuperado via idempotência (concorrente).'
            );
        ELSE
            RAISE EXCEPTION 'Chave de idempotência reutilizada com dados diferentes.';
        END IF;
    END IF;

    -- 4. Lock das Comandas envolvidas (ordem id ASC para evitar deadlock)
    PERFORM id FROM public.table_comandas
    WHERE id = ANY(v_target_comanda_ids)
      AND table_session_id = p_session_id
      AND tenant_id = p_tenant_id
    ORDER BY id ASC
    FOR UPDATE;

    GET DIAGNOSTICS v_locked_count = ROW_COUNT;

    IF v_locked_count <> v_expected_count THEN
        RAISE EXCEPTION 'Uma ou mais comandas são inválidas, fechadas ou de outra sessão.';
    END IF;

    -- 5. Validação da Soma de Alocações
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_allocations)
    LOOP
        v_item_amount := (v_item->>'amount')::numeric(10,2);
        IF v_item_amount <= 0 THEN
            RAISE EXCEPTION 'O valor alocado para cada comanda deve ser estritamente maior que zero.';
        END IF;
        v_allocation_sum := v_allocation_sum + v_item_amount;
    END LOOP;

    IF v_allocation_sum <> p_amount THEN
        RAISE EXCEPTION 'A soma das alocações (%) diverge do valor total recebido (%).', v_allocation_sum, p_amount;
    END IF;

    -- 6. Validação dos Saldos devedores de cada comanda
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_allocations)
    LOOP
        v_comanda_id := (v_item->>'comanda_id')::uuid;
        v_item_amount := (v_item->>'amount')::numeric(10,2);

        SELECT status INTO v_comanda_status
        FROM public.table_comandas
        WHERE id = v_comanda_id;

        IF v_comanda_status <> 'open' THEN
            RAISE EXCEPTION 'A comanda % já se encontra fechada ou cancelada.', v_comanda_id;
        END IF;

        -- Consumo
        SELECT COALESCE(SUM(total_amount), 0)
        INTO v_consumed
        FROM public.orders
        WHERE comanda_id = v_comanda_id AND status <> 'cancelled';

        -- Pagamentos alocados anteriores
        SELECT COALESCE(SUM(allocated_amount), 0)
        INTO v_paid
        FROM public.table_payment_allocations
        WHERE table_comanda_id = v_comanda_id;

        -- Estornos anteriores da comanda
        SELECT COALESCE(SUM(refunded_amount), 0)
        INTO v_refunded
        FROM public.table_payment_refund_allocations
        WHERE table_comanda_id = v_comanda_id;

        v_balance := v_consumed - (v_paid - v_refunded);

        IF v_item_amount > v_balance THEN
            RAISE EXCEPTION 'Valor de pagamento (%) excede o saldo devedor (%) da comanda %.',
                v_item_amount, v_balance, v_comanda_id;
        END IF;
    END LOOP;

    -- 7. Gravação de Pagamento Principal
    INSERT INTO public.table_payments (
        tenant_id,
        table_session_id,
        cash_session_id,
        amount,
        payment_method,
        idempotency_key,
        idempotency_payload_hash,
        paid_by_name,
        created_by
    ) VALUES (
        p_tenant_id,
        p_session_id,
        v_cash_session_id,
        p_amount,
        p_payment_method,
        p_idempotency_key,
        v_payload_hash,
        p_paid_by_name,
        auth.uid()
    )
    RETURNING id INTO v_payment_id;

    -- 8. Gravação das Alocações e Atualização de Status das Comandas
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_allocations)
    LOOP
        v_comanda_id := (v_item->>'comanda_id')::uuid;
        v_item_amount := (v_item->>'amount')::numeric(10,2);

        INSERT INTO public.table_payment_allocations (
            tenant_id,
            table_payment_id,
            table_comanda_id,
            table_session_id,
            allocated_amount
        ) VALUES (
            p_tenant_id,
            v_payment_id,
            v_comanda_id,
            p_session_id,
            v_item_amount
        );

        -- Recalcula saldo restante da comanda após a alocação
        SELECT COALESCE(SUM(total_amount), 0) INTO v_consumed
        FROM public.orders
        WHERE comanda_id = v_comanda_id AND status <> 'cancelled';

        SELECT COALESCE(SUM(allocated_amount), 0) INTO v_paid
        FROM public.table_payment_allocations
        WHERE table_comanda_id = v_comanda_id;

        SELECT COALESCE(SUM(refunded_amount), 0) INTO v_refunded
        FROM public.table_payment_refund_allocations
        WHERE table_comanda_id = v_comanda_id;

        v_balance := v_consumed - (v_paid - v_refunded);

        IF v_balance = 0 THEN
            UPDATE public.table_comandas
            SET status = 'closed', closed_at = timezone('utc'::text, now()), updated_at = timezone('utc'::text, now())
            WHERE id = v_comanda_id;
        END IF;

        v_alloc_result := v_alloc_result || jsonb_build_object(
            'comanda_id', v_comanda_id,
            'allocated_amount', v_item_amount,
            'remaining_balance', v_balance
        );
    END LOOP;

    -- 9. Movimentação de Caixa
    INSERT INTO public.cash_movements (
        tenant_id,
        cash_session_id,
        type,
        amount,
        reason,
        payment_method,
        created_by
    ) VALUES (
        p_tenant_id,
        v_cash_session_id,
        'order_payment',
        p_amount,
        'Recebimento Salão Mesa - ' || COALESCE(p_paid_by_name, 'Cliente'),
        p_payment_method,
        auth.uid()
    );

    -- 10. Dual-Write em payment_details para compatibilidade total
    SELECT COALESCE(payment_details->'payments', '[]'::jsonb)
    INTO v_existing_payments
    FROM public.table_sessions
    WHERE id = p_session_id;

    v_legacy_payment_obj := jsonb_build_object(
        'id', 'pay_' || replace(v_payment_id::text, '-', ''),
        'amount', p_amount,
        'method', p_payment_method,
        'customer_name', COALESCE(p_paid_by_name, 'Cliente'),
        'timestamp', to_char(timezone('utc'::text, now()), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
        'payment_id', v_payment_id
    );

    UPDATE public.table_sessions
    SET payment_details = jsonb_set(
        COALESCE(payment_details, '{}'::jsonb),
        '{payments}',
        v_existing_payments || v_legacy_payment_obj,
        true
    )
    WHERE id = p_session_id AND tenant_id = p_tenant_id;

    RETURN jsonb_build_object(
        'success', true,
        'payment_id', v_payment_id,
        'amount', p_amount,
        'allocations', v_alloc_result
    );
END;
$$;

-- 12. RPC: refund_table_payment
CREATE OR REPLACE FUNCTION public.refund_table_payment(
    p_payment_id UUID,
    p_refund_amount NUMERIC(10,2),
    p_allocations JSONB,
    p_reason TEXT,
    p_idempotency_key VARCHAR(100),
    p_tenant_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_existing_refund RECORD;
    v_payment RECORD;
    v_table_id UUID;
    v_cash_session_id UUID;
    v_total_refunded NUMERIC(10,2);
    v_available_to_refund NUMERIC(10,2);
    v_item JSONB;
    v_alloc_id UUID;
    v_comanda_id UUID;
    v_refund_item_amount NUMERIC(10,2);
    v_alloc_sum NUMERIC(10,2) := 0;
    v_orig_alloc_amount NUMERIC(10,2);
    v_orig_alloc_refunded NUMERIC(10,2);
    v_refund_id UUID;
    v_consumed NUMERIC(10,2);
    v_paid NUMERIC(10,2);
    v_refunded NUMERIC(10,2);
    v_balance NUMERIC(10,2);
    v_existing_payments JSONB;
    v_legacy_refund_obj JSONB;
BEGIN
    IF NOT is_authorized_for_tenant(p_tenant_id) THEN
        RAISE EXCEPTION 'Acesso não autorizado para este tenant.';
    END IF;

    IF p_refund_amount <= 0 THEN
        RAISE EXCEPTION 'O valor do estorno deve ser estritamente positivo.';
    END IF;

    IF p_allocations IS NULL OR jsonb_array_length(p_allocations) = 0 THEN
        RAISE EXCEPTION 'É obrigatório especificar o rateio do estorno nas comandas.';
    END IF;

    -- 1. Verificação rápida de idempotência
    SELECT id, refund_amount INTO v_existing_refund
    FROM public.table_payment_refunds
    WHERE tenant_id = p_tenant_id AND idempotency_key = p_idempotency_key;

    IF v_existing_refund.id IS NOT NULL THEN
        RETURN jsonb_build_object(
            'success', true,
            'refund_id', v_existing_refund.id,
            'replayed', true,
            'message', 'Estorno recuperado via idempotência.'
        );
    END IF;

    -- 2. Lock do Caixa Aberto
    SELECT id INTO v_cash_session_id
    FROM public.cash_sessions
    WHERE tenant_id = p_tenant_id AND status = 'open'
    LIMIT 1
    FOR UPDATE;

    IF v_cash_session_id IS NULL THEN
        RAISE EXCEPTION 'Não existe caixa aberto para realizar a devolução do estorno.';
    END IF;

    -- 3. Obter dados e travar pagamento original
    SELECT p.*, s.table_id
    INTO v_payment
    FROM public.table_payments p
    JOIN public.table_sessions s ON s.id = p.table_session_id
    WHERE p.id = p_payment_id AND p.tenant_id = p_tenant_id;

    IF v_payment.id IS NULL THEN
        RAISE EXCEPTION 'Pagamento original não encontrado.';
    END IF;

    -- Trava mesa física e sessão
    PERFORM id FROM public.restaurant_tables
    WHERE id = v_payment.table_id AND tenant_id = p_tenant_id
    FOR UPDATE;

    PERFORM id FROM public.table_sessions
    WHERE id = v_payment.table_session_id AND tenant_id = p_tenant_id
    FOR UPDATE;

    PERFORM id FROM public.table_payments
    WHERE id = p_payment_id AND tenant_id = p_tenant_id
    FOR UPDATE;

    -- Segunda verificação de idempotência (após lock)
    SELECT id, refund_amount INTO v_existing_refund
    FROM public.table_payment_refunds
    WHERE tenant_id = p_tenant_id AND idempotency_key = p_idempotency_key;

    IF v_existing_refund.id IS NOT NULL THEN
        RETURN jsonb_build_object(
            'success', true,
            'refund_id', v_existing_refund.id,
            'replayed', true,
            'message', 'Estorno recuperado via idempotência (concorrente).'
        );
    END IF;

    -- Validação do teto estornável do pagamento
    SELECT COALESCE(SUM(refund_amount), 0)
    INTO v_total_refunded
    FROM public.table_payment_refunds
    WHERE table_payment_id = p_payment_id;

    v_available_to_refund := v_payment.amount - v_total_refunded;

    IF p_refund_amount > v_available_to_refund THEN
        RAISE EXCEPTION 'Valor do estorno (%) excede o saldo remanescente (%) deste pagamento.',
            p_refund_amount, v_available_to_refund;
    END IF;

    -- Validação do rateio do estorno
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_allocations)
    LOOP
        v_alloc_id := (v_item->>'allocation_id')::uuid;
        v_refund_item_amount := (v_item->>'amount')::numeric(10,2);
        v_alloc_sum := v_alloc_sum + v_refund_item_amount;

        SELECT allocated_amount, table_comanda_id
        INTO v_orig_alloc_amount, v_comanda_id
        FROM public.table_payment_allocations
        WHERE id = v_alloc_id AND table_payment_id = p_payment_id;

        IF v_orig_alloc_amount IS NULL THEN
            RAISE EXCEPTION 'Alocação % não pertence a este pagamento.', v_alloc_id;
        END IF;

        SELECT COALESCE(SUM(refunded_amount), 0)
        INTO v_orig_alloc_refunded
        FROM public.table_payment_refund_allocations
        WHERE table_payment_allocation_id = v_alloc_id;

        IF v_refund_item_amount > (v_orig_alloc_amount - v_orig_alloc_refunded) THEN
            RAISE EXCEPTION 'Estorno alocado excede o valor disponível na alocação da comanda.';
        END IF;
    END LOOP;

    IF v_alloc_sum <> p_refund_amount THEN
        RAISE EXCEPTION 'Soma das devoluções (%) diverge do total estornado (%).', v_alloc_sum, p_refund_amount;
    END IF;

    -- Gravação do Estorno
    INSERT INTO public.table_payment_refunds (
        tenant_id,
        table_payment_id,
        table_session_id,
        cash_session_id,
        refund_amount,
        reason,
        idempotency_key,
        created_by
    ) VALUES (
        p_tenant_id,
        p_payment_id,
        v_payment.table_session_id,
        v_cash_session_id,
        p_refund_amount,
        p_reason,
        p_idempotency_key,
        auth.uid()
    )
    RETURNING id INTO v_refund_id;

    -- Gravação dos rateios de devolução e reabertura de comandas caso saldo > 0
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_allocations)
    LOOP
        v_alloc_id := (v_item->>'allocation_id')::uuid;
        v_refund_item_amount := (v_item->>'amount')::numeric(10,2);

        SELECT table_comanda_id INTO v_comanda_id
        FROM public.table_payment_allocations
        WHERE id = v_alloc_id;

        INSERT INTO public.table_payment_refund_allocations (
            tenant_id,
            table_payment_refund_id,
            table_payment_allocation_id,
            table_comanda_id,
            refunded_amount
        ) VALUES (
            p_tenant_id,
            v_refund_id,
            v_alloc_id,
            v_comanda_id,
            v_refund_item_amount
        );

        -- Recalcula saldo e reabre se houver dívida em aberto
        SELECT COALESCE(SUM(total_amount), 0) INTO v_consumed
        FROM public.orders
        WHERE comanda_id = v_comanda_id AND status <> 'cancelled';

        SELECT COALESCE(SUM(allocated_amount), 0) INTO v_paid
        FROM public.table_payment_allocations
        WHERE table_comanda_id = v_comanda_id;

        SELECT COALESCE(SUM(refunded_amount), 0) INTO v_refunded
        FROM public.table_payment_refund_allocations
        WHERE table_comanda_id = v_comanda_id;

        v_balance := v_consumed - (v_paid - v_refunded);

        IF v_balance > 0 THEN
            UPDATE public.table_comandas
            SET status = 'open', closed_at = NULL, updated_at = timezone('utc'::text, now())
            WHERE id = v_comanda_id;
        END IF;
    END LOOP;

    -- Movimentação de Saída no Caixa (bleed)
    INSERT INTO public.cash_movements (
        tenant_id,
        cash_session_id,
        type,
        amount,
        reason,
        payment_method,
        created_by
    ) VALUES (
        p_tenant_id,
        v_cash_session_id,
        'bleed',
        p_refund_amount,
        'Estorno Mesa Salão - ' || p_reason,
        v_payment.payment_method,
        auth.uid()
    );

    -- Dual-write do estorno em payment_details
    SELECT COALESCE(payment_details->'payments', '[]'::jsonb)
    INTO v_existing_payments
    FROM public.table_sessions
    WHERE id = v_payment.table_session_id;

    v_legacy_refund_obj := jsonb_build_object(
        'id', 'ref_' || replace(v_refund_id::text, '-', ''),
        'amount', -p_refund_amount,
        'method', v_payment.payment_method,
        'customer_name', 'Estorno: ' || p_reason,
        'timestamp', to_char(timezone('utc'::text, now()), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
        'refund_id', v_refund_id
    );

    UPDATE public.table_sessions
    SET payment_details = jsonb_set(
        COALESCE(payment_details, '{}'::jsonb),
        '{payments}',
        v_existing_payments || v_legacy_refund_obj,
        true
    )
    WHERE id = v_payment.table_session_id AND tenant_id = p_tenant_id;

    RETURN jsonb_build_object(
        'success', true,
        'refund_id', v_refund_id,
        'refunded_amount', p_refund_amount
    );
END;
$$;

-- 13. RPC: release_table
CREATE OR REPLACE FUNCTION public.release_table(
    p_session_id UUID,
    p_tenant_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_table_id UUID;
    v_pending_orders_count INT;
    v_open_comandas_count INT;
    v_comanda RECORD;
    v_consumed NUMERIC(10,2);
    v_paid NUMERIC(10,2);
    v_refunded NUMERIC(10,2);
    v_balance NUMERIC(10,2);
BEGIN
    IF NOT is_authorized_for_tenant(p_tenant_id) THEN
        RAISE EXCEPTION 'Acesso não autorizado para este tenant.';
    END IF;

    SELECT table_id INTO v_table_id
    FROM public.table_sessions
    WHERE id = p_session_id AND tenant_id = p_tenant_id AND status = 'open';

    IF v_table_id IS NULL THEN
        RAISE EXCEPTION 'Sessão de mesa não encontrada ou já encerrada.';
    END IF;

    -- Trava física e de sessão
    PERFORM id FROM public.restaurant_tables
    WHERE id = v_table_id AND tenant_id = p_tenant_id
    FOR UPDATE;

    PERFORM id FROM public.table_sessions
    WHERE id = p_session_id AND tenant_id = p_tenant_id
    FOR UPDATE;

    -- 1. Verifica pedidos pendentes na cozinha/KDS
    SELECT count(*) INTO v_pending_orders_count
    FROM public.orders
    WHERE table_session_id = p_session_id
      AND tenant_id = p_tenant_id
      AND status IN ('pending', 'confirmed', 'preparing');

    IF v_pending_orders_count > 0 THEN
        RAISE EXCEPTION 'Não é possível liberar a mesa com % pedido(s) em preparo na cozinha/KDS.', v_pending_orders_count;
    END IF;

    -- 2. Verifica se há comandas com saldo devedor
    FOR v_comanda IN
        SELECT id, name, status
        FROM public.table_comandas
        WHERE table_session_id = p_session_id AND tenant_id = p_tenant_id
        ORDER BY id ASC
        FOR UPDATE
    LOOP
        SELECT COALESCE(SUM(total_amount), 0) INTO v_consumed
        FROM public.orders
        WHERE comanda_id = v_comanda.id AND status <> 'cancelled';

        SELECT COALESCE(SUM(allocated_amount), 0) INTO v_paid
        FROM public.table_payment_allocations
        WHERE table_comanda_id = v_comanda.id;

        SELECT COALESCE(SUM(refunded_amount), 0) INTO v_refunded
        FROM public.table_payment_refund_allocations
        WHERE table_comanda_id = v_comanda.id;

        v_balance := v_consumed - (v_paid - v_refunded);

        IF v_balance > 0 THEN
            RAISE EXCEPTION 'A comanda "%" ainda possui saldo devedor de R$ % pendente.', v_comanda.name, v_balance;
        END IF;

        IF v_comanda.status = 'open' THEN
            UPDATE public.table_comandas
            SET status = 'closed', closed_at = timezone('utc'::text, now()), updated_at = timezone('utc'::text, now())
            WHERE id = v_comanda.id;
        END IF;
    END LOOP;

    -- 3. Encerra a sessão da mesa e desocupa a mesa
    UPDATE public.table_sessions
    SET status = 'closed', closed_at = timezone('utc'::text, now()), updated_at = timezone('utc'::text, now())
    WHERE id = p_session_id AND tenant_id = p_tenant_id;

    UPDATE public.restaurant_tables
    SET status = 'available', current_session_id = NULL, updated_at = timezone('utc'::text, now())
    WHERE id = v_table_id AND tenant_id = p_tenant_id;

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Mesa liberada com sucesso.'
    );
END;
$$;

-- 14. PROCEDURE: sp_backfill_table_comandas_idempotent
CREATE OR REPLACE PROCEDURE public.sp_backfill_table_comandas_idempotent()
LANGUAGE plpgsql
AS $$
DECLARE
    v_session RECORD;
    v_order RECORD;
    v_comanda_name TEXT;
    v_norm_name TEXT;
    v_comanda_id UUID;
    v_legacy_comandas JSONB;
    v_legacy_payments JSONB;
    v_comanda_elem JSONB;
    v_payment_elem JSONB;
    v_payment_idx INT;
    v_payment_id_text TEXT;
    v_payment_amount NUMERIC(10,2);
    v_payment_method TEXT;
    v_paid_by_name TEXT;
    v_payment_ts TIMESTAMPTZ;
    v_payment_uuid UUID;
    v_matching_comandas UUID[];
    v_target_comanda_id UUID;
    v_source_key TEXT;
    v_historical_cash_id UUID;
    v_total_consumed NUMERIC(10,2);
    v_total_allocated NUMERIC(10,2);
    v_candidate_balance NUMERIC(10,2);
    v_has_divergence BOOLEAN;
    v_existing_payment_amount NUMERIC(10,2);
    v_raw_amount_text TEXT;
    v_raw_clean_text TEXT;
BEGIN
    FOR v_session IN
        SELECT s.id, s.tenant_id, s.table_id, s.payment_details, s.opened_at, s.closed_at, s.status
        FROM public.table_sessions s
        ORDER BY s.opened_at ASC
    LOOP
        v_legacy_comandas := v_session.payment_details->'comandas';
        v_legacy_payments := v_session.payment_details->'payments';

        -- A. Criação de Comandas a partir do array de comandas legadas
        IF v_legacy_comandas IS NOT NULL AND jsonb_typeof(v_legacy_comandas) = 'array' THEN
            FOR v_comanda_elem IN SELECT * FROM jsonb_array_elements(v_legacy_comandas)
            LOOP
                v_comanda_name := trim(trim(both '"' from v_comanda_elem::text));
                v_norm_name := lower(regexp_replace(v_comanda_name, '\s+', ' ', 'g'));
                IF v_norm_name <> '' THEN
                    v_source_key := 'legacy_cmd_' || md5(v_norm_name);
                    INSERT INTO public.table_comandas (
                        tenant_id,
                        table_session_id,
                        name,
                        status,
                        created_at,
                        legacy_source_key
                    ) VALUES (
                        v_session.tenant_id,
                        v_session.id,
                        v_comanda_name,
                        CASE WHEN v_session.status = 'closed' THEN 'closed' ELSE 'open' END,
                        COALESCE(v_session.opened_at, timezone('utc'::text, now())),
                        v_source_key
                    )
                    ON CONFLICT (tenant_id, table_session_id, legacy_source_key) DO NOTHING;
                END IF;
            END LOOP;
        END IF;

        -- B. Criação de Comandas a partir de pedidos com customer_name que ainda não existem
        FOR v_order IN
            SELECT id, customer_name, total_amount, created_date
            FROM public.orders
            WHERE table_session_id = v_session.id AND tenant_id = v_session.tenant_id
        LOOP
            v_comanda_name := trim(COALESCE(v_order.customer_name, ''));
            v_norm_name := lower(regexp_replace(v_comanda_name, '\s+', ' ', 'g'));

            IF v_norm_name <> '' THEN
                v_source_key := 'legacy_cmd_' || md5(v_norm_name);
                INSERT INTO public.table_comandas (
                    tenant_id,
                    table_session_id,
                    name,
                    status,
                    created_at,
                    legacy_source_key
                ) VALUES (
                    v_session.tenant_id,
                    v_session.id,
                    v_comanda_name,
                    CASE WHEN v_session.status = 'closed' THEN 'closed' ELSE 'open' END,
                    COALESCE(v_order.created_date, v_session.opened_at, timezone('utc'::text, now())),
                    v_source_key
                )
                ON CONFLICT (tenant_id, table_session_id, legacy_source_key) DO NOTHING;
            END IF;
        END LOOP;

        -- C. Se a sessão tem pedidos mas nenhuma comanda foi criada, cria Comanda 01
        IF NOT EXISTS (
            SELECT 1 FROM public.table_comandas
            WHERE table_session_id = v_session.id AND tenant_id = v_session.tenant_id
        ) AND EXISTS (
            SELECT 1 FROM public.orders
            WHERE table_session_id = v_session.id AND tenant_id = v_session.tenant_id
        ) THEN
            INSERT INTO public.table_comandas (
                tenant_id,
                table_session_id,
                name,
                status,
                created_at,
                legacy_source_key
            ) VALUES (
                v_session.tenant_id,
                v_session.id,
                'Comanda 01',
                CASE WHEN v_session.status = 'closed' THEN 'closed' ELSE 'open' END,
                COALESCE(v_session.opened_at, timezone('utc'::text, now())),
                'legacy_cmd_default_01'
            )
            ON CONFLICT (tenant_id, table_session_id, legacy_source_key) DO NOTHING;
        END IF;

        -- D. Vínculo dos Pedidos com Comandas (Sem suposições cegas)
        FOR v_order IN
            SELECT id, customer_name, total_amount
            FROM public.orders
            WHERE table_session_id = v_session.id
              AND tenant_id = v_session.tenant_id
              AND comanda_id IS NULL
        LOOP
            v_target_comanda_id := NULL;
            v_comanda_name := trim(COALESCE(v_order.customer_name, ''));
            v_norm_name := lower(regexp_replace(v_comanda_name, '\s+', ' ', 'g'));

            IF v_norm_name <> '' THEN
                SELECT array_agg(id) INTO v_matching_comandas
                FROM public.table_comandas
                WHERE table_session_id = v_session.id
                  AND tenant_id = v_session.tenant_id
                  AND lower(regexp_replace(name, '\s+', ' ', 'g')) = v_norm_name;

                IF array_length(v_matching_comandas, 1) = 1 THEN
                    v_target_comanda_id := v_matching_comandas[1];
                ELSE
                    INSERT INTO public.migration_unlinked_orders_log (
                        tenant_id, order_id, table_session_id, customer_name, reason
                    ) VALUES (
                        v_session.tenant_id, v_order.id, v_session.id, v_order.customer_name,
                        CASE WHEN v_matching_comandas IS NULL THEN 'Nenhuma comanda encontrada para o nome.'
                             ELSE 'Múltiplas comandas encontradas com o mesmo nome na sessão.' END
                    )
                    ON CONFLICT (tenant_id, order_id) DO NOTHING;
                END IF;
            ELSE
                -- Pedido sem customer_name: se há exatamente uma comanda na sessão, associa
                SELECT array_agg(id) INTO v_matching_comandas
                FROM public.table_comandas
                WHERE table_session_id = v_session.id AND tenant_id = v_session.tenant_id;

                IF array_length(v_matching_comandas, 1) = 1 THEN
                    v_target_comanda_id := v_matching_comandas[1];
                ELSE
                    INSERT INTO public.migration_unlinked_orders_log (
                        tenant_id, order_id, table_session_id, customer_name, reason
                    ) VALUES (
                        v_session.tenant_id, v_order.id, v_session.id, v_order.customer_name,
                        'Pedido sem customer_name em sessão com ' || COALESCE(array_length(v_matching_comandas, 1), 0)::text || ' comandas.'
                    )
                    ON CONFLICT (tenant_id, order_id) DO NOTHING;
                END IF;
            END IF;

            IF v_target_comanda_id IS NOT NULL THEN
                UPDATE public.orders
                SET comanda_id = v_target_comanda_id
                WHERE id = v_order.id;
            END IF;
        END LOOP;

        -- E. Migração dos Pagamentos Legados
        IF v_legacy_payments IS NOT NULL AND jsonb_typeof(v_legacy_payments) = 'array' THEN
            v_payment_idx := 0;
            FOR v_payment_elem IN SELECT * FROM jsonb_array_elements(v_legacy_payments)
            LOOP
                v_payment_idx := v_payment_idx + 1;
                v_payment_id_text := trim(both '"' from COALESCE(v_payment_elem->>'id', ''));
                v_raw_amount_text := v_payment_elem->>'amount';
                v_raw_clean_text := regexp_replace(v_raw_amount_text, '[^0-9\.\-]', '', 'g');
                v_payment_amount := v_raw_clean_text::numeric(10,2);
                v_payment_method := COALESCE(v_payment_elem->>'method', 'outro');
                v_paid_by_name := v_payment_elem->>'customer_name';
                v_payment_ts := COALESCE((v_payment_elem->>'timestamp')::timestamptz, v_session.closed_at, v_session.opened_at, timezone('utc'::text, now()));

                IF v_payment_id_text <> '' THEN
                    v_source_key := 'legacy_pay_id_' || v_payment_id_text;
                ELSE
                    v_source_key := 'legacy_pay_idx_' || v_payment_idx::text || '_' || md5(COALESCE(v_paid_by_name, '') || ':' || v_payment_amount::text);
                END IF;

                -- Tenta identificar sessão de caixa da época do pagamento
                SELECT id INTO v_historical_cash_id
                FROM public.cash_sessions
                WHERE tenant_id = v_session.tenant_id
                  AND opened_at <= v_payment_ts
                  AND (closed_at IS NULL OR closed_at >= v_payment_ts)
                ORDER BY opened_at DESC
                LIMIT 1;

                -- Trata apenas pagamentos positivos (valores negativos eram estornos manuais no legado)
                IF v_payment_amount > 0 THEN
                    -- Verifica se já existe registro migrado com divergência
                    SELECT amount INTO v_existing_payment_amount
                    FROM public.table_payments
                    WHERE tenant_id = v_session.tenant_id
                      AND table_session_id = v_session.id
                      AND legacy_source_key = v_source_key;

                    IF v_existing_payment_amount IS NOT NULL AND v_existing_payment_amount <> v_payment_amount THEN
                        INSERT INTO public.migration_divergent_records_log (
                            tenant_id, table_session_id, entity_type, legacy_identifier,
                            divergence_reason, payload
                        ) VALUES (
                            v_session.tenant_id, v_session.id, 'table_payments', v_source_key,
                            'Valor migrado difere do registro legado.',
                            jsonb_build_object('existing', v_existing_payment_amount, 'legacy', v_payment_amount)
                        );
                    END IF;

                    INSERT INTO public.table_payments (
                        tenant_id,
                        table_session_id,
                        cash_session_id,
                        amount,
                        payment_method,
                        paid_by_name,
                        created_at,
                        is_legacy_migrated,
                        legacy_source_key
                    ) VALUES (
                        v_session.tenant_id,
                        v_session.id,
                        v_historical_cash_id,
                        v_payment_amount,
                        v_payment_method,
                        v_paid_by_name,
                        v_payment_ts,
                        true,
                        v_source_key
                    )
                    ON CONFLICT (tenant_id, table_session_id, legacy_source_key) DO UPDATE
                    SET tenant_id = EXCLUDED.tenant_id -- no-op seguro para capturar RETURNING id
                    RETURNING id INTO v_payment_uuid;

                    -- F. Conciliação e Alocação do Pagamento Legado
                    v_target_comanda_id := NULL;
                    v_norm_name := lower(regexp_replace(COALESCE(v_paid_by_name, ''), '\s+', ' ', 'g'));

                    IF v_norm_name <> '' THEN
                        SELECT array_agg(id) INTO v_matching_comandas
                        FROM public.table_comandas
                        WHERE table_session_id = v_session.id
                          AND tenant_id = v_session.tenant_id
                          AND lower(regexp_replace(name, '\s+', ' ', 'g')) = v_norm_name;

                        IF array_length(v_matching_comandas, 1) = 1 THEN
                            v_target_comanda_id := v_matching_comandas[1];
                        END IF;
                    END IF;

                    -- Se não encontrou por nome, mas há apenas 1 comanda na sessão inteira
                    IF v_target_comanda_id IS NULL THEN
                        SELECT array_agg(id) INTO v_matching_comandas
                        FROM public.table_comandas
                        WHERE table_session_id = v_session.id AND tenant_id = v_session.tenant_id;

                        IF array_length(v_matching_comandas, 1) = 1 THEN
                            v_target_comanda_id := v_matching_comandas[1];
                        END IF;
                    END IF;

                    IF v_target_comanda_id IS NOT NULL THEN
                        -- Verifica saldo disponível para não exceder consumo
                        SELECT COALESCE(SUM(total_amount), 0) INTO v_total_consumed
                        FROM public.orders
                        WHERE comanda_id = v_target_comanda_id AND status <> 'cancelled';

                        SELECT COALESCE(SUM(allocated_amount), 0) INTO v_total_allocated
                        FROM public.table_payment_allocations
                        WHERE table_comanda_id = v_target_comanda_id
                          AND table_payment_id <> v_payment_uuid;

                        v_candidate_balance := v_total_consumed - v_total_allocated;

                        IF v_candidate_balance >= v_payment_amount THEN
                            INSERT INTO public.table_payment_allocations (
                                tenant_id,
                                table_payment_id,
                                table_comanda_id,
                                table_session_id,
                                allocated_amount,
                                legacy_source_key
                            ) VALUES (
                                v_session.tenant_id,
                                v_payment_uuid,
                                v_target_comanda_id,
                                v_session.id,
                                v_payment_amount,
                                'legacy_alloc_' || v_source_key
                            )
                            ON CONFLICT (tenant_id, table_session_id, legacy_source_key) DO NOTHING;
                        ELSE
                            INSERT INTO public.migration_unallocated_payments_log (
                                tenant_id, table_session_id, legacy_payment_id, legacy_payment_index,
                                amount, customer_name, reason, legacy_source_key
                            ) VALUES (
                                v_session.tenant_id, v_session.id, v_payment_id_text, v_payment_idx,
                                v_payment_amount, v_paid_by_name,
                                'Valor do pagamento (' || v_payment_amount::text || ') excede o saldo devedor restante (' || v_candidate_balance::text || ') da comanda.',
                                v_source_key
                            )
                            ON CONFLICT (tenant_id, table_session_id, legacy_source_key) DO NOTHING;
                        END IF;
                    ELSE
                        INSERT INTO public.migration_unallocated_payments_log (
                            tenant_id, table_session_id, legacy_payment_id, legacy_payment_index,
                            amount, customer_name, reason, legacy_source_key
                        ) VALUES (
                            v_session.tenant_id, v_session.id, v_payment_id_text, v_payment_idx,
                            v_payment_amount, v_paid_by_name,
                            'Não foi possível vincular univocamente a uma comanda da sessão.',
                            v_source_key
                        )
                        ON CONFLICT (tenant_id, table_session_id, legacy_source_key) DO NOTHING;
                    END IF;
                END IF;
            END LOOP;
        END IF;
    END LOOP;
END;
$$;

-- 15. PERMISSÕES E SEGURANÇA (RESTRICT DIRECT REST WRITES)
REVOKE ALL ON TABLE public.table_comandas FROM anon, authenticated;
REVOKE ALL ON TABLE public.table_payments FROM anon, authenticated;
REVOKE ALL ON TABLE public.table_payment_allocations FROM anon, authenticated;
REVOKE ALL ON TABLE public.table_payment_refunds FROM anon, authenticated;
REVOKE ALL ON TABLE public.table_payment_refund_allocations FROM anon, authenticated;

-- Somente leitura autorizada via RLS para clientes
GRANT SELECT ON TABLE public.table_comandas TO authenticated;
GRANT SELECT ON TABLE public.table_payments TO authenticated;
GRANT SELECT ON TABLE public.table_payment_allocations TO authenticated;
GRANT SELECT ON TABLE public.table_payment_refunds TO authenticated;
GRANT SELECT ON TABLE public.table_payment_refund_allocations TO authenticated;

ALTER TABLE public.table_comandas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.table_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.table_payment_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.table_payment_refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.table_payment_refund_allocations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_select_table_comandas ON public.table_comandas;
CREATE POLICY p_select_table_comandas ON public.table_comandas
    FOR SELECT TO authenticated
    USING (is_authorized_for_tenant(tenant_id));

DROP POLICY IF EXISTS p_select_table_payments ON public.table_payments;
CREATE POLICY p_select_table_payments ON public.table_payments
    FOR SELECT TO authenticated
    USING (is_authorized_for_tenant(tenant_id));

DROP POLICY IF EXISTS p_select_table_payment_allocations ON public.table_payment_allocations;
CREATE POLICY p_select_table_payment_allocations ON public.table_payment_allocations
    FOR SELECT TO authenticated
    USING (is_authorized_for_tenant(tenant_id));

DROP POLICY IF EXISTS p_select_table_payment_refunds ON public.table_payment_refunds;
CREATE POLICY p_select_table_payment_refunds ON public.table_payment_refunds
    FOR SELECT TO authenticated
    USING (is_authorized_for_tenant(tenant_id));

DROP POLICY IF EXISTS p_select_table_payment_refund_allocations ON public.table_payment_refund_allocations;
CREATE POLICY p_select_table_payment_refund_allocations ON public.table_payment_refund_allocations
    FOR SELECT TO authenticated
    USING (is_authorized_for_tenant(tenant_id));

-- Permissões de Execução das RPCs
GRANT EXECUTE ON FUNCTION public.create_table_comanda(UUID, VARCHAR, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_table_comanda_name(UUID, VARCHAR, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.process_table_payment(UUID, UUID, NUMERIC, VARCHAR, JSONB, VARCHAR, VARCHAR) TO authenticated;
GRANT EXECUTE ON FUNCTION public.refund_table_payment(UUID, NUMERIC, JSONB, TEXT, VARCHAR, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.release_table(UUID, UUID) TO authenticated;
