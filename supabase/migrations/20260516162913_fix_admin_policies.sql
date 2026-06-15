-- Replace policies that used string literal 'admin' with the proper public.has_role() function to avoid enum casting errors

-- 1. Disclosed Periods
DROP POLICY IF EXISTS "Admins can view disclosed periods" ON public.disclosed_periods;
CREATE POLICY "Admins can view disclosed periods" ON public.disclosed_periods
    FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can insert disclosed periods" ON public.disclosed_periods;
CREATE POLICY "Admins can insert disclosed periods" ON public.disclosed_periods
    FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 2. SIPs
DROP POLICY IF EXISTS "Admins can view all sips" ON public.sips;
CREATE POLICY "Admins can view all sips" ON public.sips
    FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- 3. Investments
DROP POLICY IF EXISTS "Admins can view all investments" ON public.investments;
CREATE POLICY "Admins can view all investments" ON public.investments
    FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can update investments" ON public.investments;
CREATE POLICY "Admins can update investments" ON public.investments
    FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));
