-- Create table for archived financial periods
CREATE TABLE IF NOT EXISTS public.disclosed_periods (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    period_name text NOT NULL,
    sales_data jsonb NOT NULL DEFAULT '[]'::jsonb,
    returns_data jsonb NOT NULL DEFAULT '[]'::jsonb,
    ad_expenses_data jsonb NOT NULL DEFAULT '[]'::jsonb,
    inventory_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.disclosed_periods ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view disclosed periods" ON public.disclosed_periods;
CREATE POLICY "Admins can view disclosed periods" ON public.disclosed_periods
    FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can insert disclosed periods" ON public.disclosed_periods;
CREATE POLICY "Admins can insert disclosed periods" ON public.disclosed_periods
    FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin'));
