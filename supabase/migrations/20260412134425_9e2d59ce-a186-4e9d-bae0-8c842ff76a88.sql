
-- Add selling price and delivery fee to inventory
ALTER TABLE public.inventory ADD COLUMN IF NOT EXISTS average_selling_price numeric NOT NULL DEFAULT 0;
ALTER TABLE public.inventory ADD COLUMN IF NOT EXISTS delivery_fee numeric NOT NULL DEFAULT 0;

-- Create courier partner enum
DO $$ BEGIN
  CREATE TYPE public.courier_type AS ENUM ('Valmo', 'Delhivery', 'Shadowfax', 'XpressBees', 'SAVS Trans X', 'Other');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Create delivery status enum for returns
DO $$ BEGIN
  CREATE TYPE public.delivery_status_type AS ENUM ('In Transit', 'Received');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Make courier_partner nullable in sales and keep as text for flexibility
ALTER TABLE public.sales ALTER COLUMN courier_partner DROP NOT NULL;
ALTER TABLE public.sales ALTER COLUMN courier_partner SET DEFAULT NULL;

-- Update returns table: remove is_restockable, add delivery_status, return_date, delivered_date
ALTER TABLE public.returns ADD COLUMN IF NOT EXISTS delivery_status public.delivery_status_type NOT NULL DEFAULT 'In Transit';
ALTER TABLE public.returns ADD COLUMN IF NOT EXISTS return_date date NOT NULL DEFAULT CURRENT_DATE;
ALTER TABLE public.returns ADD COLUMN IF NOT EXISTS delivered_date date;
ALTER TABLE public.returns DROP COLUMN IF EXISTS is_restockable;

-- Create ad_expenses table
CREATE TABLE IF NOT EXISTS public.ad_expenses (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  platform text NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  expense_date date NOT NULL DEFAULT CURRENT_DATE,
  description text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.ad_expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view ad expenses"
  ON public.ad_expenses FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can insert ad expenses"
  ON public.ad_expenses FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update ad expenses"
  ON public.ad_expenses FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete ad expenses"
  ON public.ad_expenses FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Update get_current_stock to use delivery_status instead of is_restockable
CREATE OR REPLACE FUNCTION public.get_current_stock(inv_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    i.total_bulk_stock_in
    - COALESCE((SELECT SUM(s.quantity_sold) FROM public.sales s WHERE s.inventory_id = inv_id), 0)::INTEGER
    + COALESCE((SELECT SUM(r.quantity_returned) FROM public.returns r JOIN public.sales s ON r.sales_id = s.id WHERE s.inventory_id = inv_id AND r.delivery_status = 'Received'), 0)::INTEGER
  FROM public.inventory i
  WHERE i.id = inv_id
$$;

-- Add RLS policy for public (anon) read access to inventory, sales, returns for forecast
CREATE POLICY "Public can view inventory" ON public.inventory FOR SELECT TO anon USING (true);
CREATE POLICY "Public can view sales" ON public.sales FOR SELECT TO anon USING (true);
CREATE POLICY "Public can view returns" ON public.returns FOR SELECT TO anon USING (true);
CREATE POLICY "Public can view ad expenses" ON public.ad_expenses FOR SELECT TO anon USING (true);
