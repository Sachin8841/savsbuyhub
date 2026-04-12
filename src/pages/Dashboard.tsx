import { useState, useEffect } from 'react';
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
import { DollarSign, Clock, AlertTriangle, Package, ShoppingCart, ArrowUpRight, ArrowDownRight, Megaphone, Warehouse } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell, Legend } from 'recharts';

const COLORS = ['hsl(224, 76%, 48%)', 'hsl(142, 76%, 36%)', 'hsl(38, 92%, 50%)', 'hsl(0, 84%, 60%)'];
const PERIOD_OPTIONS = [
  { label: '24 Hours', value: 'day' },
  { label: '7 Days', value: 'week' },
  { label: '30 Days', value: 'month' },
  { label: '1 Year', value: 'year' },
  { label: 'All Time', value: 'max' },
];

export default function Dashboard() {
  const { data: sales = [] } = useSales();
  const { data: returns = [] } = useReturns();
  const { data: inventory = [] } = useInventory();
  const { data: adExpenses = [] } = useAdExpenses();
  const { isAdmin } = useAuthStore();
  const admin = isAdmin();
  const qc = useQueryClient();
  const [trendPeriod, setTrendPeriod] = useState('max');
  const [adDialogOpen, setAdDialogOpen] = useState(false);
  const [adForm, setAdForm] = useState({ platform: '', amount: '', expense_date: new Date().toISOString().slice(0, 10), description: '' });
  const [currentStocks, setCurrentStocks] = useState<Record<string, number>>({});

  useEffect(() => {
    inventory.forEach(async (item) => {
      const { data } = await supabase.rpc('get_current_stock', { inv_id: item.id });
      if (data !== null) setCurrentStocks(prev => ({ ...prev, [item.id]: data as number }));
    });
  }, [inventory]);

  // Filter sales by period
  const getFilterDate = (period: string) => {
    const d = new Date();
    if (period === 'day') d.setDate(d.getDate() - 1);
    else if (period === 'week') d.setDate(d.getDate() - 7);
    else if (period === 'month') d.setMonth(d.getMonth() - 1);
    else if (period === 'year') d.setFullYear(d.getFullYear() - 1);
    else return null;
    return d;
  };
  const filterDate = getFilterDate(trendPeriod);
  const filteredSales = filterDate ? sales.filter(s => new Date(s.created_at) >= filterDate) : sales;
  const filteredReturns = filterDate ? returns.filter(r => new Date(r.created_at) >= filterDate) : returns;

  const totalRevenue = filteredSales.reduce((sum, s) => sum + s.quantity_sold * s.average_selling_price, 0);
  const totalUnits = filteredSales.reduce((sum, s) => sum + s.quantity_sold, 0);
  const pendingPayments = filteredSales.filter(s => s.payment_status === 'Pending').reduce((sum, s) => sum + s.quantity_sold * s.average_selling_price, 0);
  const totalPenalties = filteredReturns.reduce((sum, r) => sum + r.penalty_amount, 0);
  const totalReturnedQty = filteredReturns.reduce((sum, r) => sum + r.quantity_returned, 0);
  const totalCost = filteredSales.reduce((sum, s) => {
    const inv = s.inventory as any;
    return sum + s.quantity_sold * (inv?.average_cost_price ?? 0);
  }, 0);
  const totalAdSpend = adExpenses.reduce((sum, e) => sum + e.amount, 0);
  const netProfit = totalRevenue - totalCost - totalPenalties - totalAdSpend;
  const profitMargin = totalRevenue > 0 ? ((netProfit / totalRevenue) * 100).toFixed(1) : '0';
  const returnRate = totalUnits > 0 ? ((totalReturnedQty / totalUnits) * 100).toFixed(1) : '0';

  // Stock holding value
  const stockHoldingValue = inventory.reduce((sum, item) => {
    const stock = currentStocks[item.id] ?? 0;
    return sum + stock * item.average_cost_price + (item.delivery_fee ?? 0);
  }, 0) + totalAdSpend;

  // Platform revenue with colored bars
  const platformRevenue = ['Meesho', 'Flipkart', 'Amazon', 'Offline'].map(p => ({
    platform: p,
    revenue: filteredSales.filter(s => s.platform === p).reduce((sum, s) => sum + s.quantity_sold * s.average_selling_price, 0),
    units: filteredSales.filter(s => s.platform === p).reduce((sum, s) => sum + s.quantity_sold, 0),
  }));

  // Return breakdown by QUANTITY
  const customerReturnQty = filteredReturns.filter(r => r.return_type === 'Customer Return').reduce((sum, r) => sum + r.quantity_returned, 0);
  const rtoReturnQty = filteredReturns.filter(r => r.return_type === 'RTO').reduce((sum, r) => sum + r.quantity_returned, 0);
  const returnPieData = [
    { name: 'Customer Returns', value: customerReturnQty },
    { name: 'RTO', value: rtoReturnQty },
  ].filter(d => d.value > 0);

  // Trend data based on period
  const buildTrendData = () => {
    const dataMap: Record<string, { label: string; revenue: number; cost: number; profit: number; units: number }> = {};
    
    filteredSales.forEach(s => {
      let key: string;
      const date = new Date(s.created_at);
      if (trendPeriod === 'day') {
        key = `${date.getHours().toString().padStart(2, '0')}:00`;
      } else if (trendPeriod === 'week') {
        key = date.toISOString().slice(0, 10);
      } else if (trendPeriod === 'month') {
        key = date.toISOString().slice(0, 10);
      } else {
        key = s.dispatch_date?.slice(0, 7) ?? date.toISOString().slice(0, 7);
      }

      if (!dataMap[key]) dataMap[key] = { label: key, revenue: 0, cost: 0, profit: 0, units: 0 };
      const rev = s.quantity_sold * s.average_selling_price;
      const cost = s.quantity_sold * ((s.inventory as any)?.average_cost_price ?? 0);
      dataMap[key].revenue += rev;
      dataMap[key].cost += cost;
      dataMap[key].units += s.quantity_sold;
    });

    const arr = Object.values(dataMap).sort((a, b) => a.label.localeCompare(b.label));
    arr.forEach(m => { m.profit = m.revenue - m.cost; });
    return arr;
  };
  const trendData = buildTrendData();

  // Recent sales
  const recentSales = sales.slice(0, 5);

  const fmt = (n: number) => '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 0 });

  // Ad expense submit
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

  const kpis = [
    { title: 'Total Revenue', value: fmt(totalRevenue), icon: DollarSign, color: 'text-primary', bg: 'bg-primary/10' },
    { title: 'Net Profit', value: fmt(netProfit), subtitle: `${profitMargin}% margin`, icon: netProfit >= 0 ? ArrowUpRight : ArrowDownRight, color: netProfit >= 0 ? 'text-emerald-600' : 'text-destructive', bg: netProfit >= 0 ? 'bg-emerald-50 dark:bg-emerald-950' : 'bg-destructive/10' },
    { title: 'Pending Payments', value: fmt(pendingPayments), icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-950' },
    { title: 'Stock Holding Value', value: fmt(stockHoldingValue), icon: Warehouse, color: 'text-primary', bg: 'bg-primary/10' },
    { title: 'Penalties & Returns', value: fmt(totalPenalties), subtitle: `${returnRate}% return rate`, icon: AlertTriangle, color: 'text-destructive', bg: 'bg-destructive/10' },
    { title: 'Units Sold', value: totalUnits.toLocaleString(), icon: ShoppingCart, color: 'text-primary', bg: 'bg-primary/10' },
    { title: 'Products', value: inventory.length.toString(), icon: Package, color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-950' },
    { title: 'Ad Spend', value: fmt(totalAdSpend), icon: Megaphone, color: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-950' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Dashboard</h2>
          <p className="text-muted-foreground">SAVS BuyHub — Sales Command Center</p>
        </div>
        <div className="flex items-center gap-2">
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

      {/* KPIs */}
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-4 xl:grid-cols-4">
        {kpis.map(kpi => (
          <Card key={kpi.title} className="border-none shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className={`rounded-lg p-2 ${kpi.bg}`}><kpi.icon className={`h-4 w-4 ${kpi.color}`} /></div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground truncate">{kpi.title}</p>
                  <p className={`text-lg font-bold ${kpi.color}`}>{kpi.value}</p>
                  {'subtitle' in kpi && kpi.subtitle && <p className="text-xs text-muted-foreground">{kpi.subtitle}</p>}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Revenue & Profit Trend with period selector */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Revenue & Profit Trend</CardTitle>
              <CardDescription>Performance with quantity & price trends</CardDescription>
            </div>
            <div className="flex gap-1">
              {PERIOD_OPTIONS.map(p => (
                <Button key={p.value} variant={trendPeriod === p.value ? 'default' : 'ghost'} size="sm" className="text-xs h-7 px-2"
                  onClick={() => setTrendPeriod(p.value)}>{p.label}</Button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent className="h-80">
          {trendData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="label" fontSize={11} tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                <YAxis yAxisId="revenue" fontSize={11} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                <YAxis yAxisId="units" orientation="right" fontSize={11} tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                <Tooltip formatter={(v: number, name: string) => name === 'Units' ? v : fmt(v)} contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }} />
                <Line yAxisId="revenue" type="monotone" dataKey="revenue" stroke="hsl(224, 76%, 48%)" strokeWidth={2.5} name="Revenue" dot={false} />
                <Line yAxisId="revenue" type="monotone" dataKey="profit" stroke="hsl(142, 76%, 36%)" strokeWidth={2} name="Profit" dot={false} />
                <Line yAxisId="units" type="monotone" dataKey="units" stroke="hsl(38, 92%, 50%)" strokeWidth={1.5} strokeDasharray="4 2" name="Units" dot={false} />
                <Legend />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full items-center justify-center text-muted-foreground">No data for this period</div>
          )}
        </CardContent>
      </Card>

      {/* Charts Row */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Revenue by Platform</CardTitle></CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={platformRevenue} barSize={36}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="platform" fontSize={12} tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                <YAxis fontSize={12} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                <Tooltip formatter={(v: number) => fmt(v)} contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }} />
                <Bar dataKey="revenue" radius={[6, 6, 0, 0]} name="Revenue">
                  {platformRevenue.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Return Breakdown</CardTitle>
            <CardDescription>By quantity of units returned</CardDescription>
          </CardHeader>
          <CardContent className="h-72">
            {returnPieData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={returnPieData} cx="50%" cy="50%" innerRadius={40} outerRadius={70} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
                    {returnPieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-muted-foreground">No returns yet</div>
            )}
          </CardContent>
        </Card>

        {/* Recent Sales */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Recent Sales</CardTitle><CardDescription>Latest 5 transactions</CardDescription></CardHeader>
          <CardContent>
            {recentSales.length > 0 ? (
              <div className="space-y-3">
                {recentSales.map(s => {
                  const inv = s.inventory as any;
                  return (
                    <div key={s.id} className="flex items-center justify-between rounded-lg border p-3">
                      <div>
                        <p className="text-sm font-medium">{inv?.product_name ?? 'Unknown'}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <Badge variant="secondary" className="text-xs">{s.platform}</Badge>
                          <span className="text-xs text-muted-foreground">{s.dispatch_date}</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-sm">{fmt(s.quantity_sold * s.average_selling_price)}</p>
                        <p className="text-xs text-muted-foreground">{s.quantity_sold} units</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex h-48 items-center justify-center text-muted-foreground">No sales yet</div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
