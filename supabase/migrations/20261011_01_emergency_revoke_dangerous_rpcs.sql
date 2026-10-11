-- ==============================================================================
-- SCRIPT DE EMERGÊNCIA: REVOGAÇÃO DE PRIVILÉGIOS PÚBLICOS EM RPCs ADMINISTRATIVAS
-- Arquivo: supabase/migrations/20261011_01_emergency_revoke_dangerous_rpcs.sql
-- Status: NÃO EXECUTADO (Aguardando autorização explícita)
-- Objetivo: Fechar imediatamente a execução anônima de procedures destrutivas
-- ==============================================================================

-- 1. CORREÇÃO DE SEARCH_PATH EM TODAS AS FUNÇÕES SECURITY DEFINER
-- Impede ataques de sequestro de caminho de busca (Search Path Hijacking)

ALTER FUNCTION public.delete_tenant(uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.toggle_tenant_status(uuid, boolean) SET search_path = public, pg_temp;
ALTER FUNCTION public.create_new_tenant(text, text, text, text, text, text) SET search_path = public, pg_temp;
ALTER FUNCTION public.get_sales_metrics(uuid, timestamptz, timestamptz) SET search_path = public, pg_temp;
ALTER FUNCTION public.get_clients_summary(uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.get_master_tenants() SET search_path = public, pg_temp;
ALTER FUNCTION public.update_tenant_info(uuid, text, text, text, text, text, text) SET search_path = public, pg_temp;
ALTER FUNCTION public.lookup_customer_by_phone(uuid, text) SET search_path = public, pg_temp;
ALTER FUNCTION public.verify_admin_login(text, text, text) SET search_path = public, pg_temp;

-- 2. REVOGAÇÃO DE PRIVILÉGIOS PÚBLICOS E ANÔNIMOS EM FUNÇÕES DESTRUTIVAS / FINANCEIRAS

-- A. Exclusão de Tenants (Extremamente Perigoso)
REVOKE EXECUTE ON FUNCTION public.delete_tenant(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_tenant(uuid) TO service_role;

-- B. Alteração de Status Ativo/Inativo de Tenants
REVOKE EXECUTE ON FUNCTION public.toggle_tenant_status(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.toggle_tenant_status(uuid, boolean) TO service_role;

-- C. Criação de Novos Restaurantes
REVOKE EXECUTE ON FUNCTION public.create_new_tenant(text, text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_new_tenant(text, text, text, text, text, text) TO service_role;

-- D. Métricas Financeiras e Faturamento de Lojas
REVOKE EXECUTE ON FUNCTION public.get_sales_metrics(uuid, timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_sales_metrics(uuid, timestamptz, timestamptz) TO authenticated, service_role;

-- E. Relatório Global de Tenants e Faturamento Geral
REVOKE EXECUTE ON FUNCTION public.get_master_tenants() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_master_tenants() TO service_role;

-- F. Resumo e Carteira de Clientes
REVOKE EXECUTE ON FUNCTION public.get_clients_summary(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_clients_summary(uuid) TO authenticated, service_role;

-- G. Atualização de Dados e Credenciais de Lojas
REVOKE EXECUTE ON FUNCTION public.update_tenant_info(uuid, text, text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_tenant_info(uuid, text, text, text, text, text, text) TO authenticated, service_role;

-- Comentário de auditoria:
COMMENT ON FUNCTION public.delete_tenant IS 'Destrutiva: Restrita exclusivamente ao service_role/master admin.';
COMMENT ON FUNCTION public.get_sales_metrics IS 'Financeira: Restrita a administradores autenticados e service_role.';
