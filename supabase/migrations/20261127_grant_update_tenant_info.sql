-- Concede permissão de execução na nova assinatura de update_tenant_info e recarrega schema
GRANT EXECUTE ON FUNCTION public.update_tenant_info(uuid,text,text,text,text,text,text,text,text) TO authenticated, service_role, anon;
NOTIFY pgrst, 'reload schema';
