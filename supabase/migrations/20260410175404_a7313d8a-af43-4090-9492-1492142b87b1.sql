
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL DEFAULT 'user',
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE POLICY "Users can view own roles" ON public.user_roles
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all roles" ON public.user_roles
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert roles" ON public.user_roles
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update roles" ON public.user_roles
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete roles" ON public.user_roles
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.handle_new_user_role()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user');
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created_role
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_role();

CREATE TABLE public.inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku TEXT UNIQUE NOT NULL,
  product_name TEXT NOT NULL,
  average_cost_price DECIMAL(10,2) NOT NULL DEFAULT 0,
  total_bulk_stock_in INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view inventory" ON public.inventory
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can insert inventory" ON public.inventory
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update inventory" ON public.inventory
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete inventory" ON public.inventory
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TYPE public.platform_type AS ENUM ('Meesho', 'Flipkart', 'Amazon', 'Offline');
CREATE TYPE public.payment_status_type AS ENUM ('Pending', 'Settled');

CREATE TABLE public.sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dispatch_date DATE NOT NULL,
  platform public.platform_type NOT NULL,
  inventory_id UUID NOT NULL REFERENCES public.inventory(id) ON DELETE RESTRICT,
  quantity_sold INTEGER NOT NULL CHECK (quantity_sold > 0),
  average_selling_price DECIMAL(10,2) NOT NULL,
  courier_partner TEXT NOT NULL,
  payment_status public.payment_status_type NOT NULL DEFAULT 'Pending',
  settlement_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view sales" ON public.sales
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can insert sales" ON public.sales
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update sales" ON public.sales
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete sales" ON public.sales
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TYPE public.return_type AS ENUM ('Customer Return', 'RTO');

CREATE TABLE public.returns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_id UUID NOT NULL UNIQUE REFERENCES public.sales(id) ON DELETE RESTRICT,
  return_type public.return_type NOT NULL,
  quantity_returned INTEGER NOT NULL CHECK (quantity_returned > 0),
  is_restockable BOOLEAN NOT NULL DEFAULT false,
  penalty_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.returns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view returns" ON public.returns
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can insert returns" ON public.returns
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update returns" ON public.returns
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete returns" ON public.returns
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_inventory_updated_at
  BEFORE UPDATE ON public.inventory
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.get_current_stock(inv_id UUID)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    i.total_bulk_stock_in
    - COALESCE((SELECT SUM(s.quantity_sold) FROM public.sales s WHERE s.inventory_id = inv_id), 0)::INTEGER
    + COALESCE((SELECT SUM(r.quantity_returned) FROM public.returns r JOIN public.sales s ON r.sales_id = s.id WHERE s.inventory_id = inv_id AND r.is_restockable = true), 0)::INTEGER
  FROM public.inventory i
  WHERE i.id = inv_id
$$;
