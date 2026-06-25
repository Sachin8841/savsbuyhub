import { useMemo } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/stores/authStore';

// Keep previous data while refetching so tables don't collapse to zero rows
// (which would otherwise reset scroll position to top after every status edit).
const KEEP = { placeholderData: keepPreviousData } as const;

export function useInventory() {
  const loading = useAuthStore((state) => state.loading);

  return useQuery({
    queryKey: ['inventory'],
    queryFn: async () => {
      const { data, error } = await supabase.from('inventory').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !loading, ...KEEP,
  });
}

export function useCapitalAccounts() {
  const loading = useAuthStore((state) => state.loading);

  return useQuery({
    queryKey: ['capital_accounts'],
    queryFn: async () => {
      const { data, error } = await supabase.from('capital_accounts').select('*').single();
      if (error) throw error;
      return data;
    },
    enabled: !loading, ...KEEP,
  });
}

export function useCashMovements() {
  const loading = useAuthStore((state) => state.loading);

  return useQuery({
    queryKey: ['cash_movements'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cash_movements')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(25);
      if (error) throw error;
      return data;
    },
    enabled: !loading, ...KEEP,
  });
}

export function useSales() {
  const loading = useAuthStore((state) => state.loading);

  return useQuery({
    queryKey: ['sales'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sales')
        .select('*, inventory(sku, product_name, average_cost_price, average_selling_price, delivery_fee)')
        .order('dispatch_date', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !loading, ...KEEP,
  });
}

export function useReturns() {
  const loading = useAuthStore((state) => state.loading);

  return useQuery({
    queryKey: ['returns'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('returns')
        .select('*, sales(id, platform, inventory_id, quantity_sold, average_selling_price, dispatch_date, inventory(sku, product_name, average_cost_price, delivery_fee))')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !loading, ...KEEP,
  });
}

export function useAdExpenses() {
  const loading = useAuthStore((state) => state.loading);

  return useQuery({
    queryKey: ['ad_expenses'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ad_expenses')
        .select('*')
        .order('expense_date', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !loading, ...KEEP,
  });
}

export function useCurrentStock(inventoryId: string) {
  const loading = useAuthStore((state) => state.loading);

  return useQuery({
    queryKey: ['current_stock', inventoryId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_current_stock', { inv_id: inventoryId });
      if (error) throw error;
      return data as number;
    },
    enabled: !loading && !!inventoryId,
  });
}

export function useCurrentStocks() {
  const { data: inventory = [] } = useInventory();
  const { data: sales = [] } = useSales();
  const { data: returns = [] } = useReturns();

  return useMemo(() => {
    const stock: Record<string, number> = {};
    for (const item of inventory as any[]) {
      stock[item.id] = Number(item.total_bulk_stock_in ?? 0);
    }
    for (const sale of sales as any[]) {
      if (!sale.inventory_id || sale.payment_status === 'Cancelled') continue;
      stock[sale.inventory_id] = (stock[sale.inventory_id] ?? 0) - Number(sale.quantity_sold ?? 0);
    }
    for (const ret of returns as any[]) {
      if (ret.delivery_status !== 'Received') continue;
      const invId = ret.inventory_id || ret.sales?.inventory_id;
      if (!invId) continue;
      stock[invId] = (stock[invId] ?? 0) + Number(ret.quantity_returned ?? 0);
    }
    return stock;
  }, [inventory, sales, returns]);
}

