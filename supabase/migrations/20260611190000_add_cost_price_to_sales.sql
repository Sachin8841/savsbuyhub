-- Migration: Add cost_price to sales table and update P&L RPCs
-- Description: Isolates transaction-level cost price so future inventory adjustments do not alter past profit logs.

-- 1. ADD COLUMN
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS cost_price decimal(10,2);

-- 2. BACKFILL HISTORICAL DATA
UPDATE public.sales s
SET cost_price = i.average_cost_price
FROM public.inventory i
WHERE s.inventory_id = i.id AND s.cost_price IS NULL;

-- 3. SET DEFAULT FOR NEW SALES
ALTER TABLE public.sales ALTER COLUMN cost_price SET DEFAULT 0;

-- 4. RECREATE DISCLOSED PERIOD PROFIT CALCULATOR WITH DYNAMIC COST PRICE
CREATE OR REPLACE FUNCTION public.calculate_disclosed_period_profit(dp_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  dp record;
  revenue numeric := 0;
  cogs numeric := 0;
  delivery_fees numeric := 0;
  penalties numeric := 0;
  expenses numeric := 0;
  returned_revenue numeric := 0;
  returned_cogs numeric := 0;
  s jsonb;
  r jsonb;
  e jsonb;
  inv_item jsonb;
  sale_item jsonb;
  inv_id text;
BEGIN
  SELECT * INTO dp FROM public.disclosed_periods WHERE id = dp_id;
  IF dp IS NULL THEN
    RETURN 0;
  END IF;

  -- Parse sales_data
  IF dp.sales_data IS NOT NULL AND jsonb_typeof(dp.sales_data) = 'array' THEN
    FOR s IN SELECT * FROM jsonb_array_elements(dp.sales_data) LOOP
      IF COALESCE(s->>'payment_status', '') != 'Cancelled' THEN
        revenue := revenue + (COALESCE(s->>'quantity_sold', '0'))::numeric * (COALESCE(s->>'average_selling_price', '0'))::numeric;
        
        -- Match inventory to compute COGS and delivery fees
        IF dp.inventory_snapshot IS NOT NULL AND jsonb_typeof(dp.inventory_snapshot) = 'array' THEN
          FOR inv_item IN SELECT * FROM jsonb_array_elements(dp.inventory_snapshot) LOOP
            IF inv_item->>'id' = s->>'inventory_id' THEN
              cogs := cogs + (COALESCE(s->>'quantity_sold', '0'))::numeric * (COALESCE(s->>'cost_price', inv_item->>'average_cost_price', '0'))::numeric;
              delivery_fees := delivery_fees + (COALESCE(s->>'quantity_sold', '0'))::numeric * (COALESCE(inv_item->>'delivery_fee', '0')::numeric / GREATEST((COALESCE(inv_item->>'total_bulk_stock_in', '1'))::numeric, 1));
            END IF;
          END LOOP;
        END IF;
      END IF;
    END LOOP;
  END IF;

  -- Parse returns_data to get penalties, returned revenue, and returned COGS
  IF dp.returns_data IS NOT NULL AND jsonb_typeof(dp.returns_data) = 'array' THEN
    FOR r IN SELECT * FROM jsonb_array_elements(dp.returns_data) LOOP
      penalties := penalties + (COALESCE(r->>'penalty_amount', '0'))::numeric;
      
      -- Find corresponding sale in sales_data to get selling price
      sale_item := NULL;
      IF dp.sales_data IS NOT NULL AND jsonb_typeof(dp.sales_data) = 'array' THEN
        FOR s IN SELECT * FROM jsonb_array_elements(dp.sales_data) LOOP
          IF s->>'id' = r->>'sales_id' THEN
            sale_item := s;
            EXIT;
          END IF;
        END LOOP;
      END IF;

      IF sale_item IS NOT NULL THEN
        returned_revenue := returned_revenue + (COALESCE(r->>'quantity_returned', '0'))::numeric * (COALESCE(sale_item->>'average_selling_price', '0'))::numeric;
        
        -- Find average cost price
        inv_id := COALESCE(r->>'inventory_id', sale_item->>'inventory_id');
        IF dp.inventory_snapshot IS NOT NULL AND jsonb_typeof(dp.inventory_snapshot) = 'array' THEN
          FOR inv_item IN SELECT * FROM jsonb_array_elements(dp.inventory_snapshot) LOOP
            IF inv_item->>'id' = inv_id THEN
              returned_cogs := returned_cogs + (COALESCE(r->>'quantity_returned', '0'))::numeric * (COALESCE(sale_item->>'cost_price', inv_item->>'average_cost_price', '0'))::numeric;
              EXIT;
            END IF;
          END LOOP;
        END IF;
      END IF;
    END LOOP;
  END IF;

  -- Parse ad_expenses_data
  IF dp.ad_expenses_data IS NOT NULL AND jsonb_typeof(dp.ad_expenses_data) = 'array' THEN
    FOR e IN SELECT * FROM jsonb_array_elements(dp.ad_expenses_data) LOOP
      expenses := expenses + (COALESCE(e->>'amount', '0'))::numeric;
    END LOOP;
  END IF;

  RETURN (revenue - returned_revenue) - (cogs - returned_cogs) - delivery_fees - penalties - expenses;
END;
$$;

-- 5. RECREATE SHARE PRICE SQL CALCULATOR WITH TRANSACTION COST PRICE
CREATE OR REPLACE FUNCTION public.calculate_share_price_as_of(as_of_date date)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  base_val numeric := 100;
  total_shares numeric := 100000;
  stock_holding_value numeric := 0;
  active_profit numeric := 0;
  historical_profit numeric := 0;
  total_retained_earnings numeric := 0;
  discounted_book_value numeric := 0;
  earnings_per_share numeric := 0;
  time_decay_multiplier numeric := 1.0;
  raw_price numeric := 0;
  final_price numeric := 0;
  last_sale_date date;
  days_since_last_sale numeric := 0;
  penalty numeric := 0;
  sales_count integer;
  inv_count integer;
  
  -- variables for returns calculations
  active_revenue numeric := 0;
  active_cogs numeric := 0;
  active_delivery_fees numeric := 0;
  active_returned_revenue numeric := 0;
  active_returned_cogs numeric := 0;
  active_penalties numeric := 0;
  active_ad_expenses numeric := 0;
BEGIN
  -- 1. Stock Holding Value as of date
  SELECT COALESCE(SUM(GREATEST(0, 
    i.total_bulk_stock_in 
    - COALESCE((SELECT SUM(s.quantity_sold) FROM public.sales s WHERE s.inventory_id = i.id AND s.dispatch_date <= as_of_date AND s.payment_status::text != 'Cancelled'), 0)
    + COALESCE((SELECT SUM(r.quantity_returned) FROM public.returns r JOIN public.sales s ON r.sales_id = s.id WHERE s.inventory_id = i.id AND r.return_date <= as_of_date AND r.delivery_status::text = 'Received'), 0)
  ) * i.average_cost_price), 0)
  INTO stock_holding_value
  FROM public.inventory i;

  -- 2. Active Ledger Profit as of date
  -- Active Revenue
  SELECT COALESCE(SUM(s.quantity_sold * s.average_selling_price), 0) INTO active_revenue
  FROM public.sales s WHERE s.payment_status::text != 'Cancelled' AND s.dispatch_date <= as_of_date;

  -- Active COGS (using sales.cost_price first) & Outbound Delivery Fees
  SELECT 
    COALESCE(SUM(s.quantity_sold * COALESCE(s.cost_price, i.average_cost_price)), 0),
    COALESCE(SUM(s.quantity_sold * (COALESCE(i.delivery_fee, 0) / GREATEST(COALESCE(i.total_bulk_stock_in, 1), 1))), 0)
  INTO active_cogs, active_delivery_fees
  FROM public.sales s
  JOIN public.inventory i ON s.inventory_id = i.id
  WHERE s.payment_status::text != 'Cancelled' AND s.dispatch_date <= as_of_date;

  -- Active Returned Revenue & Returned COGS
  SELECT 
    COALESCE(SUM(r.quantity_returned * s.average_selling_price), 0),
    COALESCE(SUM(r.quantity_returned * COALESCE(s.cost_price, i.average_cost_price)), 0)
  INTO active_returned_revenue, active_returned_cogs
  FROM public.returns r
  JOIN public.sales s ON r.sales_id = s.id
  JOIN public.inventory i ON s.inventory_id = i.id
  WHERE r.return_date <= as_of_date;

  -- Active Return Penalties
  SELECT COALESCE(SUM(r.penalty_amount), 0) INTO active_penalties
  FROM public.returns r WHERE r.return_date <= as_of_date;

  -- Active Ad Expenses
  SELECT COALESCE(SUM(e.amount), 0) INTO active_ad_expenses
  FROM public.ad_expenses e WHERE e.expense_date <= as_of_date;

  active_profit := (active_revenue - active_returned_revenue) 
                   - (active_cogs - active_returned_cogs) 
                   - active_delivery_fees 
                   - active_penalties 
                   - active_ad_expenses;

  -- 3. Historical Retained Earnings
  SELECT COALESCE(SUM(public.calculate_disclosed_period_profit(id)), 0)
  INTO historical_profit
  FROM public.disclosed_periods
  WHERE created_at::date <= as_of_date;

  total_retained_earnings := active_profit + historical_profit;

  -- 4. Formula
  discounted_book_value := (stock_holding_value * 0.5) / total_shares;
  earnings_per_share := (total_retained_earnings * 5) / total_shares;

  -- 5. Time Decay
  SELECT COUNT(*), MAX(dispatch_date) INTO sales_count, last_sale_date
  FROM public.sales
  WHERE payment_status::text != 'Cancelled' AND dispatch_date <= as_of_date;

  SELECT COUNT(*) INTO inv_count FROM public.inventory WHERE stock_added_date <= as_of_date;

  IF sales_count > 0 THEN
    days_since_last_sale := EXTRACT(DAY FROM (as_of_date::timestamp - last_sale_date::timestamp));
    IF days_since_last_sale > 5 THEN
      penalty := LEAST(0.5, (days_since_last_sale - 5) * 0.01);
      time_decay_multiplier := 1.0 - penalty;
    END IF;
  ELSIF inv_count > 0 THEN
    time_decay_multiplier := 0.5;
  END IF;

  raw_price := base_val + discounted_book_value + earnings_per_share;
  final_price := raw_price * time_decay_multiplier;

  RETURN ROUND(GREATEST(10.0, final_price), 2);
END;
$$;

-- 6. RECREATE PROJECT FORECAST CALCULATOR WITH TRANSACTION COST PRICE
CREATE OR REPLACE FUNCTION public.get_public_forecast_data()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  res jsonb;
  dp record;
  dp_revenue numeric;
  dp_returned_revenue numeric;
  dp_cogs numeric;
  dp_returned_cogs numeric;
  dp_delivery_fees numeric;
  dp_penalties numeric;
  dp_expenses numeric;
  dp_units integer;
  dp_returned_units integer;
  dp_orders integer;
  s jsonb;
  r jsonb;
  e jsonb;
  inv_item jsonb;
  sale_item jsonb;
  inv_id text;
BEGIN
  -- Create a temporary table to store the results
  CREATE TEMP TABLE IF NOT EXISTS temp_forecast (
    label text,
    revenue numeric,
    investment numeric,
    profit numeric,
    units integer,
    orders integer
  ) ON COMMIT DROP;
  
  DELETE FROM temp_forecast;
  
  -- 1. Gather historical data from disclosed_periods
  FOR dp IN SELECT * FROM public.disclosed_periods ORDER BY created_at ASC LOOP
    dp_revenue := 0;
    dp_returned_revenue := 0;
    dp_cogs := 0;
    dp_returned_cogs := 0;
    dp_delivery_fees := 0;
    dp_penalties := 0;
    dp_expenses := 0;
    dp_units := 0;
    dp_returned_units := 0;
    dp_orders := 0;

    -- Parse sales
    IF dp.sales_data IS NOT NULL AND jsonb_typeof(dp.sales_data) = 'array' THEN
      FOR s IN SELECT * FROM jsonb_array_elements(dp.sales_data) LOOP
        IF COALESCE(s->>'payment_status', '') != 'Cancelled' THEN
          dp_revenue := dp_revenue + (COALESCE(s->>'quantity_sold', '0'))::numeric * (COALESCE(s->>'average_selling_price', '0'))::numeric;
          dp_units := dp_units + (COALESCE(s->>'quantity_sold', '0'))::integer;
          dp_orders := dp_orders + 1;
          
          IF dp.inventory_snapshot IS NOT NULL AND jsonb_typeof(dp.inventory_snapshot) = 'array' THEN
            FOR inv_item IN SELECT * FROM jsonb_array_elements(dp.inventory_snapshot) LOOP
              IF inv_item->>'id' = s->>'inventory_id' THEN
                dp_cogs := dp_cogs + (COALESCE(s->>'quantity_sold', '0'))::numeric * (COALESCE(s->>'cost_price', inv_item->>'average_cost_price', '0'))::numeric;
                dp_delivery_fees := dp_delivery_fees + (COALESCE(s->>'quantity_sold', '0'))::numeric * (COALESCE(inv_item->>'delivery_fee', '0')::numeric / GREATEST((COALESCE(inv_item->>'total_bulk_stock_in', '1'))::numeric, 1));
              END IF;
            END LOOP;
          END IF;
        END IF;
      END LOOP;
    END IF;

    -- Parse returns
    IF dp.returns_data IS NOT NULL AND jsonb_typeof(dp.returns_data) = 'array' THEN
      FOR r IN SELECT * FROM jsonb_array_elements(dp.returns_data) LOOP
        dp_penalties := dp_penalties + (COALESCE(r->>'penalty_amount', '0'))::numeric;
        dp_returned_units := dp_returned_units + (COALESCE(r->>'quantity_returned', '0'))::integer;
        
        sale_item := NULL;
        IF dp.sales_data IS NOT NULL AND jsonb_typeof(dp.sales_data) = 'array' THEN
          FOR s IN SELECT * FROM jsonb_array_elements(dp.sales_data) LOOP
            IF s->>'id' = r->>'sales_id' THEN
              sale_item := s;
              EXIT;
            END IF;
          END LOOP;
        END IF;

        IF sale_item IS NOT NULL THEN
          dp_returned_revenue := dp_returned_revenue + (COALESCE(r->>'quantity_returned', '0'))::numeric * (COALESCE(sale_item->>'average_selling_price', '0'))::numeric;
          inv_id := COALESCE(r->>'inventory_id', sale_item->>'inventory_id');
          IF dp.inventory_snapshot IS NOT NULL AND jsonb_typeof(dp.inventory_snapshot) = 'array' THEN
            FOR inv_item IN SELECT * FROM jsonb_array_elements(dp.inventory_snapshot) LOOP
              IF inv_item->>'id' = inv_id THEN
                dp_returned_cogs := dp_returned_cogs + (COALESCE(r->>'quantity_returned', '0'))::numeric * (COALESCE(sale_item->>'cost_price', inv_item->>'average_cost_price', '0'))::numeric;
                EXIT;
              END IF;
            END LOOP;
          END IF;
        END IF;
      END LOOP;
    END IF;

    -- Parse ad expenses
    IF dp.ad_expenses_data IS NOT NULL AND jsonb_typeof(dp.ad_expenses_data) = 'array' THEN
      FOR e IN SELECT * FROM jsonb_array_elements(dp.ad_expenses_data) LOOP
        dp_expenses := dp_expenses + (COALESCE(e->>'amount', '0'))::numeric;
      END LOOP;
    END IF;

    -- Insert disclosed period totals into temp table
    INSERT INTO temp_forecast (label, revenue, investment, profit, units, orders)
    VALUES (
      dp.period_name,
      dp_revenue - dp_returned_revenue,
      dp_cogs - dp_returned_cogs + dp_delivery_fees + dp_penalties + dp_expenses,
      (dp_revenue - dp_returned_revenue) - (dp_cogs - dp_returned_cogs + dp_delivery_fees + dp_penalties + dp_expenses),
      dp_units - dp_returned_units,
      dp_orders
    );
  END LOOP;

  -- 2. Gather active ledger data grouped by month (using sales.cost_price)
  INSERT INTO temp_forecast (label, revenue, investment, profit, units, orders)
  SELECT 
    m.month as label,
    COALESCE(s.sales_revenue, 0) - COALESCE(r.returned_revenue, 0) as revenue,
    COALESCE(s.sales_cogs, 0) - COALESCE(r.returned_cogs, 0) + COALESCE(s.sales_delivery_fees, 0) + COALESCE(r.return_penalties, 0) + COALESCE(a.ad_expenses, 0) as investment,
    (COALESCE(s.sales_revenue, 0) - COALESCE(r.returned_revenue, 0)) - (COALESCE(s.sales_cogs, 0) - COALESCE(r.returned_cogs, 0) + COALESCE(s.sales_delivery_fees, 0) + COALESCE(r.return_penalties, 0) + COALESCE(a.ad_expenses, 0)) as profit,
    COALESCE(s.sales_units, 0) - COALESCE(r.returned_units, 0) as units,
    COALESCE(s.sales_orders, 0) as orders
  FROM (
    SELECT DISTINCT TO_CHAR(dispatch_date, 'YYYY-MM') as month FROM public.sales WHERE payment_status::text != 'Cancelled'
    UNION
    SELECT DISTINCT TO_CHAR(return_date, 'YYYY-MM') as month FROM public.returns
    UNION
    SELECT DISTINCT TO_CHAR(expense_date, 'YYYY-MM') as month FROM public.ad_expenses
  ) m
  LEFT JOIN (
    SELECT 
      TO_CHAR(sl.dispatch_date, 'YYYY-MM') as month,
      SUM(sl.quantity_sold * sl.average_selling_price) as sales_revenue,
      SUM(sl.quantity_sold * COALESCE(sl.cost_price, inv.average_cost_price)) as sales_cogs,
      SUM(sl.quantity_sold * (COALESCE(inv.delivery_fee, 0) / GREATEST(COALESCE(inv.total_bulk_stock_in, 1), 1))) as sales_delivery_fees,
      SUM(sl.quantity_sold) as sales_units,
      COUNT(sl.id)::integer as sales_orders
    FROM public.sales sl
    JOIN public.inventory inv ON sl.inventory_id = inv.id
    WHERE sl.payment_status::text != 'Cancelled'
    GROUP BY TO_CHAR(sl.dispatch_date, 'YYYY-MM')
  ) s ON m.month = s.month
  LEFT JOIN (
    SELECT 
      TO_CHAR(rt.return_date, 'YYYY-MM') as month,
      SUM(rt.quantity_returned * sl.average_selling_price) as returned_revenue,
      SUM(rt.quantity_returned * COALESCE(sl.cost_price, inv.average_cost_price)) as returned_cogs,
      SUM(rt.penalty_amount) as return_penalties,
      SUM(rt.quantity_returned) as returned_units
    FROM public.returns rt
    JOIN public.sales sl ON rt.sales_id = sl.id
    JOIN public.inventory inv ON sl.inventory_id = inv.id
    GROUP BY TO_CHAR(rt.return_date, 'YYYY-MM')
  ) r ON m.month = r.month
  LEFT JOIN (
    SELECT 
      TO_CHAR(ad.expense_date, 'YYYY-MM') as month,
      SUM(ad.amount) as ad_expenses
    FROM public.ad_expenses ad
    GROUP BY TO_CHAR(ad.expense_date, 'YYYY-MM')
  ) a ON m.month = a.month;

  -- 3. Return aggregated json
  SELECT COALESCE(jsonb_agg(t), '[]'::jsonb) INTO res
  FROM (
    SELECT 
      label,
      SUM(revenue) as revenue,
      SUM(investment) as investment,
      SUM(profit) as profit,
      SUM(units)::integer as units,
      SUM(orders)::integer as orders,
      COALESCE(ROUND(SUM(profit) / NULLIF(SUM(units), 0), 0), 0) as profit_per_unit
    FROM temp_forecast
    GROUP BY label
    ORDER BY label ASC
  ) t;

  RETURN res;
END;
$$;

-- 7. NOTIFY PGRST SCHEMA CACHE RELOAD
NOTIFY pgrst, 'reload schema';
