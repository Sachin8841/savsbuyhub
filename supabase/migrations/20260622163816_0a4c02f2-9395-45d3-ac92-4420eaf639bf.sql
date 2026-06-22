REVOKE EXECUTE ON FUNCTION public.ensure_capital_account() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.apply_capital_delta(numeric, numeric) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.record_cash_movement(text, numeric, numeric, numeric, text, text, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_capital_accounts(numeric, numeric, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sync_sale_capital() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sync_return_penalty_capital() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.revoke_user_access(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.record_cash_movement(text, numeric, numeric, numeric, text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_capital_accounts(numeric, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_user_access(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_capital_account() TO service_role;
GRANT EXECUTE ON FUNCTION public.apply_capital_delta(numeric, numeric) TO service_role;
GRANT EXECUTE ON FUNCTION public.sync_sale_capital() TO service_role;
GRANT EXECUTE ON FUNCTION public.sync_return_penalty_capital() TO service_role;