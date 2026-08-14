ALTER TABLE public.inventory
  ADD COLUMN IF NOT EXISTS supplier_name text,
  ADD COLUMN IF NOT EXISTS supplier_contact text,
  ADD COLUMN IF NOT EXISTS supplier_invoice_number text,
  ADD COLUMN IF NOT EXISTS transport_provider text,
  ADD COLUMN IF NOT EXISTS transport_bill_number text,
  ADD COLUMN IF NOT EXISTS purchase_notes text;

GRANT EXECUTE ON FUNCTION public.get_current_stock(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_capital_delta(numeric, numeric) TO authenticated;

CREATE OR REPLACE FUNCTION public.execute_monthly_disclosure(_period_name text, _notes text DEFAULT ''::text, _dividend_declared numeric DEFAULT 0)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
  v_net_worth numeric := 0;
BEGIN
  IF NOT public.current_user_has_role('admin') THEN
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

  -- Snapshot data BEFORE stock rebase / purge
  SELECT COALESCE(jsonb_agg(row_to_json(s)::jsonb), '[]'::jsonb) INTO v_sales FROM public.sales s;
  SELECT COALESCE(jsonb_agg(row_to_json(r)::jsonb), '[]'::jsonb) INTO v_returns FROM public.returns r;
  SELECT COALESCE(jsonb_agg(row_to_json(a)::jsonb), '[]'::jsonb) INTO v_exp FROM public.ad_expenses a;
  SELECT COALESCE(jsonb_agg(row_to_json(i)::jsonb), '[]'::jsonb) INTO v_inv FROM public.inventory i;
  SELECT COALESCE(jsonb_agg(row_to_json(c)::jsonb), '[]'::jsonb) INTO v_cash FROM public.cash_movements c;

  -- Rebase inventory to closing stock in one pass
  WITH closing AS (
    SELECT i.id,
           GREATEST(0, COALESCE(i.total_bulk_stock_in, 0)
             - COALESCE((SELECT SUM(s.quantity_sold) FROM public.sales s
                          WHERE s.inventory_id = i.id AND s.payment_status <> 'Cancelled'), 0)
             + COALESCE((SELECT SUM(r.quantity_returned) FROM public.returns r
                          LEFT JOIN public.sales s2 ON s2.id = r.sales_id
                          WHERE COALESCE(r.inventory_id, s2.inventory_id) = i.id
                            AND r.delivery_status = 'Received'), 0)) AS qty,
           COALESCE(i.average_cost_price, 0) AS cost
    FROM public.inventory i
  ), valued AS (
    SELECT COALESCE(SUM(qty * cost), 0) AS total FROM closing
  )
  SELECT total INTO v_stock_value FROM valued;

  UPDATE public.inventory i
  SET total_bulk_stock_in = c.qty
  FROM (
    SELECT i2.id,
           GREATEST(0, COALESCE(i2.total_bulk_stock_in, 0)
             - COALESCE((SELECT SUM(s.quantity_sold) FROM public.sales s
                          WHERE s.inventory_id = i2.id AND s.payment_status <> 'Cancelled'), 0)
             + COALESCE((SELECT SUM(r.quantity_returned) FROM public.returns r
                          LEFT JOIN public.sales s2 ON s2.id = r.sales_id
                          WHERE COALESCE(r.inventory_id, s2.inventory_id) = i2.id
                            AND r.delivery_status = 'Received'), 0)) AS qty
    FROM public.inventory i2
  ) c
  WHERE i.id = c.id;

  SELECT COALESCE(hot_cash, 0), COALESCE(account_holding_value, 0)
  INTO v_hot_cash, v_account
  FROM public.capital_accounts WHERE id = true;

  v_net_worth := v_hot_cash + v_account + v_stock_value;

  INSERT INTO public.disclosed_periods (
    period_name, sales_data, returns_data, ad_expenses_data, inventory_snapshot,
    notes, dividend_declared, gross_revenue, cogs, operating_expenses,
    return_penalties, net_profit, stock_holding_value, hot_cash_snapshot,
    account_holding_value_snapshot, net_worth, cash_movements_data
  ) VALUES (
    COALESCE(NULLIF(btrim(_period_name), ''), 'Period ' || to_char(now(), 'YYYY-MM-DD')),
    v_sales, v_returns, v_exp, v_inv,
    COALESCE(_notes, ''), COALESCE(_dividend_declared, 0), v_gross_revenue, v_cogs, v_operating_expenses,
    v_return_penalties, v_net_profit, v_stock_value, v_hot_cash,
    v_account, v_net_worth, v_cash
  );

  DELETE FROM public.returns;
  DELETE FROM public.sales;
  DELETE FROM public.ad_expenses;

  RETURN true;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.execute_monthly_disclosure(text, text, numeric) TO authenticated;