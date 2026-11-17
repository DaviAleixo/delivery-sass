-- ==============================================================================
-- Migration: Complement Groups Free Quantity & Size Selector (Padrão iFood / Açaí)
-- Arquivo: supabase/migrations/20261117_complement_groups_free_quantity_and_size_selector.sql
-- ==============================================================================

ALTER TABLE public.complement_groups
ADD COLUMN IF NOT EXISTS free_quantity INTEGER DEFAULT 0 NOT NULL,
ADD COLUMN IF NOT EXISTS is_size_selector BOOLEAN DEFAULT false NOT NULL;
