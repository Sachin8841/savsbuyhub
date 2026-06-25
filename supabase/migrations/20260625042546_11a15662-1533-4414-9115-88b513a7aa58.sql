ALTER TABLE public.returns
  ADD COLUMN IF NOT EXISTS platform text,
  ADD COLUMN IF NOT EXISTS order_number text,
  ADD COLUMN IF NOT EXISTS sub_order_number text,
  ADD COLUMN IF NOT EXISTS courier_partner text,
  ADD COLUMN IF NOT EXISTS raw_status text,
  ADD COLUMN IF NOT EXISTS sku_snapshot text,
  ADD COLUMN IF NOT EXISTS product_name_snapshot text,
  ADD COLUMN IF NOT EXISTS source_report text,
  ADD COLUMN IF NOT EXISTS report_row jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_returns_order_number ON public.returns(order_number);
CREATE INDEX IF NOT EXISTS idx_returns_sub_order_number ON public.returns(sub_order_number);
CREATE INDEX IF NOT EXISTS idx_returns_inventory_status ON public.returns(inventory_id, delivery_status);
CREATE INDEX IF NOT EXISTS idx_returns_sales_id ON public.returns(sales_id);
CREATE INDEX IF NOT EXISTS idx_sales_order_number ON public.sales(order_number);
CREATE INDEX IF NOT EXISTS idx_sales_status_date ON public.sales(payment_status, dispatch_date);
CREATE INDEX IF NOT EXISTS idx_inventory_sku_lower ON public.inventory(lower(sku));
CREATE INDEX IF NOT EXISTS idx_cash_movements_created_at ON public.cash_movements(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ad_expenses_date ON public.ad_expenses(expense_date DESC);