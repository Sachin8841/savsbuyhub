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
    old_amount := COALESCE(OLD.settlement_amount, COALESCE(OLD.quantity_sold, 0) * COALESCE(OLD.average_selling_price, 0));
    IF OLD.payment_method = 'COD' THEN
      old_hot := -old_amount;
    ELSE
      old_account := -old_amount;
    END IF;
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') AND NEW.payment_status = 'Settled' THEN
    new_amount := COALESCE(NEW.settlement_amount, COALESCE(NEW.quantity_sold, 0) * COALESCE(NEW.average_selling_price, 0));
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
    v_gross_revenue := v_gross_revenue + COALESCE(sale_rec.quantity_sold, 0) * COALESCE(sale_rec.average_selling_price, 0);
    v_cogs := v_cogs + COALESCE(sale_rec.quantity_sold, 0) * COALESCE(sale_rec.cost_price, sale_rec.average_cost_price, 0);
    v_delivery_fees := v_delivery_fees + COALESCE(sale_rec.quantity_sold, 0) * (COALESCE(sale_rec.delivery_fee, 0) / COALESCE(sale_rec.base_stock, 1));
  END LOOP;

  SELECT COALESCE(SUM(r.quantity_returned * COALESCE(s.average_selling_price, 0)), 0),
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