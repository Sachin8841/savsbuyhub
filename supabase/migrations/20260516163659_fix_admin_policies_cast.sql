-- Add explicit casting to app_role and restrict to authenticated users

DROP POLICY IF EXISTS "Admins can view disclosed periods" ON public.disclosed_periods;
CREATE POLICY "Admins can view disclosed periods" ON public.disclosed_periods
    FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Admins can insert disclosed periods" ON public.disclosed_periods;
CREATE POLICY "Admins can insert disclosed periods" ON public.disclosed_periods
    FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Admins can view all sips" ON public.sips;
CREATE POLICY "Admins can view all sips" ON public.sips
    FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Admins can view all investments" ON public.investments;
CREATE POLICY "Admins can view all investments" ON public.investments
    FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Admins can update investments" ON public.investments;
CREATE POLICY "Admins can update investments" ON public.investments
    FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));
