import { useSales, useReturns, useInventory } from '@/hooks/useData';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { DollarSign, Clock, TrendingUp, AlertTriangle, Package, ShoppingCart, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell, Legend, AreaChart, Area } from 'recharts';

const COLORS = ['hsl(224, 76%, 48%)', 'hsl(142, 76%, 36%)', 'hsl(38, 92%, 50%)', 'hsl(0, 84%, 60%)'];

export default function Dashboard() {
  const { data: sales = [] } = useSales();
  const { data: returns = [] } = useReturns();
  const { data: inventory = [] } = useInventory();

  const totalRevenue = sales.reduce((sum, s) => sum + s.quantity_sold * s.average_selling_price, 0);
  const totalUnits = sales.reduce((sum, s) => sum + s.quantity_sold, 0);
  const pendingPayments = sales
    .filter(s => s.payment_status === 'Pending')
    .reduce((sum, s) => sum + s.quantity_sold * s.average_selling_price, 0);
  const totalPenalties = returns.reduce((sum, r) => sum + r.penalty_amount, 0);
  const totalCost = sales.reduce((sum, s) => {
    const inv = s.inventory as any;
    return sum + s.quantity_sold * (inv?.average_cost_price ?? 0);
  }, 0);
  const netProfit = totalRevenue - totalCost - totalPenalties;
  const profitMargin = totalRevenue > 0 ? ((netProfit / totalRevenue) * 100).toFixed(1) : '0';
  const returnRate = totalUnits > 0 ? ((returns.reduce((s, r) => s + r.quantity_returned, 0) / totalUnits) * 100).toFixed(1) : '0';

  // Platform revenue
  const platformRevenue = ['Meesho', 'Flipkart', 'Amazon', 'Offline'].map(p => ({
    platform: p,
    revenue: sales.filter(s => s.platform === p).reduce((sum, s) => sum + s.quantity_sold * s.average_selling_price, 0),
    units: sales.filter(s => s.platform === p).reduce((sum, s) => sum + s.quantity_sold, 0),
  }));

  // Return breakdown
  const customerReturns = returns.filter(r => r.return_type === 'Customer Return').length;
  const rtoReturns = returns.filter(r => r.return_type === 'RTO').length;
  const returnPieData = [
    { name: 'Customer Returns', value: customerReturns || 0 },
    { name: 'RTO', value: rtoReturns || 0 },
  ].filter(d => d.value > 0);

  // Monthly P&L
  const monthlyData: Record<string, { month: string; revenue: number; cost: number; profit: number; units: number }> = {};
  sales.forEach(s => {
    const month = s.dispatch_date?.slice(0, 7);
    if (!month) return;
    if (!monthlyData[month]) monthlyData[month] = { month, revenue: 0, cost: 0, profit: 0, units: 0 };
    const rev = s.quantity_sold * s.average_selling_price;
    const cost = s.quantity_sold * ((s.inventory as any)?.average_cost_price ?? 0);
    monthlyData[month].revenue += rev;
    monthlyData[month].cost += cost;
    monthlyData[month].units += s.quantity_sold;
  });
  returns.forEach(r => {
    const sale = r.sales as any;
    if (sale) {
      const month = sale.dispatch_date?.slice(0, 7);
      if (month && monthlyData[month]) {
        monthlyData[month].cost += r.penalty_amount;
      }
    }
  });
  const monthlyArr = Object.values(monthlyData).sort((a, b) => a.month.localeCompare(b.month));
  monthlyArr.forEach(m => { m.profit = m.revenue - m.cost; });

  // Recent sales
  const recentSales = sales.slice(0, 5);

  const fmt = (n: number) => '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 0 });

  const kpis = [
    { title: 'Total Revenue', value: fmt(totalRevenue), icon: DollarSign, color: 'text-primary', bg: 'bg-primary/10' },
    { title: 'Net Profit', value: fmt(netProfit), subtitle: `${profitMargin}% margin`, icon: netProfit >= 0 ? ArrowUpRight : ArrowDownRight, color: netProfit >= 0 ? 'text-emerald-600' : 'text-destructive', bg: netProfit >= 0 ? 'bg-emerald-50' : 'bg-destructive/10' },
    { title: 'Pending Payments', value: fmt(pendingPayments), icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50' },
    { title: 'Total Penalties', value: fmt(totalPenalties), subtitle: `${returnRate}% return rate`, icon: AlertTriangle, color: 'text-destructive', bg: 'bg-destructive/10' },
    { title: 'Units Sold', value: totalUnits.toLocaleString(), icon: ShoppingCart, color: 'text-primary', bg: 'bg-primary/10' },
    { title: 'Products', value: inventory.length.toString(), icon: Package, color: 'text-emerald-600', bg: 'bg-emerald-50' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Dashboard</h2>
          <p className="text-muted-foreground">SAVS BuyHub — Sales Command Center Overview</p>
        </div>
        <Badge variant="outline" className="text-xs">Live Data</Badge>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {kpis.map(kpi => (
          <Card key={kpi.title} className="border-none shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className={`rounded-lg p-2 ${kpi.bg}`}>
                  <kpi.icon className={`h-4 w-4 ${kpi.color}`} />
                </div>
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

      {/* Charts Row 1 */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Revenue & Profit Trend</CardTitle>
            <CardDescription>Monthly performance overview</CardDescription>
          </CardHeader>
          <CardContent className="h-72">
            {monthlyArr.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={monthlyArr}>
                  <defs>
                    <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(224, 76%, 48%)" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="hsl(224, 76%, 48%)" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="colorProfit" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(142, 76%, 36%)" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="hsl(142, 76%, 36%)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" fontSize={11} />
                  <YAxis fontSize={11} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: number) => fmt(v)} />
                  <Area type="monotone" dataKey="revenue" stroke="hsl(224, 76%, 48%)" fill="url(#colorRevenue)" strokeWidth={2} name="Revenue" />
                  <Area type="monotone" dataKey="profit" stroke="hsl(142, 76%, 36%)" fill="url(#colorProfit)" strokeWidth={2} name="Profit" />
                  <Legend />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-muted-foreground">No sales data yet</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Return Breakdown</CardTitle>
            <CardDescription>Customer Returns vs RTO</CardDescription>
          </CardHeader>
          <CardContent className="h-72">
            {returnPieData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={returnPieData} cx="50%" cy="50%" innerRadius={40} outerRadius={70} dataKey="value" label>
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
      </div>

      {/* Charts Row 2 */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Revenue by Platform</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={platformRevenue}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="platform" fontSize={12} />
                <YAxis fontSize={12} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: number) => fmt(v)} />
                <Bar dataKey="revenue" fill="hsl(224, 76%, 48%)" radius={[6, 6, 0, 0]} name="Revenue" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Recent Sales */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Recent Sales</CardTitle>
            <CardDescription>Latest 5 transactions</CardDescription>
          </CardHeader>
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
