-- 1. Operational ledgers become admin-only reads
DROP POLICY IF EXISTS "Authenticated users can view inventory" ON public.inventory;
CREATE POLICY "Admins can view inventory" ON public.inventory FOR SELECT TO authenticated USING (public.current_user_has_role('admin'::app_role));

DROP POLICY IF EXISTS "Authenticated users can view sales" ON public.sales;
CREATE POLICY "Admins can view sales" ON public.sales FOR SELECT TO authenticated USING (public.current_user_has_role('admin'::app_role));

DROP POLICY IF EXISTS "Authenticated users can view returns" ON public.returns;
CREATE POLICY "Admins can view returns" ON public.returns FOR SELECT TO authenticated USING (public.current_user_has_role('admin'::app_role));

DROP POLICY IF EXISTS "Authenticated users can view ad expenses" ON public.ad_expenses;
CREATE POLICY "Admins can view ad expenses" ON public.ad_expenses FOR SELECT TO authenticated USING (public.current_user_has_role('admin'::app_role));

DROP POLICY IF EXISTS "Authenticated users can view capital accounts" ON public.capital_accounts;
CREATE POLICY "Admins can view capital accounts" ON public.capital_accounts FOR SELECT TO authenticated USING (public.current_user_has_role('admin'::app_role));

DROP POLICY IF EXISTS "Authenticated users can view cash movements" ON public.cash_movements;
CREATE POLICY "Admins can view cash movements" ON public.cash_movements FOR SELECT TO authenticated USING (public.current_user_has_role('admin'::app_role));

-- 2. Internal-only routines: not directly callable by app users
REVOKE EXECUTE ON FUNCTION public.apply_capital_delta(numeric, numeric) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.ensure_capital_account() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user_profile() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user_role() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sync_sale_capital() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sync_return_penalty_capital() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.assign_offline_order_number() FROM anon, authenticated, PUBLIC;