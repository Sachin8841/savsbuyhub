-- Fix all old policies to cast 'admin' to app_role correctly

-- INVENTORY
DROP POLICY IF EXISTS "Admins can insert inventory" ON public.inventory;
CREATE POLICY "Admins can insert inventory" ON public.inventory
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Admins can update inventory" ON public.inventory;
CREATE POLICY "Admins can update inventory" ON public.inventory
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Admins can delete inventory" ON public.inventory;
CREATE POLICY "Admins can delete inventory" ON public.inventory
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- SALES
DROP POLICY IF EXISTS "Admins can insert sales" ON public.sales;
CREATE POLICY "Admins can insert sales" ON public.sales
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Admins can update sales" ON public.sales;
CREATE POLICY "Admins can update sales" ON public.sales
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Admins can delete sales" ON public.sales;
CREATE POLICY "Admins can delete sales" ON public.sales
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- RETURNS
DROP POLICY IF EXISTS "Admins can insert returns" ON public.returns;
CREATE POLICY "Admins can insert returns" ON public.returns
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Admins can update returns" ON public.returns;
CREATE POLICY "Admins can update returns" ON public.returns
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Admins can delete returns" ON public.returns;
CREATE POLICY "Admins can delete returns" ON public.returns
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- AD EXPENSES
DROP POLICY IF EXISTS "Admins can insert ad expenses" ON public.ad_expenses;
CREATE POLICY "Admins can insert ad expenses" ON public.ad_expenses
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Admins can update ad expenses" ON public.ad_expenses;
CREATE POLICY "Admins can update ad expenses" ON public.ad_expenses
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Admins can delete ad expenses" ON public.ad_expenses;
CREATE POLICY "Admins can delete ad expenses" ON public.ad_expenses
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- PROFILES
DROP POLICY IF EXISTS "Admins can update any profile" ON public.profiles;
CREATE POLICY "Admins can update any profile" ON public.profiles 
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));
