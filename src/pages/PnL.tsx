import { useState, useMemo } from 'react';
import { useSales, useReturns, useInventory, useAdExpenses, useCapitalAccounts, useCashMovements, useCurrentStocks } from '@/hooks/useData';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Download, FileText } from 'lucide-react';
import { PeriodSelector, getFilterDate } from '@/components/DateRangePicker';
import { exportToXlsx } from '@/lib/xlsx-export';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { PageHeader, StatCard, SectionCard } from '@/components/PageHeader';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertTriangle, TrendingUp, TrendingDown, DollarSign, Landmark } from 'lucide-react';
import { useEffect } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid, Line, Area, AreaChart } from 'recharts';

const fmt = (n: number) => '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 0 });

export default function PnL() {
  const { data: sales = [] } = useSales();
  const { data: returns = [] } = useReturns();
  const { data: inventory = [] } = useInventory();
  const { data: adExpenses = [] } = useAdExpenses();
  const { data: capital } = useCapitalAccounts();
  const { data: cashMovements = [] } = useCashMovements();
  const [period, setPeriod] = useState('month');
  const [dateRange, setDateRange] = useState<{ from?: Date; to?: Date }>({});
  const [disclosureOpen, setDisclosureOpen] = useState(false);
  const [disclosureConfirm, setDisclosureConfirm] = useState('');
  const [disclosureNotes, setDisclosureNotes] = useState('');
  const [dividendDeclared, setDividendDeclared] = useState<number | ''>('');

  
  const [disclosedPeriods, setDisclosedPeriods] = useState<any[]>([]);
  const [selectedDisclosedPeriod, setSelectedDisclosedPeriod] = useState<string>('active');
  const currentStocks = useCurrentStocks();

  const qc = useQueryClient();
  const { toast } = useToast();

  useEffect(() => {
    supabase.from('disclosed_periods').select('*').order('created_at', { ascending: false }).then(res => {
      if (res.data) setDisclosedPeriods(res.data);
    });
  }, []);

  // Determine which data to use (Active ledger vs Archived snapshot)
  const activePeriod = selectedDisclosedPeriod === 'active' ? null : disclosedPeriods.find(p => p.id === selectedDisclosedPeriod);
  
  const currentSales = activePeriod ? activePeriod.sales_data : sales;
  const currentReturns = activePeriod ? activePeriod.returns_data : returns;
  const currentAdExpenses = activePeriod ? activePeriod.ad_expenses_data : adExpenses;

  const { from: filterFrom, to: filterTo } = getFilterDate(period, dateRange);

  const inRange = (dateStr: string) => {
    if (!filterFrom) return true;
    const d = new Date(dateStr);
    return d >= filterFrom && (!filterTo || d <= filterTo);
  };

  const filteredSales = currentSales.filter((s: any) => inRange(s.dispatch_date) && s.payment_status !== 'Cancelled');
  const filteredReturns = currentReturns.filter((r: any) => inRange(r.return_date));
  const filteredAdExpenses = currentAdExpenses.filter((e: any) => inRange(e.expense_date));

  const pnl = useMemo(() => {
    const currentInventory = activePeriod ? activePeriod.inventory_snapshot || [] : inventory;

    const returnedRevenue = filteredReturns.reduce((sum, r) => {
      const sale = currentSales.find((s: any) => s.id === r.sales_id);
      return sum + r.quantity_returned * (sale?.average_selling_price ?? 0);
    }, 0);

    const returnedCogs = filteredReturns.reduce((sum, r) => {
      const sale = currentSales.find((s: any) => s.id === r.sales_id);
      const invId = r.inventory_id || sale?.inventory_id;
      const inv = currentInventory.find((i: any) => i.id === invId);
      const costPrice = sale?.cost_price ?? inv?.average_cost_price ?? 0;
      return sum + r.quantity_returned * costPrice;
    }, 0);
    
    const revenue = filteredSales.reduce((sum, s) => sum + s.quantity_sold * s.average_selling_price, 0) - returnedRevenue;
    const units = filteredSales.reduce((sum, s) => sum + s.quantity_sold, 0);
    const cogs = filteredSales.reduce((sum, s) => {
      const inv = currentInventory.find((i: any) => i.id === s.inventory_id);
      const costPrice = s.cost_price ?? inv?.average_cost_price ?? 0;
      return sum + s.quantity_sold * costPrice;
    }, 0) - returnedCogs;
    const deliveryFees = filteredSales.reduce((sum, s) => {
      const inv = currentInventory.find((i: any) => i.id === s.inventory_id);
      const feePerUnit = inv ? (inv.delivery_fee || 0) / (inv.total_bulk_stock_in || 1) : 0;
      return sum + s.quantity_sold * feePerUnit;
    }, 0);
    const grossProfit = revenue - cogs;
    const returnPenalties = filteredReturns.reduce((sum, r) => sum + r.penalty_amount, 0);
    const returnedUnits = filteredReturns.reduce((sum, r) => sum + r.quantity_returned, 0);
    
    const filteredInventoryForDelivery = filterFrom
      ? currentInventory.filter((i: any) => !i.stock_added_date || new Date(i.stock_added_date) >= filterFrom)
      : currentInventory;
    const inventoryDeliveryFees = filteredInventoryForDelivery.reduce((sum: number, i: any) => sum + (i.delivery_fee || 0), 0);

    const adSpend = filteredAdExpenses.filter(e => e.category === 'Ads' || !e.category).reduce((sum, e) => sum + e.amount, 0);
    const freightExpenses = filteredAdExpenses.filter(e => e.category === 'Delivery/Freight').reduce((sum, e) => sum + e.amount, 0);
    const packagingExpenses = filteredAdExpenses.filter(e => e.category === 'Packaging').reduce((sum, e) => sum + e.amount, 0);
    const otherExpenses = filteredAdExpenses.filter(e => !['Ads', 'Delivery/Freight', 'Packaging'].includes(e.category) && e.category).reduce((sum, e) => sum + e.amount, 0);

    const totalExpenses = deliveryFees + inventoryDeliveryFees + returnPenalties + adSpend + freightExpenses + packagingExpenses + otherExpenses;
    const netProfit = grossProfit - totalExpenses;
    const netUnits = units - returnedUnits;
    const profitPerUnit = netUnits > 0 ? netProfit / netUnits : 0;

    // Platform breakdown
    const platforms = ['Meesho', 'Flipkart', 'Amazon', 'Offline'].map(p => {
      const pSales = filteredSales.filter(s => s.platform === p);
      const pRev = pSales.reduce((sum, s) => sum + s.quantity_sold * s.average_selling_price, 0);
      const pCost = pSales.reduce((sum, s) => {
        const inv = currentInventory.find((i: any) => i.id === s.inventory_id);
        const cp = s.cost_price ?? inv?.average_cost_price ?? 0;
        return sum + s.quantity_sold * cp;
      }, 0);
      const pUnits = pSales.reduce((sum, s) => sum + s.quantity_sold, 0);
      return { platform: p, revenue: pRev, cost: pCost, profit: pRev - pCost, units: pUnits };
    }).filter(p => p.revenue > 0);

    const stockHoldingValue = currentInventory.reduce((sum: number, item: any) => {
      const stock = activePeriod ? (item.total_bulk_stock_in || 0) : (currentStocks[item.id] ?? 0);
      return sum + stock * (item.average_cost_price || 0);
    }, 0);

    return { revenue, units, cogs, deliveryFees, inventoryDeliveryFees, grossProfit, returnPenalties, returnedUnits, adSpend, freightExpenses, packagingExpenses, otherExpenses, totalExpenses, netProfit, profitPerUnit, platforms, stockHoldingValue };
  }, [filteredSales, filteredReturns, filteredAdExpenses, currentStocks, activePeriod, inventory]);

  // -------- Monthly trend (last 6 months in filtered range) --------
  const monthlyTrend = useMemo(() => {
    const buckets: Record<string, { month: string; revenue: number; cogs: number; expenses: number; profit: number }> = {};
    const key = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = (d: Date) => d.toLocaleString('en-US', { month: 'short', year: '2-digit' });
    const ensure = (d: Date) => {
      const k = key(d);
      if (!buckets[k]) buckets[k] = { month: label(d), revenue: 0, cogs: 0, expenses: 0, profit: 0 };
      return buckets[k];
    };
    const currentInventory = activePeriod ? activePeriod.inventory_snapshot || [] : inventory;
    filteredSales.forEach((s: any) => {
      if (!s.dispatch_date) return;
      const b = ensure(new Date(s.dispatch_date));
      const inv = currentInventory.find((i: any) => i.id === s.inventory_id);
      const cp = s.cost_price ?? inv?.average_cost_price ?? 0;
      b.revenue += s.quantity_sold * s.average_selling_price;
      b.cogs += s.quantity_sold * cp;
    });
    filteredReturns.forEach((r: any) => {
      if (!r.return_date) return;
      const b = ensure(new Date(r.return_date));
      b.expenses += r.penalty_amount || 0;
    });
    filteredAdExpenses.forEach((e: any) => {
      if (!e.expense_date) return;
      const b = ensure(new Date(e.expense_date));
      b.expenses += e.amount || 0;
    });
    currentInventory.forEach((i: any) => {
      if (!i.stock_added_date || !i.delivery_fee) return;
      const b = ensure(new Date(i.stock_added_date));
      b.expenses += i.delivery_fee || 0;
    });
    Object.values(buckets).forEach(b => { b.profit = b.revenue - b.cogs - b.expenses; });
    return Object.entries(buckets).sort(([a], [b]) => a.localeCompare(b)).slice(-6).map(([, v]) => v);
  }, [filteredSales, filteredReturns, filteredAdExpenses, activePeriod, inventory]);

  // -------- Per-SKU profitability --------
  const skuPnl = useMemo(() => {
    const currentInventory = activePeriod ? activePeriod.inventory_snapshot || [] : inventory;
    const map: Record<string, { sku: string; product: string; units: number; revenue: number; cogs: number; returns: number; penalties: number; profit: number; margin: number; returnRate: number }> = {};
    filteredSales.forEach((s: any) => {
      const inv = currentInventory.find((i: any) => i.id === s.inventory_id);
      if (!inv) return;
      const id = inv.id;
      const cp = s.cost_price ?? inv.average_cost_price ?? 0;
      const row = map[id] || (map[id] = { sku: inv.sku, product: inv.product_name, units: 0, revenue: 0, cogs: 0, returns: 0, penalties: 0, profit: 0, margin: 0, returnRate: 0 });
      row.units += s.quantity_sold;
      row.revenue += s.quantity_sold * s.average_selling_price;
      row.cogs += s.quantity_sold * cp;
    });
    filteredReturns.forEach((r: any) => {
      const invId = r.inventory_id || currentSales.find((s: any) => s.id === r.sales_id)?.inventory_id;
      if (!invId || !map[invId]) return;
      map[invId].returns += r.quantity_returned;
      map[invId].penalties += r.penalty_amount || 0;
    });
    return Object.values(map).map(r => {
      r.profit = r.revenue - r.cogs - r.penalties;
      r.margin = r.revenue > 0 ? (r.profit / r.revenue) * 100 : 0;
      r.returnRate = r.units > 0 ? (r.returns / r.units) * 100 : 0;
      return r;
    }).sort((a, b) => b.profit - a.profit);
  }, [filteredSales, filteredReturns, activePeriod, inventory, currentSales]);

  // -------- Payment status breakdown --------
  const paymentBreakdown = useMemo(() => {
    const groups: Record<string, { status: string; orders: number; value: number }> = {};
    filteredSales.forEach((s: any) => {
      const st = s.payment_status || 'Unknown';
      const g = groups[st] || (groups[st] = { status: st, orders: 0, value: 0 });
      g.orders += 1;
      g.value += s.quantity_sold * s.average_selling_price;
    });
    return Object.values(groups).sort((a, b) => b.value - a.value);
  }, [filteredSales]);

  const historicalTotals = useMemo(() => disclosedPeriods.reduce((acc, p) => {
    acc.netProfit += Number(p.net_profit ?? 0);
    acc.netWorth = Math.max(acc.netWorth, Number(p.net_worth ?? 0));
    return acc;
  }, { netProfit: 0, netWorth: 0 }), [disclosedPeriods]);

  const liveHotCash = Number(capital?.hot_cash ?? 0);
  const liveAccountValue = Number(capital?.account_holding_value ?? 0);
  const liveNetWorth = liveHotCash + liveAccountValue + pnl.stockHoldingValue;

  const lineItems = [
    { label: 'Sales Revenue', value: pnl.revenue, bold: true, type: 'income' as const },
    { label: `  Units Sold`, value: pnl.units, isMeta: true },
    { label: 'Cost of Goods Sold (COGS)', value: -pnl.cogs, type: 'expense' as const },
    { label: 'Gross Profit', value: pnl.grossProfit, bold: true, type: 'subtotal' as const },
    { label: 'Outbound Delivery Fees (Couriers)', value: -pnl.deliveryFees, type: 'expense' as const },
    { label: 'Inventory Delivery / Inbound Freight', value: -pnl.inventoryDeliveryFees, type: 'expense' as const },
    { label: `Return Penalties (${pnl.returnedUnits} units)`, value: -pnl.returnPenalties, type: 'expense' as const },
    { label: 'Advertising & Marketing', value: -pnl.adSpend, type: 'expense' as const },
    { label: 'Inbound Freight & Dealer Delivery', value: -pnl.freightExpenses, type: 'expense' as const },
    { label: 'Packaging Costs', value: -pnl.packagingExpenses, type: 'expense' as const },
    { label: 'Other General Expenses', value: -pnl.otherExpenses, type: 'expense' as const },
    { label: 'Total Operating Expenses', value: -pnl.totalExpenses, bold: true, type: 'subtotal' as const },
    { label: 'Net Profit / (Loss)', value: pnl.netProfit, bold: true, type: 'total' as const },
    { label: 'Profit Per Unit', value: pnl.profitPerUnit, bold: true, type: 'total' as const },
    { label: 'Total Capital Outlay (Expenses + COGS)', value: -(pnl.cogs + pnl.totalExpenses), bold: true, type: 'expense' as const },
    { label: 'Capital Tied Up in Unsold Inventory (Asset)', value: pnl.stockHoldingValue, bold: true, type: 'income' as const },
  ];

  const handleExport = () => {
    exportToXlsx({
      filename: `SAVS_PnL_Statement_${new Date().toISOString().slice(0, 10)}.xlsx`,
      sheetName: 'P&L Statement',
      title: 'SAVS BuyHub - Profit & Loss Statement',
      rows: lineItems.map(item => ({
        'Line Item': item.label,
        'Amount (₹)': item.isMeta ? item.value : Math.abs(item.value),
        'Type': item.isMeta ? 'Units' : (item.value ?? 0) >= 0 ? 'Income' : 'Expense',
      })),
    });
  };

  const handleMonthlyDisclosure = async () => {
    const confirmationText = disclosureConfirm.trim().toLowerCase();
    const allowedConfirmations = ['cmo approval', 'approve', 'confirm', 'cmo', 'yes'];
    if (!allowedConfirmations.includes(confirmationText)) {
      toast({ 
        title: 'Confirmation Required', 
        description: 'Please type "CMO Approval" or "confirm" in the confirmation field to proceed.', 
        variant: 'destructive' 
      });
      return;
    }

    try {
      const { error: rpcError } = await supabase.rpc('execute_monthly_disclosure', {
        _period_name: `Period ending ${new Date().toLocaleDateString()}`,
        _notes: disclosureNotes,
        _dividend_declared: dividendDeclared === '' ? 0 : dividendDeclared
      });

      if (rpcError) throw new Error(`Archiving Failed: ${rpcError.message}`);

      // Refresh data
      qc.invalidateQueries({ queryKey: ['sales'] });
      qc.invalidateQueries({ queryKey: ['returns'] });
      qc.invalidateQueries({ queryKey: ['ad_expenses'] });
      qc.invalidateQueries({ queryKey: ['inventory'] });
      
      const res = await supabase.from('disclosed_periods').select('*').order('created_at', { ascending: false });
      if (res.data) setDisclosedPeriods(res.data);

      toast({ title: 'Monthly Disclosure Complete', description: 'Financial period saved with net profit, stock value, cash balances, and net worth.' });
      setDisclosureOpen(false);
      setDisclosureConfirm('');
      setDisclosureNotes('');
      setDividendDeclared('');
    } catch (err: any) {
      const isSchemaError = err.message?.toLowerCase().includes('column') || err.message?.toLowerCase().includes('function') || err.message?.toLowerCase().includes('relation');
      toast({ 
        title: 'Disclosure Halted', 
        description: (
          <div className="space-y-2 text-sm text-left">
            <p>{err.message || String(err)}</p>
            {isSchemaError && (
              <div className="bg-slate-900 text-slate-300 p-2.5 rounded text-xs font-mono border border-slate-700 mt-2">
                <strong>Migration required:</strong> Paste and run the contents of <code>phase5_fixes.sql</code> in your Supabase SQL Editor.
              </div>
            )}
          </div>
        ) as any, 
        variant: 'destructive' 
      });
    }
  };

  return (
    <div className="space-y-5 animate-in">
      <PageHeader
        title="Profit & Loss Statement"
        subtitle="SAVS BuyHub — Corporate Financial Overview"
        icon={<FileText className="h-5 w-5 text-indigo-500" />}
        actions={<>
          <div className="mr-1">
            <select 
              className="flex h-9 w-40 items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              value={selectedDisclosedPeriod}
              onChange={(e) => setSelectedDisclosedPeriod(e.target.value)}
            >
              <option value="active">Active Ledger</option>
              {disclosedPeriods.map(dp => (
                <option key={dp.id} value={dp.id}>{dp.period_name}</option>
              ))}
            </select>
          </div>
          <Dialog open={disclosureOpen} onOpenChange={setDisclosureOpen}>
            <DialogTrigger asChild>
              <Button variant="destructive" size="sm" className="gap-1 h-9"><AlertTriangle className="h-4 w-4" />Monthly Disclosure</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="text-destructive">⚠️ Monthly Disclosure — Zero Accounts</DialogTitle>
              </DialogHeader>
              <p className="text-sm text-muted-foreground">
                This will permanently archive and delete <strong>ALL sales, returns, and expenses</strong> from the active ledger to start a new period. This action is irreversible.
              </p>
              <div className="mt-4 space-y-4">
                <div>
                  <Label>Disclosure Notes (Optional)</Label>
                  <Input value={disclosureNotes} onChange={e => setDisclosureNotes(e.target.value)} placeholder="e.g. Q3 Outstanding Performance, expansion planned." className="mt-1" />
                </div>
                <div>
                  <Label>Dividend Declared (%) (Optional)</Label>
                  <Input type="number" value={dividendDeclared} onChange={e => setDividendDeclared(e.target.value === '' ? '' : Number(e.target.value))} placeholder="e.g. 5" className="mt-1" />
                </div>
                <div>
                  <Label>Type <strong>CMO Approval</strong> to proceed</Label>
                  <Input value={disclosureConfirm} onChange={e => setDisclosureConfirm(e.target.value)} placeholder="Type CMO Approval here..." className="mt-1" />
                </div>
              </div>
              <DialogFooter className="mt-4">
                <Button variant="outline" onClick={() => setDisclosureOpen(false)}>Cancel</Button>
                <Button variant="destructive" onClick={handleMonthlyDisclosure}>Archive Period</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <PeriodSelector value={period} onChange={setPeriod} dateRange={dateRange} onDateRangeChange={setDateRange} />
          <Button variant="outline" size="sm" onClick={handleExport} className="h-9"><Download className="mr-1 h-4 w-4" />Export Statement</Button>
        </>}
      />

      {/* Summary Cards */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-5">
        <StatCard title="Gross Revenue" value={fmt(pnl.revenue)} icon={<DollarSign />} color="primary" />
        <StatCard title="Gross Profit" value={fmt(pnl.grossProfit)} icon={<TrendingUp />} color="amber" />
        <StatCard title="Net Profit / (Loss)" value={fmt(pnl.netProfit)} icon={pnl.netProfit >= 0 ? <TrendingUp /> : <TrendingDown />} color={pnl.netProfit >= 0 ? 'emerald' : 'red'} />
        <StatCard title="Profit Per Unit" value={fmt(Math.round(pnl.profitPerUnit))} icon={<DollarSign />} color={pnl.profitPerUnit >= 0 ? 'emerald' : 'red'} />
        <StatCard title="Net Worth" value={fmt(liveNetWorth)} icon={<Landmark />} color="primary" />
      </div>

      {/* Visualizations */}
      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard title="Revenue vs Total Costs" description="Outlay vs Net Earnings">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={[{ name: 'Financials', Revenue: pnl.revenue, Costs: pnl.cogs + pnl.totalExpenses, Profit: pnl.netProfit }]} layout="vertical" margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="hsl(var(--border))" />
                <XAxis type="number" tickFormatter={(v) => `₹${v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v}`} fontSize={11} />
                <YAxis type="category" dataKey="name" hide />
                <Tooltip formatter={(value: number) => fmt(value)} cursor={{ fill: 'transparent' }} />
                <Legend />
                <Bar dataKey="Revenue" fill="hsl(224, 76%, 48%)" radius={[0, 4, 4, 0]} barSize={30} />
                <Bar dataKey="Costs" fill="hsl(38, 92%, 50%)" radius={[0, 4, 4, 0]} barSize={30} />
                <Bar dataKey="Profit" fill={pnl.netProfit >= 0 ? "hsl(142, 76%, 36%)" : "hsl(0, 84%, 60%)"} radius={[0, 4, 4, 0]} barSize={30} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>

        <SectionCard title="Operating Expenses Breakdown" description="Distribution of non-COGS overheads">
          <div className="h-64">
            {pnl.totalExpenses > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={[
                      { name: 'Delivery Fees', value: pnl.deliveryFees },
                      { name: 'Inventory Freight', value: pnl.inventoryDeliveryFees },
                      { name: 'Return Penalties', value: pnl.returnPenalties },
                      { name: 'Ad Spend', value: pnl.adSpend },
                      { name: 'Freight', value: pnl.freightExpenses },
                      { name: 'Packaging', value: pnl.packagingExpenses },
                      { name: 'Other', value: pnl.otherExpenses }
                    ].filter(d => d.value > 0)}
                    cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={2} dataKey="value"
                  >
                    <Cell fill="hsl(224, 76%, 48%)" />
                    <Cell fill="hsl(0, 84%, 60%)" />
                    <Cell fill="hsl(38, 92%, 50%)" />
                    <Cell fill="hsl(280, 68%, 50%)" />
                    <Cell fill="hsl(142, 76%, 36%)" />
                    <Cell fill="hsl(215, 16%, 47%)" />
                  </Pie>
                  <Tooltip formatter={(value: number) => fmt(value)} />
                  <Legend layout="vertical" verticalAlign="middle" align="right" wrapperStyle={{ fontSize: '11px' }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-muted-foreground">No expenses recorded</div>
            )}
          </div>
        </SectionCard>
      </div>

      {/* P&L Table */}
      <SectionCard title="Corporate Income Statement" description="Comprehensive breakdown of revenues, direct costs, and operational expenses." noPadding>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50 dark:bg-slate-900/50">
                <TableHead className="w-3/4 font-semibold text-slate-600 dark:text-slate-300">Financial Line Item</TableHead>
                <TableHead className="text-right font-semibold text-slate-600 dark:text-slate-300">Amount (INR)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lineItems.map((item, i) => (
                <TableRow key={i} className={`${item.type === 'total' ? 'bg-indigo-50/50 dark:bg-indigo-900/20 border-t-2 border-indigo-200 dark:border-indigo-800' : item.type === 'subtotal' ? 'bg-slate-50 dark:bg-slate-900/50 border-t border-slate-200 dark:border-slate-800' : 'border-b-0'} hover:bg-muted/50 transition-colors`}>
                  <TableCell className={`${item.bold ? 'font-bold text-slate-900 dark:text-slate-100' : 'text-slate-600 dark:text-slate-400'} ${item.isMeta ? 'text-xs italic' : 'pl-6'}`}>
                    {item.label}
                  </TableCell>
                  <TableCell className={`text-right font-mono ${item.bold ? 'font-bold text-slate-900 dark:text-slate-100' : ''} ${item.isMeta ? 'text-muted-foreground text-xs' : ''} ${item.type === 'total' ? (item.value >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400') : ''}`}>
                    {item.isMeta ? item.value.toLocaleString() : fmt(Math.round(Math.abs(item.value)))}
                    {!item.isMeta && item.value < 0 && <span className="text-red-500 ml-2 inline-block w-3">▼</span>}
                    {!item.isMeta && item.value > 0 && item.type !== 'expense' && <span className="text-emerald-500 ml-2 inline-block w-3">▲</span>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </SectionCard>

      {/* Platform P&L */}
      {pnl.platforms.length > 0 && (
        <SectionCard title="Platform-wise Performance" description="Revenues, costs, margins, and return rates per sales channel." noPadding>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead className="font-semibold text-xs">Platform</TableHead>
                  <TableHead className="text-right font-semibold text-xs">Revenue</TableHead>
                  <TableHead className="text-right font-semibold text-xs">COGS</TableHead>
                  <TableHead className="text-right font-semibold text-xs">Profit</TableHead>
                  <TableHead className="text-right font-semibold text-xs">Units</TableHead>
                  <TableHead className="text-right font-semibold text-xs">Profit/Unit</TableHead>
                  <TableHead className="text-right font-semibold text-xs">Margin</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pnl.platforms.map(p => (
                  <TableRow key={p.platform} className="hover:bg-primary/5 transition-colors">
                    <TableCell><Badge variant="outline" className="px-1.5 py-0 text-[10px] uppercase font-bold tracking-wider">{p.platform}</Badge></TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(p.revenue)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(p.cost)}</TableCell>
                    <TableCell className={`text-right font-semibold tabular-nums ${p.profit >= 0 ? 'text-emerald-600' : 'text-destructive'}`}>{fmt(p.profit)}</TableCell>
                    <TableCell className="text-right tabular-nums">{p.units}</TableCell>
                    <TableCell className="text-right tabular-nums">{p.units > 0 ? fmt(Math.round(p.profit / p.units)) : '—'}</TableCell>
                    <TableCell className="text-right tabular-nums font-medium">{p.revenue > 0 ? ((p.profit / p.revenue) * 100).toFixed(1) + '%' : '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </SectionCard>
      )}

      {/* Monthly Trend */}
      {monthlyTrend.length > 0 && (
        <SectionCard title="Monthly Trend" description="Revenue, COGS, expenses and net profit by month">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={monthlyTrend} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="hsl(224, 76%, 48%)" stopOpacity={0.45} /><stop offset="95%" stopColor="hsl(224, 76%, 48%)" stopOpacity={0} /></linearGradient>
                  <linearGradient id="prof" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="hsl(142, 76%, 36%)" stopOpacity={0.45} /><stop offset="95%" stopColor="hsl(142, 76%, 36%)" stopOpacity={0} /></linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => v >= 1000 ? `₹${(v / 1000).toFixed(0)}k` : `₹${v}`} />
                <Tooltip formatter={(v: number) => fmt(v)} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Area type="monotone" dataKey="revenue" stroke="hsl(224, 76%, 48%)" fill="url(#rev)" strokeWidth={2} name="Revenue" />
                <Area type="monotone" dataKey="profit" stroke="hsl(142, 76%, 36%)" fill="url(#prof)" strokeWidth={2} name="Net Profit" />
                <Line type="monotone" dataKey="cogs" stroke="hsl(38, 92%, 50%)" strokeWidth={2} dot={false} name="COGS" />
                <Line type="monotone" dataKey="expenses" stroke="hsl(0, 84%, 60%)" strokeWidth={2} dot={false} name="Expenses" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>
      )}

      {/* Cash flow summary */}
      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Cash Flow Summary" description="Live working capital position">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border bg-gradient-to-br from-emerald-50 to-white dark:from-emerald-950/30 dark:to-slate-900 p-4">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">Hot Cash (COD)</p>
              <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-400 mt-1 tabular-nums">{fmt(liveHotCash)}</p>
            </div>
            <div className="rounded-lg border bg-gradient-to-br from-indigo-50 to-white dark:from-indigo-950/30 dark:to-slate-900 p-4">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">Account Value (Bank)</p>
              <p className="text-2xl font-bold text-indigo-700 dark:text-indigo-400 mt-1 tabular-nums">{fmt(liveAccountValue)}</p>
            </div>
            <div className="rounded-lg border p-4 col-span-2">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">Total Liquid + Inventory Asset</p>
              <p className="text-xl font-bold mt-1 tabular-nums">{fmt(liveNetWorth)}</p>
              <p className="text-[10px] text-muted-foreground mt-1">Cash + Bank + Unsold inventory at cost</p>
            </div>
            <div className="rounded-lg border p-4 col-span-2">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">Archived Earnings</p>
              <p className="text-xl font-bold mt-1 tabular-nums">{fmt(historicalTotals.netProfit)}</p>
              <p className="text-[10px] text-muted-foreground mt-1">Saved from completed monthly disclosures</p>
            </div>
          </div>
          {cashMovements.length > 0 && (
            <div className="mt-3 border-t pt-3">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">Recent Movements</p>
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {cashMovements.slice(0, 8).map((m: any) => (
                  <div key={m.id} className="flex items-center justify-between text-xs py-1 border-b border-dashed last:border-0">
                    <span className="text-muted-foreground truncate">{m.movement_type.replace(/_/g, ' ')} · {new Date(m.created_at).toLocaleDateString()}</span>
                    <span className={`font-mono tabular-nums ${(m.hot_cash_delta + m.account_delta) >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                      {(m.hot_cash_delta + m.account_delta) >= 0 ? '+' : ''}{fmt(m.hot_cash_delta + m.account_delta)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </SectionCard>

        <SectionCard title="Payment Status Breakdown" description="Order count & value by collection status">
          {paymentBreakdown.length > 0 ? (
            <div className="space-y-2">
              {paymentBreakdown.map(p => {
                const total = paymentBreakdown.reduce((s, x) => s + x.value, 0);
                const pct = total > 0 ? (p.value / total) * 100 : 0;
                const color =
                  p.status === 'Settled' ? 'bg-emerald-500' :
                  p.status === 'Pending' ? 'bg-amber-500' :
                  p.status === 'Cancelled' || p.status === 'Return' || p.status === 'Order RTO' ? 'bg-red-500' :
                  'bg-indigo-500';
                return (
                  <div key={p.status}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="font-medium">{p.status} <span className="text-muted-foreground">({p.orders})</span></span>
                      <span className="font-mono tabular-nums">{fmt(p.value)} <span className="text-muted-foreground">· {pct.toFixed(1)}%</span></span>
                    </div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div className={`h-full ${color} transition-all`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-8 text-center">No sales in selected period.</p>
          )}
        </SectionCard>
      </div>

      {/* Per-SKU profitability */}
      {skuPnl.length > 0 && (
        <SectionCard title="Per-SKU Profitability" description="Profit, margin and return rate ranked by net profit" noPadding>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead className="font-semibold text-xs">SKU</TableHead>
                  <TableHead className="font-semibold text-xs">Product</TableHead>
                  <TableHead className="text-right font-semibold text-xs">Units</TableHead>
                  <TableHead className="text-right font-semibold text-xs">Revenue</TableHead>
                  <TableHead className="text-right font-semibold text-xs">COGS</TableHead>
                  <TableHead className="text-right font-semibold text-xs">Returns</TableHead>
                  <TableHead className="text-right font-semibold text-xs">Return %</TableHead>
                  <TableHead className="text-right font-semibold text-xs">Profit</TableHead>
                  <TableHead className="text-right font-semibold text-xs">Margin</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {skuPnl.slice(0, 50).map(r => (
                  <TableRow key={r.sku} className="hover:bg-primary/5 transition-colors">
                    <TableCell className="font-mono text-xs text-primary">{r.sku}</TableCell>
                    <TableCell className="text-xs max-w-[260px] truncate">{r.product}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.units}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(r.revenue)}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{fmt(r.cogs)}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.returns}</TableCell>
                    <TableCell className={`text-right tabular-nums ${r.returnRate > 15 ? 'text-red-600 font-semibold' : ''}`}>{r.returnRate.toFixed(1)}%</TableCell>
                    <TableCell className={`text-right tabular-nums font-semibold ${r.profit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{fmt(r.profit)}</TableCell>
                    <TableCell className={`text-right tabular-nums font-medium ${r.margin >= 0 ? '' : 'text-red-600'}`}>{r.margin.toFixed(1)}%</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </SectionCard>
      )}
    </div>
  );
}
