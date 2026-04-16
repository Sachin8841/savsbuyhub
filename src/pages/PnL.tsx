import { useState, useMemo } from 'react';
import { useSales, useReturns, useInventory, useAdExpenses } from '@/hooks/useData';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Download, FileText } from 'lucide-react';
import { PeriodSelector, getFilterDate } from '@/components/DateRangePicker';
import { exportToXlsx } from '@/lib/xlsx-export';

const fmt = (n: number) => '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 0 });

export default function PnL() {
  const { data: sales = [] } = useSales();
  const { data: returns = [] } = useReturns();
  const { data: inventory = [] } = useInventory();
  const { data: adExpenses = [] } = useAdExpenses();
  const [period, setPeriod] = useState('month');
  const [dateRange, setDateRange] = useState<{ from?: Date; to?: Date }>({});

  const { from: filterFrom, to: filterTo } = getFilterDate(period, dateRange);

  const inRange = (dateStr: string) => {
    if (!filterFrom) return true;
    const d = new Date(dateStr);
    return d >= filterFrom && (!filterTo || d <= filterTo);
  };

  const filteredSales = sales.filter(s => inRange(s.dispatch_date));
  const filteredReturns = returns.filter(r => inRange(r.return_date));
  const filteredAdExpenses = adExpenses.filter(e => inRange(e.expense_date));

  const pnl = useMemo(() => {
    const revenue = filteredSales.reduce((sum, s) => sum + s.quantity_sold * s.average_selling_price, 0);
    const units = filteredSales.reduce((sum, s) => sum + s.quantity_sold, 0);
    const cogs = filteredSales.reduce((sum, s) => {
      const inv = s.inventory as any;
      return sum + s.quantity_sold * (inv?.average_cost_price ?? 0);
    }, 0);
    const deliveryFees = filteredSales.reduce((sum, s) => {
      const inv = s.inventory as any;
      return sum + (inv?.delivery_fee ?? 0);
    }, 0);
    const grossProfit = revenue - cogs;
    const returnPenalties = filteredReturns.reduce((sum, r) => sum + r.penalty_amount, 0);
    const returnedUnits = filteredReturns.reduce((sum, r) => sum + r.quantity_returned, 0);
    const adSpend = filteredAdExpenses.reduce((sum, e) => sum + e.amount, 0);
    const totalExpenses = deliveryFees + returnPenalties + adSpend;
    const netProfit = grossProfit - totalExpenses;
    const profitPerUnit = units > 0 ? netProfit / units : 0;

    // Platform breakdown
    const platforms = ['Meesho', 'Flipkart', 'Amazon', 'Offline'].map(p => {
      const pSales = filteredSales.filter(s => s.platform === p);
      const pRev = pSales.reduce((sum, s) => sum + s.quantity_sold * s.average_selling_price, 0);
      const pCost = pSales.reduce((sum, s) => sum + s.quantity_sold * ((s.inventory as any)?.average_cost_price ?? 0), 0);
      const pUnits = pSales.reduce((sum, s) => sum + s.quantity_sold, 0);
      return { platform: p, revenue: pRev, cost: pCost, profit: pRev - pCost, units: pUnits };
    }).filter(p => p.revenue > 0);

    return { revenue, units, cogs, deliveryFees, grossProfit, returnPenalties, returnedUnits, adSpend, totalExpenses, netProfit, profitPerUnit, platforms };
  }, [filteredSales, filteredReturns, filteredAdExpenses]);

  const lineItems = [
    { label: 'Sales Revenue', value: pnl.revenue, bold: true, type: 'income' as const },
    { label: `  Units Sold`, value: pnl.units, isMeta: true },
    { label: 'Cost of Goods Sold (COGS)', value: -pnl.cogs, type: 'expense' as const },
    { label: 'Gross Profit', value: pnl.grossProfit, bold: true, type: 'subtotal' as const },
    { label: 'Delivery Fees', value: -pnl.deliveryFees, type: 'expense' as const },
    { label: `Return Penalties (${pnl.returnedUnits} units)`, value: -pnl.returnPenalties, type: 'expense' as const },
    { label: 'Advertising Spend', value: -pnl.adSpend, type: 'expense' as const },
    { label: 'Total Operating Expenses', value: -pnl.totalExpenses, bold: true, type: 'subtotal' as const },
    { label: 'Net Profit / (Loss)', value: pnl.netProfit, bold: true, type: 'total' as const },
    { label: 'Profit Per Unit', value: pnl.profitPerUnit, bold: true, type: 'total' as const },
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <FileText className="h-6 w-6 text-primary" />
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Profit & Loss Statement</h2>
            <p className="text-muted-foreground">SAVS BuyHub — Financial Overview</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <PeriodSelector value={period} onChange={setPeriod} dateRange={dateRange} onDateRangeChange={setDateRange} />
          <Button variant="outline" size="sm" onClick={handleExport}><Download className="mr-1 h-4 w-4" />Export</Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
        <Card><CardContent className="p-4 text-center"><p className="text-xs text-muted-foreground">Revenue</p><p className="text-xl font-bold text-primary">{fmt(pnl.revenue)}</p></CardContent></Card>
        <Card><CardContent className="p-4 text-center"><p className="text-xs text-muted-foreground">Gross Profit</p><p className="text-xl font-bold text-amber-500">{fmt(pnl.grossProfit)}</p></CardContent></Card>
        <Card><CardContent className="p-4 text-center"><p className="text-xs text-muted-foreground">Net Profit</p><p className={`text-xl font-bold ${pnl.netProfit >= 0 ? 'text-emerald-500' : 'text-destructive'}`}>{fmt(pnl.netProfit)}</p></CardContent></Card>
        <Card><CardContent className="p-4 text-center"><p className="text-xs text-muted-foreground">Profit/Unit</p><p className={`text-xl font-bold ${pnl.profitPerUnit >= 0 ? 'text-emerald-500' : 'text-destructive'}`}>{fmt(Math.round(pnl.profitPerUnit))}</p></CardContent></Card>
      </div>

      {/* P&L Table */}
      <Card>
        <CardHeader><CardTitle className="text-base">Income Statement</CardTitle><CardDescription>Detailed breakdown of revenue and expenses</CardDescription></CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-3/4">Line Item</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lineItems.map((item, i) => (
                  <TableRow key={i} className={item.type === 'total' ? 'bg-muted/50 border-t-2' : item.type === 'subtotal' ? 'bg-muted/30' : ''}>
                    <TableCell className={`${item.bold ? 'font-semibold' : ''} ${item.isMeta ? 'text-muted-foreground text-xs' : ''}`}>
                      {item.label}
                    </TableCell>
                    <TableCell className={`text-right ${item.bold ? 'font-semibold' : ''} ${item.isMeta ? 'text-muted-foreground text-xs' : ''} ${item.type === 'total' ? (item.value >= 0 ? 'text-emerald-600' : 'text-destructive') : ''}`}>
                      {item.isMeta ? item.value.toLocaleString() : fmt(Math.round(Math.abs(item.value)))}
                      {!item.isMeta && item.value < 0 && <span className="text-destructive ml-1">▼</span>}
                      {!item.isMeta && item.value > 0 && item.type !== 'expense' && <span className="text-emerald-500 ml-1">▲</span>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Platform P&L */}
      {pnl.platforms.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Platform-wise P&L</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Platform</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                    <TableHead className="text-right">COGS</TableHead>
                    <TableHead className="text-right">Profit</TableHead>
                    <TableHead className="text-right">Units</TableHead>
                    <TableHead className="text-right">Profit/Unit</TableHead>
                    <TableHead className="text-right">Margin</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pnl.platforms.map(p => (
                    <TableRow key={p.platform}>
                      <TableCell><Badge variant="secondary">{p.platform}</Badge></TableCell>
                      <TableCell className="text-right">{fmt(p.revenue)}</TableCell>
                      <TableCell className="text-right">{fmt(p.cost)}</TableCell>
                      <TableCell className={`text-right font-medium ${p.profit >= 0 ? 'text-emerald-600' : 'text-destructive'}`}>{fmt(p.profit)}</TableCell>
                      <TableCell className="text-right">{p.units}</TableCell>
                      <TableCell className="text-right">{p.units > 0 ? fmt(Math.round(p.profit / p.units)) : '—'}</TableCell>
                      <TableCell className="text-right">{p.revenue > 0 ? ((p.profit / p.revenue) * 100).toFixed(1) + '%' : '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
