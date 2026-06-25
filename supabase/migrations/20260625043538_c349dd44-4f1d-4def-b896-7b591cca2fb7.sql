CREATE INDEX IF NOT EXISTS idx_sales_dispatch_date_desc ON public.sales(dispatch_date DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_created_at_desc ON public.inventory(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_returns_created_at_desc ON public.returns(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cash_movements_created_at_desc ON public.cash_movements(created_at DESC);