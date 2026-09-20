ALTER TABLE public.disclosed_periods
  ADD COLUMN IF NOT EXISTS stocks_value_snapshot numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS shares_value_snapshot numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS funds_value_snapshot numeric NOT NULL DEFAULT 0;

CREATE SCHEMA IF NOT EXISTS private;

CREATE OR REPLACE FUNCTION private.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION private.current_user_has_role(_role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT private.has_role(auth.uid(), _role)
$$;

REVOKE ALL ON SCHEMA private FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO authenticated;
REVOKE ALL ON FUNCTION private.has_role(uuid, public.app_role) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.current_user_has_role(public.app_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION private.current_user_has_role(public.app_role) TO authenticated;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public, private'
AS $$
  SELECT private.has_role(_user_id, _role)
$$;

CREATE OR REPLACE FUNCTION public.current_user_has_role(_role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public, private'
AS $$
  SELECT private.current_user_has_role(_role)
$$;

DO $$
DECLARE
  p record;
  using_expr text;
  check_expr text;
BEGIN
  FOR p IN
    SELECT schemaname, tablename, policyname, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (qual ILIKE '%current_user_has_role%'
        OR qual ILIKE '%has_role%'
        OR with_check ILIKE '%current_user_has_role%'
        OR with_check ILIKE '%has_role%')
  LOOP
    using_expr := replace(replace(p.qual, 'current_user_has_role', 'private.current_user_has_role'), 'has_role', 'private.has_role');
    check_expr := replace(replace(p.with_check, 'current_user_has_role', 'private.current_user_has_role'), 'has_role', 'private.has_role');
    IF p.qual IS NOT NULL THEN
      EXECUTE format('ALTER POLICY %I ON %I.%I USING (%s)', p.policyname, p.schemaname, p.tablename, using_expr);
    END IF;
    IF p.with_check IS NOT NULL THEN
      EXECUTE format('ALTER POLICY %I ON %I.%I WITH CHECK (%s)', p.policyname, p.schemaname, p.tablename, check_expr);
    END IF;
  END LOOP;
END $$;

DROP POLICY IF EXISTS "Admins can delete any profile" ON public.profiles;
CREATE POLICY "Admins can delete any profile"
ON public.profiles
FOR DELETE
TO authenticated
USING (private.current_user_has_role('admin'::public.app_role));
GRANT DELETE ON public.profiles TO authenticated;

ALTER FUNCTION public.apply_capital_delta(numeric, numeric) SECURITY DEFINER;
ALTER FUNCTION public.execute_monthly_disclosure(text, text, numeric) SECURITY INVOKER;
ALTER FUNCTION public.get_current_stock(uuid) SECURITY INVOKER;
ALTER FUNCTION public.get_public_forecast_data() SECURITY INVOKER;
ALTER FUNCTION public.get_public_price_history() SECURITY INVOKER;
ALTER FUNCTION public.get_public_share_price() SECURITY INVOKER;
ALTER FUNCTION public.revoke_user_access(uuid) SECURITY INVOKER;

REVOKE EXECUTE ON FUNCTION public.apply_capital_delta(numeric, numeric) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.current_user_has_role(public.app_role) FROM anon, authenticated, PUBLIC;

CREATE OR REPLACE FUNCTION public.execute_monthly_disclosure(_period_name text, _notes text DEFAULT ''::text, _dividend_declared numeric DEFAULT 0)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public, private'
AS $$
DECLARE
  v_sales jsonb; v_returns jsonb; v_exp jsonb; v_inv jsonb; v_cash jsonb;
  v_gross_revenue numeric := 0;
  v_returned_revenue numeric := 0;
  v_returned_cogs numeric := 0;
  v_cogs numeric := 0;
  v_delivery_fees numeric := 0;
  v_ad_expenses numeric := 0;
  v_return_penalties numeric := 0;
  v_operating_expenses numeric := 0;
  v_net_profit numeric := 0;
  v_stock_value numeric := 0;
  v_hot_cash numeric := 0;
  v_account numeric := 0;
  v_stocks numeric := 0;
  v_shares numeric := 0;
  v_funds numeric := 0;
  v_net_worth numeric := 0;
BEGIN
  IF NOT private.current_user_has_role('admin') THEN
    RAISE EXCEPTION 'Only admins can execute monthly disclosure';
  END IF;

  PERFORM set_config('app.monthly_disclosure', 'on', true);
  INSERT INTO public.capital_accounts (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

  SELECT
    COALESCE(SUM(public.get_sale_realized_amount(s.quantity_sold, s.average_selling_price, s.settlement_amount)), 0),
    COALESCE(SUM(COALESCE(s.quantity_sold, 0) * COALESCE(s.cost_price, i.average_cost_price, 0)), 0),
    COALESCE(SUM(COALESCE(s.quantity_sold, 0) * (COALESCE(i.delivery_fee, 0) / COALESCE(NULLIF(i.total_bulk_stock_in, 0), 1))), 0)
  INTO v_gross_revenue, v_cogs, v_delivery_fees
  FROM public.sales s
  LEFT JOIN public.inventory i ON i.id = s.inventory_id
  WHERE s.payment_status <> 'Cancelled';

  SELECT
    COALESCE(SUM(r.quantity_returned * COALESCE(public.get_sale_realized_amount(s.quantity_sold, s.average_selling_price, s.settlement_amount) / NULLIF(s.quantity_sold, 0), 0)), 0),
    COALESCE(SUM(r.quantity_returned * COALESCE(s.cost_price, i.average_cost_price, 0)), 0),
    COALESCE(SUM(r.penalty_amount), 0)
  INTO v_returned_revenue, v_returned_cogs, v_return_penalties
  FROM public.returns r
  LEFT JOIN public.sales s ON s.id = r.sales_id
  LEFT JOIN public.inventory i ON i.id = COALESCE(r.inventory_id, s.inventory_id);

  SELECT COALESCE(SUM(amount), 0) INTO v_ad_expenses FROM public.ad_expenses;
  v_gross_revenue := v_gross_revenue - v_returned_revenue;
  v_cogs := v_cogs - v_returned_cogs;
  v_operating_expenses := v_delivery_fees + v_ad_expenses + v_return_penalties;
  v_net_profit := v_gross_revenue - v_cogs - v_operating_expenses;

  SELECT COALESCE(jsonb_agg(row_to_json(s)::jsonb), '[]'::jsonb) INTO v_sales FROM public.sales s;
  SELECT COALESCE(jsonb_agg(row_to_json(r)::jsonb), '[]'::jsonb) INTO v_returns FROM public.returns r;
  SELECT COALESCE(jsonb_agg(row_to_json(a)::jsonb), '[]'::jsonb) INTO v_exp FROM public.ad_expenses a;
  SELECT COALESCE(jsonb_agg(row_to_json(i)::jsonb), '[]'::jsonb) INTO v_inv FROM public.inventory i;
  SELECT COALESCE(jsonb_agg(row_to_json(c)::jsonb), '[]'::jsonb) INTO v_cash FROM public.cash_movements c;

  WITH closing AS (
    SELECT i.id,
      GREATEST(0, COALESCE(i.total_bulk_stock_in, 0)
        - COALESCE((SELECT SUM(s.quantity_sold) FROM public.sales s WHERE s.inventory_id = i.id AND s.payment_status <> 'Cancelled'), 0)
        + COALESCE((SELECT SUM(r.quantity_returned) FROM public.returns r LEFT JOIN public.sales s2 ON s2.id = r.sales_id WHERE COALESCE(r.inventory_id, s2.inventory_id) = i.id AND r.delivery_status = 'Received'), 0)) AS qty,
      COALESCE(i.average_cost_price, 0) AS cost
    FROM public.inventory i
  ), valued AS (SELECT COALESCE(SUM(qty * cost), 0) AS total FROM closing)
  SELECT total INTO v_stock_value FROM valued;

  UPDATE public.inventory i
  SET total_bulk_stock_in = c.qty
  FROM (
    SELECT i2.id,
      GREATEST(0, COALESCE(i2.total_bulk_stock_in, 0)
        - COALESCE((SELECT SUM(s.quantity_sold) FROM public.sales s WHERE s.inventory_id = i2.id AND s.payment_status <> 'Cancelled'), 0)
        + COALESCE((SELECT SUM(r.quantity_returned) FROM public.returns r LEFT JOIN public.sales s2 ON s2.id = r.sales_id WHERE COALESCE(r.inventory_id, s2.inventory_id) = i2.id AND r.delivery_status = 'Received'), 0)) AS qty
    FROM public.inventory i2
  ) c
  WHERE i.id = c.id;

  SELECT COALESCE(hot_cash, 0), COALESCE(account_holding_value, 0), COALESCE(stocks_value, 0), COALESCE(shares_value, 0), COALESCE(funds_value, 0)
  INTO v_hot_cash, v_account, v_stocks, v_shares, v_funds
  FROM public.capital_accounts WHERE id = true;
  v_net_worth := v_hot_cash + v_account + v_stocks + v_shares + v_funds + v_stock_value;

  INSERT INTO public.disclosed_periods (
    period_name, sales_data, returns_data, ad_expenses_data, inventory_snapshot,
    notes, dividend_declared, gross_revenue, cogs, operating_expenses,
    return_penalties, net_profit, stock_holding_value, hot_cash_snapshot,
    account_holding_value_snapshot, stocks_value_snapshot, shares_value_snapshot,
    funds_value_snapshot, net_worth, cash_movements_data
  ) VALUES (
    COALESCE(NULLIF(btrim(_period_name), ''), 'Period ' || to_char(now(), 'YYYY-MM-DD')),
    v_sales, v_returns, v_exp, v_inv, COALESCE(_notes, ''), COALESCE(_dividend_declared, 0),
    v_gross_revenue, v_cogs, v_operating_expenses, v_return_penalties, v_net_profit,
    v_stock_value, v_hot_cash, v_account, v_stocks, v_shares, v_funds, v_net_worth, v_cash
  );

  DELETE FROM public.returns WHERE id IS NOT NULL;
  DELETE FROM public.sales WHERE id IS NOT NULL;
  DELETE FROM public.ad_expenses WHERE id IS NOT NULL;
  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.execute_monthly_disclosure(text, text, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_current_stock(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_forecast_data() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_price_history() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_share_price() TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_user_access(uuid) TO authenticated;
