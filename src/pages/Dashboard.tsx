import { useSales, useReturns, useInventory } from '@/hooks/useData';
import { useSales, useReturns, useInventory } from '@/hooks/useData';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DollarSign, Clock, TrendingUp, AlertTriangle } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell, Legend } from 'recharts';

const COLORS = ['hsl(224, 76%, 48%)', 'hsl(142, 76%, 36%)', 'hsl(38, 92%, 50%)', 'hsl(0, 84%, 60%)'];

export default function Dashboard() {
  const { data: sales = [] } = useSales();
  const { data: returns = [] } = useReturns();
  const { data: inventory = [] } = useInventory();

  const totalRevenue = sales.reduce((sum, s) => sum + s.quantity_sold * s.average_selling_price, 0);
  const pendingPayments = sales
    .filter(s => s.payment_status === 'Pending')
    .reduce((sum, s) => sum + s.quantity_sold * s.average_selling_price, 0);
  const totalPenalties = returns.reduce((sum, r) => sum + r.penalty_amount, 0);
  const totalCost = sales.reduce((sum, s) => {
    const inv = s.inventory as any;
    return sum + s.quantity_sold * (inv?.average_cost_price ?? 0);
  }, 0);
  const netProfit = totalRevenue - totalCost - totalPenalties;

  // Revenue by platform
  const platformRevenue = ['Meesho', 'Flipkart', 'Amazon', 'Offline'].map(p => ({
    platform: p,
    revenue: sales.filter(s => s.platform === p).reduce((sum, s) => sum + s.quantity_sold * s.average_selling_price, 0),
  }));

  // Return breakdown
  const customerReturns = returns.filter(r => r.return_type === 'Customer Return').length;
  const rtoReturns = returns.filter(r => r.return_type === 'RTO').length;
  const returnPieData = [
    { name: 'Customer Returns', value: customerReturns || 0 },
    { name: 'RTO', value: rtoReturns || 0 },
  ].filter(d => d.value > 0);

  // Monthly P&L
  const monthlyData: Record<string, { month: string; revenue: number; cost: number; profit: number }> = {};
  sales.forEach(s => {
    const month = s.dispatch_date.slice(0, 7);
    if (!monthlyData[month]) monthlyData[month] = { month, revenue: 0, cost: 0, profit: 0 };
    const rev = s.quantity_sold * s.average_selling_price;
    const cost = s.quantity_sold * ((s.inventory as any)?.average_cost_price ?? 0);
    monthlyData[month].revenue += rev;
    monthlyData[month].cost += cost;
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

  const fmt = (n: number) => '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 0 });

  const kpis = [
    { title: 'Total Revenue', value: fmt(totalRevenue), icon: DollarSign, color: 'text-primary' },
    { title: 'Pending Payments', value: fmt(pendingPayments), icon: Clock, color: 'text-warning' },
    { title: 'Net Profit', value: fmt(netProfit), icon: TrendingUp, color: netProfit >= 0 ? 'text-success' : 'text-destructive' },
    { title: 'Total Penalties', value: fmt(totalPenalties), icon: AlertTriangle, color: 'text-destructive' },
  ];

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Dashboard</h2>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map(kpi => (
          <Card key={kpi.title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{kpi.title}</CardTitle>
              <kpi.icon className={`h-5 w-5 ${kpi.color}`} />
            </CardHeader>
            <CardContent>
              <p className={`text-2xl font-bold ${kpi.color}`}>{kpi.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Revenue by Platform</CardTitle></CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={platformRevenue}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="platform" fontSize={12} />
                <YAxis fontSize={12} tickFormatter={(v) => `₹${(v/1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: number) => fmt(v)} />
                <Bar dataKey="revenue" fill="hsl(224, 76%, 48%)" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Return Rate Breakdown</CardTitle></CardHeader>
          <CardContent className="h-72">
            {returnPieData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={returnPieData} cx="50%" cy="50%" outerRadius={80} dataKey="value" label>
                    {returnPieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-muted-foreground">No return data yet</div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-base">Profit & Loss Over Time</CardTitle></CardHeader>
          <CardContent className="h-72">
            {monthlyArr.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={monthlyArr}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" fontSize={12} />
                  <YAxis fontSize={12} tickFormatter={(v) => `₹${(v/1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: number) => fmt(v)} />
                  <Line type="monotone" dataKey="revenue" stroke="hsl(224, 76%, 48%)" strokeWidth={2} name="Revenue" />
                  <Line type="monotone" dataKey="profit" stroke="hsl(142, 76%, 36%)" strokeWidth={2} name="Profit" />
                  <Legend />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-muted-foreground">No sales data yet</div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
