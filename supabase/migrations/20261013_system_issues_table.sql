-- Migration: Create system_issues table and RPC functions for SuperAdmin Central de Pendências & Sentry
CREATE TABLE IF NOT EXISTS public.system_issues (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title               TEXT NOT NULL,
    description         TEXT,
    severity            TEXT NOT NULL DEFAULT 'urgent', -- 'urgent', 'warning', 'info'
    status              TEXT NOT NULL DEFAULT 'open',   -- 'open', 'in_progress', 'resolved'
    source              TEXT NOT NULL DEFAULT 'manual', -- 'manual', 'sentry', 'checkout', 'webhook', 'printer'
    path                TEXT,                           -- caminho / rota / endpoint opcional
    tenant_id           UUID REFERENCES public.tenants(id) ON DELETE SET NULL,
    tenant_name         TEXT,
    sentry_event_id     TEXT,
    metadata            JSONB DEFAULT '{}'::jsonb,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at         TIMESTAMPTZ,
    resolved_by         TEXT
);

CREATE INDEX IF NOT EXISTS idx_system_issues_status ON public.system_issues(status);
CREATE INDEX IF NOT EXISTS idx_system_issues_severity ON public.system_issues(severity);
CREATE INDEX IF NOT EXISTS idx_system_issues_created_at ON public.system_issues(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_system_issues_tenant_id ON public.system_issues(tenant_id);

-- RLS
ALTER TABLE public.system_issues ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can report issues" ON public.system_issues;
CREATE POLICY "Public can report issues"
ON public.system_issues
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

DROP POLICY IF EXISTS "Anyone can read issues" ON public.system_issues;
CREATE POLICY "Anyone can read issues"
ON public.system_issues
FOR SELECT
TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS "Anyone can update issues" ON public.system_issues;
CREATE POLICY "Anyone can update issues"
ON public.system_issues
FOR UPDATE
TO anon, authenticated
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "Anyone can delete issues" ON public.system_issues;
CREATE POLICY "Anyone can delete issues"
ON public.system_issues
FOR DELETE
TO anon, authenticated
USING (true);

-- RPC para cadastrar issue de forma padronizada
CREATE OR REPLACE FUNCTION public.report_system_issue(
    p_title TEXT,
    p_description TEXT DEFAULT NULL,
    p_severity TEXT DEFAULT 'urgent',
    p_source TEXT DEFAULT 'manual',
    p_path TEXT DEFAULT NULL,
    p_tenant_id UUID DEFAULT NULL,
    p_tenant_name TEXT DEFAULT NULL,
    p_sentry_event_id TEXT DEFAULT NULL,
    p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_issue JSONB;
BEGIN
    INSERT INTO public.system_issues (
        title,
        description,
        severity,
        status,
        source,
        path,
        tenant_id,
        tenant_name,
        sentry_event_id,
        metadata
    ) VALUES (
        p_title,
        p_description,
        COALESCE(p_severity, 'urgent'),
        'open',
        COALESCE(p_source, 'manual'),
        p_path,
        p_tenant_id,
        p_tenant_name,
        p_sentry_event_id,
        COALESCE(p_metadata, '{}'::jsonb)
    )
    RETURNING to_jsonb(system_issues.*) INTO v_issue;

    RETURN v_issue;
END;
$$;

-- RPC para marcar pendência como resolvida
CREATE OR REPLACE FUNCTION public.resolve_system_issue(
    p_issue_id UUID,
    p_resolved_by TEXT DEFAULT 'SuperAdmin'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_updated JSONB;
BEGIN
    UPDATE public.system_issues
    SET 
        status = 'resolved',
        resolved_at = NOW(),
        resolved_by = COALESCE(p_resolved_by, 'SuperAdmin')
    WHERE id = p_issue_id
    RETURNING to_jsonb(system_issues.*) INTO v_updated;

    RETURN v_updated;
END;
$$;

-- RPC para reabrir pendência
CREATE OR REPLACE FUNCTION public.reopen_system_issue(
    p_issue_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_updated JSONB;
BEGIN
    UPDATE public.system_issues
    SET 
        status = 'open',
        resolved_at = NULL,
        resolved_by = NULL
    WHERE id = p_issue_id
    RETURNING to_jsonb(system_issues.*) INTO v_updated;

    RETURN v_updated;
END;
$$;
