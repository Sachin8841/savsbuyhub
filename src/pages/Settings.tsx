import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/stores/authStore';
import { useQueryClient } from '@tanstack/react-query';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Shield, Users, FileDown, Database, Palette, UserCircle, CheckCircle2, Settings as SettingsIcon, Trash2, ShieldCheck, ShieldAlert, Terminal, RefreshCw, Sparkles, ArrowRightLeft, TrendingUp, AlertTriangle, AlertCircle, Play, Warehouse, Sliders, Eye, Search } from 'lucide-react';
import { exportDashboardReport } from '@/lib/xlsx-export';
import { PageHeader, StatCard, SectionCard, EmptyState } from '@/components/PageHeader';
import { useSales, useInventory, useReturns, useAdExpenses } from '@/hooks/useData';

interface UserWithProfile {
  user_id: string;
  role: string;
  email: string;
  full_name: string;
  aadhar_number?: string;
  pan_number?: string;
  bank_name?: string;
  account_number?: string;
  ifsc_code?: string;
  phone?: string;
  dob?: string;
  address?: string;
  gender?: string;
}


export default function SettingsPage() {
  const { user, isAdmin } = useAuthStore();
  const [users, setUsers] = useState<UserWithProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [userSearch, setUserSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | 'admin' | 'user'>('all');
  const [detailsUser, setDetailsUser] = useState<UserWithProfile | null>(null);
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: sales = [] } = useSales();
  const { data: inventory = [] } = useInventory();
  const { data: returns = [] } = useReturns();
  const { data: adExpenses = [] } = useAdExpenses();
  const admin = isAdmin();

  // Low Stock & Current Stocks state
  const [currentStocks, setCurrentStocks] = useState<Record<string, number>>({});
  const [disclosedPeriods, setDisclosedPeriods] = useState<any[]>([]);
  
  useEffect(() => {
    if (inventory.length > 0) {
      inventory.forEach(async (item) => {
        const { data } = await supabase.rpc('get_current_stock', { inv_id: item.id });
        if (data !== null) setCurrentStocks(prev => ({ ...prev, [item.id]: data as number }));
      });
    }
  }, [inventory]);

  const lowStockItems = useMemo(() => {
    return inventory
      .map(item => ({
        ...item,
        currentStock: currentStocks[item.id] ?? 0
      }))
      .filter(item => item.currentStock <= 10);
  }, [inventory, currentStocks]);

  // Diagnostics check state
  const [dbStatus, setDbStatus] = useState<'testing' | 'healthy' | 'unhealthy'>('testing');
  const [diagResults, setDiagResults] = useState<{
    api: boolean;
    tables: { name: string; count: number; status: 'ok' | 'error' }[];
    rpcs: { name: string; status: 'ok' | 'error'; val?: any }[];
    errorDetails?: string;
  }>({ api: false, tables: [], rpcs: [] });
  const [diagLoading, setDiagLoading] = useState(false);
  const [auditLogs, setAuditLogs] = useState<string[]>([]);

  const runDiagnostics = async () => {
    setDiagLoading(true);
    setDbStatus('testing');
    const logs: string[] = [];
    const timestamp = () => new Date().toLocaleTimeString();
    
    logs.push(`[${timestamp()}] SYSTEM: Initializing environment diagnostic check...`);
    
    try {
      logs.push(`[${timestamp()}] DATABASE: Testing connection to Supabase instance...`);
      const { data: pCountData, error: pCountErr } = await supabase.from('profiles').select('count', { count: 'exact', head: true });
      if (pCountErr) throw pCountErr;
      
      logs.push(`[${timestamp()}] DATABASE: Connection successful. Authenticated schema access OK.`);
      
      const tablesToCheck = [
        { name: 'profiles', key: 'profiles' },
        { name: 'user_roles', key: 'user_roles' },
        { name: 'investments', key: 'investments' },
        { name: 'sales', key: 'sales' },
        { name: 'returns', key: 'returns' },
        { name: 'inventory', key: 'inventory' },
        { name: 'ad_expenses', key: 'ad_expenses' },
        { name: 'disclosed_periods', key: 'disclosed_periods' },
        { name: 'sips', key: 'sips' }
      ];
      
      const tablesResults: any[] = [];
      for (const t of tablesToCheck) {
        logs.push(`[${timestamp()}] SCHEMA: Querying table integrity for public."${t.name}"...`);
        const { count, error } = await supabase.from(t.name as any).select('*', { count: 'exact', head: true });
        if (error) {
          logs.push(`[${timestamp()}] ❌ SCHEMA ERROR: Table "${t.name}" failed verification: ${error.message}`);
          tablesResults.push({ name: t.name, count: 0, status: 'error' });
        } else {
          logs.push(`[${timestamp()}] 🟢 SCHEMA OK: Table "${t.name}" active. Count: ${count ?? 0}`);
          tablesResults.push({ name: t.name, count: count ?? 0, status: 'ok' });
        }
      }
      
      const rpcsToCheck = [
        { name: 'get_public_share_price', args: {} },
        { name: 'get_public_price_history', args: {} },
        { name: 'get_public_forecast_data', args: {} }
      ];
      
      const rpcsResults: any[] = [];
      for (const r of rpcsToCheck) {
        logs.push(`[${timestamp()}] PROCEDURE: Executing RPC call public."${r.name}"()...`);
        const { data, error } = await supabase.rpc(r.name as any, r.args);
        if (error) {
          logs.push(`[${timestamp()}] ❌ PROCEDURE ERROR: RPC "${r.name}" failed: ${error.message}`);
          rpcsResults.push({ name: r.name, status: 'error' });
        } else {
          logs.push(`[${timestamp()}] 🟢 PROCEDURE OK: RPC "${r.name}" execution successful.`);
          rpcsResults.push({ name: r.name, status: 'ok', val: data });
        }
      }
      
      let hasColumnError = false;
      logs.push(`[${timestamp()}] SCHEMA: Auditing public."sales" table for transaction "cost_price" column...`);
      try {
        const { error: colErr } = await supabase.from('sales').select('cost_price').limit(1);
        if (colErr) {
          logs.push(`[${timestamp()}] ❌ SCHEMA ERROR: public."sales" table is missing the "cost_price" column. Run the migration script.`);
          hasColumnError = true;
        } else {
          logs.push(`[${timestamp()}] 🟢 SCHEMA OK: public."sales".cost_price column detected and operational.`);
        }
      } catch (e: any) {
        logs.push(`[${timestamp()}] ❌ SCHEMA ERROR: public."sales" table column audit threw an exception: ${e.message || String(e)}`);
        hasColumnError = true;
      }

      setDiagResults({
        api: true,
        tables: tablesResults,
        rpcs: rpcsResults
      });
      
      const hasErrors = tablesResults.some(t => t.status === 'error') || rpcsResults.some(r => r.status === 'error') || hasColumnError;
      setDbStatus(hasErrors ? 'unhealthy' : 'healthy');
      logs.push(`[${timestamp()}] SYSTEM: Diagnostics completed. Environment status: ${hasErrors ? 'WARNINGS DETECTED' : 'HEALTHY'}`);
    } catch (err: any) {
      console.error(err);
      logs.push(`[${timestamp()}] ❌ SYSTEM CRITICAL: Diagnostic execution failed: ${err.message || String(err)}`);
      setDbStatus('unhealthy');
      setDiagResults({
        api: false,
        tables: [],
        rpcs: [],
        errorDetails: err.message || String(err)
      });
    } finally {
      setDiagLoading(false);
      setAuditLogs(logs);
    }
  };

  useEffect(() => {
    if (admin) {
      runDiagnostics();
    }
  }, [admin]);

  // Valuation Simulator state
  const [simBaseVal, setSimBaseVal] = useState(100);
  const [simStockValue, setSimStockValue] = useState(0);
  const [simActiveProfit, setSimActiveProfit] = useState(0);
  const [simHistoricalProfit, setSimHistoricalProfit] = useState(0);
  const [simTotalShares, setSimTotalShares] = useState(100000);
  const [simDaysSinceSale, setSimDaysSinceSale] = useState(0);

  useEffect(() => {
    if (inventory.length > 0 && sales.length > 0) {
      const stockVal = inventory.reduce((sum, item) => {
        const stock = currentStocks[item.id] ?? 0;
        return sum + stock * (item.average_cost_price || 0);
      }, 0);
      
      const returnedRevenue = returns.reduce((sum, r) => {
        const sale = sales.find(s => s.id === r.sales_id);
        return sum + r.quantity_returned * (sale?.average_selling_price ?? 0);
      }, 0);
      const returnedCogs = returns.reduce((sum, r) => {
        const sale = sales.find(s => s.id === r.sales_id);
        const invId = r.inventory_id || sale?.inventory_id;
        const inv = inventory.find(i => i.id === invId);
        const costPrice = sale?.cost_price ?? inv?.average_cost_price ?? 0;
        return sum + r.quantity_returned * costPrice;
      }, 0);
      const nonCancelledSales = sales.filter(s => s.payment_status !== 'Cancelled');
      const activeRevenue = nonCancelledSales.reduce((sum, s) => sum + s.quantity_sold * s.average_selling_price, 0) - returnedRevenue;
      const activeCogs = nonCancelledSales.reduce((sum, s) => {
        const inv = inventory.find(i => i.id === s.inventory_id);
        const costPrice = s.cost_price ?? inv?.average_cost_price ?? 0;
        return sum + s.quantity_sold * costPrice;
      }, 0) - returnedCogs;
      const activeDeliveryFees = nonCancelledSales.reduce((sum, s) => {
        const inv = inventory.find(i => i.id === s.inventory_id);
        const feePerUnit = inv ? (inv.delivery_fee || 0) / (inv.total_bulk_stock_in || 1) : 0;
        return sum + s.quantity_sold * feePerUnit;
      }, 0);
      const activePenalties = returns.reduce((sum, r) => sum + r.penalty_amount, 0);
      const activeAdSpend = adExpenses.reduce((sum, e) => sum + e.amount, 0);
      const calculatedActiveProfit = activeRevenue - activeCogs - activeDeliveryFees - activePenalties - activeAdSpend;

      const calculatedHistProfit = disclosedPeriods.reduce((sum, dp) => {
        return sum + (dp.dividend_declared || 0); // simulation fallback
      }, 0);

      setSimStockValue(Math.round(stockVal));
      setSimActiveProfit(Math.round(calculatedActiveProfit));
      
      const dispatchDates = sales.filter(s => s.payment_status !== 'Cancelled' && s.dispatch_date).map(s => new Date(s.dispatch_date).getTime());
      if (dispatchDates.length > 0) {
        const lastSale = Math.max(...dispatchDates);
        const diffDays = Math.floor((new Date().getTime() - lastSale) / (1000 * 60 * 60 * 24));
        setSimDaysSinceSale(Math.max(0, diffDays));
      }
    }
  }, [inventory, sales, returns, adExpenses, currentStocks, disclosedPeriods]);

  // Compute Platform performance breakdown
  const platformData = useMemo(() => {
    const nonCancelled = sales.filter(s => s.payment_status !== 'Cancelled');
    return ['Meesho', 'Flipkart', 'Amazon', 'Offline'].map(p => {
      const pSales = nonCancelled.filter(s => s.platform === p);
      const revenue = pSales.reduce((sum, s) => sum + s.quantity_sold * s.average_selling_price, 0);
      
      const returnedRevenue = returns.filter(r => {
        const sale = sales.find(s => s.id === r.sales_id);
        return sale?.platform === p;
      }).reduce((sum, r) => {
        const sale = sales.find(s => s.id === r.sales_id);
        return sum + r.quantity_returned * (sale?.average_selling_price ?? 0);
      }, 0);
      
      const returnedCogs = returns.filter(r => {
        const sale = sales.find(s => s.id === r.sales_id);
        return sale?.platform === p;
      }).reduce((sum, r) => {
        const sale = sales.find(s => s.id === r.sales_id);
        const invId = r.inventory_id || sale?.inventory_id;
        const inv = inventory.find(i => i.id === invId);
        const costPrice = sale?.cost_price ?? inv?.average_cost_price ?? 0;
        return sum + r.quantity_returned * costPrice;
      }, 0);

      const netRev = revenue - returnedRevenue;

      const cost = pSales.reduce((sum, s) => {
        const inv = inventory.find(i => i.id === s.inventory_id);
        const feePerUnit = inv ? (inv.delivery_fee || 0) / (inv.total_bulk_stock_in || 1) : 0;
        const cp = s.cost_price ?? (inv as any)?.average_cost_price ?? 0;
        return sum + s.quantity_sold * (cp + feePerUnit);
      }, 0) - returnedCogs;

      const pReturns = returns.filter(r => {
        const sale = sales.find(s => s.id === r.sales_id);
        return sale?.platform === p;
      });
      const penalty = pReturns.reduce((sum, r) => sum + r.penalty_amount, 0);
      const returnedUnits = pReturns.reduce((sum, r) => sum + r.quantity_returned, 0);
      const units = pSales.reduce((sum, s) => sum + s.quantity_sold, 0);
      
      const netProfit = netRev - cost - penalty;
      const margin = netRev > 0 ? (netProfit / netRev) * 100 : 0;
      const returnRate = units > 0 ? (returnedUnits / units) * 100 : 0;

      return { platform: p, revenue: netRev, cost, penalty, profit: netProfit, units, returnRate, margin };
    }).filter(p => p.units > 0);
  }, [sales, inventory, returns]);



  // Compute Simulated Share Price components
  const simValuation = useMemo(() => {
    const discountedBookValue = (simStockValue * 0.5) / simTotalShares;
    const totalRetainedEarnings = simActiveProfit + simHistoricalProfit;
    const earningsPerShare = (totalRetainedEarnings * 5) / simTotalShares;
    
    let timeDecayMultiplier = 1.0;
    if (simDaysSinceSale > 5) {
      const penalty = Math.min(0.5, (simDaysSinceSale - 5) * 0.01);
      timeDecayMultiplier = 1.0 - penalty;
    }
    
    const rawPrice = simBaseVal + discountedBookValue + earningsPerShare;
    const finalPrice = Math.max(10.0, rawPrice * timeDecayMultiplier);
    
    return {
      discountedBookValue,
      totalRetainedEarnings,
      earningsPerShare,
      timeDecayMultiplier,
      rawPrice,
      finalPrice: Number(finalPrice.toFixed(2))
    };
  }, [simBaseVal, simStockValue, simActiveProfit, simHistoricalProfit, simTotalShares, simDaysSinceSale]);

  const fetchUsers = async () => {
    setLoading(true);
    const { data: roles } = await supabase.from('user_roles').select('user_id, role');
    const { data: profiles } = await supabase.from('profiles').select('*');
    const profileMap = new Map((profiles ?? []).map(p => [p.user_id, p]));
    setUsers((roles ?? []).map(r => {
      const prof: any = profileMap.get(r.user_id);
      return {
        user_id: r.user_id,
        role: r.role,
        email: prof?.email ?? 'Unknown',
        full_name: prof?.full_name ?? '—',
        aadhar_number: prof?.aadhar_number,
        pan_number: prof?.pan_number,
        bank_name: prof?.bank_name,
        account_number: prof?.account_number,
        ifsc_code: prof?.ifsc_code,
        phone: prof?.phone,
        dob: prof?.dob,
        address: prof?.address,
        gender: prof?.gender
      };
    }));

    try {
      const { data: periods } = await supabase.from('disclosed_periods').select('*').order('created_at', { ascending: false });
      if (periods) setDisclosedPeriods(periods);
    } catch (e) {
      console.warn("Disclosed periods table not available yet.");
    }

    setLoading(false);
  };

  useEffect(() => {
    if (user) {
      fetchUsers();
    }
  }, [user]);

  const updateRole = async (userId: string, newRole: string) => {
    const { error } = await supabase.from('user_roles').update({ role: newRole as any }).eq('user_id', userId);
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Role updated' });
    setUsers(prev => prev.map(u => u.user_id === userId ? { ...u, role: newRole } : u));
  };

  const deleteUser = async (userId: string) => {
    if (!confirm('WARNING: This will permanently delete this user profile and revoke all access. Proceed?')) return;
    try {
      const { error } = await (supabase.rpc as any)('delete_user_account', { _target_user_id: userId });
      if (error) throw error;
      toast({ title: 'User Deleted', description: 'The user account has been successfully scrubbed.' });
      setUsers(prev => prev.filter(u => u.user_id !== userId));
    } catch (err: any) {
      toast({ title: 'Error deleting user', description: err.message, variant: 'destructive' });
    }
  };

  const handleFullExport = () => exportDashboardReport(sales, inventory, returns, adExpenses, {});

  // Stats
  const totalSales = sales.length;
  const totalReturns = returns.length;
  const totalProducts = inventory.length;
  const adminCount = users.filter(u => u.role === 'admin').length;
  const userCount = users.filter(u => u.role === 'user').length;

  return (
    <div className="space-y-6 max-w-6xl mx-auto animate-in">
      <PageHeader
        title="System Settings"
        subtitle="Manage configuration, users, and exports."
        icon={<SettingsIcon className="h-5 w-5 text-indigo-500" />}
      />

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="overview">System Overview</TabsTrigger>
          <TabsTrigger value="users">User Management</TabsTrigger>
          <TabsTrigger value="diagnostics" className="gap-2 flex items-center">
            {dbStatus === 'healthy' ? (
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
            ) : dbStatus === 'unhealthy' ? (
              <span className="h-2 w-2 rounded-full bg-rose-500 animate-pulse shrink-0" />
            ) : (
              <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse shrink-0" />
            )}
            Reliability & Logs
          </TabsTrigger>
          <TabsTrigger value="advanced">Advanced & AI</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
            <StatCard
              title="Products"
              value={totalProducts}
              icon={<Warehouse className="h-5 w-5" />}
              color="primary"
            />
            <StatCard
              title="Total Sales"
              value={totalSales}
              icon={<ArrowRightLeft className="h-5 w-5" />}
              color="primary"
            />
            <StatCard
              title="Returns"
              value={totalReturns}
              icon={<AlertCircle className="h-5 w-5" />}
              color="red"
            />
            <StatCard
              title="Admins"
              value={adminCount}
              icon={<Shield className="h-5 w-5" />}
              color="emerald"
            />
            <StatCard
              title="Users"
              value={userCount}
              icon={<Users className="h-5 w-5" />}
              color="slate"
            />
          </div>

          <SectionCard>
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900/50 flex items-center justify-center">
                  <FileDown className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold">Full Data Export</h3>
                  <p className="text-sm text-muted-foreground">Download a complete Excel report of all business operations.</p>
                </div>
              </div>
              <Button size="lg" className="bg-indigo-600 hover:bg-indigo-700 text-white" onClick={handleFullExport}>
                <FileDown className="mr-2 h-4 w-4" /> Generate Report
              </Button>
            </div>
          </SectionCard>

          <div className="mt-6">
            {/* Low stock Alerts */}
            <SectionCard
              title="Inventory Replenishment Alerts"
              description="Catalog items running below Safety stock guidelines (<= 10 units)"
              contentClassName="max-h-[340px] overflow-y-auto space-y-3"
            >
              {lowStockItems.length > 0 ? (
                <div className="space-y-3">
                  {lowStockItems.map(item => {
                    const percent = Math.min(100, Math.max(0, (item.currentStock / 10) * 100));
                    let badgeColor = "bg-rose-500";
                    let textColor = "text-rose-600 dark:text-rose-400";
                    let alertLevel = "Critical Reorder";
                    
                    if (item.currentStock > 2 && item.currentStock <= 5) {
                      badgeColor = "bg-amber-500";
                      textColor = "text-amber-600 dark:text-amber-400";
                      alertLevel = "Stock Warning";
                    } else if (item.currentStock > 5) {
                      badgeColor = "bg-indigo-500";
                      textColor = "text-indigo-600 dark:text-indigo-400";
                      alertLevel = "Safety Alert";
                    }
                    
                    return (
                      <div key={item.id} className="p-3 border rounded-lg hover:bg-muted/10 transition-colors flex justify-between items-center bg-white/50 dark:bg-slate-900/50">
                        <div className="min-w-0 flex-1 mr-4">
                          <p className="font-semibold text-sm truncate">{item.product_name}</p>
                          <div className="flex gap-2 items-center text-xs text-muted-foreground mt-1">
                            <Badge variant="outline" className={`${textColor} border-current py-0 text-[10px]`}>{alertLevel}</Badge>
                            <span>SKU: {item.sku}</span>
                          </div>
                          <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full mt-2.5 overflow-hidden">
                            <div className={`h-full ${badgeColor}`} style={{ width: `${percent}%` }} />
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="text-2xl font-black">{item.currentStock}</span>
                          <span className="text-[10px] text-muted-foreground block uppercase font-bold tracking-wider">units</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <EmptyState
                  icon={<CheckCircle2 className="h-10 w-10 text-emerald-500" />}
                  title="Catalog Stocks Healthy"
                  description="All catalog products are holding sufficient safety stock reserves."
                />
              )}
            </SectionCard>
          </div>

          {/* Platform Performance analysis table */}
          <SectionCard
            title="Platform channel Profitability Breakdown"
            description="Comparative performance metrics per sales channel (adjusted for returns & courier penalties)"
            className="mt-6"
            noPadding
          >
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50 dark:bg-slate-900/50">
                    <TableHead className="font-semibold text-xs">Platform</TableHead>
                    <TableHead className="text-right font-semibold text-xs">Net Revenue</TableHead>
                    <TableHead className="text-right font-semibold text-xs">COGS & Outbound</TableHead>
                    <TableHead className="text-right font-semibold text-xs">Returns Penalty</TableHead>
                    <TableHead className="text-right font-semibold text-xs">Net Profit</TableHead>
                    <TableHead className="text-right font-semibold text-xs">Return Rate</TableHead>
                    <TableHead className="text-right font-semibold text-xs">Operating Margin</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {platformData.map(p => (
                    <TableRow key={p.platform} className="hover:bg-muted/50 transition-colors">
                      <TableCell><Badge variant="secondary" className="font-bold">{p.platform}</Badge></TableCell>
                      <TableCell className="text-right font-mono text-xs font-semibold">₹{p.revenue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</TableCell>
                      <TableCell className="text-right font-mono text-xs text-muted-foreground">₹{p.cost.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</TableCell>
                      <TableCell className="text-right font-mono text-xs text-rose-500">₹{p.penalty.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</TableCell>
                      <TableCell className={`text-right font-mono text-xs font-bold ${p.profit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400'}`}>
                        ₹{p.profit.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                      </TableCell>
                      <TableCell className="text-right text-xs font-semibold text-slate-500">{p.returnRate.toFixed(1)}%</TableCell>
                      <TableCell className="text-right">
                        <Badge variant="outline" className={p.margin >= 20 ? 'text-emerald-600 border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20' : p.margin >= 10 ? 'text-indigo-600 border-indigo-200 bg-indigo-50 dark:bg-indigo-950/20' : 'text-rose-500 border-rose-200 bg-rose-50 dark:bg-rose-950/20'}>
                          {p.margin.toFixed(1)}%
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                  {platformData.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-6 text-muted-foreground text-xs">No active ledger transaction records found for operational channels.</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </SectionCard>
        </TabsContent>

        <TabsContent value="users" className="space-y-6">
          <SectionCard
            title="User Directory & Permissions"
            description={`Assign roles, view profile KYC, and manage access. ${users.length} registered users.`}
            noPadding
          >
            <div className="flex flex-col sm:flex-row gap-2 p-3 border-b bg-muted/30">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search name or email…"
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  className="pl-8 h-9 text-sm"
                />
              </div>
              <Select value={roleFilter} onValueChange={(v: any) => setRoleFilter(v)}>
                <SelectTrigger className="w-full sm:w-36 h-9 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All roles</SelectItem>
                  <SelectItem value="admin">Admin only</SelectItem>
                  <SelectItem value="user">User only</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" className="h-9 gap-2" onClick={fetchUsers} disabled={loading}>
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
              </Button>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/50">
                  <TableRow>
                    <TableHead>User Profile</TableHead>
                    <TableHead className="hidden md:table-cell">Email</TableHead>
                    <TableHead className="hidden sm:table-cell">Phone</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead className="text-right">Manage</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users
                    .filter(u => roleFilter === 'all' || u.role === roleFilter)
                    .filter(u => {
                      const q = userSearch.trim().toLowerCase();
                      if (!q) return true;
                      return (u.full_name ?? '').toLowerCase().includes(q) || (u.email ?? '').toLowerCase().includes(q);
                    })
                    .map(u => (
                    <TableRow key={u.user_id} className={u.role !== 'admin' && u.role !== 'user' ? 'bg-rose-50/50 dark:bg-rose-950/10' : ''}>
                      <TableCell>
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-xs shrink-0">
                            {u.full_name && u.full_name !== '—' ? u.full_name.substring(0, 2).toUpperCase() : 'U'}
                          </div>
                          <div className="min-w-0">
                            <div className="font-medium text-sm truncate flex items-center gap-1.5">
                              {u.full_name || 'Anonymous User'}
                              {u.user_id === user?.id && <Badge variant="outline" className="text-[9px] px-1 py-0">You</Badge>}
                            </div>
                            <div className="text-[11px] text-muted-foreground truncate md:hidden">{u.email}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm hidden md:table-cell">{u.email}</TableCell>
                      <TableCell className="text-muted-foreground text-xs hidden sm:table-cell font-mono">{u.phone || '—'}</TableCell>
                      <TableCell>
                        <Badge
                          variant={u.role === 'admin' ? 'default' : u.role === 'user' ? 'secondary' : 'destructive'}
                          className={u.role === 'admin' ? 'bg-indigo-600' : u.role !== 'user' ? 'bg-rose-600 text-white' : ''}
                        >
                          {u.role === 'admin' || u.role === 'user' ? u.role.toUpperCase() : `⚠ ${u.role.toUpperCase()}`}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" title="View KYC details" onClick={() => setDetailsUser(u)}>
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                          <Select
                            value={u.role === 'admin' || u.role === 'user' ? u.role : ''}
                            onValueChange={(v) => updateRole(u.user_id, v)}
                          >
                            <SelectTrigger className="w-28 h-8 text-xs"><SelectValue placeholder="Role…" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="admin">Admin</SelectItem>
                              <SelectItem value="user">User</SelectItem>
                            </SelectContent>
                          </Select>
                          {u.user_id !== user?.id && (
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10" title="Delete user" onClick={() => deleteUser(u.user_id)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {users.length === 0 && !loading && (
                    <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No users found</TableCell></TableRow>
                  )}
                  {loading && (
                    <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Loading users…</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </SectionCard>

          <Dialog open={!!detailsUser} onOpenChange={(o) => !o && setDetailsUser(null)}>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>{detailsUser?.full_name || 'User'}</DialogTitle>
                <DialogDescription>{detailsUser?.email}</DialogDescription>
              </DialogHeader>
              {detailsUser && (
                <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                  {[
                    ['Role', detailsUser.role?.toUpperCase()],
                    ['Phone', detailsUser.phone],
                    ['Date of Birth', detailsUser.dob],
                    ['Gender', detailsUser.gender],
                    ['Aadhar Number', detailsUser.aadhar_number],
                    ['PAN Number', detailsUser.pan_number],
                    ['Bank Name', detailsUser.bank_name],
                    ['Account Number', detailsUser.account_number],
                    ['IFSC Code', detailsUser.ifsc_code],
                  ].map(([label, val]) => (
                    <div key={label as string} className="min-w-0">
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</div>
                      <div className="font-mono text-xs truncate">{val || <span className="text-muted-foreground/60">—</span>}</div>
                    </div>
                  ))}
                  <div className="col-span-2 min-w-0">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Address</div>
                    <div className="text-xs">{detailsUser.address || <span className="text-muted-foreground/60">—</span>}</div>
                  </div>
                </div>
              )}
            </DialogContent>
          </Dialog>

          {/* Bulk recovery panel — shown automatically when any user has an unexpected role */}
          {users.some(u => u.role !== 'admin' && u.role !== 'user') && (
            <div className="rounded-xl border-2 border-rose-300 dark:border-rose-700 bg-rose-50 dark:bg-rose-950/20 p-4 space-y-3">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-rose-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold text-rose-800 dark:text-rose-300 text-sm">⚠ {users.filter(u => u.role !== 'admin' && u.role !== 'user').length} account(s) have an invalid role</p>
                  <p className="text-xs text-rose-600 dark:text-rose-400 mt-1">
                    Accounts with roles other than <code className="font-mono bg-rose-100 dark:bg-rose-900/30 px-1 rounded">admin</code> or <code className="font-mono bg-rose-100 dark:bg-rose-900/30 px-1 rounded">user</code> cannot access the ERP. Click below to reset them all to Admin immediately.
                  </p>
                </div>
              </div>
              <Button
                size="sm"
                className="bg-rose-600 hover:bg-rose-700 text-white"
                onClick={async () => {
                  const badUsers = users.filter(u => u.role !== 'admin' && u.role !== 'user');
                  let fixed = 0;
                  for (const u of badUsers) {
                    const { error } = await supabase.from('user_roles').update({ role: 'admin' as any }).eq('user_id', u.user_id);
                    if (!error) fixed++;
                  }
                  setUsers(prev => prev.map(u => (u.role !== 'admin' && u.role !== 'user') ? { ...u, role: 'admin' } : u));
                  toast({ title: `✅ Fixed ${fixed} account(s)`, description: 'All invalid-role accounts have been reset to Admin.' });
                }}
              >
                <ShieldCheck className="mr-2 h-4 w-4" />
                Reset All Invalid Roles → Admin
              </Button>
            </div>
          )}
        </TabsContent>



        <TabsContent value="diagnostics" className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-3">
            {/* Health Checklist card */}
            <SectionCard
              title="Reliability Diagnostics"
              description="Live database schema & latency checks"
              className="lg:col-span-1"
            >
              <div className="space-y-4">
                <div className="flex flex-col items-center justify-center p-4 border rounded-xl bg-slate-50/50 dark:bg-slate-900/50 text-center">
                  <span className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground">Environment Status</span>
                  {dbStatus === 'healthy' ? (
                    <>
                      <span className="text-2xl font-black text-emerald-600 mt-2 flex items-center gap-1.5">
                        <span className="h-3 w-3 rounded-full bg-emerald-500 animate-ping" />
                        Healthy
                      </span>
                      <p className="text-xs text-muted-foreground mt-1">All database schemas and RPC APIs are operational.</p>
                    </>
                  ) : dbStatus === 'unhealthy' ? (
                    <>
                      <span className="text-2xl font-black text-rose-500 mt-2 flex items-center gap-1.5">
                        <span className="h-3 w-3 rounded-full bg-rose-500 animate-ping" />
                        Warnings
                      </span>
                      <p className="text-xs text-muted-foreground mt-1">Some schemas or procedures failed verification. Please run migrations.</p>
                    </>
                  ) : (
                    <>
                      <span className="text-2xl font-black text-amber-500 mt-2 flex items-center gap-1.5 animate-pulse">
                        Testing...
                      </span>
                      <p className="text-xs text-muted-foreground mt-1">Running system queries...</p>
                    </>
                  )}
                </div>

                <div className="space-y-2.5">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-muted-foreground font-semibold">Supabase API Connection</span>
                    {diagResults.api ? (
                      <Badge className="bg-emerald-50 text-white hover:bg-emerald-600 text-[10px] px-2">Connected</Badge>
                    ) : (
                      <Badge variant="destructive" className="text-[10px] px-2">Disconnected</Badge>
                    )}
                  </div>
                  
                  <div className="border-t pt-2.5">
                    <p className="text-xs font-semibold text-muted-foreground mb-2">Stored Procedures (RPCs)</p>
                    <div className="space-y-2">
                      {diagResults.rpcs.map(r => (
                        <div key={r.name} className="flex justify-between items-center text-xs bg-slate-50 dark:bg-slate-900/40 p-1.5 rounded border">
                          <span className="font-mono text-muted-foreground text-[10px]">{r.name}()</span>
                          {r.status === 'ok' ? (
                            <span className="text-emerald-500 text-[10px] font-bold flex items-center gap-1">● Active</span>
                          ) : (
                            <span className="text-rose-500 text-[10px] font-bold flex items-center gap-1">● Error</span>
                          )}
                        </div>
                      ))}
                      {diagResults.rpcs.length === 0 && (
                        <p className="text-xs text-muted-foreground italic text-center py-2">No tests performed yet.</p>
                      )}
                    </div>
                  </div>
                </div>

                <Button onClick={runDiagnostics} disabled={diagLoading} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white mt-2">
                  <RefreshCw className={`mr-2 h-4 w-4 ${diagLoading ? 'animate-spin' : ''}`} />
                  {diagLoading ? 'Testing...' : 'Run Diagnostics'}
                </Button>
              </div>
            </SectionCard>

            {/* Simulated live logs console */}
            <SectionCard
              title="Real-time System Telemetry Logs"
              description="Live operations feed and event auditing console"
              className="lg:col-span-2"
              action={
                <Badge variant="outline" className="font-mono text-[10px] uppercase text-indigo-500 border-indigo-200 bg-indigo-50 dark:bg-indigo-950/20">stdout</Badge>
              }
            >
              <div className="rounded-xl bg-slate-950 p-4 font-mono text-[11px] text-emerald-400 border border-slate-800 shadow-inner h-[280px] overflow-y-auto space-y-1.5 scrollbar-thin">
                {auditLogs.length > 0 ? (
                  auditLogs.map((log, index) => {
                    const isError = log.includes('❌') || log.includes('ERROR') || log.includes('failed');
                    const isOk = log.includes('🟢') || log.includes('successful') || log.includes('OK');
                    let lineClass = "text-emerald-400";
                    if (isError) lineClass = "text-rose-400 font-bold";
                    else if (isOk) lineClass = "text-emerald-300";
                    
                    return (
                      <p key={index} className={`${lineClass} leading-normal`}>
                        {log}
                      </p>
                    );
                  })
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-slate-500 italic">
                    <Terminal className="h-8 w-8 text-slate-600 mb-2 animate-pulse" />
                    <p>Click "Run Diagnostics" to initialize telemetry feeds.</p>
                    <p className="text-[10px] mt-1 text-slate-600">Console stdout buffer currently empty</p>
                  </div>
                )}
              </div>
            </SectionCard>
          </div>

          {/* Database table record integrity checklist */}
          <SectionCard
            title="Database Schemas & Object Verification"
            description="Integrity scan of all core tables, columns, and records"
            noPadding
          >
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50 dark:bg-slate-900/50">
                    <TableHead>Database Object Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Record Count</TableHead>
                    <TableHead className="text-right">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {diagResults.tables.map(t => (
                    <TableRow key={t.name} className="hover:bg-muted/50 transition-colors">
                      <TableCell className="font-mono text-xs text-slate-700 dark:text-slate-300">public."{t.name}"</TableCell>
                      <TableCell className="text-xs text-muted-foreground">TABLE</TableCell>
                      <TableCell className="text-right font-mono text-xs font-semibold">{t.count}</TableCell>
                      <TableCell className="text-right">
                        {t.status === 'ok' ? (
                          <Badge className="bg-emerald-50 text-emerald-600 border-emerald-200 border hover:bg-emerald-50 text-[10px] font-bold px-2 py-0.5">Verified</Badge>
                        ) : (
                          <Badge variant="destructive" className="text-[10px] font-bold px-2 py-0.5">Failed</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {diagResults.tables.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-6 text-muted-foreground text-xs">Auditing database schema catalog...</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </SectionCard>
        </TabsContent>

        <TabsContent value="advanced" className="space-y-6">
          {/* Share Valuation Simulator Card */}
          <SectionCard
            title="Dynamic Share Valuation Simulator"
            description="Simulate and audit the algorithmic pricing engine that calculates the dynamic SAVS share value. Adjust ledger inputs below to see changes in real-time."
          >
            <div className="grid gap-6 lg:grid-cols-3">
              {/* Sliders panel */}
              <div className="lg:col-span-2 space-y-6">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <Label className="font-semibold text-slate-700 dark:text-slate-300">Catalog Inventory Asset Value (Cost + Delivery)</Label>
                    <span className="font-mono text-indigo-600 font-bold">₹{simStockValue.toLocaleString('en-IN')}</span>
                  </div>
                  <input type="range" min="0" max="1000000" step="5000" value={simStockValue} onChange={e => setSimStockValue(Number(e.target.value))} className="w-full accent-indigo-600 cursor-pointer h-2 bg-slate-100 dark:bg-slate-800 rounded-lg appearance-none" />
                  <p className="text-[11px] text-muted-foreground">Direct book cost value of all unsold inventory in warehouse holdings.</p>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <Label className="font-semibold text-slate-700 dark:text-slate-300">Active Ledger Net Profit / Loss</Label>
                    <span className={`font-mono font-bold ${simActiveProfit >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                      ₹{simActiveProfit.toLocaleString('en-IN')}
                    </span>
                  </div>
                  <input type="range" min="-200000" max="800000" step="2000" value={simActiveProfit} onChange={e => setSimActiveProfit(Number(e.target.value))} className="w-full accent-indigo-600 cursor-pointer h-2 bg-slate-100 dark:bg-slate-800 rounded-lg appearance-none" />
                  <p className="text-[11px] text-muted-foreground">Cumulative net profits minus refunds & penalties in the active disclosure period.</p>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <Label className="font-semibold text-slate-700 dark:text-slate-300">Historical Disclosed Period Earnings</Label>
                    <span className="font-mono text-indigo-600 font-bold">₹{simHistoricalProfit.toLocaleString('en-IN')}</span>
                  </div>
                  <input type="range" min="0" max="1000000" step="5000" value={simHistoricalProfit} onChange={e => setSimHistoricalProfit(Number(e.target.value))} className="w-full accent-indigo-600 cursor-pointer h-2 bg-slate-100 dark:bg-slate-800 rounded-lg appearance-none" />
                  <p className="text-[11px] text-muted-foreground">Locked earnings archived from previously closed monthly disclosure cycles.</p>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <Label className="font-semibold text-slate-700 dark:text-slate-300">Total Equity Shares</Label>
                      <span className="font-mono text-indigo-600 font-bold">{simTotalShares.toLocaleString('en-IN')}</span>
                    </div>
                    <input type="range" min="50000" max="200000" step="5000" value={simTotalShares} onChange={e => setSimTotalShares(Number(e.target.value))} className="w-full accent-indigo-600 cursor-pointer h-2 bg-slate-100 dark:bg-slate-800 rounded-lg appearance-none" />
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <Label className="font-semibold text-slate-700 dark:text-slate-300">Days Since Last Dispatch Sale</Label>
                      <span className={`font-mono font-bold ${simDaysSinceSale > 5 ? 'text-amber-500' : 'text-emerald-500'}`}>
                        {simDaysSinceSale} days
                      </span>
                    </div>
                    <input type="range" min="0" max="60" step="1" value={simDaysSinceSale} onChange={e => setSimDaysSinceSale(Number(e.target.value))} className="w-full accent-indigo-600 cursor-pointer h-2 bg-slate-100 dark:bg-slate-800 rounded-lg appearance-none" />
                  </div>
                </div>
              </div>

              {/* Formula display panel */}
              <div className="lg:col-span-1 p-5 border rounded-2xl bg-indigo-50/20 dark:bg-slate-900/50 flex flex-col justify-between">
                <div className="space-y-4">
                  <h4 className="text-sm font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">Valuation Formula Breakdown</h4>
                  
                  <div className="space-y-2.5 text-xs">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Base Equity Value:</span>
                      <span className="font-mono font-bold text-slate-700 dark:text-slate-300">₹{simBaseVal.toFixed(2)}</span>
                    </div>

                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Discounted Asset Value:</span>
                      <span className="font-mono font-semibold text-slate-700 dark:text-slate-300" title="(Stock Value * 50% discount) / Total Shares">
                        + ₹{simValuation.discountedBookValue.toFixed(2)}
                      </span>
                    </div>

                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Capitalized Earnings EPS:</span>
                      <span className="font-mono font-semibold text-slate-700 dark:text-slate-300" title="(Retained Earnings * 5x multiplier) / Total Shares">
                        + ₹{simValuation.earningsPerShare.toFixed(2)}
                      </span>
                    </div>

                    <div className="flex justify-between border-t pt-2 mt-2">
                      <span className="text-slate-700 dark:text-slate-300 font-semibold">Raw Share Price:</span>
                      <span className="font-mono font-bold text-slate-900 dark:text-slate-100">₹{simValuation.rawPrice.toFixed(2)}</span>
                    </div>

                    <div className="flex justify-between">
                      <span className="text-slate-700 dark:text-slate-300">Inactivity Time Decay:</span>
                      <span className="font-mono font-bold text-amber-500">
                        x {simValuation.timeDecayMultiplier.toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="border-t pt-4 mt-6 text-center space-y-2">
                  <span className="text-xs uppercase tracking-widest font-bold text-muted-foreground">Simulated Share Price</span>
                  <div className="text-3xl font-black text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/20 py-3 rounded-xl border border-emerald-100 dark:border-emerald-900/30 animate-pulse font-mono shadow-sm">
                    ₹{simValuation.finalPrice.toFixed(2)}
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    * Formula adheres precisely to the database calculation logic implemented in the Supabase schema.
                  </p>
                </div>
              </div>
            </div>
          </SectionCard>
        </TabsContent>
      </Tabs>
    </div>
  );
}
