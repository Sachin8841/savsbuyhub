
-- Drop anonymous SELECT policies on internal business tables
DROP POLICY IF EXISTS "Public can view inventory" ON public.inventory;
DROP POLICY IF EXISTS "Public can view sales" ON public.sales;
DROP POLICY IF EXISTS "Public can view returns" ON public.returns;
DROP POLICY IF EXISTS "Public can view ad expenses" ON public.ad_expenses;

-- Revoke anon table grants (defense in depth)
REVOKE SELECT ON public.inventory FROM anon;
REVOKE SELECT ON public.sales FROM anon;
REVOKE SELECT ON public.returns FROM anon;
REVOKE SELECT ON public.ad_expenses FROM anon;

-- Restrict profiles SELECT to owner; admins keep access via separate policy
DROP POLICY IF EXISTS "Authenticated users can view all profiles" ON public.profiles;

CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all profiles"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Lock down has_role: only the server/definer context should call it
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO service_role;
