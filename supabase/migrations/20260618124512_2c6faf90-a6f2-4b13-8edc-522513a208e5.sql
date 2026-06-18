
-- 1. Profiles: KYC fields
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS pan_number text,
  ADD COLUMN IF NOT EXISTS aadhar_number text,
  ADD COLUMN IF NOT EXISTS bank_name text,
  ADD COLUMN IF NOT EXISTS account_number text,
  ADD COLUMN IF NOT EXISTS ifsc_code text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS initial text,
  ADD COLUMN IF NOT EXISTS dob text,
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS gender text;

-- 2. Sales: cost_price
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS cost_price numeric;

-- 3. payment_status_type: add 'Cancelled'
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    WHERE t.typname = 'payment_status_type' AND e.enumlabel = 'Cancelled'
  ) THEN
    ALTER TYPE public.payment_status_type ADD VALUE 'Cancelled';
  END IF;
END $$;

-- 4. investments
CREATE TABLE IF NOT EXISTS public.investments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount numeric NOT NULL CHECK (amount >= 0),
  purchase_date date NOT NULL DEFAULT CURRENT_DATE,
  utr_number text,
  status text NOT NULL DEFAULT 'Pending',
  shares numeric,
  share_price_at_buy numeric,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.investments TO authenticated;
GRANT ALL ON public.investments TO service_role;
ALTER TABLE public.investments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users view own investments" ON public.investments;
CREATE POLICY "Users view own investments" ON public.investments FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Users insert own investments" ON public.investments;
CREATE POLICY "Users insert own investments" ON public.investments FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Admins update investments" ON public.investments;
CREATE POLICY "Admins update investments" ON public.investments FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Admins delete investments" ON public.investments;
CREATE POLICY "Admins delete investments" ON public.investments FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- 5. sips
CREATE TABLE IF NOT EXISTS public.sips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount numeric NOT NULL,
  frequency text NOT NULL DEFAULT 'Monthly',
  autopay_enabled boolean DEFAULT false,
  start_date date NOT NULL DEFAULT CURRENT_DATE,
  next_date date NOT NULL DEFAULT CURRENT_DATE,
  status text DEFAULT 'Active',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sips TO authenticated;
GRANT ALL ON public.sips TO service_role;
ALTER TABLE public.sips ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own sips" ON public.sips;
CREATE POLICY "Users manage own sips" ON public.sips FOR ALL TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin')) WITH CHECK (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

-- 6. disclosed_periods
CREATE TABLE IF NOT EXISTS public.disclosed_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_name text NOT NULL,
  sales_data jsonb NOT NULL DEFAULT '[]'::jsonb,
  returns_data jsonb NOT NULL DEFAULT '[]'::jsonb,
  ad_expenses_data jsonb NOT NULL DEFAULT '[]'::jsonb,
  inventory_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes text DEFAULT '',
  dividend_declared numeric(5,2) DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.disclosed_periods TO authenticated;
GRANT ALL ON public.disclosed_periods TO service_role;
ALTER TABLE public.disclosed_periods ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated view disclosed periods" ON public.disclosed_periods;
CREATE POLICY "Authenticated view disclosed periods" ON public.disclosed_periods FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Admins insert disclosed periods" ON public.disclosed_periods;
CREATE POLICY "Admins insert disclosed periods" ON public.disclosed_periods FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Admins update disclosed periods" ON public.disclosed_periods;
CREATE POLICY "Admins update disclosed periods" ON public.disclosed_periods FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- 7. Public share price functions (simplified, app already has a JS fallback)
CREATE OR REPLACE FUNCTION public.get_public_share_price()
RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT 100::numeric $$;

CREATE OR REPLACE FUNCTION public.get_public_price_history()
RETURNS TABLE("time" text, price numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT CURRENT_DATE::text, 100::numeric $$;

CREATE OR REPLACE FUNCTION public.get_public_forecast_data()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT '[]'::jsonb $$;

GRANT EXECUTE ON FUNCTION public.get_public_share_price() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_price_history() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_forecast_data() TO anon, authenticated;

-- 8. execute_monthly_disclosure
CREATE OR REPLACE FUNCTION public.execute_monthly_disclosure(
  _period_name text,
  _notes text DEFAULT '',
  _dividend_declared numeric DEFAULT 0
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_sales jsonb; v_returns jsonb; v_exp jsonb; v_inv jsonb;
  inv RECORD; new_stock integer;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can execute monthly disclosure';
  END IF;

  FOR inv IN SELECT * FROM public.inventory LOOP
    new_stock := public.get_current_stock(inv.id);
    IF new_stock IS NOT NULL THEN
      UPDATE public.inventory SET total_bulk_stock_in = GREATEST(0, new_stock) WHERE id = inv.id;
    END IF;
  END LOOP;

  SELECT COALESCE(jsonb_agg(row_to_json(s)), '[]'::jsonb) INTO v_sales FROM public.sales s;
  SELECT COALESCE(jsonb_agg(row_to_json(r)), '[]'::jsonb) INTO v_returns FROM public.returns r;
  SELECT COALESCE(jsonb_agg(row_to_json(a)), '[]'::jsonb) INTO v_exp FROM public.ad_expenses a;
  SELECT COALESCE(jsonb_agg(row_to_json(i)), '[]'::jsonb) INTO v_inv FROM public.inventory i;

  INSERT INTO public.disclosed_periods (period_name, sales_data, returns_data, ad_expenses_data, inventory_snapshot, notes, dividend_declared)
  VALUES (_period_name, v_sales, v_returns, v_exp, v_inv, _notes, _dividend_declared);

  DELETE FROM public.returns;
  DELETE FROM public.sales;
  DELETE FROM public.ad_expenses;
  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.execute_monthly_disclosure(text, text, numeric) TO authenticated;

NOTIFY pgrst, 'reload schema';
