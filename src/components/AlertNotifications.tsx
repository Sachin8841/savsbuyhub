import { useEffect, useState } from 'react';
import { useInventory, useSales } from '@/hooks/useData';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/stores/authStore';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Package, Clock, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface AlertItem {
  id: string;
  type: 'warning' | 'info' | 'danger';
  title: string;
  description: string;
  icon: any;
}

export function AlertNotifications() {
  const { data: inventory = [] } = useInventory();
  const { data: sales = [] } = useSales();
  const { isAdmin } = useAuthStore();
  const [currentStocks, setCurrentStocks] = useState<Record<string, number>>({});
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  useEffect(() => {
    inventory.forEach(async (item) => {
      const { data } = await supabase.rpc('get_current_stock', { inv_id: item.id });
      if (data !== null) setCurrentStocks(prev => ({ ...prev, [item.id]: data as number }));
    });
  }, [inventory]);

  if (!isAdmin()) return null;

  const alerts: AlertItem[] = [];

  // Low stock alerts
  inventory.forEach(item => {
    const stock = currentStocks[item.id];
    if (stock !== undefined && stock <= 2 && stock >= 0) {
      alerts.push({
        id: `low-${item.id}`,
        type: stock === 0 ? 'danger' : 'warning',
        title: stock === 0 ? 'Out of Stock' : 'Low Stock',
        description: `${item.product_name} (${item.sku}) — ${stock} units remaining`,
        icon: Package,
      });
    }
  });

  // Pending payments
  const pendingCount = sales.filter(s => s.payment_status === 'Pending').length;
  const pendingAmount = sales.filter(s => s.payment_status === 'Pending').reduce((sum, s) => sum + s.quantity_sold * s.average_selling_price, 0);
  if (pendingCount > 0) {
    alerts.push({
      id: 'pending-payments',
      type: 'info',
      title: 'Pending Payments',
      description: `${pendingCount} orders with ₹${pendingAmount.toLocaleString('en-IN')} pending settlement`,
      icon: Clock,
    });
  }

  const visibleAlerts = alerts.filter(a => !dismissed.has(a.id));
  if (visibleAlerts.length === 0) return null;

  return (
    <div className="space-y-2 mb-4">
      {visibleAlerts.slice(0, 5).map(alert => (
        <Alert key={alert.id} variant={alert.type === 'danger' ? 'destructive' : 'default'} className="relative pr-10">
          <alert.icon className="h-4 w-4" />
          <AlertTitle className="text-sm">{alert.title}</AlertTitle>
          <AlertDescription className="text-xs">{alert.description}</AlertDescription>
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-2 right-2 h-6 w-6"
            onClick={() => setDismissed(prev => new Set(prev).add(alert.id))}
          >
            <X className="h-3 w-3" />
          </Button>
        </Alert>
      ))}
    </div>
  );
}
