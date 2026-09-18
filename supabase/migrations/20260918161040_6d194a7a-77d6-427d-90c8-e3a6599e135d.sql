ALTER TABLE public.capital_accounts
  ADD COLUMN IF NOT EXISTS stocks_value numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS shares_value numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS funds_value numeric NOT NULL DEFAULT 0;

ALTER TABLE public.cash_movements
  ADD COLUMN IF NOT EXISTS stocks_delta numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS shares_delta numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS funds_delta numeric NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.set_capital_accounts(
  _hot_cash numeric,
  _account_holding_value numeric,
  _stocks_value numeric,
  _shares_value numeric,
  _funds_value numeric,
  _notes text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $$
DECLARE
  old_hot numeric := 0;
  old_account numeric := 0;
  old_stocks numeric := 0;
  old_shares numeric := 0;
  old_funds numeric := 0;
  new_hot numeric := COALESCE(_hot_cash, 0);
  new_account numeric := COALESCE(_account_holding_value, 0);
  new_stocks numeric := COALESCE(_stocks_value, 0);
  new_shares numeric := COALESCE(_shares_value, 0);
  new_funds numeric := COALESCE(_funds_value, 0);
BEGIN
  IF NOT public.current_user_has_role('admin') THEN
    RAISE EXCEPTION 'Only admins can set cash and asset balances';
  END IF;

  INSERT INTO public.capital_accounts (id) VALUES (true)
  ON CONFLICT (id) DO NOTHING;

  SELECT
    COALESCE(hot_cash, 0),
    COALESCE(account_holding_value, 0),
    COALESCE(stocks_value, 0),
    COALESCE(shares_value, 0),
    COALESCE(funds_value, 0)
  INTO old_hot, old_account, old_stocks, old_shares, old_funds
  FROM public.capital_accounts
  WHERE id = true;

  UPDATE public.capital_accounts
  SET hot_cash = new_hot,
      account_holding_value = new_account,
      stocks_value = new_stocks,
      shares_value = new_shares,
      funds_value = new_funds,
      notes = _notes,
      updated_at = now()
  WHERE id = true;

  INSERT INTO public.cash_movements (
    movement_type, amount, hot_cash_delta, account_delta,
    stocks_delta, shares_delta, funds_delta, notes, created_by
  ) VALUES (
    'manual_set',
    ABS(new_hot - old_hot) + ABS(new_account - old_account) +
      ABS(new_stocks - old_stocks) + ABS(new_shares - old_shares) + ABS(new_funds - old_funds),
    new_hot - old_hot,
    new_account - old_account,
    new_stocks - old_stocks,
    new_shares - old_shares,
    new_funds - old_funds,
    _notes,
    auth.uid()
  );

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_capital_accounts(numeric, numeric, numeric, numeric, numeric, text) TO authenticated;

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
  v_stocks numeric := 0;
  v_shares numeric := 0;
  v_funds numeric := 0;
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

  SELECT COALESCE(SUM(penalty_amount), 0) INTO v_return_penalties FROM public.returns;
  SELECT COALESCE(SUM(amount), 0) INTO v_expenses FROM public.ad_expenses;

  SELECT COALESCE(SUM(GREATEST(0, COALESCE(i.total_bulk_stock_in, 0) - COALESCE(sold.qty, 0) + COALESCE(rec.qty, 0)) * COALESCE(i.average_cost_price, 0)), 0)
  INTO v_stock_value
  FROM public.inventory i
  LEFT JOIN (
    SELECT inventory_id, SUM(quantity_sold) AS qty FROM public.sales
    WHERE payment_status <> 'Cancelled' GROUP BY inventory_id
  ) sold ON sold.inventory_id = i.id
  LEFT JOIN (
    SELECT COALESCE(r.inventory_id, s.inventory_id) AS inventory_id, SUM(r.quantity_returned) AS qty
    FROM public.returns r LEFT JOIN public.sales s ON s.id = r.sales_id
    WHERE r.delivery_status = 'Received' GROUP BY COALESCE(r.inventory_id, s.inventory_id)
  ) rec ON rec.inventory_id = i.id;

  SELECT
    COALESCE(hot_cash, 0), COALESCE(account_holding_value, 0),
    COALESCE(stocks_value, 0), COALESCE(shares_value, 0), COALESCE(funds_value, 0)
  INTO v_hot_cash, v_account, v_stocks, v_shares, v_funds
  FROM public.capital_accounts WHERE id = true;

  v_actual := v_hot_cash + v_account + v_stocks + v_shares + v_funds + v_stock_value;
  v_expected := v_settlement_total - v_return_penalties - v_expenses + v_stock_value + v_stocks + v_shares + v_funds;
  v_variance := v_actual - v_expected;

  INSERT INTO public.accounting_reconciliations (
    period_name, ledger_sales_total, settlement_total, return_penalties_total,
    expenses_total, stock_holding_value, hot_cash_snapshot, account_holding_value_snapshot,
    expected_net_worth, actual_net_worth, variance, status, notes, created_by
  ) VALUES (
    COALESCE(_period_name, 'Reconciliation ' || to_char(now(), 'YYYY-MM-DD HH24:MI')),
    v_sales_total, v_settlement_total, v_return_penalties, v_expenses, v_stock_value,
    v_hot_cash, v_account, v_expected, v_actual,
    v_variance, CASE WHEN ABS(v_variance) <= 1 THEN 'balanced' ELSE 'review_required' END,
    _notes, auth.uid()
  ) RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.execute_accounting_reconciliation(text, text) TO authenticated;