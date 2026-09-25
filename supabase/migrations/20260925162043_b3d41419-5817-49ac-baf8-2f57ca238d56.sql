DROP POLICY IF EXISTS "Authenticated view disclosed periods" ON public.disclosed_periods;
DROP POLICY IF EXISTS "Authenticated users can view disclosed periods" ON public.disclosed_periods;
DROP POLICY IF EXISTS "Anyone can view disclosed periods" ON public.disclosed_periods;
DROP POLICY IF EXISTS "Admins can view disclosed periods" ON public.disclosed_periods;

CREATE POLICY "Admins can view disclosed periods"
ON public.disclosed_periods
FOR SELECT
TO authenticated
USING (public.current_user_has_role('admin'::public.app_role));