-- Concede permissão de execução em verify_admin_reset_email para todas as roles
GRANT EXECUTE ON FUNCTION public.verify_admin_reset_email(TEXT, TEXT) TO postgres, service_role, authenticated, anon;
ALTER FUNCTION public.verify_admin_reset_email(TEXT, TEXT) OWNER TO postgres;

NOTIFY pgrst, 'reload schema';
