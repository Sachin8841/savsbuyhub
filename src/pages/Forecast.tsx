import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { PageHeader, StatCard, SectionCard } from '@/components/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { TrendingUp, Package, BarChart3, ShoppingCart, LogIn, DollarSign, ArrowUpRight, LineChart } from 'lucide-react';
import { CartesianGrid, Tooltip, ResponsiveContainer, Line, Legend, ComposedChart, Area, AreaChart, XAxis, YAxis, Bar } from 'recharts';
import { useNavigate } from 'react-router-dom';
import { PeriodSelector, getFilterDate } from '@/components/DateRangePicker';
import { useAuthStore } from '@/stores/authStore';

const fmt = (n: number) => '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 0 });

export default function Forecast() {
  const [sharePrice, setSharePrice] = useState<number>(100);
  const [priceHistory, setPriceHistory] = useState<{ time: string; price: number }[]>([]);
  const [forecastData, setForecastData] = useState<any[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('max');
  const [dateRange, setDateRange] = useState<{ from?: Date; to?: Date }>({});
  const navigate = useNavigate();
  const { isAdmin } = useAuthStore();
  const admin = isAdmin();

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [priceRes, historyRes, forecastRes] = await Promise.all([
          supabase.rpc('get_public_share_price'),
          supabase.rpc('get_public_price_history'),
          supabase.rpc('get_public_forecast_data'),
        ]);
        if (priceRes.error || historyRes.error || forecastRes.error) {
          console.error({ priceErr: priceRes.error, histErr: historyRes.error, foreErr: forecastRes.error });
          throw new Error('Public database RPC functions are not installed.');
        }
        setSharePrice(priceRes.data ?? 100);
        setPriceHistory(historyRes.data ?? []);
        setForecastData((forecastRes.data as any) ?? []);
      } catch (err: any) {
        console.error(err);
        setErrorMsg('Please run the phase5_fixes.sql database migration script in your Supabase SQL Editor. The public forecast page requires secure RPC functions to operate.');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const { from: filterFrom, to: filterTo } = getFilterDate(period, dateRange);

  const filteredData = useMemo(() => {
    if (!filterFrom) return forecastData;
    const fromStr = `${filterFrom.getFullYear()}-${(filterFrom.getMonth() + 1).toString().padStart(2, '0')}`;
    const toStr = filterTo ? `${filterTo.getFullYear()}-${(filterTo.getMonth() + 1).toString().padStart(2, '0')}` : null;
    return forecastData.filter((d: any) => {
      return d.label >= fromStr && (!toStr || d.label <= toStr);
    });
  }, [forecastData, filterFrom, filterTo]);

  const totalRevenue = useMemo(() => filteredData.reduce((sum, d) => sum + Number(d.revenue || 0), 0), [filteredData]);
  const totalUnits = useMemo(() => filteredData.reduce((sum, d) => sum + Number(d.units || 0), 0), [filteredData]);
  const totalOrders = useMemo(() => filteredData.reduce((sum, d) => sum + Number(d.orders || 0), 0), [filteredData]);
  const totalInvestment = useMemo(() => filteredData.reduce((sum, d) => sum + Number(d.investment || 0), 0), [filteredData]);
  const netProfit = useMemo(() => filteredData.reduce((sum, d) => sum + Number(d.profit || 0), 0), [filteredData]);
  const profitPerUnit = totalUnits > 0 ? netProfit / totalUnits : 0;

  const trendData = useMemo(() => {
    return filteredData.map((d: any) => ({
      label: d.label,
      revenue: Number(d.revenue || 0),
      investment: Number(d.investment || 0),
      profit: Number(d.profit || 0),
      units: Number(d.units || 0),
      orders: Number(d.orders || 0),
      profitPerUnit: d.units > 0 ? Math.round(Number(d.profit || 0) / d.units) : 0,
    }));
  }, [filteredData]);

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

  const combinedTrend = [
    ...trendData.map(m => ({ ...m, forecastRevenue: undefined as number | undefined })),
    ...forecastMonths.map(m => ({ ...m, forecastRevenue: m.revenue, revenue: undefined as number | undefined, profit: undefined, investment: 0, orders: 0, profitPerUnit: 0 })),
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
      <div className="bg-gradient-to-br from-indigo-950 via-slate-900 to-indigo-900 text-white border-b">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between mb-8 flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-xl bg-white flex items-center justify-center shadow-lg border border-slate-700 p-1.5 shrink-0">
                <img src="/savs-logo-placeholder.png" alt="SAVS Logo" className="h-full w-full object-contain" />
              </div>
              <h1 className="text-3xl font-extrabold tracking-tight text-white">SAVS BuyHub</h1>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <Button onClick={() => navigate('/login')} className="bg-white/10 hover:bg-white/20 text-white border-none gap-2 rounded-full px-6">
                <LogIn className="h-4 w-4" /> Admin Login
              </Button>
            </div>
          </div>
          
          <div className="max-w-3xl py-8">
            <Badge className="bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 mb-6 border-emerald-500/30 px-3 py-1 text-sm">Public Transparency Portal</Badge>
            <h2 className="text-4xl sm:text-5xl font-black tracking-tight mb-6 leading-tight">
              Real-time Business Intelligence & <span className="text-emerald-400">Sales Forecasting</span>
            </h2>
            <p className="text-lg text-slate-300 mb-8 leading-relaxed max-w-2xl">
              Welcome to the SAVS BuyHub public ledger. We believe in complete financial transparency. Explore our live sales data, revenue trends, and dynamic share valuation.
            </p>
            <div className="flex items-center gap-4 flex-wrap mt-8">
              <PeriodSelector value={period} onChange={setPeriod} dateRange={dateRange} onDateRangeChange={setDateRange} />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5 mt-10">
            {[
              { title: 'Total Revenue', value: fmt(totalRevenue), icon: DollarSign, color: 'text-emerald-400' },
              { title: 'Investment', value: fmt(totalInvestment), icon: Package, color: 'text-amber-400' },
              { title: 'Net Profit', value: fmt(netProfit), icon: ArrowUpRight, color: 'text-emerald-400' },
              { title: 'Profit/Unit', value: fmt(Math.round(profitPerUnit)), icon: TrendingUp, color: profitPerUnit >= 0 ? 'text-emerald-400' : 'text-red-400' },
              { title: 'Orders / Units', value: `${totalOrders} / ${totalUnits.toLocaleString()}`, icon: ShoppingCart, color: 'text-indigo-300' },
            ].map(kpi => (
              <Card key={kpi.title} className="border-none bg-white/5 backdrop-blur-sm shadow-none">
                <CardContent className="flex items-center gap-4 p-5">
                  <div className={`rounded-lg bg-white/10 p-2.5 ${kpi.color}`}><kpi.icon className="h-5 w-5" /></div>
                  <div>
                    <p className="text-sm text-slate-400">{kpi.title}</p>
                    <p className={`text-xl font-bold ${kpi.color}`}>{kpi.value}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 space-y-6">
        {errorMsg && (
          <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 text-destructive text-sm space-y-2">
            <p className="font-semibold flex items-center gap-2">⚠️ Database Migration Required</p>
            <p className="text-muted-foreground">{errorMsg}</p>
            <p className="text-xs font-mono bg-muted p-2 rounded border max-w-lg">
              {"To resolve this: Open your Supabase Dashboard -> SQL Editor -> Create New Query -> Paste all contents of \"phase5_fixes.sql\" and click \"Run\"."}
            </p>
          </div>
        )}
           {/* Live Market Share Price & History */}
        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-1 bg-gradient-to-b from-indigo-950 to-slate-900 border-none shadow-xl text-white">
            <CardContent className="p-8 flex flex-col justify-center h-full space-y-6">
              <div>
                <Badge className="bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 mb-4 border-emerald-500/30">Live Market</Badge>
                <h2 className="text-3xl font-bold mb-2">SAVS Share Price</h2>
                <div className="flex items-end gap-2">
                  <span className="text-5xl font-black text-emerald-400">₹{sharePrice}</span>
                  <span className="text-sm text-slate-400 mb-1">/ share</span>
                </div>
              </div>
              <p className="text-slate-300 leading-relaxed text-sm">
                Our share price is dynamically calculated based on real-time net assets, revenue, and profit margins. Every sale increases our equity value.
              </p>
            </CardContent>
          </Card>
          
        <SectionCard title="Price History" description="Historical valuation based on daily performance" className="lg:col-span-2">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={priceHistory}>
                <defs>
                  <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="time" fontSize={12} tickLine={false} axisLine={false} tick={{ fill: 'hsl(var(--muted-foreground))' }} minTickGap={30} />
                <YAxis domain={['auto', 'auto']} tickFormatter={(v) => `₹${v}`} fontSize={12} tickLine={false} axisLine={false} tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                <Tooltip 
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)' }}
                  itemStyle={{ color: '#10b981', fontWeight: 'bold' }}
                />
                <Area dataKey="price" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorPrice)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>
        </div>

        <SectionCard title="Revenue & Profit Trend" description="Investment, revenue, profit & units with 3-month projection" action={<Badge variant="secondary" className="bg-indigo-500/20 text-indigo-400">AI Forecast</Badge>}>
          <div className="h-80">
            {combinedTrend.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={combinedTrend}>
                  <defs>
                    <linearGradient id="fRevGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(224, 76%, 48%)" stopOpacity={0.2} />
                      <stop offset="100%" stopColor="hsl(224, 76%, 48%)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="label" fontSize={10} tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                  <YAxis yAxisId="money" fontSize={10} tickFormatter={(v) => `₹${v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v}`} tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                  <YAxis yAxisId="count" orientation="right" fontSize={10} tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Area yAxisId="money" dataKey="revenue" stroke="hsl(224, 76%, 48%)" strokeWidth={2.5} fill="url(#fRevGrad)" name="Revenue" />
                  <Line yAxisId="money" dataKey="investment" stroke="hsl(38, 92%, 50%)" strokeWidth={2} name="Investment" dot={false} />
                  <Line yAxisId="money" dataKey="profit" stroke="hsl(142, 76%, 36%)" strokeWidth={2} name="Profit" dot={false} />
                  <Line yAxisId="money" dataKey="forecastRevenue" stroke="hsl(224, 76%, 48%)" strokeWidth={2} strokeDasharray="8 4" name="Forecast" dot={{ r: 4, fill: 'hsl(224, 76%, 48%)' }} />
                  <Bar yAxisId="count" dataKey="units" name="Units" fill="hsl(280, 68%, 50%)" opacity={0.4} barSize={12} />
                  <Legend />
                </ComposedChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-muted-foreground">No data yet</div>
            )}
          </div>
        </SectionCard>

        {/* 3-Month Forecast Cards */}
        {forecastMonths.length > 0 && (
          <div>
            <h3 className="text-lg font-semibold mb-3 flex items-center gap-2"><TrendingUp className="h-5 w-5 text-primary" />3-Month Forecast</h3>
            <div className="grid gap-4 sm:grid-cols-3">
              {forecastMonths.map((m, i) => (
                <Card key={m.label} className="border-primary/20">
                  <CardContent className="p-5">
                    <p className="text-sm text-muted-foreground">{m.label}</p>
                    <p className="text-2xl font-bold text-primary mt-1">{fmt(m.revenue)}</p>
                    <p className="text-sm text-muted-foreground">{m.units} projected units</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {!admin && (
          <div className="mt-8 p-6 bg-slate-900 border border-slate-700 rounded-xl text-sm flex flex-col gap-3 shadow-2xl">
            <h3 className="text-emerald-400 font-bold uppercase tracking-wider text-xs">Official Contact & Support</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-slate-300"><strong className="text-white">HQ Address:</strong> Erode-638004, Tamil Nadu, India</p>
                <p className="text-slate-300"><strong className="text-white">Branches:</strong> Coimbatore | Bangalore | Salem</p>
                <div className="flex flex-col gap-1 mt-2 text-slate-400">
                  <span className="flex items-center gap-2 text-emerald-400">📞 <span className="text-slate-300 hover:text-white transition-colors +=1 font-semibold">+91 8903228758</span></span>
                  <span className="flex items-center gap-2 text-emerald-400">📞 <span className="text-slate-300 hover:text-white transition-colors +=1 font-semibold">+91 9865424458</span></span>
                  <span className="flex items-center gap-2 text-emerald-400">📞 <span className="text-slate-300 hover:text-white transition-colors +=1 font-semibold">+91 6383936883</span></span>
                </div>
              </div>
              <div className="flex flex-col gap-2 justify-center text-slate-400">
                <span className="flex items-center gap-2 text-indigo-400">✉️ <span className="text-slate-300 hover:text-white transition-colors cursor-pointer font-semibold">savsgroupofficial@gmail.com</span></span>
                <span className="flex items-center gap-2 text-indigo-400">✉️ <span className="text-slate-300 hover:text-white transition-colors cursor-pointer font-semibold">savsgroup.help@gmail.com</span></span>
                <span className="flex items-center gap-2 text-indigo-400">✉️ <span className="text-slate-300 hover:text-white transition-colors cursor-pointer font-semibold">savsbuyhubofficial@gmail.com</span></span>
                <span className="flex items-center gap-2 text-indigo-400">✉️ <span className="text-slate-300 hover:text-white transition-colors cursor-pointer font-semibold">savsglobalventureofficial@gmail.com</span></span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
