-- Migration: Criação da tabela de fechamentos de caixa (shift_closings)
CREATE TABLE IF NOT EXISTS public.shift_closings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    shift_date DATE NOT NULL,
    period_mode TEXT NOT NULL DEFAULT 'today',
    period_label TEXT NOT NULL,
    opened_at TIMESTAMPTZ,
    closed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    cashier_name TEXT NOT NULL DEFAULT 'Operador',
    gross_revenue NUMERIC(10,2) NOT NULL DEFAULT 0,
    net_revenue NUMERIC(10,2) NOT NULL DEFAULT 0,
    total_orders INT NOT NULL DEFAULT 0,
    delivery_orders INT NOT NULL DEFAULT 0,
    counter_orders INT NOT NULL DEFAULT 0,
    dine_in_orders INT NOT NULL DEFAULT 0,
    average_ticket NUMERIC(10,2) NOT NULL DEFAULT 0,
    payment_breakdown JSONB NOT NULL DEFAULT '{}'::jsonb,
    cash_drawer JSONB NOT NULL DEFAULT '{}'::jsonb,
    driver_settlements JSONB NOT NULL DEFAULT '[]'::jsonb,
    raw_closing_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shift_closings_tenant_date ON public.shift_closings (tenant_id, shift_date DESC);

ALTER TABLE public.shift_closings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_all_shift_closings_authenticated" ON public.shift_closings;

CREATE POLICY "allow_all_shift_closings_authenticated"
    ON public.shift_closings
    FOR ALL
    TO anon, authenticated, service_role
    USING (true)
    WITH CHECK (true);
