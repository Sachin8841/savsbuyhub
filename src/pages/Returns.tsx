import { useState } from 'react';
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
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { exportToXlsx } from '@/lib/xlsx-export';
import { Plus, Download, Trash2, Search, AlertTriangle, Package } from 'lucide-react';
import { CsvImportButton } from '@/components/CsvImportButton';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

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
  const qc = useQueryClient();
  const { toast } = useToast();

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { inventory_id: '', return_type: 'Customer Return', quantity_returned: 1, return_date: new Date().toISOString().slice(0, 10) },
  });

  const filtered = returns.filter(r => {
    const sale = r.sales as any;
    const inv = sale?.inventory;
    const matchSearch = search === '' ||
      inv?.sku?.toLowerCase().includes(search.toLowerCase()) ||
      inv?.product_name?.toLowerCase().includes(search.toLowerCase()) ||
      r.return_type.toLowerCase().includes(search.toLowerCase());
    const matchType = typeFilter === 'all' || r.return_type === typeFilter;
    const matchStatus = statusFilter === 'all' || r.delivery_status === statusFilter;
    return matchSearch && matchType && matchStatus;
  });

  const totalReturns = returns.reduce((sum, r) => sum + r.quantity_returned, 0);
  const totalPenalty = returns.reduce((sum, r) => sum + r.penalty_amount, 0);
  const inTransit = returns.filter(r => r.delivery_status === 'In Transit').length;
  const received = returns.filter(r => r.delivery_status === 'Received').length;
  const fmt = (n: number) => '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 0 });

  const onSubmit = async (values: FormData) => {
    try {
      const penalty_per_unit = values.return_type === 'Customer Return' ? 160 : 0;
      // One row per returned unit (quantity-based logging)
      const rows = Array.from({ length: values.quantity_returned }, () => ({
        sales_id: null,
        inventory_id: values.inventory_id,
        return_type: values.return_type,
        quantity_returned: 1,
        return_date: values.return_date,
        penalty_amount: penalty_per_unit,
        delivery_status: 'In Transit' as const,
      }));
      const { error } = await supabase.from('returns').insert(rows as any);
      if (error) throw error;
      toast({ title: `Logged ${rows.length} return${rows.length > 1 ? 's' : ''}` });
      qc.invalidateQueries({ queryKey: ['returns'] });
      qc.invalidateQueries({ queryKey: ['inventory'] });
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
    toast({ title: 'Return deleted' });
  };

  const toggleDeliveryStatus = async (ret: any) => {
    const newStatus = ret.delivery_status === 'In Transit' ? 'Received' : 'In Transit';
    const delivered_date = newStatus === 'Received' ? new Date().toISOString().slice(0, 10) : null;
    const { error } = await supabase.from('returns').update({ delivery_status: newStatus, delivered_date }).eq('id', ret.id);
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    qc.invalidateQueries({ queryKey: ['returns'] });
    qc.invalidateQueries({ queryKey: ['inventory'] });
    toast({ title: `Marked as ${newStatus}` });
  };

  const handleExport = () => {
    exportToXlsx({
      filename: `SAVS_Returns_${new Date().toISOString().slice(0, 10)}.xlsx`,
      sheetName: 'Returns',
      title: 'SAVS BuyHub - Returns Report',
      rows: filtered.map(r => {
        const sale = r.sales as any;
        const inv = sale?.inventory;
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
    for (const row of rows) {
      const sku = row.sku || row.SKU || '';
      const inv = inventory.find(i => i.sku.toLowerCase() === sku.toLowerCase());
      if (!inv) { errors.push(`SKU not found: ${sku}`); continue; }
      const productSales = sales.filter(s => s.inventory_id === inv.id);
      const returnedSaleIds = new Set(returns.map(r => r.sales_id));
      const availableSale = productSales.find(s => !returnedSaleIds.has(s.id));
      if (!availableSale) { errors.push(`No unreturned sale for: ${sku}`); continue; }
      const return_type = row.return_type || row['Return Type'] || '';
      const quantity_returned = parseInt(row.quantity_returned || row['Qty Returned'] || '0', 10);
      const return_date = row.return_date || row['Return Date'] || new Date().toISOString().slice(0, 10);
      if (!return_type || !quantity_returned) { errors.push(`Missing data for: ${sku}`); continue; }
      const validTypes = ['Customer Return', 'RTO'];
      if (!validTypes.includes(return_type)) { errors.push(`Invalid return type: ${return_type}`); continue; }
      const penalty_amount = return_type === 'Customer Return' ? 160 : 0;
      const { error } = await supabase.from('returns').insert({
        sales_id: availableSale.id, return_type: return_type as any, quantity_returned, penalty_amount, return_date,
        delivery_status: 'In Transit' as const,
      });
      if (error) errors.push(`${sku}: ${error.message}`);
      else success++;
    }
    qc.invalidateQueries({ queryKey: ['returns'] });
    qc.invalidateQueries({ queryKey: ['inventory'] });
    return { success, errors };
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-2xl font-bold">Returns</h2>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleExport}><Download className="mr-1 h-4 w-4" />Export Excel</Button>
          {admin && <CsvImportButton onImport={handleImport} expectedColumns={['sku', 'return_type', 'quantity_returned', 'return_date']} label="Import CSV" />}
          {admin && (
            <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) form.reset(); }}>
              <DialogTrigger asChild><Button size="sm"><Plus className="mr-1 h-4 w-4" />Log Return</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Log Return</DialogTitle></DialogHeader>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <div>
                    <Label>Return Date</Label>
                    <Input type="date" {...form.register('return_date')} />
                  </div>
                  <div>
                    <Label>Product</Label>
                    <Controller name="inventory_id" control={form.control} render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger><SelectValue placeholder="Select product" /></SelectTrigger>
                        <SelectContent>
                          {inventory.map(i => <SelectItem key={i.id} value={i.id}>{i.sku} - {i.product_name}</SelectItem>)}
                        </SelectContent>
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
        </div>
      </div>

      <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
        <Card><CardContent className="p-3 flex items-center gap-2"><Package className="h-4 w-4 text-primary" /><div><p className="text-xs text-muted-foreground">Total Returns</p><p className="font-bold text-sm">{totalReturns} units</p></div></CardContent></Card>
        <Card><CardContent className="p-3 flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-destructive" /><div><p className="text-xs text-muted-foreground">Total Penalty</p><p className="font-bold text-sm">{fmt(totalPenalty)}</p></div></CardContent></Card>
        <Card><CardContent className="p-3 flex items-center gap-2"><Package className="h-4 w-4 text-amber-500" /><div><p className="text-xs text-muted-foreground">In Transit</p><p className="font-bold text-sm">{inTransit}</p></div></CardContent></Card>
        <Card><CardContent className="p-3 flex items-center gap-2"><Package className="h-4 w-4 text-emerald-500" /><div><p className="text-xs text-muted-foreground">Received</p><p className="font-bold text-sm">{received}</p></div></CardContent></Card>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search returns..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="Customer Return">Customer Return</SelectItem>
            <SelectItem value="RTO">RTO</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="In Transit">In Transit</SelectItem>
            <SelectItem value="Received">Received</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Return Date</TableHead>
              <TableHead>SKU</TableHead>
              <TableHead>Product</TableHead>
              <TableHead>Platform</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="text-right">Qty</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Delivered</TableHead>
              <TableHead className="text-right">Penalty</TableHead>
              {admin && <TableHead className="text-right">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map(r => {
              const sale = r.sales as any;
              const inv = sale?.inventory;
              return (
                <TableRow key={r.id}>
                  <TableCell>{r.return_date ?? '—'}</TableCell>
                  <TableCell className="font-mono text-sm">{inv?.sku}</TableCell>
                  <TableCell>{inv?.product_name}</TableCell>
                  <TableCell><Badge variant="secondary">{sale?.platform ?? '—'}</Badge></TableCell>
                  <TableCell><Badge variant={r.return_type === 'RTO' ? 'outline' : 'secondary'}>{r.return_type}</Badge></TableCell>
                  <TableCell className="text-right">{r.quantity_returned}</TableCell>
                  <TableCell>
                    {admin ? (
                      <Button
                        variant={r.delivery_status === 'Received' ? 'default' : 'outline'}
                        size="sm"
                        className="text-xs h-7"
                        onClick={() => toggleDeliveryStatus(r)}
                      >
                        {r.delivery_status}
                      </Button>
                    ) : (
                      <Badge variant={r.delivery_status === 'Received' ? 'default' : 'outline'}>{r.delivery_status}</Badge>
                    )}
                  </TableCell>
                  <TableCell>{r.delivered_date ?? '—'}</TableCell>
                  <TableCell className="text-right">₹{r.penalty_amount}</TableCell>
                  {admin && (
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(r.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
            {filtered.length === 0 && (
              <TableRow><TableCell colSpan={admin ? 10 : 9} className="text-center text-muted-foreground py-8">No returns found</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
