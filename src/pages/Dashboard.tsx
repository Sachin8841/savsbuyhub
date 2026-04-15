import { useState, useEffect, useMemo } from 'react';
import { useSales, useReturns, useInventory, useAdExpenses } from '@/hooks/useData';
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
import { DollarSign, Clock, AlertTriangle, Package, ShoppingCart, ArrowUpRight, ArrowDownRight, Megaphone, Warehouse, Download, TrendingUp } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Line, PieChart, Pie, Cell, Legend, ComposedChart, Area } from 'recharts';
import { exportDashboardReport } from '@/lib/xlsx-export';
import { AlertNotifications } from '@/components/AlertNotifications';


const PERIOD_OPTIONS = [
  { label: '1D', value: 'day' },
  { label: '7D', value: 'week' },
  { label: '30D', value: 'month' },
  { label: '1Y', value: 'year' },
  { label: 'Max', value: 'max' },
];

const fmt = (n: number) => '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 0 });

const PeriodSelector = ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
  <div className="flex items-center gap-0.5 bg-muted/50 rounded-lg p-0.5 w-fit">
    {PERIOD_OPTIONS.map(p => (
      <Button key={p.value} variant={value === p.value ? 'default' : 'ghost'} size="sm" className="text-xs h-6 px-2.5"
        onClick={() => onChange(p.value)}>{p.label}</Button>
    ))}
  </div>
);

export default function Dashboard() {
  const { data: sales = [] } = useSales();
  const { data: returns = [] } = useReturns();
  const { data: inventory = [] } = useInventory();
  const { data: adExpenses = [] } = useAdExpenses();
  const { isAdmin } = useAuthStore();
  const admin = isAdmin();
  const qc = useQueryClient();
  const [trendPeriod, setTrendPeriod] = useState('max');
  const [profitPeriod, setProfitPeriod] = useState('max');
  const [unitsPeriod, setUnitsPeriod] = useState('max');
  const [adDialogOpen, setAdDialogOpen] = useState(false);
  const [adForm, setAdForm] = useState({ platform: '', amount: '', expense_date: new Date().toISOString().slice(0, 10), description: '' });
  const [currentStocks, setCurrentStocks] = useState<Record<string, number>>({});

  useEffect(() => {
    inventory.forEach(async (item) => {
      const { data } = await supabase.rpc('get_current_stock', { inv_id: item.id });
      if (data !== null) setCurrentStocks(prev => ({ ...prev, [item.id]: data as number }));
    });
  }, [inventory]);

  const getFilterDate = (period: string) => {
    const d = new Date();
    if (period === 'day') d.setDate(d.getDate() - 1);
    else if (period === 'week') d.setDate(d.getDate() - 7);
    else if (period === 'month') d.setMonth(d.getMonth() - 1);
    else if (period === 'year') d.setFullYear(d.getFullYear() - 1);
    else return null;
    return d;
  };


  // Main KPI filtering uses dispatch_date for sales
  const filterDate = getFilterDate(trendPeriod);
  const filteredSales = filterDate ? sales.filter(s => new Date(s.dispatch_date) >= filterDate) : sales;
  const filteredReturns = filterDate ? returns.filter(r => new Date(r.return_date) >= filterDate) : returns;
  const filteredAdExpenses = filterDate ? adExpenses.filter(e => new Date(e.expense_date) >= filterDate) : adExpenses;

  const totalRevenue = filteredSales.reduce((sum, s) => sum + s.quantity_sold * s.average_selling_price, 0);
  const totalUnits = filteredSales.reduce((sum, s) => sum + s.quantity_sold, 0);
  const totalOrders = filteredSales.length;
  const pendingPayments = filteredSales.filter(s => s.payment_status === 'Pending').reduce((sum, s) => sum + s.quantity_sold * s.average_selling_price, 0);
  const totalPenalties = filteredReturns.reduce((sum, r) => sum + r.penalty_amount, 0);
  const totalReturnedQty = filteredReturns.reduce((sum, r) => sum + r.quantity_returned, 0);
  const totalCost = filteredSales.reduce((sum, s) => {
    const inv = s.inventory as any;
    return sum + s.quantity_sold * (inv?.average_cost_price ?? 0);
  }, 0);
  const totalAdSpend = filteredAdExpenses.reduce((sum, e) => sum + e.amount, 0);
  const totalDeliveryFees = filteredSales.reduce((sum, s) => {
    const inv = s.inventory as any;
    return sum + (inv?.delivery_fee ?? 0);
  }, 0);
  const netProfit = totalRevenue - totalCost - totalPenalties - totalAdSpend - totalDeliveryFees;
  const profitMargin = totalRevenue > 0 ? ((netProfit / totalRevenue) * 100).toFixed(1) : '0';
  const returnRate = totalUnits > 0 ? ((totalReturnedQty / totalUnits) * 100).toFixed(1) : '0';
  const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;
  const profitPerOrder = totalOrders > 0 ? netProfit / totalOrders : 0;

  const stockHoldingValue = inventory.reduce((sum, item) => {
    const stock = currentStocks[item.id] ?? 0;
    return sum + stock * item.average_cost_price + (item.delivery_fee ?? 0);
  }, 0);

  // Platform data
  const platformData = useMemo(() => ['Meesho', 'Flipkart', 'Amazon', 'Offline'].map(p => {
    const platSales = filteredSales.filter(s => s.platform === p);
    const revenue = platSales.reduce((sum, s) => sum + s.quantity_sold * s.average_selling_price, 0);
    const cost = platSales.reduce((sum, s) => sum + s.quantity_sold * ((s.inventory as any)?.average_cost_price ?? 0), 0);
    return {
      platform: p,
      revenue,
      cost,
      profit: revenue - cost,
      orders: platSales.length,
      units: platSales.reduce((sum, s) => sum + s.quantity_sold, 0),
    };
  }), [filteredSales]);

  // Return breakdown - show quantity AND penalty amount
  const customerReturns = filteredReturns.filter(r => r.return_type === 'Customer Return');
  const rtoReturns = filteredReturns.filter(r => r.return_type === 'RTO');
  const customerReturnQty = customerReturns.reduce((sum, r) => sum + r.quantity_returned, 0);
  const rtoReturnQty = rtoReturns.reduce((sum, r) => sum + r.quantity_returned, 0);
  const customerReturnPenalty = customerReturns.reduce((sum, r) => sum + r.penalty_amount, 0);
  const rtoReturnPenalty = rtoReturns.reduce((sum, r) => sum + r.penalty_amount, 0);
  const returnPieData = [
    { name: 'Customer Return', value: customerReturnQty, penalty: customerReturnPenalty },
    { name: 'RTO', value: rtoReturnQty, penalty: rtoReturnPenalty },
  ].filter(d => d.value > 0);

  // Build trend data from dispatch_date
  const buildTrendData = (period: string) => {
    const fd = getFilterDate(period);
    const fSales = fd ? sales.filter(s => new Date(s.dispatch_date) >= fd) : sales;
    const dataMap: Record<string, { label: string; revenue: number; cost: number; investment: number; profit: number; units: number; orders: number; profitPerOrder: number }> = {};

    fSales.forEach(s => {
      let key: string;
      const date = new Date(s.dispatch_date);
      if (period === 'day') {
        key = `${date.getHours().toString().padStart(2, '0')}:00`;
      } else if (period === 'week' || period === 'month') {
        key = s.dispatch_date;
      } else {
        key = s.dispatch_date?.slice(0, 7) ?? date.toISOString().slice(0, 7);
      }

      if (!dataMap[key]) dataMap[key] = { label: key, revenue: 0, cost: 0, investment: 0, profit: 0, units: 0, orders: 0, profitPerOrder: 0 };
      const rev = s.quantity_sold * s.average_selling_price;
      const cost = s.quantity_sold * ((s.inventory as any)?.average_cost_price ?? 0);
      const deliveryFee = (s.inventory as any)?.delivery_fee ?? 0;
      dataMap[key].revenue += rev;
      dataMap[key].cost += cost;
      dataMap[key].investment += cost + deliveryFee;
      dataMap[key].units += s.quantity_sold;
      dataMap[key].orders += 1;
    });

    const arr = Object.values(dataMap).sort((a, b) => a.label.localeCompare(b.label));
    arr.forEach(m => {
      m.profit = m.revenue - m.investment;
      m.profitPerOrder = m.orders > 0 ? Math.round(m.profit / m.orders) : 0;
    });
    return arr;
  };

  const trendData = useMemo(() => buildTrendData(trendPeriod), [sales, trendPeriod]);
  const profitTrendData = useMemo(() => buildTrendData(profitPeriod), [sales, profitPeriod]);
  const unitsTrendData = useMemo(() => buildTrendData(unitsPeriod), [sales, unitsPeriod]);

  // Top products
  const topProducts = useMemo(() => {
    const map: Record<string, { name: string; sku: string; revenue: number; units: number; profit: number }> = {};
    filteredSales.forEach(s => {
      const inv = s.inventory as any;
      if (!inv) return;
      if (!map[inv.sku]) map[inv.sku] = { name: inv.product_name, sku: inv.sku, revenue: 0, units: 0, profit: 0 };
      map[inv.sku].revenue += s.quantity_sold * s.average_selling_price;
      map[inv.sku].units += s.quantity_sold;
      map[inv.sku].profit += s.quantity_sold * (s.average_selling_price - (inv.average_cost_price ?? 0));
    });
    return Object.values(map).sort((a, b) => b.revenue - a.revenue).slice(0, 6);
  }, [filteredSales]);

  const handleAdSubmit = async () => {
    if (!adForm.platform || !adForm.amount) return;
    const { error } = await supabase.from('ad_expenses').insert({
      platform: adForm.platform,
      amount: parseFloat(adForm.amount),
      expense_date: adForm.expense_date,
      description: adForm.description || null,
    });
    if (error) return;
    qc.invalidateQueries({ queryKey: ['ad_expenses'] });
    setAdDialogOpen(false);
    setAdForm({ platform: '', amount: '', expense_date: new Date().toISOString().slice(0, 10), description: '' });
  };

  const handleDownload = () => {
    exportDashboardReport(sales, inventory, returns, adExpenses, currentStocks);
  };

  const kpis = [
    { title: 'Total Revenue', value: fmt(totalRevenue), icon: DollarSign, color: 'text-primary', bg: 'bg-primary/10' },
    { title: 'Total Investment', value: fmt(totalCost + totalDeliveryFees), icon: Package, color: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-950' },
    { title: 'Net Profit', value: fmt(netProfit), subtitle: `${profitMargin}% margin`, icon: netProfit >= 0 ? ArrowUpRight : ArrowDownRight, color: netProfit >= 0 ? 'text-emerald-600' : 'text-destructive', bg: netProfit >= 0 ? 'bg-emerald-50 dark:bg-emerald-950' : 'bg-destructive/10' },
    { title: 'Total Orders', value: totalOrders.toLocaleString(), subtitle: `${totalUnits} units · Avg ${fmt(Math.round(avgOrderValue))}`, icon: ShoppingCart, color: 'text-primary', bg: 'bg-primary/10' },
    { title: 'Profit/Order', value: fmt(Math.round(profitPerOrder)), icon: TrendingUp, color: profitPerOrder >= 0 ? 'text-emerald-600' : 'text-destructive', bg: profitPerOrder >= 0 ? 'bg-emerald-50 dark:bg-emerald-950' : 'bg-destructive/10' },
    { title: 'Pending Payments', value: fmt(pendingPayments), icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-950' },
    { title: 'Stock Value', value: fmt(stockHoldingValue), icon: Warehouse, color: 'text-primary', bg: 'bg-primary/10' },
    { title: 'Returns', value: `${totalReturnedQty} units`, subtitle: `${returnRate}% rate · ${fmt(totalPenalties)} penalty`, icon: AlertTriangle, color: 'text-destructive', bg: 'bg-destructive/10' },
    { title: 'Ad Spend', value: fmt(totalAdSpend), icon: Megaphone, color: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-950' },
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
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Dashboard</h2>
          <p className="text-muted-foreground">SAVS BuyHub — Sales Command Center</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleDownload}><Download className="mr-1 h-4 w-4" />Download Report</Button>
          {admin && (
            <Dialog open={adDialogOpen} onOpenChange={setAdDialogOpen}>
              <DialogTrigger asChild><Button variant="outline" size="sm"><Megaphone className="mr-1 h-4 w-4" />Ad Expense</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Log Ad Expense</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div><Label>Platform</Label>
                    <Select value={adForm.platform} onValueChange={v => setAdForm(p => ({ ...p, platform: v }))}>
                      <SelectTrigger><SelectValue placeholder="Select platform" /></SelectTrigger>
                      <SelectContent>
                        {['Meesho', 'Flipkart', 'Amazon', 'Instagram', 'Facebook', 'Google', 'Other'].map(p => (
                          <SelectItem key={p} value={p}>{p}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div><Label>Amount (₹)</Label><Input type="number" step="0.01" value={adForm.amount} onChange={e => setAdForm(p => ({ ...p, amount: e.target.value }))} /></div>
                  <div><Label>Date</Label><Input type="date" value={adForm.expense_date} onChange={e => setAdForm(p => ({ ...p, expense_date: e.target.value }))} /></div>
                  <div><Label>Description (Optional)</Label><Input value={adForm.description} onChange={e => setAdForm(p => ({ ...p, description: e.target.value }))} /></div>
                  <Button onClick={handleAdSubmit} className="w-full">Save Expense</Button>
                </div>
              </DialogContent>
            </Dialog>
          )}
          <Badge variant="outline" className="text-xs">Live Data</Badge>
        </div>
      </div>

      <AlertNotifications />
      {/* KPIs */}
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
        {kpis.map(kpi => (
          <Card key={kpi.title} className="border-none shadow-sm">
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

      {/* Revenue & Profit Trend — stock-market style candlestick-inspired */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <CardTitle className="text-base">Revenue & Profit Trend</CardTitle>
              <CardDescription>Investment, revenue, profit/loss & unit count by dispatch date</CardDescription>
            </div>
            <PeriodSelector value={trendPeriod} onChange={setTrendPeriod} />
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
                <Area yAxisId="money" type="monotone" dataKey="revenue" stroke="hsl(224, 76%, 48%)" strokeWidth={2.5} fill="url(#revGrad)" name="Revenue" />
                <Line yAxisId="money" type="monotone" dataKey="investment" stroke="hsl(38, 92%, 50%)" strokeWidth={2} name="Investment" dot={false} />
                <Line yAxisId="money" type="monotone" dataKey="profit" stroke="hsl(142, 76%, 36%)" strokeWidth={2} name="Profit" dot={{ r: 3, fill: 'hsl(142, 76%, 36%)' }} />
                <Bar yAxisId="count" dataKey="units" name="Units" fill="hsl(280, 68%, 50%)" opacity={0.4} barSize={trendData.length > 20 ? 6 : 16} />
                <Legend />
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full items-center justify-center text-muted-foreground">No data for this period</div>
          )}
        </CardContent>
      </Card>

      {/* Profit Per Order + Units Sold — each with own period selector */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <CardTitle className="text-base">Profit Per Order</CardTitle>
                <CardDescription>Average profit earned per order</CardDescription>
              </div>
              <PeriodSelector value={profitPeriod} onChange={setProfitPeriod} />
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
                  <Bar dataKey="profitPerOrder" name="Profit/Order" radius={[4, 4, 0, 0]}>
                    {profitTrendData.map((entry, i) => (
                      <Cell key={i} fill={entry.profitPerOrder >= 0 ? 'hsl(142, 76%, 36%)' : 'hsl(0, 84%, 60%)'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-muted-foreground">No data</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <CardTitle className="text-base">Units Sold Trend</CardTitle>
                <CardDescription>Volume of units sold over time</CardDescription>
              </div>
              <PeriodSelector value={unitsPeriod} onChange={setUnitsPeriod} />
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
                  <Line type="monotone" dataKey="orders" name="Orders" stroke="hsl(38, 92%, 50%)" strokeWidth={2} dot={false} />
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
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Platform Performance</CardTitle>
            <CardDescription>Revenue, cost, profit & orders by platform</CardDescription>
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
                <Bar yAxisId="count" dataKey="orders" name="Orders" fill="hsl(280, 68%, 50%)" radius={[4, 4, 0, 0]} barSize={20} opacity={0.6} />
                <Legend />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
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
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Top Performing Products</CardTitle>
          <CardDescription>Best sellers by revenue</CardDescription>
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
                    <p className="text-xs text-muted-foreground">{p.units} units · {fmt(p.profit)} profit</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-center text-muted-foreground py-6">No product data yet</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
