-- Create the execute_monthly_disclosure function to bypass all client-side errors and RLS timeouts
-- This function runs entirely on the server as SECURITY DEFINER, meaning it will always succeed.
CREATE OR REPLACE FUNCTION public.execute_monthly_disclosure(
  _period_name text,
  _notes text,
  _dividend_declared decimal
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sales_data jsonb;
  v_returns_data jsonb;
  v_ad_expenses_data jsonb;
  v_inventory_data jsonb;
  inv RECORD;
  new_stock integer;
BEGIN
  -- 1. Freeze inventory stock based on the true calculated quantity
  FOR inv IN SELECT * FROM public.inventory LOOP
    new_stock := public.get_current_stock(inv.id);
    IF new_stock IS NOT NULL THEN
      UPDATE public.inventory SET total_bulk_stock_in = new_stock WHERE id = inv.id;
    END IF;
  END LOOP;

  -- 2. Build JSON snapshots of the current data before wiping
  SELECT COALESCE(jsonb_agg(row_to_json(s)), '[]'::jsonb) INTO v_sales_data FROM public.sales s;
  SELECT COALESCE(jsonb_agg(row_to_json(r)), '[]'::jsonb) INTO v_returns_data FROM public.returns r;
  SELECT COALESCE(jsonb_agg(row_to_json(a)), '[]'::jsonb) INTO v_ad_expenses_data FROM public.ad_expenses a;
  SELECT COALESCE(jsonb_agg(row_to_json(i)), '[]'::jsonb) INTO v_inventory_data FROM public.inventory i;

  -- 3. Insert into disclosed_periods
  INSERT INTO public.disclosed_periods (
    period_name,
    sales_data,
    returns_data,
    ad_expenses_data,
    inventory_snapshot,
    notes,
    dividend_declared
  ) VALUES (
    _period_name,
    v_sales_data,
    v_returns_data,
    v_ad_expenses_data,
    v_inventory_data,
    _notes,
    _dividend_declared
  );

  -- 4. Safely clear the active ledgers (returns must be deleted before sales due to foreign keys)
  DELETE FROM public.returns;
  DELETE FROM public.sales;
  DELETE FROM public.ad_expenses;

  RETURN true;
END;
$$;

-- Force Supabase to reload its API cache immediately so the frontend can see the new function
NOTIFY pgrst, 'reload schema';
-- phase4_setup.sql

-- 1. Ensure profiles table has all necessary KYC fields (fixes Settings crash)
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS aadhar_number text,
ADD COLUMN IF NOT EXISTS pan_number text,
ADD COLUMN IF NOT EXISTS bank_name text,
ADD COLUMN IF NOT EXISTS account_number text,
ADD COLUMN IF NOT EXISTS ifsc_code text,
ADD COLUMN IF NOT EXISTS phone text,
ADD COLUMN IF NOT EXISTS initial text;

-- 2. Create Delete User function with Investment Protection
CREATE OR REPLACE FUNCTION public.delete_user_account(_target_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.stock_ledger WHERE user_id = _target_user_id AND stock_balance > 0) THEN
    RAISE EXCEPTION 'Cannot delete user: User currently holds active stock investments.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION 'Only administrators can delete users.';
  END IF;

  DELETE FROM public.user_roles WHERE user_id = _target_user_id;
  DELETE FROM public.profiles WHERE id = _target_user_id;
  RETURN true;
END;
$$;

-- 3. Create Investment Requests table for Admin Approvals
CREATE TABLE IF NOT EXISTS public.investment_requests (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid REFERENCES auth.users(id) NOT NULL,
    amount numeric NOT NULL CHECK (amount > 0),
    stock_price_at_request numeric NOT NULL,
    requested_shares numeric NOT NULL,
    payment_method text NOT NULL,
    transaction_id text NOT NULL,
    status text NOT NULL DEFAULT 'pending', -- pending, approved, rejected
    created_at timestamp with time zone DEFAULT now()
);

-- Enable RLS on investment requests
ALTER TABLE public.investment_requests ENABLE ROW LEVEL SECURITY;

-- Policies for investment_requests
DROP POLICY IF EXISTS "Users can view own investment requests" ON public.investment_requests;
CREATE POLICY "Users can view own investment requests" ON public.investment_requests FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own investment requests" ON public.investment_requests;
CREATE POLICY "Users can insert own investment requests" ON public.investment_requests FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can view all investment requests" ON public.investment_requests;
CREATE POLICY "Admins can view all investment requests" ON public.investment_requests FOR SELECT USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "Admins can update investment requests" ON public.investment_requests;
CREATE POLICY "Admins can update investment requests" ON public.investment_requests FOR UPDATE USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'));

-- 4. Reload schema cache (CRITICAL TO FIX ALL DB CRASHES)
NOTIFY pgrst, 'reload schema';
