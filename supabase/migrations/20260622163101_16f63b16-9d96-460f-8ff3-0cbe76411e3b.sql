ALTER TABLE public.inventory
  ADD COLUMN IF NOT EXISTS parent_inventory_id uuid REFERENCES public.inventory(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_inventory_parent_inventory_id ON public.inventory(parent_inventory_id);

CREATE TABLE IF NOT EXISTS public.capital_accounts (
  id boolean PRIMARY KEY DEFAULT true,
  hot_cash numeric NOT NULL DEFAULT 0,
  account_holding_value numeric NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT capital_accounts_singleton CHECK (id = true)
);

GRANT SELECT ON public.capital_accounts TO authenticated;
GRANT INSERT, UPDATE ON public.capital_accounts TO authenticated;
GRANT ALL ON public.capital_accounts TO service_role;

ALTER TABLE public.capital_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view capital accounts" ON public.capital_accounts;
CREATE POLICY "Authenticated users can view capital accounts"
ON public.capital_accounts
FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "Admins can manage capital accounts" ON public.capital_accounts;
CREATE POLICY "Admins can manage capital accounts"
ON public.capital_accounts
FOR ALL
TO authenticated
USING (public.current_user_has_role('admin'))
WITH CHECK (public.current_user_has_role('admin'));

CREATE TABLE IF NOT EXISTS public.cash_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  movement_type text NOT NULL CHECK (movement_type IN ('manual_set', 'cash_to_account', 'account_to_cash', 'manual_adjustment', 'sale_settlement', 'return_penalty')),
  amount numeric NOT NULL DEFAULT 0,
  hot_cash_delta numeric NOT NULL DEFAULT 0,
  account_delta numeric NOT NULL DEFAULT 0,
  reference_table text,
  reference_id uuid,
  notes text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.cash_movements TO authenticated;
GRANT ALL ON public.cash_movements TO service_role;

ALTER TABLE public.cash_movements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view cash movements" ON public.cash_movements;
CREATE POLICY "Authenticated users can view cash movements"
ON public.cash_movements
FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "Admins can insert cash movements" ON public.cash_movements;
CREATE POLICY "Admins can insert cash movements"
ON public.cash_movements
FOR INSERT
TO authenticated
WITH CHECK (public.current_user_has_role('admin'));

CREATE OR REPLACE FUNCTION public.ensure_capital_account()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  INSERT INTO public.capital_accounts (id) VALUES (true)
  ON CONFLICT (id) DO NOTHING;
$$;

CREATE OR REPLACE FUNCTION public.apply_capital_delta(_hot_cash_delta numeric, _account_delta numeric)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public.ensure_capital_account();
  UPDATE public.capital_accounts
  SET hot_cash = hot_cash + COALESCE(_hot_cash_delta, 0),
      account_holding_value = account_holding_value + COALESCE(_account_delta, 0),
      updated_at = now()
  WHERE id = true;
END;
$$;

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
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.current_user_has_role('admin') THEN
    RAISE EXCEPTION 'Only admins can change cash balances';
  END IF;

  PERFORM public.apply_capital_delta(_hot_cash_delta, _account_delta);

  INSERT INTO public.cash_movements (movement_type, amount, hot_cash_delta, account_delta, reference_table, reference_id, notes, created_by)
  VALUES (_movement_type, COALESCE(_amount, 0), COALESCE(_hot_cash_delta, 0), COALESCE(_account_delta, 0), _reference_table, _reference_id, _notes, auth.uid());

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_capital_accounts(_hot_cash numeric, _account_holding_value numeric, _notes text DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  old_hot numeric := 0;
  old_account numeric := 0;
BEGIN
  IF NOT public.current_user_has_role('admin') THEN
    RAISE EXCEPTION 'Only admins can set cash balances';
  END IF;

  PERFORM public.ensure_capital_account();
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
  IF TG_OP IN ('UPDATE', 'DELETE') AND OLD.payment_status = 'Settled' THEN
    old_amount := COALESCE(OLD.quantity_sold, 0) * COALESCE(OLD.average_selling_price, 0);
    IF OLD.payment_method = 'COD' THEN
      old_hot := -old_amount;
    ELSE
      old_account := -old_amount;
    END IF;
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') AND NEW.payment_status = 'Settled' THEN
    new_amount := COALESCE(NEW.quantity_sold, 0) * COALESCE(NEW.average_selling_price, 0);
    IF NEW.payment_method = 'COD' THEN
      new_hot := new_amount;
    ELSE
      new_account := new_amount;
    END IF;
  END IF;

  IF (old_hot + new_hot) <> 0 OR (old_account + new_account) <> 0 THEN
    PERFORM public.apply_capital_delta(old_hot + new_hot, old_account + new_account);
    INSERT INTO public.cash_movements (movement_type, amount, hot_cash_delta, account_delta, reference_table, reference_id, notes)
    VALUES ('sale_settlement', ABS(new_amount - old_amount), old_hot + new_hot, old_account + new_account, 'sales', COALESCE(NEW.id, OLD.id), 'Auto-sync from sales settlement');
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_sale_capital ON public.sales;
CREATE TRIGGER trg_sync_sale_capital
AFTER INSERT OR UPDATE OR DELETE ON public.sales
FOR EACH ROW EXECUTE FUNCTION public.sync_sale_capital();

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

DROP TRIGGER IF EXISTS trg_sync_return_penalty_capital ON public.returns;
CREATE TRIGGER trg_sync_return_penalty_capital
AFTER INSERT OR UPDATE OR DELETE ON public.returns
FOR EACH ROW EXECUTE FUNCTION public.sync_return_penalty_capital();

INSERT INTO public.capital_accounts (id) VALUES (true)
ON CONFLICT (id) DO NOTHING;