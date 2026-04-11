import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, Package, BarChart3, ShoppingCart } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Legend, PieChart, Pie, Cell } from 'recharts';

const COLORS = ['hsl(224, 76%, 48%)', 'hsl(142, 76%, 36%)', 'hsl(38, 92%, 50%)', 'hsl(0, 84%, 60%)'];

export default function Forecast() {
  const [sales, setSales] = useState<any[]>([]);
  const [inventory, setInventory] = useState<any[]>([]);
  const [returns, setReturns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      const [salesRes, invRes, retRes] = await Promise.all([
        supabase.from('sales').select('*, inventory(sku, product_name, average_cost_price)').order('dispatch_date', { ascending: false }),
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

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  const totalRevenue = sales.reduce((sum, s) => sum + s.quantity_sold * s.average_selling_price, 0);
  const totalUnits = sales.reduce((sum, s) => sum + s.quantity_sold, 0);
  const totalReturns = returns.length;
  const returnRate = totalUnits > 0 ? ((returns.reduce((s, r) => s + r.quantity_returned, 0) / totalUnits) * 100).toFixed(1) : '0';
  const totalProducts = inventory.length;

  // Platform breakdown
  const platformData = ['Meesho', 'Flipkart', 'Amazon', 'Offline'].map(p => ({
    platform: p,
    revenue: sales.filter(s => s.platform === p).reduce((sum, s) => sum + s.quantity_sold * s.average_selling_price, 0),
    units: sales.filter(s => s.platform === p).reduce((sum, s) => sum + s.quantity_sold, 0),
  }));

  // Monthly trend
  const monthlyMap: Record<string, { month: string; revenue: number; units: number }> = {};
  sales.forEach(s => {
    const month = s.dispatch_date?.slice(0, 7);
    if (!month) return;
    if (!monthlyMap[month]) monthlyMap[month] = { month, revenue: 0, units: 0 };
    monthlyMap[month].revenue += s.quantity_sold * s.average_selling_price;
    monthlyMap[month].units += s.quantity_sold;
  });
  const monthlyTrend = Object.values(monthlyMap).sort((a, b) => a.month.localeCompare(b.month));

  // Simple forecast: average of last 3 months projected forward
  const last3 = monthlyTrend.slice(-3);
  const avgRevenue = last3.length > 0 ? last3.reduce((s, m) => s + m.revenue, 0) / last3.length : 0;
  const avgUnits = last3.length > 0 ? last3.reduce((s, m) => s + m.units, 0) / last3.length : 0;
  const growthRate = last3.length >= 2 ? ((last3[last3.length - 1].revenue / last3[0].revenue - 1) * 100) : 0;

  // Next 3 months forecast
  const forecastMonths = [];
  const lastMonth = monthlyTrend.length > 0 ? monthlyTrend[monthlyTrend.length - 1].month : new Date().toISOString().slice(0, 7);
  for (let i = 1; i <= 3; i++) {
    const d = new Date(lastMonth + '-01');
    d.setMonth(d.getMonth() + i);
    const fm = d.toISOString().slice(0, 7);
    forecastMonths.push({
      month: fm,
      revenue: Math.round(avgRevenue * (1 + (growthRate / 100) * i * 0.3)),
      units: Math.round(avgUnits * (1 + (growthRate / 100) * i * 0.3)),
      forecast: true,
    });
  }

  const combinedTrend = [
    ...monthlyTrend.map(m => ({ ...m, forecast: false, forecastRevenue: undefined as number | undefined })),
    ...forecastMonths.map(m => ({ ...m, forecastRevenue: m.revenue, revenue: undefined as number | undefined })),
  ];

  // Top products
  const productSales: Record<string, { name: string; sku: string; units: number; revenue: number }> = {};
  sales.forEach(s => {
    const inv = s.inventory as any;
    if (!inv) return;
    if (!productSales[inv.sku]) productSales[inv.sku] = { name: inv.product_name, sku: inv.sku, units: 0, revenue: 0 };
    productSales[inv.sku].units += s.quantity_sold;
    productSales[inv.sku].revenue += s.quantity_sold * s.average_selling_price;
  });
  const topProducts = Object.values(productSales).sort((a, b) => b.revenue - a.revenue).slice(0, 5);

  const fmt = (n: number) => '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 0 });

  return (
    <div className="min-h-screen bg-background">
      {/* Hero */}
      <div className="bg-gradient-to-br from-primary/10 via-background to-primary/5 border-b">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="h-10 w-10 rounded-lg bg-primary flex items-center justify-center">
              <BarChart3 className="h-6 w-6 text-primary-foreground" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">SAVS BuyHub</h1>
          </div>
          <p className="text-lg text-muted-foreground mt-1">Sales Forecast & Business Intelligence</p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mt-8">
            {[
              { title: 'Total Revenue', value: fmt(totalRevenue), icon: TrendingUp, color: 'text-primary' },
              { title: 'Units Sold', value: totalUnits.toLocaleString(), icon: ShoppingCart, color: 'text-emerald-500' },
              { title: 'Products', value: totalProducts.toString(), icon: Package, color: 'text-amber-500' },
              { title: 'Return Rate', value: `${returnRate}%`, icon: BarChart3, color: 'text-destructive' },
            ].map(kpi => (
              <Card key={kpi.title} className="border-none shadow-md">
                <CardContent className="flex items-center gap-4 p-5">
                  <div className={`rounded-lg bg-muted p-2.5 ${kpi.color}`}>
                    <kpi.icon className="h-5 w-5" />
                  </div>
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

      {/* Charts */}
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 space-y-6">
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Revenue Trend + Forecast */}
          <Card className="lg:col-span-2">
            <CardHeader><CardTitle className="text-base flex items-center gap-2">Revenue Trend & Forecast <Badge variant="secondary">AI Projected</Badge></CardTitle></CardHeader>
            <CardContent className="h-80">
              {combinedTrend.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={combinedTrend}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" fontSize={12} />
                    <YAxis fontSize={12} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
                    <Tooltip formatter={(v: number) => fmt(v)} />
                    <Line type="monotone" dataKey="revenue" stroke="hsl(224, 76%, 48%)" strokeWidth={2} name="Actual Revenue" dot={{ r: 4 }} />
                    <Line type="monotone" dataKey="forecastRevenue" stroke="hsl(224, 76%, 48%)" strokeWidth={2} strokeDasharray="8 4" name="Forecast" dot={{ r: 4 }} />
                    <Legend />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center text-muted-foreground">No data yet</div>
              )}
            </CardContent>
          </Card>

          {/* Platform Revenue */}
          <Card>
            <CardHeader><CardTitle className="text-base">Revenue by Platform</CardTitle></CardHeader>
            <CardContent className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={platformData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="platform" fontSize={12} />
                  <YAxis fontSize={12} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: number) => fmt(v)} />
                  <Bar dataKey="revenue" fill="hsl(224, 76%, 48%)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Platform Units Pie */}
          <Card>
            <CardHeader><CardTitle className="text-base">Units by Platform</CardTitle></CardHeader>
            <CardContent className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={platformData.filter(p => p.units > 0)} cx="50%" cy="50%" outerRadius={80} dataKey="units" nameKey="platform" label>
                    {platformData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
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
                      <div>
                        <p className="font-medium text-foreground">{p.name}</p>
                        <p className="text-sm text-muted-foreground">{p.sku}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-foreground">{fmt(p.revenue)}</p>
                      <p className="text-sm text-muted-foreground">{p.units} units</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center text-muted-foreground py-8">No product data yet</p>
            )}
          </CardContent>
        </Card>

        {/* Forecast summary */}
        {forecastMonths.length > 0 && avgRevenue > 0 && (
          <Card className="border-primary/20 bg-primary/5">
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><TrendingUp className="h-5 w-5 text-primary" />3-Month Forecast</CardTitle></CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-3">
                {forecastMonths.map(m => (
                  <div key={m.month} className="rounded-lg border bg-card p-4 text-center">
                    <p className="text-sm text-muted-foreground">{m.month}</p>
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
          <p className="text-sm text-muted-foreground">© {new Date().getFullYear()} SAVS BuyHub. All data is live from our command center.</p>
        </div>
      </div>
    </div>
  );
}
