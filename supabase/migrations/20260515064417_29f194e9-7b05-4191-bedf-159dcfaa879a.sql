
-- 1. Inventory aliases
ALTER TABLE public.inventory ADD COLUMN IF NOT EXISTS aliases text[] NOT NULL DEFAULT '{}';

-- 2. Sales: order number + payment method
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS order_number text;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS payment_method text;

-- 3. Returns: link directly to inventory; make sales_id optional
ALTER TABLE public.returns ADD COLUMN IF NOT EXISTS inventory_id uuid;
ALTER TABLE public.returns ALTER COLUMN sales_id DROP NOT NULL;

-- Backfill inventory_id from sales for existing rows
UPDATE public.returns r
SET inventory_id = s.inventory_id
FROM public.sales s
WHERE r.sales_id = s.id AND r.inventory_id IS NULL;

-- 4. Expenses: category column (defaults to 'Ads' to preserve existing behavior)
ALTER TABLE public.ad_expenses ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'Ads';

-- 5. Update get_current_stock to use returns.inventory_id directly when present
CREATE OR REPLACE FUNCTION public.get_current_stock(inv_id uuid)
RETURNS integer
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
$function$;
