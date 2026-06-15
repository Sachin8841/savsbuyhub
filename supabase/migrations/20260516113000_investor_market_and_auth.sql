-- 1. Update Auth Trigger for Admin Emails
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  assigned_role public.app_role;
BEGIN
  IF NEW.email IN (
    'sachinsathishkumar2005@gmail.com', 
    'sathishabirami2002@gmail.com', 
    'vanisathishkumar2003@gmail.com', 
    'savsbuyhub@gmail.com', 
    'savsbuyhubofficial@gmail.com'
  ) THEN
    assigned_role := 'admin'::public.app_role;
  ELSE
    assigned_role := 'user'::public.app_role;
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, assigned_role);
  
  RETURN NEW;
END;
$$;

-- Retroactively update existing users
UPDATE public.user_roles ur
SET role = 'admin'
FROM auth.users au
WHERE ur.user_id = au.id
  AND au.email IN (
    'sachinsathishkumar2005@gmail.com', 
    'sathishabirami2002@gmail.com', 
    'vanisathishkumar2003@gmail.com', 
    'savsbuyhub@gmail.com', 
    'savsbuyhubofficial@gmail.com'
  );

-- 2. Create Investments Table
CREATE TABLE IF NOT EXISTS public.investments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    amount NUMERIC NOT NULL CHECK (amount >= 100),
    purchase_date DATE NOT NULL DEFAULT CURRENT_DATE,
    utr_number TEXT,
    status TEXT NOT NULL DEFAULT 'Pending', -- Pending, Verified, Rejected, Sold
    shares NUMERIC, -- Calculated and assigned on verification
    share_price_at_buy NUMERIC,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RLS
ALTER TABLE public.investments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own investments" ON public.investments;
CREATE POLICY "Users can view own investments" ON public.investments
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own investments" ON public.investments;
CREATE POLICY "Users can insert own investments" ON public.investments
    FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can view all investments" ON public.investments;
CREATE POLICY "Admins can view all investments" ON public.investments
    FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can update investments" ON public.investments;
CREATE POLICY "Admins can update investments" ON public.investments
    FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));

-- Add full_name and phone to profiles if missing
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS full_name TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone TEXT;
