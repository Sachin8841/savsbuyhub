import { useState, useEffect } from 'react';
import { useSales, useInventory } from '@/hooks/useData';
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
import { Plus, Download, Pencil, Trash2, Search, DollarSign, Clock, FileUp, Loader2, SplitSquareHorizontal } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { CsvImportButton } from '@/components/CsvImportButton';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

const COURIER_OPTIONS = ['Valmo', 'Delhivery', 'Shadowfax', 'XpressBees', 'SAVS Trans X', 'Other'];

const schema = z.object({
  dispatch_date: z.string().min(1, 'Date required'),
  platform: z.enum(['Meesho', 'Flipkart', 'Amazon', 'Offline']),
  inventory_id: z.string().min(1, 'Select a product'),
  quantity_sold: z.number().int().min(1, 'Min 1'),
  average_selling_price: z.number().min(0),
  courier_partner: z.string().optional(),
  payment_status: z.enum(['Pending', 'Settled']),
  payment_method: z.enum(['Prepaid', 'COD']).optional(),
  order_number: z.string().optional(),
  settlement_date: z.string().optional(),
  split_orders: z.boolean().optional(), // if true, qty>1 -> one row per unit
});
type FormData = z.infer<typeof schema>;

export default function Sales() {
  const { data: sales = [] } = useSales();
  const { data: inventory = [] } = useInventory();
  const { isAdmin } = useAuthStore();
  const admin = isAdmin();
  const [search, setSearch] = useState('');
  const [platformFilter, setPlatformFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const qc = useQueryClient();
  const { toast } = useToast();

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { dispatch_date: new Date().toISOString().slice(0, 10), platform: 'Meesho', inventory_id: '', quantity_sold: 1, average_selling_price: 0, courier_partner: '', payment_status: 'Pending', payment_method: 'Prepaid', order_number: '', settlement_date: '', split_orders: true },
  });

  const paymentStatus = form.watch('payment_status');
  const selectedInvId = form.watch('inventory_id');

  // Auto-fill selling price from inventory
  const selectedInv = inventory.find(i => i.id === selectedInvId);

  useEffect(() => {
    if (selectedInv && selectedInv.average_selling_price > 0 && !editId) {
      form.setValue('average_selling_price', selectedInv.average_selling_price);
    }
  }, [selectedInvId]);

  const filtered = sales.filter(s => {
    const inv = s.inventory as any;
    const matchSearch = search === '' || inv?.sku?.toLowerCase().includes(search.toLowerCase()) || inv?.product_name?.toLowerCase().includes(search.toLowerCase()) || (s.courier_partner ?? '').toLowerCase().includes(search.toLowerCase()) || ((s as any).order_number ?? '').toLowerCase().includes(search.toLowerCase());
    const matchPlatform = platformFilter === 'all' || s.platform === platformFilter;
    const matchStatus = statusFilter === 'all' || s.payment_status === statusFilter;
    return matchSearch && matchPlatform && matchStatus;
  });

  const totalRevenue = filtered.reduce((sum, s) => sum + s.quantity_sold * s.average_selling_price, 0);
  const pendingAmount = filtered.filter(s => s.payment_status === 'Pending').reduce((sum, s) => sum + s.quantity_sold * s.average_selling_price, 0);
  const settledAmount = filtered.filter(s => s.payment_status === 'Settled').reduce((sum, s) => sum + s.quantity_sold * s.average_selling_price, 0);
  const fmt = (n: number) => '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 0 });

  const onSubmit = async (values: FormData) => {
    try {
      if (!editId) {
        const { data: stock } = await supabase.rpc('get_current_stock', { inv_id: values.inventory_id });
        if (stock !== null && values.quantity_sold > (stock as number)) {
          toast({ title: 'Insufficient stock', description: `Only ${stock} units available`, variant: 'destructive' });
          return;
        }
      }
      const baseRow = {
        dispatch_date: values.dispatch_date,
        platform: values.platform,
        inventory_id: values.inventory_id,
        average_selling_price: values.average_selling_price,
        courier_partner: values.courier_partner || null,
        payment_status: values.payment_status,
        payment_method: values.payment_method ?? null,
        order_number: values.order_number || null,
        settlement_date: values.payment_status === 'Settled' && values.settlement_date ? values.settlement_date : null,
      };
      if (editId) {
        const { error } = await supabase.from('sales').update({ ...baseRow, quantity_sold: values.quantity_sold }).eq('id', editId);
        if (error) throw error;
        toast({ title: 'Sale updated' });
      } else if (values.split_orders && values.quantity_sold > 1) {
        // Each unit is a separate order
        const rows = Array.from({ length: values.quantity_sold }, () => ({ ...baseRow, quantity_sold: 1 }));
        const { error } = await supabase.from('sales').insert(rows as any);
        if (error) throw error;
        toast({ title: `Logged ${rows.length} separate orders` });
      } else {
        const { error } = await supabase.from('sales').insert({ ...baseRow, quantity_sold: values.quantity_sold } as any);
        if (error) throw error;
        toast({ title: 'Sale recorded' });
      }
      qc.invalidateQueries({ queryKey: ['sales'] });
      qc.invalidateQueries({ queryKey: ['inventory'] });
      setDialogOpen(false);
      setEditId(null);
      form.reset();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  const handleEdit = (s: any) => {
    setEditId(s.id);
    form.reset({
      dispatch_date: s.dispatch_date, platform: s.platform, inventory_id: s.inventory_id,
      quantity_sold: s.quantity_sold, average_selling_price: s.average_selling_price,
      courier_partner: s.courier_partner ?? '', payment_status: s.payment_status,
      payment_method: s.payment_method ?? 'Prepaid',
      order_number: s.order_number ?? '',
      settlement_date: s.settlement_date ?? '',
      split_orders: false,
    });
    setDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this sale?')) return;
    const { error } = await supabase.from('sales').delete().eq('id', id);
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    qc.invalidateQueries({ queryKey: ['sales'] });
    toast({ title: 'Sale deleted' });
  };

  // Quick payment status toggle
  const togglePaymentStatus = async (sale: any) => {
    const newStatus = sale.payment_status === 'Pending' ? 'Settled' : 'Pending';
    const settlement_date = newStatus === 'Settled' ? new Date().toISOString().slice(0, 10) : null;
    const { error } = await supabase.from('sales').update({ payment_status: newStatus, settlement_date }).eq('id', sale.id);
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    qc.invalidateQueries({ queryKey: ['sales'] });
    toast({ title: `Payment marked as ${newStatus}` });
  };

  const handleExport = () => {
    exportToXlsx({
      filename: `SAVS_Sales_${new Date().toISOString().slice(0, 10)}.xlsx`,
      sheetName: 'Sales',
      title: 'SAVS BuyHub - Sales Report',
      rows: filtered.map(s => {
        const inv = s.inventory as any;
        return {
          'Dispatch Date': s.dispatch_date,
          Platform: s.platform,
          SKU: inv?.sku ?? '',
          'Product Name': inv?.product_name ?? '',
          'Qty Sold': s.quantity_sold,
          'Selling Price (₹)': s.average_selling_price,
          'Revenue (₹)': s.quantity_sold * s.average_selling_price,
          'Courier Partner': s.courier_partner ?? '',
          'Payment Status': s.payment_status,
          'Settlement Date': s.settlement_date ?? '',
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
      const dispatch_date = row.dispatch_date || row.date || row['Dispatch Date'] || '';
      const platform = row.platform || row.Platform || '';
      const quantity_sold = parseInt(row.quantity_sold || row.qty || row['Quantity Sold'] || '0', 10);
      const average_selling_price = parseFloat(row.average_selling_price || row['Selling Price'] || '0');
      const courier_partner = row.courier_partner || row['Courier Partner'] || null;
      const payment_status = row.payment_status || row['Payment Status'] || 'Pending';
      const settlement_date = row.settlement_date || row['Settlement Date'] || null;
      if (!dispatch_date || !platform || !quantity_sold) { errors.push(`Missing data for SKU: ${sku}`); continue; }
      const validPlatforms = ['Meesho', 'Flipkart', 'Amazon', 'Offline'];
      if (!validPlatforms.includes(platform)) { errors.push(`Invalid platform: ${platform}`); continue; }
      const { error } = await supabase.from('sales').insert({
        dispatch_date, platform: platform as any, inventory_id: inv.id,
        quantity_sold, average_selling_price, courier_partner,
        payment_status: (payment_status === 'Settled' ? 'Settled' : 'Pending') as any,
        settlement_date: payment_status === 'Settled' && settlement_date ? settlement_date : null,
      });
      if (error) errors.push(`${sku}: ${error.message}`);
      else success++;
    }
    qc.invalidateQueries({ queryKey: ['sales'] });
    qc.invalidateQueries({ queryKey: ['inventory'] });
    return { success, errors };
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-2xl font-bold">Sales Ledger</h2>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleExport}><Download className="mr-1 h-4 w-4" />Export Excel</Button>
          {admin && <CsvImportButton onImport={handleImport} expectedColumns={['sku', 'dispatch_date', 'platform', 'quantity_sold', 'average_selling_price']} label="Import CSV" />}
          {admin && (
            <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) { setEditId(null); form.reset(); } }}>
              <DialogTrigger asChild><Button size="sm"><Plus className="mr-1 h-4 w-4" />Log Sale</Button></DialogTrigger>
              <DialogContent className="max-h-[90vh] overflow-y-auto">
                <DialogHeader><DialogTitle>{editId ? 'Edit Sale' : 'Log New Sale'}</DialogTitle></DialogHeader>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <div><Label>Dispatch Date</Label><Input type="date" {...form.register('dispatch_date')} /></div>
                  <div>
                    <Label>Platform</Label>
                    <Controller name="platform" control={form.control} render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {['Meesho', 'Flipkart', 'Amazon', 'Offline'].map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    )} />
                  </div>
                  <div>
                    <Label>Product (SKU)</Label>
                    <Controller name="inventory_id" control={form.control} render={({ field }) => (
                      <Select value={field.value} onValueChange={(v) => { field.onChange(v); }}>
                        <SelectTrigger><SelectValue placeholder="Select product" /></SelectTrigger>
                        <SelectContent>
                          {inventory.map(i => <SelectItem key={i.id} value={i.id}>{i.sku} - {i.product_name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    )} />
                    {form.formState.errors.inventory_id && <p className="text-sm text-destructive">{form.formState.errors.inventory_id.message}</p>}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>Quantity Sold</Label><Input type="number" {...form.register('quantity_sold', { valueAsNumber: true })} /></div>
                    <div><Label>Selling Price (₹)</Label><Input type="number" step="0.01" {...form.register('average_selling_price', { valueAsNumber: true })} /></div>
                  </div>
                  <div>
                    <Label>Courier Partner (Optional)</Label>
                    <Controller name="courier_partner" control={form.control} render={({ field }) => (
                      <Select value={field.value || '_none'} onValueChange={(v) => field.onChange(v === '_none' ? '' : v)}>
                        <SelectTrigger><SelectValue placeholder="Select courier" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="_none">None</SelectItem>
                          {COURIER_OPTIONS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    )} />
                  </div>
                  <div>
                    <Label>Payment Status</Label>
                    <Controller name="payment_status" control={form.control} render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Pending">Pending</SelectItem>
                          <SelectItem value="Settled">Settled</SelectItem>
                        </SelectContent>
                      </Select>
                    )} />
                  </div>
                  {paymentStatus === 'Settled' && (
                    <div><Label>Settlement Date</Label><Input type="date" {...form.register('settlement_date')} /></div>
                  )}
                  <Button type="submit" className="w-full">{editId ? 'Update' : 'Log Sale'}</Button>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-3 grid-cols-3">
        <Card><CardContent className="p-3 flex items-center gap-2"><DollarSign className="h-4 w-4 text-primary" /><div><p className="text-xs text-muted-foreground">Total Revenue</p><p className="font-bold text-sm">{fmt(totalRevenue)}</p></div></CardContent></Card>
        <Card><CardContent className="p-3 flex items-center gap-2"><Clock className="h-4 w-4 text-amber-500" /><div><p className="text-xs text-muted-foreground">Pending</p><p className="font-bold text-sm">{fmt(pendingAmount)}</p></div></CardContent></Card>
        <Card><CardContent className="p-3 flex items-center gap-2"><DollarSign className="h-4 w-4 text-emerald-500" /><div><p className="text-xs text-muted-foreground">Settled</p><p className="font-bold text-sm">{fmt(settledAmount)}</p></div></CardContent></Card>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search sales..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={platformFilter} onValueChange={setPlatformFilter}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Platform" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Platforms</SelectItem>
            {['Meesho', 'Flipkart', 'Amazon', 'Offline'].map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="Pending">Pending</SelectItem>
            <SelectItem value="Settled">Settled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Platform</TableHead>
              <TableHead>SKU</TableHead>
              <TableHead>Product</TableHead>
              <TableHead className="text-right">Qty</TableHead>
              <TableHead className="text-right">Price</TableHead>
              <TableHead>Courier</TableHead>
              <TableHead>Status</TableHead>
              {admin && <TableHead className="text-right">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map(s => {
              const inv = s.inventory as any;
              return (
                <TableRow key={s.id}>
                  <TableCell>{s.dispatch_date}</TableCell>
                  <TableCell><Badge variant="secondary">{s.platform}</Badge></TableCell>
                  <TableCell className="font-mono text-sm">{inv?.sku}</TableCell>
                  <TableCell>{inv?.product_name}</TableCell>
                  <TableCell className="text-right">{s.quantity_sold}</TableCell>
                  <TableCell className="text-right">₹{s.average_selling_price}</TableCell>
                  <TableCell>{s.courier_partner ?? '—'}</TableCell>
                  <TableCell>
                    {admin ? (
                      <Button
                        variant={s.payment_status === 'Settled' ? 'default' : 'outline'}
                        size="sm"
                        className="text-xs h-7"
                        onClick={() => togglePaymentStatus(s)}
                      >
                        {s.payment_status}
                      </Button>
                    ) : (
                      <Badge variant={s.payment_status === 'Settled' ? 'default' : 'outline'}>
                        {s.payment_status}
                      </Badge>
                    )}
                  </TableCell>
                  {admin && (
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => handleEdit(s)}><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(s.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
            {filtered.length === 0 && (
              <TableRow><TableCell colSpan={admin ? 9 : 8} className="text-center text-muted-foreground py-8">No sales found</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
