import { useEffect, useRef } from 'react';
import { useInventory, useSales, useCurrentStocks } from '@/hooks/useData';
import { useAuthStore } from '@/stores/authStore';
import { useToast } from '@/hooks/use-toast';
import { Package, Clock } from 'lucide-react';

export function AlertNotifications() {
  const { data: inventory = [] } = useInventory();
  const { data: sales = [] } = useSales();
  const { isAdmin } = useAuthStore();
  const { toast } = useToast();
  const shownRef = useRef(false);
  const currentStocks = useCurrentStocks();

  useEffect(() => {
    if (!isAdmin() || shownRef.current || Object.keys(currentStocks).length === 0) return;
    shownRef.current = true;

    // Low stock alerts
    const lowStockItems = inventory.filter(item => {
      const stock = currentStocks[item.id];
      return stock !== undefined && stock <= 2 && stock >= 0;
    });

    if (lowStockItems.length > 0) {
      const names = lowStockItems.map(i => `${i.product_name} (${currentStocks[i.id]} left)`).join(', ');
      toast({
        title: `⚠️ Low Stock Alert (${lowStockItems.length})`,
        description: names,
        variant: 'destructive',
      });
    }

    // Pending payments
    const pendingCount = sales.filter(s => s.payment_status === 'Pending').length;
    const pendingAmount = sales.filter(s => s.payment_status === 'Pending').reduce((sum, s) => sum + s.quantity_sold * s.average_selling_price, 0);
    if (pendingCount > 0) {
      toast({
        title: `🕐 ${pendingCount} Pending Payments`,
        description: `₹${pendingAmount.toLocaleString('en-IN')} awaiting settlement`,
      });
    }
  }, [currentStocks, inventory, sales]);

  return null;
}
