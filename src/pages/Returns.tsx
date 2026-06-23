import { useState, useRef } from 'react';
import { useReturns, useSales, useInventory } from '@/hooks/useData';
import { useAuthStore } from '@/stores/authStore';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { exportToXlsx } from '@/lib/xlsx-export';
import { Plus, Download, Trash2, Search, AlertTriangle, Package, Activity, Frown, RotateCcw, FileUp, Loader2 } from 'lucide-react';
import { PageHeader, StatCard, SectionCard, EmptyState } from '@/components/PageHeader';
import { CsvImportButton } from '@/components/CsvImportButton';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { parseMeeshoReturnsCsv, classifyReturnType, matchInventoryBySku } from '@/lib/importMeesho';


const schema = z.object({
  inventory_id: z.string().min(1, 'Select a product'),
  return_type: z.enum(['Customer Return', 'RTO']),
  quantity_returned: z.number().int().min(1),
  return_date: z.string().min(1, 'Return date required'),
});
type FormData = z.infer<typeof schema>;

export default function Returns() {
  const { data: returns = [] } = useReturns();
  const { data: sales = [] } = useSales();
  const { data: inventory = [] } = useInventory();
  const { isAdmin } = useAuthStore();
  const admin = isAdmin();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [meeshoBusy, setMeeshoBusy] = useState(false);
  const [meeshoPreview, setMeeshoPreview] = useState<any[] | null>(null);
  const [meeshoPreviewOpen, setMeeshoPreviewOpen] = useState(false);
  const meeshoFileRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();
  const { toast } = useToast();


  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { inventory_id: '', return_type: 'Customer Return', quantity_returned: 1, return_date: new Date().toISOString().slice(0, 10) },
  });

  const filtered = returns.filter(r => {
    const sale = r.sales as any;
    const inv = (r as any).inventory ?? sale?.inventory ?? inventory.find(i => i.id === r.inventory_id);
    const searchLower = search.toLowerCase();
    const matchSearch = search === '' ||
      (inv?.sku && inv.sku.toLowerCase().includes(searchLower)) ||
      (inv?.product_name && inv.product_name.toLowerCase().includes(searchLower)) ||
      (r.return_type && r.return_type.toLowerCase().includes(searchLower));
    const matchType = typeFilter === 'all' || r.return_type === typeFilter;
    const matchStatus = statusFilter === 'all' || r.delivery_status === statusFilter;
    return matchSearch && matchType && matchStatus;
  });

  const totalReturns = returns.reduce((sum, r) => sum + r.quantity_returned, 0);
  const totalPenalty = returns.reduce((sum, r) => sum + r.penalty_amount, 0);
  const inTransit = returns.filter(r => r.delivery_status === 'In Transit').length;
  const received = returns.filter(r => r.delivery_status === 'Received').length;
  const fmt = (n: number) => '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 0 });

  // Generate Penalty Chart Data
  const penaltyBySku = filtered.reduce((acc: any, curr) => {
    const sale = curr.sales as any;
    const inv = (curr as any).inventory ?? sale?.inventory ?? inventory.find(i => i.id === curr.inventory_id);
    const sku = inv?.sku || 'Unknown';
    if (!acc[sku]) acc[sku] = { sku, penalty: 0, count: 0 };
    acc[sku].penalty += curr.penalty_amount;
    acc[sku].count += curr.quantity_returned;
    return acc;
  }, {});
  
  const topPenalizedSkus = Object.values(penaltyBySku)
    .sort((a: any, b: any) => b.penalty - a.penalty)
    .slice(0, 5);

  const onSubmit = async (values: FormData) => {
    try {
      const penalty_per_unit = values.return_type === 'Customer Return' ? 160 : 0;
      const row = {
        sales_id: null,
        inventory_id: values.inventory_id,
        return_type: values.return_type,
        quantity_returned: values.quantity_returned,
        return_date: values.return_date,
        penalty_amount: penalty_per_unit * values.quantity_returned,
        delivery_status: 'In Transit' as const,
      };
      const { error } = await supabase.from('returns').insert(row as any);
      if (error) throw error;
      toast({ title: `Logged return of ${values.quantity_returned} unit(s)` });
      qc.invalidateQueries({ queryKey: ['returns'] });
      qc.invalidateQueries({ queryKey: ['inventory'] });
      qc.invalidateQueries({ queryKey: ['capital_accounts'] });
      qc.invalidateQueries({ queryKey: ['cash_movements'] });
      setDialogOpen(false);
      form.reset();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this return?')) return;
    const { error } = await supabase.from('returns').delete().eq('id', id);
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    qc.invalidateQueries({ queryKey: ['returns'] });
    qc.invalidateQueries({ queryKey: ['inventory'] });
    qc.invalidateQueries({ queryKey: ['capital_accounts'] });
    qc.invalidateQueries({ queryKey: ['cash_movements'] });
    toast({ title: 'Return deleted' });
  };

  const toggleDeliveryStatus = async (ret: any) => {
    const newStatus = ret.delivery_status === 'In Transit' ? 'Received' : 'In Transit';
    const delivered_date = newStatus === 'Received' ? new Date().toISOString().slice(0, 10) : null;
    const { error } = await supabase.from('returns').update({ delivery_status: newStatus, delivered_date }).eq('id', ret.id);
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    qc.invalidateQueries({ queryKey: ['returns'] });
    qc.invalidateQueries({ queryKey: ['inventory'] });
    qc.invalidateQueries({ queryKey: ['capital_accounts'] });
    qc.invalidateQueries({ queryKey: ['cash_movements'] });
    toast({ title: `Marked as ${newStatus}` });
  };

  const handleExport = () => {
    exportToXlsx({
      filename: `SAVS_Returns_${new Date().toISOString().slice(0, 10)}.xlsx`,
      sheetName: 'Returns',
      title: 'SAVS BuyHub - Returns Report',
      rows: filtered.map(r => {
        const sale = r.sales as any;
        const inv = (r as any).inventory ?? sale?.inventory ?? inventory.find(i => i.id === r.inventory_id);
        return {
          'Return Date': r.return_date ?? '',
          SKU: inv?.sku ?? '',
          'Product Name': inv?.product_name ?? '',
          Platform: sale?.platform ?? '',
          'Return Type': r.return_type,
          'Qty Returned': r.quantity_returned,
          'Delivery Status': r.delivery_status,
          'Delivered Date': r.delivered_date ?? '',
          'Penalty (₹)': r.penalty_amount,
        };
      }),
    });
  };

  const handleImport = async (rows: Record<string, string>[]) => {
    let success = 0;
    const errors: string[] = [];
    const inserts: any[] = [];
    for (const row of rows) {
      const sku = row.sku || row.SKU || '';
      const inv = inventory.find(i => i.sku.toLowerCase() === sku.toLowerCase());
      if (!inv) { errors.push(`SKU not found: ${sku}`); continue; }
      const return_type = row.return_type || row['Return Type'] || '';
      const quantity_returned = parseInt(row.quantity_returned || row['Qty Returned'] || '0', 10);
      const return_date = row.return_date || row['Return Date'] || new Date().toISOString().slice(0, 10);
      if (!return_type || !quantity_returned) { errors.push(`Missing data for: ${sku}`); continue; }
      const validTypes = ['Customer Return', 'RTO'];
      if (!validTypes.includes(return_type)) { errors.push(`Invalid return type: ${return_type}`); continue; }
      const penalty_per_unit = return_type === 'Customer Return' ? 160 : 0;
      for (let i = 0; i < quantity_returned; i++) {
        inserts.push({
          sales_id: null, inventory_id: inv.id,
          return_type: return_type as any, quantity_returned: 1, penalty_amount: penalty_per_unit,
          return_date, delivery_status: 'In Transit' as const,
        });
      }
      success += quantity_returned;
    }
    if (inserts.length) {
      const { error } = await supabase.from('returns').insert(inserts);
      if (error) errors.push(error.message);
    }
    qc.invalidateQueries({ queryKey: ['returns'] });
    qc.invalidateQueries({ queryKey: ['inventory'] });
    qc.invalidateQueries({ queryKey: ['capital_accounts'] });
    qc.invalidateQueries({ queryKey: ['cash_movements'] });
    return { success, errors };
  };

  // ---------- Meesho returns CSV upload (intransit/RTO report) ----------
  const handleMeeshoFile = async (file: File) => {
    try {
      setMeeshoBusy(true);
      const text = await file.text();
      const rows = parseMeeshoReturnsCsv(text);
      if (!rows.length) { toast({ title: 'No return rows detected', description: 'The CSV does not contain a recognisable header row.', variant: 'destructive' }); return; }

      const existing = new Set(returns.map(r => `${(r as any).sales_id ?? ''}|${(r as any).return_date ?? ''}|${(r as any).inventory_id ?? ''}|${(r as any).return_type ?? ''}`));
      const previews = rows.map((r) => {
        const inv = matchInventoryBySku(inventory as any, r.sku, r.productName);
        const sale = sales.find((s: any) => s.order_number && (s.order_number === r.subOrderNumber || s.order_number === r.orderNumber));
        const return_type = classifyReturnType(r.typeOfReturn);
        const return_date = r.returnCreatedDate || r.dispatchDate || new Date().toISOString().slice(0, 10);
        const dedupKey = `${sale?.id ?? ''}|${return_date}|${inv?.id ?? ''}|${return_type}`;
        return {
          ...r,
          matchedInventory: inv,
          matchedSale: sale,
          return_type,
          return_date,
          delivery_status: /returned|received|delivered/i.test(r.status) ? 'Received' : 'In Transit',
          duplicate: existing.has(dedupKey),
        };
      });
      setMeeshoPreview(previews);
      setMeeshoPreviewOpen(true);
    } catch (err: any) {
      toast({ title: 'Parse failed', description: err.message, variant: 'destructive' });
    } finally {
      setMeeshoBusy(false);
      if (meeshoFileRef.current) meeshoFileRef.current.value = '';
    }
  };

  const confirmMeeshoImport = async () => {
    if (!meeshoPreview) return;
    let inserted = 0, salesUpdated = 0, skipped = 0;
    const errors: string[] = [];
    for (const p of meeshoPreview) {
      if (!p.matchedInventory) { skipped++; continue; }
      if (p.duplicate) { skipped++; continue; }
      const penalty_per_unit = p.return_type === 'Customer Return' ? 160 : 0;
      const insertRow: any = {
        sales_id: p.matchedSale?.id ?? null,
        inventory_id: p.matchedInventory.id,
        return_type: p.return_type,
        quantity_returned: p.quantity || 1,
        return_date: p.return_date,
        penalty_amount: penalty_per_unit * (p.quantity || 1),
        delivery_status: p.delivery_status,
        delivered_date: p.delivery_status === 'Received' ? p.return_date : null,
      };
      const { error } = await supabase.from('returns').insert(insertRow);
      if (error) { errors.push(`${p.subOrderNumber}: ${error.message}`); continue; }
      inserted++;

      // Update sales row's payment_status if we matched a sale.
      if (p.matchedSale?.id) {
        const newStatus = p.return_type === 'RTO' ? 'Order RTO' : 'Return';
        if (p.matchedSale.payment_status !== newStatus) {
          const { error: upErr } = await supabase.from('sales').update({ payment_status: newStatus } as any).eq('id', p.matchedSale.id);
          if (!upErr) salesUpdated++;
        }
      }
    }
    qc.invalidateQueries({ queryKey: ['returns'] });
    qc.invalidateQueries({ queryKey: ['sales'] });
    qc.invalidateQueries({ queryKey: ['inventory'] });
    qc.invalidateQueries({ queryKey: ['capital_accounts'] });
    qc.invalidateQueries({ queryKey: ['cash_movements'] });
    toast({
      title: `Imported ${inserted} returns`,
      description: `${salesUpdated} sales rows updated · ${skipped} skipped (duplicate or unmatched SKU)${errors.length ? ` · ${errors.length} errors` : ''}`,
    });
    setMeeshoPreviewOpen(false);
    setMeeshoPreview(null);
  };


  return (
    <div className="space-y-5 animate-in">
      <PageHeader
        title="Returns"
        subtitle={`${returns.length} total returns · ${fmt(totalPenalty)} in penalties`}
        icon={<RotateCcw className="h-5 w-5 text-red-500" />}
        actions={<>
          <Button variant="outline" size="sm" onClick={handleExport} className="gap-1.5"><Download className="h-4 w-4" />Export</Button>
          {admin && <CsvImportButton onImport={handleImport} expectedColumns={['sku', 'return_type', 'quantity_returned', 'return_date']} label="Import CSV" />}
          {admin && (
            <>
              <input ref={meeshoFileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleMeeshoFile(f); }} />
              <Button variant="outline" size="sm" disabled={meeshoBusy} onClick={() => meeshoFileRef.current?.click()} className="gap-1.5">
                {meeshoBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}Import Meesho Returns CSV
              </Button>
            </>
          )}
          {admin && (
            <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) form.reset(); }}>
              <DialogTrigger asChild><Button size="sm" className="gap-1.5 bg-gradient-to-r from-red-600 to-rose-500 hover:from-red-700 hover:to-rose-600 shadow-sm"><Plus className="h-4 w-4" />Log Return</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Log Return</DialogTitle></DialogHeader>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <div><Label>Return Date</Label><Input type="date" {...form.register('return_date')} /></div>
                  <div>
                    <Label>Product</Label>
                    <Controller name="inventory_id" control={form.control} render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger><SelectValue placeholder="Select product" /></SelectTrigger>
                        <SelectContent>{inventory.map(i => <SelectItem key={i.id} value={i.id}>{i.sku} - {i.product_name}</SelectItem>)}</SelectContent>
                      </Select>
                    )} />
                    {form.formState.errors.inventory_id && <p className="text-sm text-destructive">{form.formState.errors.inventory_id.message}</p>}
                  </div>
                  <div>
                    <Label>Return Type</Label>
                    <Controller name="return_type" control={form.control} render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Customer Return">Customer Return (₹160 penalty)</SelectItem>
                          <SelectItem value="RTO">RTO (No penalty)</SelectItem>
                        </SelectContent>
                      </Select>
                    )} />
                  </div>
                  <div><Label>Quantity Returned</Label><Input type="number" {...form.register('quantity_returned', { valueAsNumber: true })} /></div>
                  <Button type="submit" className="w-full">Log Return</Button>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </>}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard title="Total Units Returned" value={`${totalReturns}`} subtitle="All time" icon={<Package />} color="slate" />
        <StatCard title="Penalty Costs" value={fmt(totalPenalty)} icon={<AlertTriangle />} color="red" />
        <StatCard title="In Transit" value={inTransit} icon={<Activity />} color="amber" />
        <StatCard title="Received" value={received} icon={<Package />} color="emerald" />
      </div>

      <SectionCard title="Top Problematic SKUs" description="Sorted by highest penalty cost" noPadding={false}>
        <div className="h-52">
          {topPenalizedSkus.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topPenalizedSkus} layout="vertical" margin={{ top: 4, right: 20, left: 16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="hsl(var(--border))" />
                <XAxis type="number" tickFormatter={(v) => `₹${v}`} fontSize={11} tickLine={false} axisLine={false} />
                <YAxis dataKey="sku" type="category" fontSize={11} width={80} tickLine={false} axisLine={false} />
                <Tooltip formatter={(val: number) => [`₹${val}`, 'Penalty']} contentStyle={{ borderRadius: '8px', fontSize: '12px' }} />
                <Bar dataKey="penalty" radius={[0, 4, 4, 0]} barSize={20}>
                  {topPenalizedSkus.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={index === 0 ? "hsl(0, 84%, 60%)" : "hsl(0, 84%, 60%, 0.6)"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState icon={<Frown className="h-8 w-8" />} title="No penalty data" description="No return penalties recorded yet." />
          )}
        </div>
      </SectionCard>

      <SectionCard
        title="Returns Ledger"
        description={`${filtered.length} records`}
        action={
          <div className="flex flex-wrap gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Search returns..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-8 w-48 text-sm" />
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-36 h-8 text-sm"><SelectValue placeholder="Type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="Customer Return">Customer Return</SelectItem>
                <SelectItem value="RTO">RTO</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-36 h-8 text-sm"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="In Transit">In Transit</SelectItem>
                <SelectItem value="Received">Received</SelectItem>
              </SelectContent>
            </Select>
          </div>
        }
        noPadding
      >
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead className="font-semibold">Return Date</TableHead>
                <TableHead className="font-semibold">SKU</TableHead>
                <TableHead className="font-semibold">Product</TableHead>
                <TableHead className="font-semibold">Platform</TableHead>
                <TableHead className="font-semibold">Type</TableHead>
                <TableHead className="text-right font-semibold">Qty</TableHead>
                <TableHead className="font-semibold">Status</TableHead>
                <TableHead className="font-semibold">Delivered</TableHead>
                <TableHead className="text-right font-semibold">Penalty</TableHead>
                {admin && <TableHead className="text-right font-semibold">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(r => {
                const sale = r.sales as any;
                const inv = (r as any).inventory ?? sale?.inventory ?? inventory.find(i => i.id === r.inventory_id);
                return (
                  <TableRow key={r.id} className="hover:bg-primary/5 transition-colors group">
                    <TableCell className="text-muted-foreground text-sm">{r.return_date ?? '—'}</TableCell>
                    <TableCell className="font-mono text-xs font-medium text-primary">{inv?.sku ?? '—'}</TableCell>
                    <TableCell className="font-medium">{inv?.product_name ?? '—'}</TableCell>
                    <TableCell><Badge variant="secondary" className="text-xs">{sale?.platform ?? '—'}</Badge></TableCell>
                    <TableCell>
                      <Badge variant={r.return_type === 'RTO' ? 'outline' : 'secondary'} className={`text-xs ${r.return_type === 'Customer Return' ? 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300' : ''}` }>{r.return_type}</Badge>
                    </TableCell>
                    <TableCell className="text-right font-semibold">{r.quantity_returned}</TableCell>
                    <TableCell>
                      {admin ? (
                        <Button variant={r.delivery_status === 'Received' ? 'default' : 'outline'} size="sm" className="text-xs h-6 px-2" onClick={() => toggleDeliveryStatus(r)}>{r.delivery_status}</Button>
                      ) : (
                        <Badge variant={r.delivery_status === 'Received' ? 'default' : 'outline'} className="text-xs">{r.delivery_status}</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{r.delivered_date ?? '—'}</TableCell>
                    <TableCell className="text-right font-semibold text-red-600 dark:text-red-400">₹{r.penalty_amount}</TableCell>
                    {admin && (
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:bg-destructive/10" onClick={() => handleDelete(r.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={admin ? 10 : 9} className="py-16">
                    <EmptyState icon={<RotateCcw className="h-8 w-8" />} title="No returns found" description="Log a return or adjust your filters." />
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </SectionCard>
    </div>
  );
}
