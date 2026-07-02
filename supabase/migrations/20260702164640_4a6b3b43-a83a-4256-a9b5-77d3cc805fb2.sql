-- Reliable cash/account syncing for settled sales
DROP TRIGGER IF EXISTS trg_sync_sale_capital ON public.sales;

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
  delta_hot numeric := 0;
  delta_account numeric := 0;
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

  delta_hot := old_hot + new_hot;
  delta_account := old_account + new_account;

  IF delta_hot <> 0 OR delta_account <> 0 THEN
    PERFORM public.apply_capital_delta(delta_hot, delta_account);
    INSERT INTO public.cash_movements (movement_type, amount, hot_cash_delta, account_delta, reference_table, reference_id, notes)
    VALUES ('sale_settlement', ABS(delta_hot + delta_account), delta_hot, delta_account, 'sales', COALESCE(NEW.id, OLD.id), 'Auto-sync from sale settlement status/amount');
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_sync_sale_capital
AFTER INSERT OR UPDATE OR DELETE ON public.sales
FOR EACH ROW EXECUTE FUNCTION public.sync_sale_capital();

-- Reliable account reduction for return penalties
DROP TRIGGER IF EXISTS trg_sync_return_penalty_capital ON public.returns;

CREATE OR REPLACE FUNCTION public.sync_return_penalty_capital()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  old_penalty numeric := 0;
  new_penalty numeric := 0;
  delta numeric := 0;
BEGIN
  IF current_setting('app.monthly_disclosure', true) = 'on' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    old_penalty := COALESCE(OLD.penalty_amount, 0);
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    new_penalty := COALESCE(NEW.penalty_amount, 0);
  END IF;

  delta := old_penalty - new_penalty;

  IF delta <> 0 THEN
    PERFORM public.apply_capital_delta(0, delta);
    INSERT INTO public.cash_movements (movement_type, amount, hot_cash_delta, account_delta, reference_table, reference_id, notes)
    VALUES ('return_penalty', ABS(delta), 0, delta, 'returns', COALESCE(NEW.id, OLD.id), 'Auto-sync from return penalty');
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_sync_return_penalty_capital
AFTER INSERT OR UPDATE OR DELETE ON public.returns
FOR EACH ROW EXECUTE FUNCTION public.sync_return_penalty_capital();

-- Targeted indexes for dashboard/P&L/ledger responsiveness
CREATE INDEX IF NOT EXISTS idx_sales_dispatch_status ON public.sales (dispatch_date DESC, payment_status);
CREATE INDEX IF NOT EXISTS idx_sales_inventory_status ON public.sales (inventory_id, payment_status);
CREATE INDEX IF NOT EXISTS idx_sales_order_number ON public.sales (order_number);
CREATE INDEX IF NOT EXISTS idx_returns_date_status ON public.returns (return_date DESC, delivery_status);
CREATE INDEX IF NOT EXISTS idx_returns_sales_id ON public.returns (sales_id);
CREATE INDEX IF NOT EXISTS idx_returns_inventory_status ON public.returns (inventory_id, delivery_status);
CREATE INDEX IF NOT EXISTS idx_ad_expenses_date_category ON public.ad_expenses (expense_date DESC, category);
CREATE INDEX IF NOT EXISTS idx_inventory_sku ON public.inventory (sku);