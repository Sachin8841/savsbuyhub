CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION private.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION private.current_user_has_role(_role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
  SELECT private.has_role(auth.uid(), _role)
$$;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, private
AS $$
  SELECT private.has_role(_user_id, _role)
$$;

CREATE OR REPLACE FUNCTION public.current_user_has_role(_role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, private
AS $$
  SELECT private.current_user_has_role(_role)
$$;

CREATE OR REPLACE FUNCTION private.get_current_stock(inv_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
  SELECT
    i.total_bulk_stock_in
    - COALESCE((SELECT SUM(s.quantity_sold) FROM public.sales s WHERE s.inventory_id = inv_id), 0)::INTEGER
    + COALESCE((
        SELECT SUM(r.quantity_returned)
        FROM public.returns r
        LEFT JOIN public.sales s ON r.sales_id = s.id
        WHERE COALESCE(r.inventory_id, s.inventory_id) = inv_id
          AND r.delivery_status = 'Received'
      ), 0)::INTEGER
  FROM public.inventory i
  WHERE i.id = inv_id
$$;

CREATE OR REPLACE FUNCTION public.get_current_stock(inv_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, private
AS $$
  SELECT private.get_current_stock(inv_id)
$$;

CREATE OR REPLACE FUNCTION private.get_public_share_price()
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  base_value numeric := 100;
  total_shares numeric := 100000;
  stock_value numeric := 0;
  active_profit numeric := 0;
  historical_profit numeric := 0;
  last_sale date;
  decay numeric := 1;
BEGIN
  SELECT COALESCE(SUM(GREATEST(0, private.get_current_stock(i.id)) * COALESCE(i.average_cost_price, 0)), 0)
  INTO stock_value
  FROM public.inventory i;

  WITH active_sales AS (
    SELECT s.*, i.average_cost_price, i.delivery_fee, NULLIF(i.total_bulk_stock_in, 0) AS base_stock
    FROM public.sales s
    LEFT JOIN public.inventory i ON i.id = s.inventory_id
    WHERE s.payment_status <> 'Cancelled'
  ), ret AS (
    SELECT
      COALESCE(SUM(r.quantity_returned * COALESCE(s.average_selling_price, 0)), 0) AS returned_revenue,
      COALESCE(SUM(r.quantity_returned * COALESCE(s.cost_price, i.average_cost_price, 0)), 0) AS returned_cogs,
      COALESCE(SUM(r.penalty_amount), 0) AS penalties
    FROM public.returns r
    LEFT JOIN public.sales s ON s.id = r.sales_id
    LEFT JOIN public.inventory i ON i.id = COALESCE(r.inventory_id, s.inventory_id)
  )
  SELECT
    COALESCE(SUM(a.quantity_sold * a.average_selling_price), 0)
    - (SELECT returned_revenue FROM ret)
    - (COALESCE(SUM(a.quantity_sold * COALESCE(a.cost_price, a.average_cost_price, 0)), 0) - (SELECT returned_cogs FROM ret))
    - COALESCE(SUM(a.quantity_sold * (COALESCE(a.delivery_fee, 0) / COALESCE(a.base_stock, 1))), 0)
    - COALESCE((SELECT SUM(amount) FROM public.ad_expenses), 0)
    - COALESCE((SELECT SUM(delivery_fee) FROM public.inventory), 0)
    - (SELECT penalties FROM ret)
  INTO active_profit
  FROM active_sales a;

  SELECT COALESCE(SUM(net_profit), 0) INTO historical_profit FROM public.disclosed_periods;
  SELECT MAX(dispatch_date) INTO last_sale FROM public.sales WHERE payment_status <> 'Cancelled';

  IF last_sale IS NULL AND stock_value > 0 THEN
    decay := 0.5;
  ELSIF last_sale IS NOT NULL AND CURRENT_DATE - last_sale > 5 THEN
    decay := 1 - LEAST(0.5, ((CURRENT_DATE - last_sale - 5)::numeric * 0.01));
  END IF;

  RETURN GREATEST(10, ROUND((base_value + ((stock_value * 0.5) / total_shares) + (((active_profit + historical_profit) * 5) / total_shares)) * decay, 2));
END;
$$;

CREATE OR REPLACE FUNCTION public.get_public_share_price()
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, private
AS $$
  SELECT private.get_public_share_price()
$$;

CREATE OR REPLACE FUNCTION private.get_public_price_history()
RETURNS TABLE("time" text, price numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
  WITH archived AS (
    SELECT created_at::date AS d,
           GREATEST(10, ROUND((100 + ((stock_holding_value * 0.5) / 100000) + ((SUM(net_profit) OVER (ORDER BY created_at) * 5) / 100000)), 2)) AS p
    FROM public.disclosed_periods
  ), live AS (
    SELECT CURRENT_DATE AS d, private.get_public_share_price() AS p
  )
  SELECT d::text AS "time", p AS price
  FROM (
    SELECT * FROM archived
    UNION ALL
    SELECT * FROM live
  ) x
  ORDER BY d
$$;

CREATE OR REPLACE FUNCTION public.get_public_price_history()
RETURNS TABLE("time" text, price numeric)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, private
AS $$
  SELECT * FROM private.get_public_price_history()
$$;

CREATE OR REPLACE FUNCTION private.get_public_forecast_data()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
  WITH sales_months AS (
    SELECT to_char(s.dispatch_date, 'YYYY-MM') AS label,
           SUM(s.quantity_sold * s.average_selling_price)::numeric AS revenue,
           SUM(s.quantity_sold * COALESCE(s.cost_price, i.average_cost_price, 0))::numeric AS cogs,
           SUM(s.quantity_sold * (COALESCE(i.delivery_fee, 0) / COALESCE(NULLIF(i.total_bulk_stock_in, 0), 1)))::numeric AS delivery,
           SUM(s.quantity_sold)::numeric AS units,
           COUNT(*)::numeric AS orders
    FROM public.sales s
    LEFT JOIN public.inventory i ON i.id = s.inventory_id
    WHERE s.payment_status <> 'Cancelled'
    GROUP BY 1
  ), expense_months AS (
    SELECT to_char(expense_date, 'YYYY-MM') AS label, SUM(amount)::numeric AS expenses
    FROM public.ad_expenses
    GROUP BY 1
  ), return_months AS (
    SELECT to_char(return_date, 'YYYY-MM') AS label,
           SUM(penalty_amount)::numeric AS penalties,
           SUM(quantity_returned)::numeric AS returned_units
    FROM public.returns
    GROUP BY 1
  ), active_rows AS (
    SELECT sm.label,
           sm.revenue,
           sm.cogs + sm.delivery + COALESCE(em.expenses, 0) + COALESCE(rm.penalties, 0) AS investment,
           sm.revenue - (sm.cogs + sm.delivery + COALESCE(em.expenses, 0) + COALESCE(rm.penalties, 0)) AS profit,
           sm.units,
           sm.orders
    FROM sales_months sm
    LEFT JOIN expense_months em USING (label)
    LEFT JOIN return_months rm USING (label)
  ), archived_rows AS (
    SELECT to_char(created_at, 'YYYY-MM') AS label,
           gross_revenue AS revenue,
           cogs + operating_expenses AS investment,
           net_profit AS profit,
           COALESCE((SELECT SUM((x->>'quantity_sold')::numeric) FROM jsonb_array_elements(sales_data) x), 0) AS units,
           COALESCE(jsonb_array_length(sales_data), 0)::numeric AS orders
    FROM public.disclosed_periods
  )
  SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY label), '[]'::jsonb)
  FROM (
    SELECT label, SUM(revenue) AS revenue, SUM(investment) AS investment, SUM(profit) AS profit, SUM(units) AS units, SUM(orders) AS orders
    FROM (
      SELECT * FROM archived_rows
      UNION ALL
      SELECT * FROM active_rows
    ) u
    GROUP BY label
  ) t
$$;

CREATE OR REPLACE FUNCTION public.get_public_forecast_data()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, private
AS $$
  SELECT private.get_public_forecast_data()
$$;

GRANT EXECUTE ON FUNCTION private.has_role(uuid, public.app_role) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.current_user_has_role(public.app_role) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.get_current_stock(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.get_public_share_price() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.get_public_price_history() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.get_public_forecast_data() TO anon, authenticated, service_role;

ALTER FUNCTION public.execute_monthly_disclosure(text, text, numeric) SECURITY INVOKER;
ALTER FUNCTION public.revoke_user_access(uuid) SECURITY INVOKER;

REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.current_user_has_role(public.app_role) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.get_current_stock(uuid) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.get_public_share_price() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.get_public_price_history() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.get_public_forecast_data() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_has_role(public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_current_stock(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_share_price() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_price_history() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_forecast_data() TO anon, authenticated;

REVOKE ALL ON FUNCTION public.execute_monthly_disclosure(text, text, numeric) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.revoke_user_access(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.execute_monthly_disclosure(text, text, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_user_access(uuid) TO authenticated;