-- ==============================================================================
-- 🚀 PEDEMULEKE — HOTFIX DE PRODUÇÃO: CASH SESSIONS, ORDERS & ADMIN RPC
-- Projeto Alvo: jqwtnzdsaivbjudvjhld (PedeMuleke Prod)
-- Data: 17/11/2026
-- ==============================================================================

-- 1. Sessões de Caixa (Persistência multi-dispositivo e trilha de auditoria)
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
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_cash_sessions_open_tenant
    ON public.cash_sessions (tenant_id)
    WHERE status = 'open';

CREATE INDEX IF NOT EXISTS idx_cash_sessions_tenant_opened
    ON public.cash_sessions (tenant_id, opened_at DESC);

ALTER TABLE public.cash_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cash_sessions_all" ON public.cash_sessions;
CREATE POLICY "cash_sessions_all"
    ON public.cash_sessions
    FOR ALL
    TO authenticated, service_role
    USING (true)
    WITH CHECK (true);

-- 2. Movimentações da Gaveta (Suprimentos, Sangrias e Despesas)
CREATE TABLE IF NOT EXISTS public.cash_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    cash_session_id UUID NOT NULL REFERENCES public.cash_sessions(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('opening', 'supply', 'bleed', 'expense', 'order_payment', 'cashback_in', 'cashback_out')),
    title TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'Geral',
    amount NUMERIC(10,2) NOT NULL CHECK (amount > 0),
    direction TEXT NOT NULL CHECK (direction IN ('in', 'out')),
    operator_name TEXT NOT NULL DEFAULT 'Operador',
    notes TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.cash_movements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cash_movements_all" ON public.cash_movements;
CREATE POLICY "cash_movements_all"
    ON public.cash_movements
    FOR ALL
    TO authenticated, service_role
    USING (true)
    WITH CHECK (true);

-- 3. Adicionar coluna cash_session_id na tabela orders
ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS cash_session_id UUID REFERENCES public.cash_sessions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_orders_cash_session_id
    ON public.orders (cash_session_id);

-- 4. Criar função get_store_admin_users para a aba Configurações
CREATE OR REPLACE FUNCTION public.get_store_admin_users(p_tenant_id UUID DEFAULT NULL)
RETURNS TABLE (
    id UUID,
    tenant_id UUID,
    username TEXT,
    role TEXT,
    permissions JSONB,
    active BOOLEAN,
    created_date TIMESTAMPTZ,
    updated_date TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        u.id,
        u.tenant_id,
        u.username,
        u.role,
        u.permissions,
        u.active,
        u.created_date,
        u.updated_date
    FROM public.admin_users u
    WHERE p_tenant_id IS NULL OR u.tenant_id = p_tenant_id
    ORDER BY u.created_date ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_store_admin_users(UUID) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_store_admin_users() TO anon, authenticated, service_role;

SELECT 'Hotfix de Produção aplicado com sucesso!' as status;
