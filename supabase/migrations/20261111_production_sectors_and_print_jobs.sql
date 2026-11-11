-- Migration: Setores de Produção Dinâmicos (production_sectors) + Fila de Impressão (print_jobs)
-- e vínculos opcionais em categories e products.

-- 1. Tabela de Setores de Produção por Tenant (ex: Cozinha, Bar, Fritura, Caixa)
CREATE TABLE IF NOT EXISTS public.production_sectors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  content_mode TEXT NOT NULL DEFAULT 'production_only' CHECK (content_mode IN ('production_only', 'full_ticket')),
  operation_mode TEXT NOT NULL DEFAULT 'kds_and_print' CHECK (operation_mode IN ('kds_and_print', 'kds_only', 'print_only')),
  printer_name TEXT,
  printer_type TEXT NOT NULL DEFAULT 'thermal_raw' CHECK (printer_type IN ('thermal_raw', 'a4_browser')),
  paper_width TEXT NOT NULL DEFAULT '80mm' CHECK (paper_width IN ('80mm', '58mm', 'a4')),
  copies INTEGER NOT NULL DEFAULT 1 CHECK (copies >= 1 AND copies <= 5),
  order_index INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_date TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_production_sectors_tenant_order
  ON public.production_sectors (tenant_id, order_index, created_date);

CREATE UNIQUE INDEX IF NOT EXISTS uq_production_sectors_tenant_slug
  ON public.production_sectors (tenant_id, slug);

-- 2. Coluna sector_id em categories (padrão da categoria) e products (override opcional)
ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS sector_id UUID REFERENCES public.production_sectors(id) ON DELETE SET NULL;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS sector_id UUID REFERENCES public.production_sectors(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_categories_sector_id ON public.categories (sector_id);
CREATE INDEX IF NOT EXISTS idx_products_sector_id ON public.products (sector_id);

-- 3. Tabela persistente de fila de impressão por pedido e setor (base para anti-duplicidade e Etapa 2)
CREATE TABLE IF NOT EXISTS public.print_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  order_id TEXT NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  sector_id UUID REFERENCES public.production_sectors(id) ON DELETE SET NULL,
  sector_key TEXT NOT NULL,
  sector_name TEXT NOT NULL DEFAULT 'Geral',
  printer_name TEXT,
  printer_type TEXT NOT NULL DEFAULT 'thermal_raw' CHECK (printer_type IN ('thermal_raw', 'a4_browser')),
  paper_width TEXT NOT NULL DEFAULT '80mm' CHECK (paper_width IN ('80mm', '58mm', 'a4')),
  content_mode TEXT NOT NULL DEFAULT 'full_ticket' CHECK (content_mode IN ('production_only', 'full_ticket')),
  copies INTEGER NOT NULL DEFAULT 1 CHECK (copies >= 1 AND copies <= 5),
  items_payload JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'printing', 'printed', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  created_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  printed_at TIMESTAMPTZ,
  updated_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_print_jobs_order_sector_key UNIQUE (order_id, sector_key)
);

CREATE INDEX IF NOT EXISTS idx_print_jobs_tenant_status
  ON public.print_jobs (tenant_id, status, created_date DESC);

CREATE INDEX IF NOT EXISTS idx_print_jobs_order_id
  ON public.print_jobs (order_id);

-- 4. Políticas RLS
ALTER TABLE public.production_sectors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.print_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public select production_sectors" ON public.production_sectors;
CREATE POLICY "Public select production_sectors"
  ON public.production_sectors
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Admin insert own production_sectors" ON public.production_sectors;
CREATE POLICY "Admin insert own production_sectors"
  ON public.production_sectors
  FOR INSERT
  WITH CHECK (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin());

DROP POLICY IF EXISTS "Admin update own production_sectors" ON public.production_sectors;
CREATE POLICY "Admin update own production_sectors"
  ON public.production_sectors
  FOR UPDATE
  USING (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin())
  WITH CHECK (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin());

DROP POLICY IF EXISTS "Admin delete own production_sectors" ON public.production_sectors;
CREATE POLICY "Admin delete own production_sectors"
  ON public.production_sectors
  FOR DELETE
  USING (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin());

DROP POLICY IF EXISTS "Admin manage own print_jobs" ON public.print_jobs;
CREATE POLICY "Admin manage own print_jobs"
  ON public.print_jobs
  FOR ALL
  USING (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin())
  WITH CHECK (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin());

