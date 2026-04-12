import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/stores/authStore';

export function useInventory() {
  const loading = useAuthStore((state) => state.loading);

  return useQuery({
    queryKey: ['inventory'],
    queryFn: async () => {
      const { data, error } = await supabase.from('inventory').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !loading,
  });
}

export function useSales() {
  const loading = useAuthStore((state) => state.loading);

  return useQuery({
    queryKey: ['sales'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sales')
        .select('*, inventory(sku, product_name, average_cost_price, average_selling_price)')
        .order('dispatch_date', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !loading,
  });
}

export function useReturns() {
  const loading = useAuthStore((state) => state.loading);

  return useQuery({
    queryKey: ['returns'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('returns')
        .select('*, sales(id, platform, inventory_id, quantity_sold, average_selling_price, dispatch_date, inventory(sku, product_name))')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !loading,
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
    enabled: !loading,
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
