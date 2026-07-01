-- Remove direct anonymous access from internal helper procedures.
REVOKE EXECUTE ON FUNCTION public.execute_accounting_reconciliation(text, text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.execute_monthly_disclosure(text, text, numeric) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_current_stock(uuid) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user_profile() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user_role() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sync_sale_capital() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.apply_capital_delta(numeric, numeric) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.ensure_capital_account() FROM anon, authenticated, PUBLIC;

-- Admin-facing RPCs do not need elevated privileges because RLS already allows admins.
CREATE OR REPLACE FUNCTION public.record_cash_movement(
  _movement_type text,
  _amount numeric,
  _hot_cash_delta numeric,
  _account_delta numeric,
  _notes text DEFAULT NULL,
  _reference_table text DEFAULT NULL,
  _reference_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.current_user_has_role('admin') THEN
    RAISE EXCEPTION 'Only admins can change cash balances';
  END IF;

  INSERT INTO public.capital_accounts (id) VALUES (true)
  ON CONFLICT (id) DO NOTHING;

  UPDATE public.capital_accounts
  SET hot_cash = hot_cash + COALESCE(_hot_cash_delta, 0),
      account_holding_value = account_holding_value + COALESCE(_account_delta, 0),
      updated_at = now()
  WHERE id = true;

  INSERT INTO public.cash_movements (movement_type, amount, hot_cash_delta, account_delta, reference_table, reference_id, notes, created_by)
  VALUES (_movement_type, COALESCE(_amount, 0), COALESCE(_hot_cash_delta, 0), COALESCE(_account_delta, 0), _reference_table, _reference_id, _notes, auth.uid());

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_capital_accounts(_hot_cash numeric, _account_holding_value numeric, _notes text DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $$
DECLARE
  old_hot numeric := 0;
  old_account numeric := 0;
BEGIN
  IF NOT public.current_user_has_role('admin') THEN
    RAISE EXCEPTION 'Only admins can set cash balances';
  END IF;

  INSERT INTO public.capital_accounts (id) VALUES (true)
  ON CONFLICT (id) DO NOTHING;

  SELECT hot_cash, account_holding_value INTO old_hot, old_account FROM public.capital_accounts WHERE id = true;

  UPDATE public.capital_accounts
  SET hot_cash = COALESCE(_hot_cash, 0),
      account_holding_value = COALESCE(_account_holding_value, 0),
      notes = _notes,
      updated_at = now()
  WHERE id = true;

  INSERT INTO public.cash_movements (movement_type, amount, hot_cash_delta, account_delta, notes, created_by)
  VALUES ('manual_set', ABS(COALESCE(_hot_cash, 0) - old_hot) + ABS(COALESCE(_account_holding_value, 0) - old_account), COALESCE(_hot_cash, 0) - old_hot, COALESCE(_account_holding_value, 0) - old_account, _notes, auth.uid());

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.execute_accounting_reconciliation(
  _period_name text DEFAULT NULL,
  _notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $$
DECLARE
  v_id uuid;
  v_sales_total numeric := 0;
  v_settlement_total numeric := 0;
  v_return_penalties numeric := 0;
  v_expenses numeric := 0;
  v_stock_value numeric := 0;
  v_hot_cash numeric := 0;
  v_account numeric := 0;
  v_expected numeric := 0;
  v_actual numeric := 0;
  v_variance numeric := 0;
BEGIN
  IF NOT public.current_user_has_role('admin') THEN
    RAISE EXCEPTION 'Only admins can reconcile accounts';
  END IF;

  INSERT INTO public.capital_accounts (id) VALUES (true)
  ON CONFLICT (id) DO NOTHING;

  SELECT
    COALESCE(SUM(CASE WHEN payment_status <> 'Cancelled' THEN quantity_sold * average_selling_price ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN payment_status = 'Settled' THEN public.get_sale_realized_amount(quantity_sold, average_selling_price, settlement_amount) ELSE 0 END), 0)
  INTO v_sales_total, v_settlement_total
  FROM public.sales;

  SELECT COALESCE(SUM(penalty_amount), 0)
  INTO v_return_penalties
  FROM public.returns;

  SELECT COALESCE(SUM(amount), 0)
  INTO v_expenses
  FROM public.ad_expenses;

  SELECT COALESCE(SUM(GREATEST(0, COALESCE(i.total_bulk_stock_in, 0) - COALESCE(sold.qty, 0) + COALESCE(rec.qty, 0)) * COALESCE(i.average_cost_price, 0)), 0)
  INTO v_stock_value
  FROM public.inventory i
  LEFT JOIN (
    SELECT inventory_id, SUM(quantity_sold) AS qty
    FROM public.sales
    WHERE payment_status <> 'Cancelled'
    GROUP BY inventory_id
  ) sold ON sold.inventory_id = i.id
  LEFT JOIN (
    SELECT COALESCE(r.inventory_id, s.inventory_id) AS inventory_id, SUM(r.quantity_returned) AS qty
    FROM public.returns r
    LEFT JOIN public.sales s ON s.id = r.sales_id
    WHERE r.delivery_status = 'Received'
    GROUP BY COALESCE(r.inventory_id, s.inventory_id)
  ) rec ON rec.inventory_id = i.id;

  SELECT COALESCE(hot_cash, 0), COALESCE(account_holding_value, 0)
  INTO v_hot_cash, v_account
  FROM public.capital_accounts
  WHERE id = true;

  v_actual := v_hot_cash + v_account + v_stock_value;
  v_expected := v_settlement_total - v_return_penalties - v_expenses + v_stock_value;
  v_variance := v_actual - v_expected;

  INSERT INTO public.accounting_reconciliations (
    period_name, ledger_sales_total, settlement_total, return_penalties_total,
    expenses_total, stock_holding_value, hot_cash_snapshot, account_holding_value_snapshot,
    expected_net_worth, actual_net_worth, variance, status, notes, created_by
  ) VALUES (
    COALESCE(_period_name, 'Reconciliation ' || to_char(now(), 'YYYY-MM-DD HH24:MI')),
    v_sales_total, v_settlement_total, v_return_penalties, v_expenses, v_stock_value,
    v_hot_cash, v_account, v_expected, v_actual, v_variance,
    CASE WHEN ABS(v_variance) <= 1 THEN 'balanced' ELSE 'review_required' END,
    _notes,
    auth.uid()
  ) RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.execute_monthly_disclosure(
  _period_name text,
  _notes text DEFAULT '',
  _dividend_declared numeric DEFAULT 0
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $$
DECLARE
  v_sales jsonb;
  v_returns jsonb;
  v_exp jsonb;
  v_inv jsonb;
  v_cash jsonb;
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
  INSERT INTO public.capital_accounts (id) VALUES (true)
  ON CONFLICT (id) DO NOTHING;

  SELECT
    COALESCE(SUM(public.get_sale_realized_amount(s.quantity_sold, s.average_selling_price, s.settlement_amount)), 0),
    COALESCE(SUM(COALESCE(s.quantity_sold, 0) * COALESCE(s.cost_price, i.average_cost_price, 0)), 0),
    COALESCE(SUM(COALESCE(s.quantity_sold, 0) * (COALESCE(i.delivery_fee, 0) / COALESCE(NULLIF(i.total_bulk_stock_in, 0), 1))), 0)
  INTO v_gross_revenue, v_cogs, v_delivery_fees
  FROM public.sales s
  LEFT JOIN public.inventory i ON i.id = s.inventory_id
  WHERE s.payment_status <> 'Cancelled';

  SELECT COALESCE(SUM(r.quantity_returned * COALESCE(public.get_sale_realized_amount(s.quantity_sold, s.average_selling_price, s.settlement_amount) / NULLIF(s.quantity_sold, 0), 0)), 0),
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

  SELECT COALESCE(SUM(GREATEST(0, COALESCE(i.total_bulk_stock_in, 0) - COALESCE(sold.qty, 0) + COALESCE(rec.qty, 0)) * COALESCE(i.average_cost_price, 0)), 0)
  INTO v_stock_value
  FROM public.inventory i
  LEFT JOIN (
    SELECT inventory_id, SUM(quantity_sold) AS qty
    FROM public.sales
    WHERE payment_status <> 'Cancelled'
    GROUP BY inventory_id
  ) sold ON sold.inventory_id = i.id
  LEFT JOIN (
    SELECT COALESCE(r.inventory_id, s.inventory_id) AS inventory_id, SUM(r.quantity_returned) AS qty
    FROM public.returns r
    LEFT JOIN public.sales s ON s.id = r.sales_id
    WHERE r.delivery_status = 'Received'
    GROUP BY COALESCE(r.inventory_id, s.inventory_id)
  ) rec ON rec.inventory_id = i.id;

  UPDATE public.inventory i
  SET total_bulk_stock_in = GREATEST(0, COALESCE(i.total_bulk_stock_in, 0) - COALESCE(sold.qty, 0) + COALESCE(rec.qty, 0))
  FROM (
    SELECT inventory_id, SUM(quantity_sold) AS qty
    FROM public.sales
    WHERE payment_status <> 'Cancelled'
    GROUP BY inventory_id
  ) sold
  FULL JOIN (
    SELECT COALESCE(r.inventory_id, s.inventory_id) AS inventory_id, SUM(r.quantity_returned) AS qty
    FROM public.returns r
    LEFT JOIN public.sales s ON s.id = r.sales_id
    WHERE r.delivery_status = 'Received'
    GROUP BY COALESCE(r.inventory_id, s.inventory_id)
  ) rec ON rec.inventory_id = sold.inventory_id
  WHERE i.id = COALESCE(sold.inventory_id, rec.inventory_id);

  SELECT COALESCE(hot_cash, 0), COALESCE(account_holding_value, 0)
  INTO v_hot_cash, v_account
  FROM public.capital_accounts
  WHERE id = true;

  v_net_worth := v_hot_cash + v_account + v_stock_value;

  SELECT COALESCE(jsonb_agg(row_to_json(s)), '[]'::jsonb) INTO v_sales FROM public.sales s;
  SELECT COALESCE(jsonb_agg(row_to_json(r)), '[]'::jsonb) INTO v_returns FROM public.returns r;
  SELECT COALESCE(jsonb_agg(row_to_json(a)), '[]'::jsonb) INTO v_exp FROM public.ad_expenses a;
  SELECT COALESCE(jsonb_agg(row_to_json(i)), '[]'::jsonb) INTO v_inv FROM public.inventory i;
  SELECT COALESCE(jsonb_agg(row_to_json(c)), '[]'::jsonb) INTO v_cash FROM public.cash_movements c;

  INSERT INTO public.disclosed_periods (
    period_name, sales_data, returns_data, ad_expenses_data, inventory_snapshot,
    notes, dividend_declared, gross_revenue, cogs, operating_expenses,
    return_penalties, net_profit, stock_holding_value, hot_cash_snapshot,
    account_holding_value_snapshot, net_worth, cash_movements_data
  ) VALUES (
    _period_name, v_sales, v_returns, v_exp, v_inv,
    _notes, _dividend_declared, v_gross_revenue, v_cogs, v_operating_expenses,
    v_return_penalties, v_net_profit, v_stock_value, v_hot_cash,
    v_account, v_net_worth, v_cash
  );

  DELETE FROM public.returns;
  DELETE FROM public.sales;
  DELETE FROM public.ad_expenses;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_cash_movement(text, numeric, numeric, numeric, text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_capital_accounts(numeric, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.execute_accounting_reconciliation(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.execute_monthly_disclosure(text, text, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_sale_capital() TO service_role;
GRANT EXECUTE ON FUNCTION public.apply_capital_delta(numeric, numeric) TO service_role;
GRANT EXECUTE ON FUNCTION public.ensure_capital_account() TO service_role;