REVOKE EXECUTE ON FUNCTION public.get_public_forecast_data() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_public_price_history() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_public_share_price() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sync_return_penalty_capital() FROM anon, authenticated, PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_public_forecast_data() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_price_history() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_share_price() TO authenticated;