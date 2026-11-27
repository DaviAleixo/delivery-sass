-- Concede permissão de execução a authenticated e anon para todos os endpoints financeiros
GRANT EXECUTE ON FUNCTION public.get_financial_overview(uuid,date,date) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_payables_receivables_overview(uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.create_financial_entry(uuid,text,text,text,numeric,text,text,text,date,text,text,text,uuid,text,uuid,uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.create_financial_installments(uuid,text,text,text,text,numeric,text,date,integer,boolean,text,text,uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.mark_financial_entry_paid(uuid,uuid,text,uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.delete_financial_entry(uuid,uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.create_financial_bank_account(uuid,text,text,numeric,boolean) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.update_financial_bank_account(uuid,uuid,text,text,boolean) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.archive_financial_bank_account(uuid,uuid) TO authenticated, anon;

NOTIFY pgrst, 'reload schema';
