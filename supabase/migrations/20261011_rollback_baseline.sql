-- ==============================================================================
-- SCRIPT DE ROLLBACK SEGURO (NUNCA RESTAURA BRECHAS PERMISSIVAS)
-- Arquivo: supabase/migrations/20261011_rollback_baseline.sql
-- Status: NÃO EXECUTADO
-- Regra de Segurança: Jamais restaura USING (TRUE) ou permissões destrutivas públicas
-- ==============================================================================

-- 1. SE NECESSÁRIO REVERTER AS PROCEDURES DE CHECKOUT
-- Reverte a procedure de checkout mantendo a integridade da tabela orders
DROP FUNCTION IF EXISTS public.get_order_by_tracking_token(text, uuid);
DROP FUNCTION IF EXISTS public.create_public_order(uuid, text, text, text, text, text, jsonb, text, text, text);

-- 2. SE NECESSÁRIO REVERTER A TABELA TENANT_ADMINS
-- Nota: A remoção de tenant_admins só deve ser feita se a autenticação for descontinuada
-- DROP TABLE IF EXISTS public.tenant_admins CASCADE;

-- 3. POLÍTICAS DE CONTENÇÃO SEGURA (FALLBACK SEGURO)
-- Se uma política precisar ser revertida, o fallback seguro restringe o acesso ao service_role
-- e NUNCA concede USING (TRUE) para o papel anon/public.

-- Aviso de Segurança:
-- Este script foi concebido para reverter apenas estruturas adicionais sem reintroduzir
-- vulnerabilidades de vazamento de dados ou comandos destrutivos públicos.
