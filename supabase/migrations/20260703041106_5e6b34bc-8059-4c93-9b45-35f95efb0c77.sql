
-- Auto-generate SAVS0001, SAVS0002... for offline orders without an order number.
CREATE SEQUENCE IF NOT EXISTS public.savs_offline_order_seq START 1;

CREATE OR REPLACE FUNCTION public.next_offline_order_id()
RETURNS text
LANGUAGE sql
SET search_path = public
AS $$
  SELECT 'SAVS' || LPAD(nextval('public.savs_offline_order_seq')::text, 4, '0')
$$;

GRANT EXECUTE ON FUNCTION public.next_offline_order_id() TO authenticated, service_role;
GRANT USAGE ON SEQUENCE public.savs_offline_order_seq TO authenticated, service_role;

-- Seed the sequence past existing SAVS#### values so we never collide.
DO $$
DECLARE
  max_num integer;
BEGIN
  SELECT COALESCE(MAX(NULLIF(regexp_replace(order_number, '^SAVS0*', ''), '')::integer), 0)
  INTO max_num
  FROM public.sales
  WHERE order_number ~ '^SAVS[0-9]+$';
  IF max_num > 0 THEN
    PERFORM setval('public.savs_offline_order_seq', max_num);
  END IF;
END $$;

-- BEFORE INSERT trigger on sales: fill missing Offline order numbers.
CREATE OR REPLACE FUNCTION public.assign_offline_order_number()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.platform = 'Offline' AND (NEW.order_number IS NULL OR btrim(NEW.order_number) = '') THEN
    NEW.order_number := public.next_offline_order_id();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assign_offline_order_number ON public.sales;
CREATE TRIGGER trg_assign_offline_order_number
BEFORE INSERT ON public.sales
FOR EACH ROW EXECUTE FUNCTION public.assign_offline_order_number();

-- Restock merge helper: called from the app when the user confirms a restock.
-- Updates the existing inventory row with weighted-average cost + freight, and
-- adds the new units to total_bulk_stock_in. Returns the updated row id.
CREATE OR REPLACE FUNCTION public.merge_restock(
  _inventory_id uuid,
  _added_qty integer,
  _new_cost numeric,
  _added_freight numeric DEFAULT 0,
  _new_selling_price numeric DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  current_stock integer;
  current_cost numeric;
  new_total integer;
  weighted_cost numeric;
BEGIN
  IF NOT public.current_user_has_role('admin') THEN
    RAISE EXCEPTION 'Only admins can restock inventory';
  END IF;

  IF _added_qty IS NULL OR _added_qty <= 0 THEN
    RAISE EXCEPTION 'Restock quantity must be > 0';
  END IF;

  SELECT COALESCE(total_bulk_stock_in, 0), COALESCE(average_cost_price, 0)
  INTO current_stock, current_cost
  FROM public.inventory
  WHERE id = _inventory_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Inventory row not found: %', _inventory_id;
  END IF;

  new_total := current_stock + _added_qty;
  weighted_cost := CASE
    WHEN new_total > 0 THEN ((current_stock * current_cost) + (_added_qty * COALESCE(_new_cost, 0))) / new_total
    ELSE COALESCE(_new_cost, 0)
  END;

  UPDATE public.inventory
  SET total_bulk_stock_in = new_total,
      average_cost_price = weighted_cost,
      delivery_fee = COALESCE(delivery_fee, 0) + COALESCE(_added_freight, 0),
      average_selling_price = COALESCE(_new_selling_price, average_selling_price),
      stock_added_date = CURRENT_DATE
  WHERE id = _inventory_id;

  RETURN _inventory_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.merge_restock(uuid, integer, numeric, numeric, numeric) TO authenticated, service_role;
