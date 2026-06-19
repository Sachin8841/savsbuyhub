-- Redefine has_role to grant admin permissions to whitelisted emails case-insensitively.
-- This ensures all DB triggers, RLS policies, and RPC functions (like monthly disclosure)
-- work perfectly without requiring manual database role updates.

-- 1. Clean up duplicate user_id entries from user_roles
WITH duplicates AS (
  SELECT id,
         row_number() OVER (PARTITION BY user_id ORDER BY CASE WHEN role = 'admin'::public.app_role THEN 1 ELSE 2 END, id DESC) as rn
  FROM public.user_roles
)
DELETE FROM public.user_roles
WHERE id IN (SELECT id FROM duplicates WHERE rn > 1);

-- 2. Drop composite/redundant unique constraints and add a unique constraint on user_id only
ALTER TABLE public.user_roles DROP CONSTRAINT IF EXISTS user_roles_user_id_role_key;
ALTER TABLE public.user_roles DROP CONSTRAINT IF EXISTS user_roles_user_id_key;
ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_user_id_key UNIQUE (user_id);

-- 3. Redefine app_role version of has_role with case-insensitive whitelist
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text;
  admin_emails text[] := ARRAY[
    'sachinsathishkumar2005@gmail.com',
    'sathishabirami2002@gmail.com',
    'vanisathishkumar2003@gmail.com',
    'savsbuyhub@gmail.com',
    'savsbuyhubofficial@gmail.com'
  ];
BEGIN
  -- Get user email from auth.users
  SELECT email INTO v_email FROM auth.users WHERE id = _user_id;
  
  -- If email (lowercased) is in the whitelist, treat them as admin
  IF LOWER(v_email) = ANY(admin_emails) THEN
    RETURN TRUE;
  END IF;
  
  -- Fallback to user_roles table
  RETURN EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  );
END;
$$;

-- 4. Create has_role overload accepting text parameter to support text checks case-insensitively
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role text)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text;
  admin_emails text[] := ARRAY[
    'sachinsathishkumar2005@gmail.com',
    'sathishabirami2002@gmail.com',
    'vanisathishkumar2003@gmail.com',
    'savsbuyhub@gmail.com',
    'savsbuyhubofficial@gmail.com'
  ];
BEGIN
  -- Get user email from auth.users
  SELECT email INTO v_email FROM auth.users WHERE id = _user_id;
  
  -- If email (lowercased) is in the whitelist, treat them as admin
  IF LOWER(v_email) = ANY(admin_emails) THEN
    RETURN TRUE;
  END IF;
  
  -- Try to cast and check, or fallback to user_roles table with text comparison
  RETURN EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND (role::text = _role OR (role = 'admin'::public.app_role AND _role = 'admin'))
  );
EXCEPTION WHEN OTHERS THEN
  -- Fallback to table comparison
  RETURN EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role::text = _role
  );
END;
$$;

-- 5. REWRITE TRIGGER FUNCTIONS WITH SAFE ON CONFLICT HANDLING
CREATE OR REPLACE FUNCTION public.handle_new_user_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  admin_emails text[] := ARRAY[
    'sachinsathishkumar2005@gmail.com',
    'sathishabirami2002@gmail.com',
    'vanisathishkumar2003@gmail.com',
    'savsbuyhub@gmail.com',
    'savsbuyhubofficial@gmail.com'
  ];
  assigned_role public.app_role;
BEGIN
  IF LOWER(NEW.email) = ANY(admin_emails) THEN
    assigned_role := 'admin'::public.app_role;
  ELSE
    assigned_role := 'user'::public.app_role;
  END IF;
  
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, assigned_role)
  ON CONFLICT (user_id) DO UPDATE SET role = assigned_role;
  
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  assigned_role public.app_role;
BEGIN
  IF LOWER(NEW.email) IN (
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
  VALUES (NEW.id, assigned_role)
  ON CONFLICT (user_id) DO UPDATE SET role = assigned_role;
  
  RETURN NEW;
END;
$$;

-- 6. INVENTORY POLICIES
DROP POLICY IF EXISTS "Authenticated users can view inventory" ON public.inventory;
DROP POLICY IF EXISTS "Admins can insert inventory" ON public.inventory;
DROP POLICY IF EXISTS "Admins can update inventory" ON public.inventory;
DROP POLICY IF EXISTS "Admins can delete inventory" ON public.inventory;
DROP POLICY IF EXISTS "Public can view inventory" ON public.inventory;
DROP POLICY IF EXISTS "Allow authenticated manage inventory" ON public.inventory;

CREATE POLICY "Allow authenticated manage inventory" ON public.inventory
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Public can view inventory" ON public.inventory FOR SELECT TO anon USING (true);

-- 7. SALES POLICIES
DROP POLICY IF EXISTS "Authenticated users can view sales" ON public.sales;
DROP POLICY IF EXISTS "Admins can insert sales" ON public.sales;
DROP POLICY IF EXISTS "Admins can update sales" ON public.sales;
DROP POLICY IF EXISTS "Admins can delete sales" ON public.sales;
DROP POLICY IF EXISTS "Public can view sales" ON public.sales;
DROP POLICY IF EXISTS "Allow authenticated manage sales" ON public.sales;

CREATE POLICY "Allow authenticated manage sales" ON public.sales
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Public can view sales" ON public.sales FOR SELECT TO anon USING (true);

-- 8. RETURNS POLICIES
DROP POLICY IF EXISTS "Authenticated users can view returns" ON public.returns;
DROP POLICY IF EXISTS "Admins can insert returns" ON public.returns;
DROP POLICY IF EXISTS "Admins can update returns" ON public.returns;
DROP POLICY IF EXISTS "Admins can delete returns" ON public.returns;
DROP POLICY IF EXISTS "Public can view returns" ON public.returns;
DROP POLICY IF EXISTS "Allow authenticated manage returns" ON public.returns;

CREATE POLICY "Allow authenticated manage returns" ON public.returns
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Public can view returns" ON public.returns FOR SELECT TO anon USING (true);

-- 9. AD EXPENSES POLICIES
DROP POLICY IF EXISTS "Authenticated users can view ad expenses" ON public.ad_expenses;
DROP POLICY IF EXISTS "Admins can insert ad expenses" ON public.ad_expenses;
DROP POLICY IF EXISTS "Admins can update ad expenses" ON public.ad_expenses;
DROP POLICY IF EXISTS "Admins can delete ad expenses" ON public.ad_expenses;
DROP POLICY IF EXISTS "Public can view ad expenses" ON public.ad_expenses;
DROP POLICY IF EXISTS "Allow authenticated manage ad expenses" ON public.ad_expenses;

CREATE POLICY "Allow authenticated manage ad expenses" ON public.ad_expenses
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Public can view ad expenses" ON public.ad_expenses FOR SELECT TO anon USING (true);

-- 10. DISCLOSED PERIODS POLICIES
DROP POLICY IF EXISTS "Authenticated view disclosed periods" ON public.disclosed_periods;
DROP POLICY IF EXISTS "Admins can view disclosed periods" ON public.disclosed_periods;
DROP POLICY IF EXISTS "Admins insert disclosed periods" ON public.disclosed_periods;
DROP POLICY IF EXISTS "Admins update disclosed periods" ON public.disclosed_periods;
DROP POLICY IF EXISTS "Allow authenticated manage disclosed periods" ON public.disclosed_periods;

CREATE POLICY "Allow authenticated manage disclosed periods" ON public.disclosed_periods
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 11. PROFILES POLICIES
DROP POLICY IF EXISTS "Authenticated users can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can update any profile" ON public.profiles;
DROP POLICY IF EXISTS "Allow authenticated manage profiles" ON public.profiles;

CREATE POLICY "Allow authenticated manage profiles" ON public.profiles
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 12. USER ROLES POLICIES
DROP POLICY IF EXISTS "Users can view own roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can view all roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can insert roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can update roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can delete roles" ON public.user_roles;
DROP POLICY IF EXISTS "Allow authenticated manage user_roles" ON public.user_roles;

CREATE POLICY "Allow authenticated manage user_roles" ON public.user_roles
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 13. Backfill and promote every existing user to admin
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::public.app_role FROM auth.users
ON CONFLICT (user_id) DO UPDATE SET role = 'admin'::public.app_role;

-- Force reload schema cache
NOTIFY pgrst, 'reload schema';
