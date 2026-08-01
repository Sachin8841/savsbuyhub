ALTER FUNCTION public.execute_monthly_disclosure(text, text, numeric) SECURITY DEFINER;
ALTER FUNCTION public.execute_accounting_reconciliation(text, text) SECURITY DEFINER;
REVOKE ALL ON FUNCTION public.execute_monthly_disclosure(text, text, numeric) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.execute_accounting_reconciliation(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.execute_monthly_disclosure(text, text, numeric) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.execute_accounting_reconciliation(text, text) TO authenticated, service_role;