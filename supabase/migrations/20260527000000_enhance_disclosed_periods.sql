ALTER TABLE public.disclosed_periods ADD COLUMN IF NOT EXISTS notes text DEFAULT '';
ALTER TABLE public.disclosed_periods ADD COLUMN IF NOT EXISTS dividend_declared decimal(5,2) DEFAULT 0;

DROP POLICY IF EXISTS "Admins can view disclosed periods" ON public.disclosed_periods;
DROP POLICY IF EXISTS "Authenticated users can view disclosed periods" ON public.disclosed_periods;
CREATE POLICY "Authenticated users can view disclosed periods" ON public.disclosed_periods
    FOR SELECT TO authenticated USING (true);

