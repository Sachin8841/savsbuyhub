import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { TrendingUp, Package, BarChart3, ShoppingCart, LogIn, DollarSign, ArrowUpRight, AlertTriangle } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Legend, PieChart, Pie, Cell, ComposedChart, Area } from 'recharts';
import { useNavigate } from 'react-router-dom';

const PERIOD_OPTIONS = [
  { label: '7D', value: 'week' },
  { label: '30D', value: 'month' },
  { label: '1Y', value: 'year' },
  { label: 'Max', value: 'max' },
];

const fmt = (n: number) => '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 0 });

export default function Forecast() {
  const [sales, setSales] = useState<any[]>([]);
  const [inventory, setInventory] = useState<any[]>([]);
  const [returns, setReturns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('max');
  const navigate = useNavigate();

  useEffect(() => {
    const fetchData = async () => {
      const [salesRes, invRes, retRes] = await Promise.all([
        supabase.from('sales').select('*, inventory(sku, product_name, average_cost_price, average_selling_price)').order('dispatch_date', { ascending: false }),
        supabase.from('inventory').select('*'),
        supabase.from('returns').select('*, sales(id, platform, dispatch_date, inventory_id, quantity_sold, average_selling_price, inventory(sku, product_name))'),
      ]);
      setSales(salesRes.data ?? []);
      setInventory(invRes.data ?? []);
      setReturns(retRes.data ?? []);
      setLoading(false);
    };
    fetchData();
  }, []);

  const getFilterDate = (p: string) => {
    const d = new Date();
    if (p === 'week') d.setDate(d.getDate() - 7);
    else if (p === 'month') d.setMonth(d.getMonth() - 1);
    else if (p === 'year') d.setFullYear(d.getFullYear() - 1);
    else return null;
    return d;
  };
  const filterDate = getFilterDate(period);
  const filteredSales = filterDate ? sales.filter(s => new Date(s.created_at) >= filterDate) : sales;
  const filteredReturns = filterDate ? returns.filter(r => new Date(r.created_at) >= filterDate) : returns;

  const totalRevenue = filteredSales.reduce((sum, s) => sum + s.quantity_sold * s.average_selling_price, 0);
  const totalUnits = filteredSales.reduce((sum, s) => sum + s.quantity_sold, 0);
  const totalOrders = filteredSales.length;
  const totalCost = filteredSales.reduce((sum, s) => sum + s.quantity_sold * ((s.inventory as any)?.average_cost_price ?? 0), 0);
  const netProfit = totalRevenue - totalCost;
  const returnedQty = filteredReturns.reduce((s, r) => s + r.quantity_returned, 0);
  const returnRate = totalUnits > 0 ? ((returnedQty / totalUnits) * 100).toFixed(1) : '0';

  // Platform data
  const platformData = useMemo(() => ['Meesho', 'Flipkart', 'Amazon', 'Offline'].map(p => {
    const platSales = filteredSales.filter(s => s.platform === p);
    const revenue = platSales.reduce((sum, s) => sum + s.quantity_sold * s.average_selling_price, 0);
    const cost = platSales.reduce((sum, s) => sum + s.quantity_sold * ((s.inventory as any)?.average_cost_price ?? 0), 0);
    return { platform: p, revenue, profit: revenue - cost, orders: platSales.length, units: platSales.reduce((sum, s) => sum + s.quantity_sold, 0) };
  }), [filteredSales]);

  // Monthly trend
  const trendData = useMemo(() => {
    const dataMap: Record<string, { label: string; revenue: number; cost: number; profit: number; units: number; orders: number }> = {};
    filteredSales.forEach(s => {
      const key = period === 'week' || period === 'month'
        ? new Date(s.created_at).toISOString().slice(0, 10)
        : (s.dispatch_date?.slice(0, 7) ?? new Date(s.created_at).toISOString().slice(0, 7));
      if (!dataMap[key]) dataMap[key] = { label: key, revenue: 0, cost: 0, profit: 0, units: 0, orders: 0 };
      dataMap[key].revenue += s.quantity_sold * s.average_selling_price;
      dataMap[key].cost += s.quantity_sold * ((s.inventory as any)?.average_cost_price ?? 0);
      dataMap[key].units += s.quantity_sold;
      dataMap[key].orders += 1;
    });
    const arr = Object.values(dataMap).sort((a, b) => a.label.localeCompare(b.label));
    arr.forEach(m => { m.profit = m.revenue - m.cost; });
    return arr;
  }, [filteredSales, period]);

  // Forecast
  const last3 = trendData.slice(-3);
  const avgRevenue = last3.length > 0 ? last3.reduce((s, m) => s + m.revenue, 0) / last3.length : 0;
  const avgUnits = last3.length > 0 ? last3.reduce((s, m) => s + m.units, 0) / last3.length : 0;
  const growthRate = last3.length >= 2 && last3[0].revenue > 0 ? ((last3[last3.length - 1].revenue / last3[0].revenue - 1) * 100) : 0;

  const forecastMonths: any[] = [];
  const lastMonth = trendData.length > 0 ? trendData[trendData.length - 1].label : new Date().toISOString().slice(0, 7);
  for (let i = 1; i <= 3; i++) {
    const d = new Date(lastMonth.length === 7 ? lastMonth + '-01' : lastMonth);
    d.setMonth(d.getMonth() + i);
    forecastMonths.push({
      label: d.toISOString().slice(0, 7),
      revenue: Math.round(avgRevenue * (1 + (growthRate / 100) * i * 0.3)),
      units: Math.round(avgUnits * (1 + (growthRate / 100) * i * 0.3)),
    });
  }

  // Combined trend for chart
  const combinedTrend = [
    ...trendData.map(m => ({ ...m, forecastRevenue: undefined as number | undefined })),
    ...forecastMonths.map(m => ({ ...m, forecastRevenue: m.revenue, revenue: undefined as number | undefined, profit: undefined, cost: 0, orders: 0 })),
  ];

  // Top products
  const topProducts = useMemo(() => {
    const map: Record<string, { name: string; sku: string; revenue: number; units: number }> = {};
    filteredSales.forEach(s => {
      const inv = s.inventory as any;
      if (!inv) return;
      if (!map[inv.sku]) map[inv.sku] = { name: inv.product_name, sku: inv.sku, revenue: 0, units: 0 };
      map[inv.sku].revenue += s.quantity_sold * s.average_selling_price;
      map[inv.sku].units += s.quantity_sold;
    });
    return Object.values(map).sort((a, b) => b.revenue - a.revenue).slice(0, 5);
  }, [filteredSales]);

  // Return pie
  const customerReturnQty = filteredReturns.filter(r => r.return_type === 'Customer Return').reduce((sum, r) => sum + r.quantity_returned, 0);
  const rtoReturnQty = filteredReturns.filter(r => r.return_type === 'RTO').reduce((sum, r) => sum + r.quantity_returned, 0);
  const returnPieData = [
    { name: 'Customer Returns', value: customerReturnQty },
    { name: 'RTO', value: rtoReturnQty },
  ].filter(d => d.value > 0);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="rounded-lg border bg-card p-3 shadow-lg text-sm">
        <p className="font-medium text-foreground mb-1">{label}</p>
        {payload.map((p: any, i: number) => (
          <div key={i} className="flex items-center gap-2">
            <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: p.color }} />
            <span className="text-muted-foreground">{p.name}:</span>
            <span className="font-medium text-foreground">{p.name === 'Orders' || p.name === 'Units' ? p.value : fmt(p.value)}</span>
          </div>
        ))}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-gradient-to-br from-primary/10 via-background to-primary/5 border-b">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary flex items-center justify-center">
                <BarChart3 className="h-6 w-6 text-primary-foreground" />
              </div>
              <h1 className="text-3xl font-bold tracking-tight text-foreground">SAVS BuyHub</h1>
            </div>
            <Button onClick={() => navigate('/login')} variant="outline" className="gap-2">
              <LogIn className="h-4 w-4" />Admin Login
            </Button>
          </div>
          <p className="text-lg text-muted-foreground">Sales Forecast & Business Intelligence</p>

          {/* KPI Cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mt-6">
            {[
              { title: 'Total Revenue', value: fmt(totalRevenue), icon: DollarSign, color: 'text-primary' },
              { title: 'Net Profit', value: fmt(netProfit), icon: ArrowUpRight, color: 'text-emerald-500' },
              { title: 'Orders / Units', value: `${totalOrders} / ${totalUnits.toLocaleString()}`, icon: ShoppingCart, color: 'text-amber-500' },
              { title: 'Return Rate', value: `${returnRate}%`, icon: AlertTriangle, color: 'text-destructive' },
            ].map(kpi => (
              <Card key={kpi.title} className="border-none shadow-md">
                <CardContent className="flex items-center gap-4 p-5">
                  <div className={`rounded-lg bg-muted p-2.5 ${kpi.color}`}><kpi.icon className="h-5 w-5" /></div>
                  <div>
                    <p className="text-sm text-muted-foreground">{kpi.title}</p>
                    <p className={`text-xl font-bold ${kpi.color}`}>{kpi.value}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 space-y-6">
        {/* Period selector */}
        <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-1 w-fit">
          {PERIOD_OPTIONS.map(p => (
            <Button key={p.value} variant={period === p.value ? 'default' : 'ghost'} size="sm" className="text-xs h-7 px-3"
              onClick={() => setPeriod(p.value)}>{p.label}</Button>
          ))}
        </div>

        {/* Revenue Trend & Forecast */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">Revenue & Profit Trend <Badge variant="secondary">AI Forecast</Badge></CardTitle>
            <CardDescription>Historical performance with 3-month projection</CardDescription>
          </CardHeader>
          <CardContent className="h-80">
            {combinedTrend.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={combinedTrend}>
                  <defs>
                    <linearGradient id="fRevGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(224, 76%, 48%)" stopOpacity={0.15} />
                      <stop offset="100%" stopColor="hsl(224, 76%, 48%)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="label" fontSize={11} tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                  <YAxis fontSize={11} tickFormatter={(v) => `₹${v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v}`} tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Area type="monotone" dataKey="revenue" stroke="hsl(224, 76%, 48%)" strokeWidth={2.5} fill="url(#fRevGrad)" name="Revenue" />
                  <Line type="monotone" dataKey="profit" stroke="hsl(142, 76%, 36%)" strokeWidth={2} name="Profit" dot={false} />
                  <Line type="monotone" dataKey="forecastRevenue" stroke="hsl(224, 76%, 48%)" strokeWidth={2} strokeDasharray="8 4" name="Forecast" dot={{ r: 4, fill: 'hsl(224, 76%, 48%)' }} />
                  <Legend />
                </ComposedChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-muted-foreground">No data yet</div>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Platform Performance */}
          <Card>
            <CardHeader><CardTitle className="text-base">Platform Performance</CardTitle><CardDescription>Revenue & profit by platform</CardDescription></CardHeader>
            <CardContent className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={platformData} barGap={4}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="platform" fontSize={12} tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                  <YAxis fontSize={11} tickFormatter={(v) => `₹${v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v}`} tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="revenue" name="Revenue" fill="hsl(224, 76%, 48%)" radius={[4, 4, 0, 0]} barSize={28} />
                  <Bar dataKey="profit" name="Profit" fill="hsl(142, 76%, 36%)" radius={[4, 4, 0, 0]} barSize={28} />
                  <Legend />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Returns */}
          <Card>
            <CardHeader><CardTitle className="text-base">Return Breakdown</CardTitle><CardDescription>Units returned by type</CardDescription></CardHeader>
            <CardContent className="h-72">
              {returnPieData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={returnPieData} cx="50%" cy="50%" innerRadius={45} outerRadius={75} dataKey="value" label={({ name, value }) => `${name}: ${value}`} labelLine={false}>
                      <Cell fill="hsl(38, 92%, 50%)" />
                      <Cell fill="hsl(0, 84%, 60%)" />
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
        </div>

        {/* Top Products */}
        <Card>
          <CardHeader><CardTitle className="text-base">Top Performing Products</CardTitle></CardHeader>
          <CardContent>
            {topProducts.length > 0 ? (
              <div className="space-y-3">
                {topProducts.map((p, i) => (
                  <div key={p.sku} className="flex items-center justify-between rounded-lg border p-3">
                    <div className="flex items-center gap-3">
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">{i + 1}</span>
                      <div><p className="font-medium text-foreground">{p.name}</p><p className="text-sm text-muted-foreground">{p.sku}</p></div>
                    </div>
                    <div className="text-right"><p className="font-semibold text-foreground">{fmt(p.revenue)}</p><p className="text-sm text-muted-foreground">{p.units} units</p></div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center text-muted-foreground py-8">No product data yet</p>
            )}
          </CardContent>
        </Card>

        {/* Forecast Cards */}
        {forecastMonths.length > 0 && avgRevenue > 0 && (
          <Card className="border-primary/20 bg-primary/5">
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><TrendingUp className="h-5 w-5 text-primary" />3-Month Forecast</CardTitle></CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-3">
                {forecastMonths.map((m: any) => (
                  <div key={m.label} className="rounded-lg border bg-card p-4 text-center">
                    <p className="text-sm text-muted-foreground">{m.label}</p>
                    <p className="text-xl font-bold text-primary mt-1">{fmt(m.revenue)}</p>
                    <p className="text-sm text-muted-foreground">{m.units} units est.</p>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-4">* Forecast based on 3-month moving average with {growthRate.toFixed(1)}% growth trend</p>
            </CardContent>
          </Card>
        )}

        <div className="text-center py-6 border-t">
          <p className="text-sm text-muted-foreground">© {new Date().getFullYear()} SAVS BuyHub. All data is live.</p>
        </div>
      </div>
    </div>
  );
}
