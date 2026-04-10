import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export function useInventory() {
  return useQuery({
    queryKey: ['inventory'],
    queryFn: async () => {
      const { data, error } = await supabase.from('inventory').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useSales() {
  return useQuery({
    queryKey: ['sales'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sales')
        .select('*, inventory(sku, product_name, average_cost_price)')
        .order('dispatch_date', { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useReturns() {
  return useQuery({
    queryKey: ['returns'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('returns')
        .select('*, sales(id, platform, inventory_id, quantity_sold, average_selling_price, inventory(sku, product_name))')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useCurrentStock(inventoryId: string) {
  return useQuery({
    queryKey: ['current_stock', inventoryId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_current_stock', { inv_id: inventoryId });
      if (error) throw error;
      return data as number;
    },
    enabled: !!inventoryId,
  });
}
