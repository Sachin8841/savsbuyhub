-- Accounting reconciliation register
CREATE TABLE IF NOT EXISTS public.accounting_reconciliations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_name text NOT NULL,
  reconciliation_date date NOT NULL DEFAULT CURRENT_DATE,
  ledger_sales_total numeric NOT NULL DEFAULT 0,
  settlement_total numeric NOT NULL DEFAULT 0,
  return_penalties_total numeric NOT NULL DEFAULT 0,
  expenses_total numeric NOT NULL DEFAULT 0,
  stock_holding_value numeric NOT NULL DEFAULT 0,
  hot_cash_snapshot numeric NOT NULL DEFAULT 0,
  account_holding_value_snapshot numeric NOT NULL DEFAULT 0,
  expected_net_worth numeric NOT NULL DEFAULT 0,
  actual_net_worth numeric NOT NULL DEFAULT 0,
  variance numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'balanced' CHECK (status IN ('balanced', 'review_required')),
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.accounting_reconciliations TO authenticated;
GRANT ALL ON public.accounting_reconciliations TO service_role;

ALTER TABLE public.accounting_reconciliations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage accounting reconciliations" ON public.accounting_reconciliations;
CREATE POLICY "Admins can manage accounting reconciliations"
ON public.accounting_reconciliations
FOR ALL
TO authenticated
USING (public.current_user_has_role('admin'))
WITH CHECK (public.current_user_has_role('admin'));

DROP TRIGGER IF EXISTS update_accounting_reconciliations_updated_at ON public.accounting_reconciliations;
CREATE TRIGGER update_accounting_reconciliations_updated_at
BEFORE UPDATE ON public.accounting_reconciliations
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_accounting_reconciliations_date ON public.accounting_reconciliations(reconciliation_date DESC);
CREATE INDEX IF NOT EXISTS idx_accounting_reconciliations_status ON public.accounting_reconciliations(status);

-- Better read/order indexes for the slowest app queries.
CREATE INDEX IF NOT EXISTS idx_sales_dispatch_date_desc ON public.sales(dispatch_date DESC);
CREATE INDEX IF NOT EXISTS idx_sales_inventory_status ON public.sales(inventory_id, payment_status);
CREATE INDEX IF NOT EXISTS idx_sales_order_number ON public.sales(order_number);
CREATE INDEX IF NOT EXISTS idx_returns_created_at_desc ON public.returns(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_returns_sales_id ON public.returns(sales_id);
CREATE INDEX IF NOT EXISTS idx_returns_inventory_status ON public.returns(inventory_id, delivery_status);
CREATE INDEX IF NOT EXISTS idx_inventory_created_at_desc ON public.inventory(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cash_movements_created_at_desc ON public.cash_movements(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_disclosed_periods_created_at_desc ON public.disclosed_periods(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON public.profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON public.user_roles(user_id);

-- Exact-settlement helper: use the actual payment amount from reports as realized revenue.
CREATE OR REPLACE FUNCTION public.get_sale_realized_amount(_quantity integer, _selling_price numeric, _settlement_amount numeric)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT COALESCE(_settlement_amount, COALESCE(_quantity, 0) * COALESCE(_selling_price, 0));
$$;

-- Recreate the sale capital trigger with exact settlement amount and disclosure guard.
CREATE OR REPLACE FUNCTION public.sync_sale_capital()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  old_amount numeric := 0;
  new_amount numeric := 0;
  old_hot numeric := 0;
  old_account numeric := 0;
  new_hot numeric := 0;
  new_account numeric := 0;
BEGIN
  IF current_setting('app.monthly_disclosure', true) = 'on' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP IN ('UPDATE', 'DELETE') AND OLD.payment_status = 'Settled' THEN
    old_amount := public.get_sale_realized_amount(OLD.quantity_sold, OLD.average_selling_price, OLD.settlement_amount);
    IF OLD.payment_method = 'COD' THEN
      old_hot := -old_amount;
    ELSE
      old_account := -old_amount;
    END IF;
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') AND NEW.payment_status = 'Settled' THEN
    new_amount := public.get_sale_realized_amount(NEW.quantity_sold, NEW.average_selling_price, NEW.settlement_amount);
    IF NEW.payment_method = 'COD' THEN
      new_hot := new_amount;
    ELSE
      new_account := new_amount;
    END IF;
  END IF;

  IF (old_hot + new_hot) <> 0 OR (old_account + new_account) <> 0 THEN
    PERFORM public.apply_capital_delta(old_hot + new_hot, old_account + new_account);
    INSERT INTO public.cash_movements (movement_type, amount, hot_cash_delta, account_delta, reference_table, reference_id, notes)
    VALUES ('sale_settlement', ABS((new_hot + new_account) - (old_hot + old_account)), old_hot + new_hot, old_account + new_account, 'sales', COALESCE(NEW.id, OLD.id), 'Auto-sync from exact sale settlement');
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_sale_capital ON public.sales;
CREATE TRIGGER trg_sync_sale_capital
AFTER INSERT OR UPDATE OR DELETE ON public.sales
FOR EACH ROW EXECUTE FUNCTION public.sync_sale_capital();

-- Admin-only accounting reconciliation snapshot.
CREATE OR REPLACE FUNCTION public.execute_accounting_reconciliation(
  _period_name text DEFAULT NULL,
  _notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
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

  PERFORM public.ensure_capital_account();

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

  SELECT COALESCE(SUM(GREATEST(0, stock.current_stock) * COALESCE(i.average_cost_price, 0)), 0)
  INTO v_stock_value
  FROM public.inventory i
  CROSS JOIN LATERAL (
    SELECT COALESCE(i.total_bulk_stock_in, 0)
      - COALESCE((SELECT SUM(s.quantity_sold) FROM public.sales s WHERE s.inventory_id = i.id AND s.payment_status <> 'Cancelled'), 0)
      + COALESCE((SELECT SUM(r.quantity_returned) FROM public.returns r WHERE COALESCE(r.inventory_id, (SELECT s2.inventory_id FROM public.sales s2 WHERE s2.id = r.sales_id)) = i.id AND r.delivery_status = 'Received'), 0)
      AS current_stock
  ) stock;

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

-- Monthly disclosure now saves exact realized settlement totals and return-linked statement data.
CREATE OR REPLACE FUNCTION public.execute_monthly_disclosure(
  _period_name text,
  _notes text DEFAULT '',
  _dividend_declared numeric DEFAULT 0
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_sales jsonb;
  v_returns jsonb;
  v_exp jsonb;
  v_inv jsonb;
  v_cash jsonb;
  inv RECORD;
  sale_rec RECORD;
  new_stock integer;
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
  PERFORM public.ensure_capital_account();

  FOR sale_rec IN
    SELECT s.*, i.average_cost_price, i.delivery_fee, NULLIF(i.total_bulk_stock_in, 0) AS base_stock
    FROM public.sales s
    LEFT JOIN public.inventory i ON i.id = s.inventory_id
    WHERE s.payment_status <> 'Cancelled'
  LOOP
    v_gross_revenue := v_gross_revenue + public.get_sale_realized_amount(sale_rec.quantity_sold, sale_rec.average_selling_price, sale_rec.settlement_amount);
    v_cogs := v_cogs + COALESCE(sale_rec.quantity_sold, 0) * COALESCE(sale_rec.cost_price, sale_rec.average_cost_price, 0);
    v_delivery_fees := v_delivery_fees + COALESCE(sale_rec.quantity_sold, 0) * (COALESCE(sale_rec.delivery_fee, 0) / COALESCE(sale_rec.base_stock, 1));
  END LOOP;

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

  FOR inv IN SELECT * FROM public.inventory LOOP
    new_stock := public.get_current_stock(inv.id);
    IF new_stock IS NOT NULL THEN
      v_stock_value := v_stock_value + GREATEST(0, new_stock) * COALESCE(inv.average_cost_price, 0);
      UPDATE public.inventory SET total_bulk_stock_in = GREATEST(0, new_stock) WHERE id = inv.id;
    END IF;
  END LOOP;

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

-- Security hardening for internal SECURITY DEFINER procedures.
REVOKE EXECUTE ON FUNCTION public.execute_monthly_disclosure(text, text, numeric) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.execute_accounting_reconciliation(text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_current_stock(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user_profile() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user_role() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sync_sale_capital() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_sale_realized_amount(integer, numeric, numeric) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.execute_monthly_disclosure(text, text, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.execute_accounting_reconciliation(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_current_stock(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_sale_realized_amount(integer, numeric, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_sale_capital() TO service_role;

-- Public forecast RPCs are intentionally public; revoke signed-in execution for trigger-only/admin helpers separately.
GRANT EXECUTE ON FUNCTION public.get_public_share_price() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_price_history() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_forecast_data() TO anon, authenticated;