import { useState, useEffect, useMemo } from 'react';
import { useSales, useReturns, useInventory, useAdExpenses, useCapitalAccounts, useCashMovements } from '@/hooks/useData';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/stores/authStore';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DollarSign, Clock, AlertTriangle, Package, ShoppingCart, ArrowUpRight, ArrowDownRight, Megaphone, Warehouse, Download, TrendingUp, Trash2, Pencil, Percent, Truck, Banknote, Landmark, ArrowRightLeft } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Line, PieChart, Pie, Cell, Legend, ComposedChart, Area } from 'recharts';
import { exportDashboardReport } from '@/lib/xlsx-export';
import { AlertNotifications } from '@/components/AlertNotifications';
import { PeriodSelector, getFilterDate } from '@/components/DateRangePicker';

const fmt = (n: number) => '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 0 });

export default function Dashboard() {
  const { data: sales = [] } = useSales();
  const { data: returns = [] } = useReturns();
  const { data: inventory = [] } = useInventory();
  const { data: adExpenses = [] } = useAdExpenses();
  const { data: capitalAccounts } = useCapitalAccounts();
  const { data: cashMovements = [] } = useCashMovements();
  const { isAdmin } = useAuthStore();
  const admin = isAdmin();
  const qc = useQueryClient();
  const [trendPeriod, setTrendPeriod] = useState('max');
  const [trendDateRange, setTrendDateRange] = useState<{ from?: Date; to?: Date }>({});
  const [profitPeriod, setProfitPeriod] = useState('max');
  const [profitDateRange, setProfitDateRange] = useState<{ from?: Date; to?: Date }>({});
  const [unitsPeriod, setUnitsPeriod] = useState('max');
  const [unitsDateRange, setUnitsDateRange] = useState<{ from?: Date; to?: Date }>({});
  const [adDialogOpen, setAdDialogOpen] = useState(false);
  const [adForm, setAdForm] = useState({ category: 'Ads', platform: '', amount: '', expense_date: new Date().toISOString().slice(0, 10), description: '' });
  const [adEditId, setAdEditId] = useState<string | null>(null);
  const [capitalDialogOpen, setCapitalDialogOpen] = useState(false);
  const [capitalForm, setCapitalForm] = useState({ hot_cash: '', account_holding_value: '', notes: '' });
  const [movementForm, setMovementForm] = useState({ type: 'cash_to_account', amount: '', notes: '' });
  const [currentStocks, setCurrentStocks] = useState<Record<string, number>>({});

  useEffect(() => {
    inventory.forEach(async (item) => {
      const { data } = await supabase.rpc('get_current_stock', { inv_id: item.id });
      if (data !== null) setCurrentStocks(prev => ({ ...prev, [item.id]: data as number }));
    });
  }, [inventory]);

  const filterSalesByPeriod = (p: string, dr: { from?: Date; to?: Date }) => {
    const { from, to } = getFilterDate(p, dr);
    const nonCancelled = sales.filter(s => s.payment_status !== 'Cancelled');
    if (!from) return nonCancelled;
    return nonCancelled.filter(s => {
      const d = new Date(s.dispatch_date);
      return d >= from && (!to || d <= to);
    });
  };

  const filteredSales = filterSalesByPeriod(trendPeriod, trendDateRange);
  const { from: filterFrom } = getFilterDate(trendPeriod, trendDateRange);
  const filteredReturns = filterFrom ? returns.filter(r => new Date(r.return_date) >= filterFrom) : returns;
  const filteredAdExpenses = filterFrom ? adExpenses.filter(e => new Date(e.expense_date) >= filterFrom) : adExpenses;

  const returnedRevenue = filteredReturns.reduce((sum, r) => {
    const sale = sales.find(s => s.id === r.sales_id);
    return sum + r.quantity_returned * (sale?.average_selling_price ?? 0);
  }, 0);
  const returnedCogs = filteredReturns.reduce((sum, r) => {
    const sale = sales.find(s => s.id === r.sales_id);
    const invId = r.inventory_id || sale?.inventory_id;
    const inv = inventory.find(i => i.id === invId);
    const costPrice = sale?.cost_price ?? inv?.average_cost_price ?? 0;
    return sum + r.quantity_returned * costPrice;
  }, 0);
  
  const totalRevenue = filteredSales.reduce((sum, s) => sum + s.quantity_sold * s.average_selling_price, 0) - returnedRevenue;
  const totalUnits = filteredSales.reduce((sum, s) => sum + s.quantity_sold, 0);
  const totalOrders = filteredSales.length;
  const pendingPayments = filteredSales.filter(s => s.payment_status === 'Pending').reduce((sum, s) => sum + s.quantity_sold * s.average_selling_price, 0);
  const totalPenalties = filteredReturns.reduce((sum, r) => sum + r.penalty_amount, 0);
  const totalReturnedQty = filteredReturns.reduce((sum, r) => sum + r.quantity_returned, 0);
  const totalCost = filteredSales.reduce((sum, s) => {
    const inv = inventory.find(i => i.id === s.inventory_id);
    const costPrice = s.cost_price ?? inv?.average_cost_price ?? 0;
    return sum + s.quantity_sold * costPrice;
  }, 0) - returnedCogs;
  const totalAdSpend = filteredAdExpenses.reduce((sum, e) => sum + e.amount, 0);
  const totalInventoryDeliveryFees = useMemo(() => {
    const filteredInventory = filterFrom
      ? inventory.filter(i => i.stock_added_date && new Date(i.stock_added_date) >= filterFrom)
      : inventory;
    return filteredInventory.reduce((sum, i) => sum + (i.delivery_fee || 0), 0);
  }, [inventory, filterFrom]);
  const totalDeliveryFees = filteredSales.reduce((sum, s) => {
    const inv = inventory.find(i => i.id === s.inventory_id);
    const feePerUnit = inv ? (inv.delivery_fee || 0) / (inv.total_bulk_stock_in || 1) : 0;
    return sum + s.quantity_sold * feePerUnit;
  }, 0);
  const netProfit = totalRevenue - totalCost - totalPenalties - totalAdSpend - totalDeliveryFees;
  const profitMargin = totalRevenue > 0 ? ((netProfit / totalRevenue) * 100).toFixed(1) : '0';
  const returnRate = totalUnits > 0 ? ((totalReturnedQty / totalUnits) * 100).toFixed(1) : '0';
  const grossRevenue = filteredSales.reduce((sum, s) => sum + s.quantity_sold * s.average_selling_price, 0);
  const avgUnitValue = totalUnits > 0 ? grossRevenue / totalUnits : 0;
  const netUnits = totalUnits - totalReturnedQty;
  const profitPerUnit = netUnits > 0 ? netProfit / netUnits : 0;

  const stockHoldingValue = inventory.reduce((sum, item) => {
    const stock = currentStocks[item.id] ?? 0;
    return sum + stock * (item.average_cost_price || 0);
  }, 0);

  const platformData = useMemo(() => ['Meesho', 'Flipkart', 'Amazon', 'Offline'].map(p => {
    const platSales = filteredSales.filter(s => s.platform === p);
    const revenue = platSales.reduce((sum, s) => sum + s.quantity_sold * s.average_selling_price, 0);
    const cost = platSales.reduce((sum, s) => {
      const inv = inventory.find(i => i.id === s.inventory_id);
      const cp = s.cost_price ?? (inv as any)?.average_cost_price ?? 0;
      return sum + s.quantity_sold * cp;
    }, 0);
    const units = platSales.reduce((sum, s) => sum + s.quantity_sold, 0);
    return { platform: p, revenue, cost, profit: revenue - cost, orders: platSales.length, units };
  }), [filteredSales, inventory]);

  const customerReturns = filteredReturns.filter(r => r.return_type === 'Customer Return');
  const rtoReturns = filteredReturns.filter(r => r.return_type === 'RTO');
  const returnPieData = [
    { name: 'Customer Return', value: customerReturns.reduce((s, r) => s + r.quantity_returned, 0), penalty: customerReturns.reduce((s, r) => s + r.penalty_amount, 0) },
    { name: 'RTO', value: rtoReturns.reduce((s, r) => s + r.quantity_returned, 0), penalty: rtoReturns.reduce((s, r) => s + r.penalty_amount, 0) },
  ].filter(d => d.value > 0);

  const buildTrendData = (p: string, dr: { from?: Date; to?: Date }) => {
    const fSales = filterSalesByPeriod(p, dr);
    const dataMap: Record<string, { label: string; revenue: number; cost: number; investment: number; profit: number; units: number; orders: number; profitPerUnit: number }> = {};
    fSales.forEach(s => {
      let key: string;
      const date = new Date(s.dispatch_date);
      if (p === 'day') key = `${date.getHours().toString().padStart(2, '0')}:00`;
      else if (p === 'week' || p === 'month' || p === 'custom') key = s.dispatch_date;
      else key = s.dispatch_date?.slice(0, 7) ?? date.toISOString().slice(0, 7);
      if (!dataMap[key]) dataMap[key] = { label: key, revenue: 0, cost: 0, investment: 0, profit: 0, units: 0, orders: 0, profitPerUnit: 0 };
      
      const inv = inventory.find(i => i.id === s.inventory_id);
      const rev = s.quantity_sold * s.average_selling_price;
      const cp = s.cost_price ?? (inv as any)?.average_cost_price ?? 0;
      const cost = s.quantity_sold * cp;
      const deliveryFee = s.quantity_sold * (inv ? (inv.delivery_fee || 0) / (inv.total_bulk_stock_in || 1) : 0);

      
      dataMap[key].revenue += rev;
      dataMap[key].cost += cost;
      dataMap[key].investment += cost + deliveryFee;
      dataMap[key].units += s.quantity_sold;
      dataMap[key].orders += 1;
    });
    const arr = Object.values(dataMap).sort((a, b) => a.label.localeCompare(b.label));
    arr.forEach(m => {
      m.profit = m.revenue - m.investment;
      m.profitPerUnit = m.units > 0 ? Math.round(m.profit / m.units) : 0;
    });
    return arr;
  };

  const trendData = useMemo(() => buildTrendData(trendPeriod, trendDateRange), [sales, trendPeriod, trendDateRange, inventory]);
  const profitTrendData = useMemo(() => buildTrendData(profitPeriod, profitDateRange), [sales, profitPeriod, profitDateRange, inventory]);
  const unitsTrendData = useMemo(() => buildTrendData(unitsPeriod, unitsDateRange), [sales, unitsPeriod, unitsDateRange, inventory]);

  const topProducts = useMemo(() => {
    const map: Record<string, { name: string; sku: string; revenue: number; units: number; profit: number; profitPerUnit: number }> = {};
    filteredSales.forEach(s => {
      const inv = inventory.find(i => i.id === s.inventory_id);
      if (!inv) return;
      if (!map[inv.sku]) map[inv.sku] = { name: inv.product_name, sku: inv.sku, revenue: 0, units: 0, profit: 0, profitPerUnit: 0 };
      const cp = s.cost_price ?? inv.average_cost_price ?? 0;
      map[inv.sku].revenue += s.quantity_sold * s.average_selling_price;
      map[inv.sku].units += s.quantity_sold;
      map[inv.sku].profit += s.quantity_sold * (s.average_selling_price - cp);
    });
    Object.values(map).forEach(p => { p.profitPerUnit = p.units > 0 ? Math.round(p.profit / p.units) : 0; });
    return Object.values(map).sort((a, b) => b.revenue - a.revenue).slice(0, 6);
  }, [filteredSales, inventory]);

  // Courier performance table data
  const courierData = useMemo(() => {
    const map: Record<string, { courier: string; orders: number; units: number; revenue: number; penalties: number }> = {};
    filteredSales.forEach(s => {
      const key = s.courier_partner || 'Unknown';
      if (!map[key]) map[key] = { courier: key, orders: 0, units: 0, revenue: 0, penalties: 0 };
      map[key].orders += 1;
      map[key].units += s.quantity_sold;
      map[key].revenue += s.quantity_sold * s.average_selling_price;
    });
    filteredReturns.forEach(r => {
      const sale = sales.find(s => s.id === r.sales_id);
      const key = (sale as any)?.courier_partner || 'Unknown';
      if (map[key]) map[key].penalties += r.penalty_amount;
    });
    return Object.values(map).sort((a, b) => b.orders - a.orders).slice(0, 8);
  }, [filteredSales, filteredReturns, sales]);

  // Expenses breakdown for pie chart
  const expensePieData = useMemo(() => {
    const adSpend = filteredAdExpenses.filter(e => e.category === 'Ads' || !e.category || e.category === 'Other' || e.category === 'Packaging' || e.category === 'Software').reduce((s, e) => s + e.amount, 0);
    const deliveryExpenses = filteredAdExpenses.filter(e => (e.category as string)?.includes('Delivery') || (e.category as string)?.includes('Freight')).reduce((s, e) => s + e.amount, 0) + totalInventoryDeliveryFees;
    const penaltiesTotal = totalPenalties;
    return [
      { name: 'Ads & Marketing', value: Math.round(adSpend), color: 'hsl(224, 76%, 48%)' },
      { name: 'Delivery Fees', value: Math.round(deliveryExpenses), color: 'hsl(38, 92%, 50%)' },
      { name: 'Return Penalties', value: Math.round(penaltiesTotal), color: 'hsl(0, 84%, 60%)' },
    ].filter(d => d.value > 0);
  }, [filteredAdExpenses, totalInventoryDeliveryFees, totalPenalties]);

  const handleAdSubmit = async () => {
    if (!adForm.platform || !adForm.amount) return;
    
    if (adEditId) {
      const { error } = await supabase.from('ad_expenses').update({
        category: adForm.category, platform: adForm.platform, amount: parseFloat(adForm.amount),
        expense_date: adForm.expense_date, description: adForm.description || null,
      }).eq('id', adEditId);
      if (error) return;
    } else {
      const { error } = await supabase.from('ad_expenses').insert({
        category: adForm.category, platform: adForm.platform, amount: parseFloat(adForm.amount),
        expense_date: adForm.expense_date, description: adForm.description || null,
      });
      if (error) return;
    }

    qc.invalidateQueries({ queryKey: ['ad_expenses'] });
    setAdForm({ category: 'Ads', platform: '', amount: '', expense_date: new Date().toISOString().slice(0, 10), description: '' });
    setAdEditId(null);
  };

  const handleAdDelete = async (id: string) => {
    if (!confirm('Delete this expense?')) return;
    const { error } = await supabase.from('ad_expenses').delete().eq('id', id);
    if (!error) qc.invalidateQueries({ queryKey: ['ad_expenses'] });
  };

  const handleAdEdit = (exp: any) => {
    setAdEditId(exp.id);
    setAdForm({
      category: exp.category || 'Ads',
      platform: exp.platform,
      amount: exp.amount.toString(),
      expense_date: exp.expense_date,
      description: exp.description || ''
    });
  };

  const handleDownload = () => exportDashboardReport(sales, inventory, returns, adExpenses, currentStocks);

  const roi = totalCost > 0 ? ((netProfit / totalCost) * 100).toFixed(1) : '0';

  const kpis = [
    { title: 'Total Revenue', value: fmt(totalRevenue), icon: DollarSign, color: 'text-primary', bg: 'bg-primary/10' },
    { title: 'Total Investment', value: fmt(totalCost + stockHoldingValue + totalAdSpend + totalInventoryDeliveryFees), subtitle: 'COGS + Stock + Ads + Delivery', icon: Package, color: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-950' },
    { title: 'Net Profit', value: fmt(netProfit), subtitle: `${profitMargin}% margin`, icon: netProfit >= 0 ? ArrowUpRight : ArrowDownRight, color: netProfit >= 0 ? 'text-emerald-600' : 'text-destructive', bg: netProfit >= 0 ? 'bg-emerald-50 dark:bg-emerald-950' : 'bg-destructive/10' },
    { title: 'Total Orders', value: totalOrders.toLocaleString(), subtitle: `${totalUnits} units · Avg ${fmt(Math.round(avgUnitValue))}/unit`, icon: ShoppingCart, color: 'text-primary', bg: 'bg-primary/10' },
    { title: 'Profit/Unit', value: fmt(Math.round(profitPerUnit)), icon: TrendingUp, color: profitPerUnit >= 0 ? 'text-emerald-600' : 'text-destructive', bg: profitPerUnit >= 0 ? 'bg-emerald-50 dark:bg-emerald-950' : 'bg-destructive/10' },
    { title: 'ROI', value: `${roi}%`, subtitle: 'Return on Investment', icon: Percent, color: Number(roi) >= 0 ? 'text-emerald-600' : 'text-destructive', bg: Number(roi) >= 0 ? 'bg-emerald-50 dark:bg-emerald-950' : 'bg-destructive/10' },
    { title: 'Pending Payments', value: fmt(pendingPayments), icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-950' },
    { title: 'Stock Value', value: fmt(stockHoldingValue), icon: Warehouse, color: 'text-primary', bg: 'bg-primary/10' },
    { title: 'Returns', value: `${totalReturnedQty} units`, subtitle: `${returnRate}% rate · ${fmt(totalPenalties)} penalty`, icon: AlertTriangle, color: 'text-destructive', bg: 'bg-destructive/10' },
    { title: 'Total Expenses', value: fmt(totalAdSpend + totalInventoryDeliveryFees + totalPenalties), subtitle: `Ads ${fmt(totalAdSpend)} · Del ${fmt(totalInventoryDeliveryFees)} · Pen ${fmt(totalPenalties)}`, icon: Megaphone, color: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-950' },
  ];

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="rounded-lg border bg-card p-3 shadow-lg text-sm">
        <p className="font-medium text-foreground mb-1">{label}</p>
        {payload.map((p: any, i: number) => (
          <div key={i} className="flex items-center gap-2">
            <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: p.color }} />
            <span className="text-muted-foreground">{p.name}:</span>
            <span className="font-medium text-foreground">
              {p.name === 'Orders' || p.name === 'Units' ? p.value : fmt(p.value)}
            </span>
          </div>
        ))}
      </div>
    );
  };

  const ReturnTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const d = payload[0]?.payload;
    if (!d) return null;
    return (
      <div className="rounded-lg border bg-card p-3 shadow-lg text-sm">
        <p className="font-medium text-foreground mb-1">{d.name}</p>
        <p className="text-muted-foreground">Quantity: <span className="font-medium text-foreground">{d.value} units</span></p>
        <p className="text-muted-foreground">Penalty: <span className="font-medium text-foreground">{fmt(d.penalty)}</span></p>
      </div>
    );
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Dashboard</h2>
          <p className="text-muted-foreground">SAVS BuyHub — Sales Command Center</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <PeriodSelector value={trendPeriod} onChange={setTrendPeriod} dateRange={trendDateRange} onDateRangeChange={setTrendDateRange} />
          <Button variant="outline" size="sm" onClick={handleDownload}><Download className="mr-1 h-4 w-4" />Report</Button>
          {admin && (
            <Dialog open={adDialogOpen} onOpenChange={(open) => { setAdDialogOpen(open); if (!open) { setAdEditId(null); setAdForm({ category: 'Ads', platform: '', amount: '', expense_date: new Date().toISOString().slice(0, 10), description: '' }); } }}>
              <DialogTrigger asChild><Button variant="outline" size="sm"><Megaphone className="mr-1 h-4 w-4" />Log Expense</Button></DialogTrigger>
              <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
                <DialogHeader><DialogTitle>{adEditId ? 'Edit Expense' : 'Log Expense'}</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div><Label>Category</Label>
                    <Select value={adForm.category} onValueChange={v => setAdForm(p => ({ ...p, category: v }))}>
                      <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                      <SelectContent>
                        {['Ads', 'Delivery/Freight', 'Packaging', 'Software', 'Other'].map(c => (
                          <SelectItem key={c} value={c}>{c}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div><Label>Platform / Vendor</Label>
                    <Select value={adForm.platform} onValueChange={v => setAdForm(p => ({ ...p, platform: v }))}>
                      <SelectTrigger><SelectValue placeholder="Select platform or vendor" /></SelectTrigger>
                      <SelectContent>
                        {['Meesho', 'Flipkart', 'Amazon', 'Instagram', 'Facebook', 'Google', 'Dealer', 'Local Vendor', 'Other'].map(p => (
                          <SelectItem key={p} value={p}>{p}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div><Label>Amount (₹)</Label><Input type="number" step="0.01" value={adForm.amount} onChange={e => setAdForm(p => ({ ...p, amount: e.target.value }))} /></div>
                  <div><Label>Date</Label><Input type="date" value={adForm.expense_date} onChange={e => setAdForm(p => ({ ...p, expense_date: e.target.value }))} /></div>
                  <div><Label>Description (Optional)</Label><Input value={adForm.description} onChange={e => setAdForm(p => ({ ...p, description: e.target.value }))} /></div>
                  <div className="flex gap-2">
                    {adEditId && <Button variant="outline" onClick={() => { setAdEditId(null); setAdForm({ category: 'Ads', platform: '', amount: '', expense_date: new Date().toISOString().slice(0, 10), description: '' }); }} className="flex-1">Cancel</Button>}
                    <Button onClick={handleAdSubmit} className="flex-1">{adEditId ? 'Update' : 'Save'} Expense</Button>
                  </div>
                </div>
                
                <div className="mt-6 border-t pt-4">
                  <h4 className="text-sm font-semibold mb-3">Recent Expenses</h4>
                  <div className="space-y-2">
                    {adExpenses.slice(0, 5).map(exp => (
                      <div key={exp.id} className="flex items-center justify-between bg-muted/30 p-2 rounded-md text-sm border">
                        <div>
                          <p className="font-medium">{exp.category} - {exp.platform} <span className="text-muted-foreground text-xs font-normal">{exp.expense_date}</span></p>
                          <p className="text-xs text-muted-foreground">₹{exp.amount} {exp.description && `- ${exp.description}`}</p>
                        </div>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleAdEdit(exp)}><Pencil className="h-3.5 w-3.5" /></Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleAdDelete(exp.id)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                        </div>
                      </div>
                    ))}
                    {adExpenses.length === 0 && <p className="text-xs text-muted-foreground text-center">No expenses logged yet.</p>}
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          )}
          <Badge variant="outline" className="text-xs">Live Data</Badge>
        </div>
      </div>

      <AlertNotifications />

      <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
        {kpis.map(kpi => (
          <Card key={kpi.title} className="border-none glass-card micro-animate">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className={`rounded-lg p-2 ${kpi.bg}`}><kpi.icon className={`h-4 w-4 ${kpi.color}`} /></div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground truncate">{kpi.title}</p>
                  <p className={`text-lg font-bold ${kpi.color}`}>{kpi.value}</p>
                  {'subtitle' in kpi && kpi.subtitle && <p className="text-[11px] text-muted-foreground">{kpi.subtitle}</p>}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Revenue & Profit Trend */}
      <Card className="glass-card micro-animate">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <CardTitle className="text-base">Revenue & Profit Trend</CardTitle>
              <CardDescription>Investment, revenue, profit/loss & unit count by dispatch date</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="h-80">
          {trendData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={trendData}>
                <defs>
                  <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(224, 76%, 48%)" stopOpacity={0.2} />
                    <stop offset="100%" stopColor="hsl(224, 76%, 48%)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="label" fontSize={10} tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                <YAxis yAxisId="money" fontSize={10} tickFormatter={(v) => `₹${v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v}`} tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                <YAxis yAxisId="count" orientation="right" fontSize={10} tick={{ fill: 'hsl(var(--muted-foreground))' }} label={{ value: 'Units', angle: 90, position: 'insideRight', fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                <Tooltip content={<CustomTooltip />} />
                <Area yAxisId="money" dataKey="revenue" stroke="hsl(224, 76%, 48%)" strokeWidth={2.5} fill="url(#revGrad)" name="Revenue" />
                <Line yAxisId="money" dataKey="investment" stroke="hsl(38, 92%, 50%)" strokeWidth={2} name="Investment" dot={false} />
                <Line yAxisId="money" dataKey="profit" stroke="hsl(142, 76%, 36%)" strokeWidth={2} name="Profit" dot={{ r: 3, fill: 'hsl(142, 76%, 36%)' }} />
                <Bar yAxisId="count" dataKey="units" name="Units" fill="hsl(280, 68%, 50%)" opacity={0.4} barSize={trendData.length > 20 ? 6 : 16} />
                <Legend />
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full items-center justify-center text-muted-foreground">No data for this period</div>
          )}
        </CardContent>
      </Card>

      {/* Profit Per Unit + Units Sold */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="glass-card micro-animate">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <CardTitle className="text-base">Profit Per Unit</CardTitle>
                <CardDescription>Average profit earned per unit sold</CardDescription>
              </div>
              <PeriodSelector value={profitPeriod} onChange={setProfitPeriod} dateRange={profitDateRange} onDateRangeChange={setProfitDateRange} />
            </div>
          </CardHeader>
          <CardContent className="h-64">
            {profitTrendData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={profitTrendData} barSize={profitTrendData.length > 20 ? 8 : 24}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="label" fontSize={10} tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                  <YAxis fontSize={11} tickFormatter={(v) => `₹${v}`} tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="profitPerUnit" name="Profit/Unit" radius={[4, 4, 0, 0]}>
                    {profitTrendData.map((entry, i) => (
                      <Cell key={i} fill={entry.profitPerUnit >= 0 ? 'hsl(142, 76%, 36%)' : 'hsl(0, 84%, 60%)'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-muted-foreground">No data</div>
            )}
          </CardContent>
        </Card>

        <Card className="glass-card micro-animate">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <CardTitle className="text-base">Units Sold Trend</CardTitle>
                <CardDescription>Volume of units sold over time</CardDescription>
              </div>
              <PeriodSelector value={unitsPeriod} onChange={setUnitsPeriod} dateRange={unitsDateRange} onDateRangeChange={setUnitsDateRange} />
            </div>
          </CardHeader>
          <CardContent className="h-64">
            {unitsTrendData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={unitsTrendData} barSize={unitsTrendData.length > 20 ? 8 : 24}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="label" fontSize={10} tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                  <YAxis fontSize={11} tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="units" name="Units" radius={[4, 4, 0, 0]} fill="hsl(224, 76%, 48%)" />
                  <Line dataKey="orders" name="Orders" stroke="hsl(38, 92%, 50%)" strokeWidth={2} dot={false} />
                  <Legend />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-muted-foreground">No data</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Platform Performance + Returns */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="glass-card micro-animate lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Platform Performance</CardTitle>
            <CardDescription>Revenue, cost, profit & units by platform</CardDescription>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={platformData} barGap={2}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="platform" fontSize={12} tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                <YAxis yAxisId="money" fontSize={11} tickFormatter={(v) => `₹${v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v}`} tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                <YAxis yAxisId="count" orientation="right" fontSize={11} tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                <Tooltip content={<CustomTooltip />} />
                <Bar yAxisId="money" dataKey="revenue" name="Revenue" fill="hsl(224, 76%, 48%)" radius={[4, 4, 0, 0]} barSize={20} />
                <Bar yAxisId="money" dataKey="cost" name="Cost" fill="hsl(38, 92%, 50%)" radius={[4, 4, 0, 0]} barSize={20} />
                <Bar yAxisId="money" dataKey="profit" name="Profit" fill="hsl(142, 76%, 36%)" radius={[4, 4, 0, 0]} barSize={20} />
                <Bar yAxisId="count" dataKey="units" name="Units" fill="hsl(280, 68%, 50%)" radius={[4, 4, 0, 0]} barSize={20} opacity={0.6} />
                <Legend />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="glass-card micro-animate">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Return Breakdown</CardTitle>
            <CardDescription>Units & penalty by return type</CardDescription>
          </CardHeader>
          <CardContent className="h-72">
            {returnPieData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={returnPieData} cx="50%" cy="50%" innerRadius={40} outerRadius={70} dataKey="value"
                    label={(props: any) => `${props.name}: ${props.value} (${fmt(props.payload?.penalty ?? 0)})`} labelLine={false}>
                    <Cell fill="hsl(38, 92%, 50%)" />
                    <Cell fill="hsl(0, 84%, 60%)" />
                  </Pie>
                  <Tooltip content={<ReturnTooltip />} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-muted-foreground">No returns yet</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Top Products */}
      <Card className="glass-card micro-animate">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Top Performing Products</CardTitle>
          <CardDescription>Best sellers by revenue with profit per unit</CardDescription>
        </CardHeader>
        <CardContent>
          {topProducts.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {topProducts.map((p, i) => (
                <div key={p.sku} className="flex items-center gap-3 rounded-lg border p-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary shrink-0">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm truncate">{p.name}</p>
                    <p className="text-xs text-muted-foreground">{p.sku}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-semibold text-sm">{fmt(p.revenue)}</p>
                    <p className="text-xs text-muted-foreground">{p.units} units · {fmt(p.profitPerUnit)}/unit</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-center text-muted-foreground py-6">No product data yet</p>
          )}
        </CardContent>
      </Card>

      {/* Expenses Breakdown + Courier Performance */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="glass-card micro-animate">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Expenses Breakdown</CardTitle>
            <CardDescription>Ads, delivery fees & return penalties split</CardDescription>
          </CardHeader>
          <CardContent className="h-72">
            {expensePieData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={expensePieData} cx="50%" cy="50%" innerRadius={52} outerRadius={85} dataKey="value" paddingAngle={3}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                    {expensePieData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number) => fmt(v)} />
                  <Legend formatter={(value) => <span className="text-xs">{value}</span>} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-muted-foreground">No expense data yet</div>
            )}
          </CardContent>
        </Card>

        <Card className="glass-card micro-animate">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <Truck className="h-4 w-4 text-muted-foreground" />
              <div>
                <CardTitle className="text-base">Courier Performance</CardTitle>
                <CardDescription>Orders, units shipped & return penalties by courier</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {courierData.length > 0 ? (
              <div className="space-y-2">
                <div className="grid grid-cols-4 text-xs text-muted-foreground font-medium px-2 pb-1 border-b">
                  <span>Courier</span>
                  <span className="text-right">Orders</span>
                  <span className="text-right">Units</span>
                  <span className="text-right">Penalties</span>
                </div>
                {courierData.map((c, i) => (
                  <div key={c.courier} className={`grid grid-cols-4 text-sm px-2 py-1.5 rounded-md ${i % 2 === 0 ? 'bg-muted/30' : ''}`}>
                    <span className="font-medium truncate pr-1">{c.courier}</span>
                    <span className="text-right tabular-nums">{c.orders}</span>
                    <span className="text-right tabular-nums">{c.units}</span>
                    <span className={`text-right tabular-nums text-xs ${c.penalties > 0 ? 'text-destructive font-medium' : 'text-muted-foreground'}`}>
                      {c.penalties > 0 ? fmt(c.penalties) : '—'}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center text-muted-foreground py-6">No courier data yet</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
