CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.current_user_has_role(_role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(auth.uid(), _role)
$$;

REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO service_role;

REVOKE ALL ON FUNCTION public.current_user_has_role(public.app_role) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.current_user_has_role(public.app_role) FROM anon;
GRANT EXECUTE ON FUNCTION public.current_user_has_role(public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_has_role(public.app_role) TO service_role;

DO $$
BEGIN
  DROP POLICY IF EXISTS "Admins can insert sales" ON public.sales;
  CREATE POLICY "Admins can insert sales"
  ON public.sales
  FOR INSERT
  TO authenticated
  WITH CHECK (public.current_user_has_role('admin'));

  DROP POLICY IF EXISTS "Admins can update sales" ON public.sales;
  CREATE POLICY "Admins can update sales"
  ON public.sales
  FOR UPDATE
  TO authenticated
  USING (public.current_user_has_role('admin'))
  WITH CHECK (public.current_user_has_role('admin'));

  DROP POLICY IF EXISTS "Admins can delete sales" ON public.sales;
  CREATE POLICY "Admins can delete sales"
  ON public.sales
  FOR DELETE
  TO authenticated
  USING (public.current_user_has_role('admin'));

  DROP POLICY IF EXISTS "Admins can insert returns" ON public.returns;
  CREATE POLICY "Admins can insert returns"
  ON public.returns
  FOR INSERT
  TO authenticated
  WITH CHECK (public.current_user_has_role('admin'));

  DROP POLICY IF EXISTS "Admins can update returns" ON public.returns;
  CREATE POLICY "Admins can update returns"
  ON public.returns
  FOR UPDATE
  TO authenticated
  USING (public.current_user_has_role('admin'))
  WITH CHECK (public.current_user_has_role('admin'));

  DROP POLICY IF EXISTS "Admins can delete returns" ON public.returns;
  CREATE POLICY "Admins can delete returns"
  ON public.returns
  FOR DELETE
  TO authenticated
  USING (public.current_user_has_role('admin'));

  DROP POLICY IF EXISTS "Admins can insert inventory" ON public.inventory;
  CREATE POLICY "Admins can insert inventory"
  ON public.inventory
  FOR INSERT
  TO authenticated
  WITH CHECK (public.current_user_has_role('admin'));

  DROP POLICY IF EXISTS "Admins can update inventory" ON public.inventory;
  CREATE POLICY "Admins can update inventory"
  ON public.inventory
  FOR UPDATE
  TO authenticated
  USING (public.current_user_has_role('admin'))
  WITH CHECK (public.current_user_has_role('admin'));

  DROP POLICY IF EXISTS "Admins can delete inventory" ON public.inventory;
  CREATE POLICY "Admins can delete inventory"
  ON public.inventory
  FOR DELETE
  TO authenticated
  USING (public.current_user_has_role('admin'));

  DROP POLICY IF EXISTS "Admins can insert ad expenses" ON public.ad_expenses;
  CREATE POLICY "Admins can insert ad expenses"
  ON public.ad_expenses
  FOR INSERT
  TO authenticated
  WITH CHECK (public.current_user_has_role('admin'));

  DROP POLICY IF EXISTS "Admins can update ad expenses" ON public.ad_expenses;
  CREATE POLICY "Admins can update ad expenses"
  ON public.ad_expenses
  FOR UPDATE
  TO authenticated
  USING (public.current_user_has_role('admin'))
  WITH CHECK (public.current_user_has_role('admin'));

  DROP POLICY IF EXISTS "Admins can delete ad expenses" ON public.ad_expenses;
  CREATE POLICY "Admins can delete ad expenses"
  ON public.ad_expenses
  FOR DELETE
  TO authenticated
  USING (public.current_user_has_role('admin'));

  DROP POLICY IF EXISTS "Admins insert disclosed periods" ON public.disclosed_periods;
  CREATE POLICY "Admins insert disclosed periods"
  ON public.disclosed_periods
  FOR INSERT
  TO authenticated
  WITH CHECK (public.current_user_has_role('admin'));

  DROP POLICY IF EXISTS "Admins update disclosed periods" ON public.disclosed_periods;
  CREATE POLICY "Admins update disclosed periods"
  ON public.disclosed_periods
  FOR UPDATE
  TO authenticated
  USING (public.current_user_has_role('admin'))
  WITH CHECK (public.current_user_has_role('admin'));

  DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
  CREATE POLICY "Admins can view all profiles"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (public.current_user_has_role('admin'));

  DROP POLICY IF EXISTS "Admins can update any profile" ON public.profiles;
  CREATE POLICY "Admins can update any profile"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (public.current_user_has_role('admin'))
  WITH CHECK (public.current_user_has_role('admin'));

  DROP POLICY IF EXISTS "Admins can view all roles" ON public.user_roles;
  CREATE POLICY "Admins can view all roles"
  ON public.user_roles
  FOR SELECT
  TO authenticated
  USING (public.current_user_has_role('admin'));

  DROP POLICY IF EXISTS "Admins can insert roles" ON public.user_roles;
  CREATE POLICY "Admins can insert roles"
  ON public.user_roles
  FOR INSERT
  TO authenticated
  WITH CHECK (public.current_user_has_role('admin'));

  DROP POLICY IF EXISTS "Admins can update roles" ON public.user_roles;
  CREATE POLICY "Admins can update roles"
  ON public.user_roles
  FOR UPDATE
  TO authenticated
  USING (public.current_user_has_role('admin'))
  WITH CHECK (public.current_user_has_role('admin'));

  DROP POLICY IF EXISTS "Admins can delete roles" ON public.user_roles;
  CREATE POLICY "Admins can delete roles"
  ON public.user_roles
  FOR DELETE
  TO authenticated
  USING (public.current_user_has_role('admin'));
END $$;

CREATE OR REPLACE FUNCTION public.execute_monthly_disclosure(_period_name text, _notes text DEFAULT ''::text, _dividend_declared numeric DEFAULT 0)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sales jsonb; v_returns jsonb; v_exp jsonb; v_inv jsonb;
  inv RECORD; new_stock integer;
BEGIN
  IF NOT public.current_user_has_role('admin') THEN
    RAISE EXCEPTION 'Only admins can execute monthly disclosure';
  END IF;

  FOR inv IN SELECT * FROM public.inventory LOOP
    new_stock := public.get_current_stock(inv.id);
    IF new_stock IS NOT NULL THEN
      UPDATE public.inventory SET total_bulk_stock_in = GREATEST(0, new_stock) WHERE id = inv.id;
    END IF;
  END LOOP;

  SELECT COALESCE(jsonb_agg(row_to_json(s)), '[]'::jsonb) INTO v_sales FROM public.sales s;
  SELECT COALESCE(jsonb_agg(row_to_json(r)), '[]'::jsonb) INTO v_returns FROM public.returns r;
  SELECT COALESCE(jsonb_agg(row_to_json(a)), '[]'::jsonb) INTO v_exp FROM public.ad_expenses a;
  SELECT COALESCE(jsonb_agg(row_to_json(i)), '[]'::jsonb) INTO v_inv FROM public.inventory i;

  INSERT INTO public.disclosed_periods (period_name, sales_data, returns_data, ad_expenses_data, inventory_snapshot, notes, dividend_declared)
  VALUES (_period_name, v_sales, v_returns, v_exp, v_inv, _notes, _dividend_declared);

  DELETE FROM public.returns;
  DELETE FROM public.sales;
  DELETE FROM public.ad_expenses;
  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.execute_monthly_disclosure(text, text, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.execute_monthly_disclosure(text, text, numeric) TO service_role;