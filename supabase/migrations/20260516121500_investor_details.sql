-- Add PAN and Initial to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS pan_number text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS initial text;

-- Create SIPs table
CREATE TABLE IF NOT EXISTS public.sips (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid REFERENCES public.profiles(user_id) ON DELETE CASCADE NOT NULL,
    amount numeric NOT NULL,
    frequency text NOT NULL DEFAULT 'Monthly',
    autopay_enabled boolean DEFAULT false,
    start_date date NOT NULL DEFAULT CURRENT_DATE,
    next_date date NOT NULL,
    status text DEFAULT 'Active',
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- RLS for SIPs
ALTER TABLE public.sips ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own sips" ON public.sips;
CREATE POLICY "Users can view own sips" ON public.sips
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own sips" ON public.sips;
CREATE POLICY "Users can insert own sips" ON public.sips
    FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own sips" ON public.sips;
CREATE POLICY "Users can update own sips" ON public.sips
    FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can view all sips" ON public.sips;
CREATE POLICY "Admins can view all sips" ON public.sips
    FOR ALL USING (public.has_role(auth.uid(), 'admin'));
