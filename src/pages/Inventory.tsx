import { useState, useEffect } from 'react';
import { useInventory } from '@/hooks/useData';
import { useAuthStore } from '@/stores/authStore';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { exportToXlsx } from '@/lib/xlsx-export';
import { Card, CardContent } from '@/components/ui/card';
import { Plus, Download, Pencil, Trash2, Search, AlertTriangle, PackagePlus } from 'lucide-react';
import { CsvImportButton } from '@/components/CsvImportButton';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

const schema = z.object({
  sku: z.string().min(1, 'SKU required').max(50),
  product_name: z.string().min(1, 'Product name required').max(255),
  aliases: z.string().optional(), // comma-separated
  average_cost_price: z.number().min(0),
  average_selling_price: z.number().min(0),
  total_bulk_stock_in: z.number().int().min(0),
  delivery_fee: z.number().min(0),
  stock_added_date: z.string().optional(),
});
type FormData = z.infer<typeof schema>;

export default function Inventory() {
  const { data: inventory = [] } = useInventory();
  const { isAdmin } = useAuthStore();
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [currentStocks, setCurrentStocks] = useState<Record<string, number>>({});
  const qc = useQueryClient();
  const { toast } = useToast();
  const admin = isAdmin();

  const form = useForm<FormData>({ resolver: zodResolver(schema), defaultValues: { sku: '', product_name: '', aliases: '', average_cost_price: 0, average_selling_price: 0, total_bulk_stock_in: 0, delivery_fee: 0, stock_added_date: new Date().toISOString().slice(0, 10) } });

  const [restockDialogOpen, setRestockDialogOpen] = useState(false);
  const [restockItem, setRestockItem] = useState<any>(null);

  const restockForm = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { sku: '', product_name: '', aliases: '', average_cost_price: 0, average_selling_price: 0, total_bulk_stock_in: 0, delivery_fee: 0, stock_added_date: new Date().toISOString().slice(0, 10) }
  });

  const getNextBatchSkuAndName = (item: any, inventoryList: any[]) => {
    const baseSku = item.sku.replace(/_B\d+$/, '');
    const baseName = item.product_name.replace(/\s*\(Batch\s*\d+\)$/, '');
    
    let maxBatch = 1;
    inventoryList.forEach(i => {
      if (i.sku === baseSku) {
        // base batch
      } else {
        const match = i.sku.match(new RegExp(`^${baseSku}_B(\\d+)$`));
        if (match) {
          const num = parseInt(match[1], 10);
          if (num > maxBatch) maxBatch = num;
        }
      }
    });
    
    const nextBatch = maxBatch + 1;
    return {
      sku: `${baseSku}_B${nextBatch}`,
      product_name: `${baseName} (Batch ${nextBatch})`
    };
  };

  const handleRestockInit = (item: any) => {
    setRestockItem(item);
    const { sku, product_name } = getNextBatchSkuAndName(item, inventory);
    restockForm.reset({
      sku,
      product_name,
      aliases: (item.aliases ?? []).join(', '),
      average_cost_price: 0,
      average_selling_price: item.average_selling_price ?? 0,
      total_bulk_stock_in: 0,
      delivery_fee: 0,
      stock_added_date: new Date().toISOString().slice(0, 10)
    });
    setRestockDialogOpen(true);
  };

  const onRestockSubmit = async (values: FormData) => {
    try {
      const aliases = (values.aliases ?? '').split(',').map(s => s.trim()).filter(Boolean);
      const payload = {
        sku: values.sku,
        product_name: values.product_name,
        aliases,
        average_cost_price: values.average_cost_price,
        average_selling_price: values.average_selling_price,
        total_bulk_stock_in: values.total_bulk_stock_in,
        delivery_fee: values.delivery_fee,
        stock_added_date: values.stock_added_date || new Date().toISOString().slice(0, 10),
      };
      const { error } = await supabase.from('inventory').insert(payload);
      if (error) throw error;
      toast({ title: 'New batch restocked successfully' });
      qc.invalidateQueries({ queryKey: ['inventory'] });
      setRestockDialogOpen(false);
      setRestockItem(null);
      restockForm.reset();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  useEffect(() => {
    inventory.forEach(async (item) => {
      const { data } = await supabase.rpc('get_current_stock', { inv_id: item.id });
      if (data !== null) setCurrentStocks(prev => ({ ...prev, [item.id]: data as number }));
    });
  }, [inventory]);

  const filtered = inventory.filter(i =>
    i.sku.toLowerCase().includes(search.toLowerCase()) ||
    i.product_name.toLowerCase().includes(search.toLowerCase())
  );

  // Calculate stock holding value
  const totalStockValue = inventory.reduce((sum, item) => {
    const stock = currentStocks[item.id] ?? 0;
    return sum + stock * (item.average_cost_price || 0);
  }, 0);

  const onSubmit = async (values: FormData) => {
    try {
      const aliases = (values.aliases ?? '').split(',').map(s => s.trim()).filter(Boolean);

      const payload = {
        sku: values.sku,
        product_name: values.product_name,
        aliases,
        average_cost_price: values.average_cost_price,
        average_selling_price: values.average_selling_price,
        total_bulk_stock_in: values.total_bulk_stock_in,
        delivery_fee: values.delivery_fee,
        stock_added_date: values.stock_added_date || new Date().toISOString().slice(0, 10),
      };
      if (editId) {
        const { error } = await supabase.from('inventory').update(payload).eq('id', editId);
        if (error) throw error;
        toast({ title: 'Item updated' });
      } else {
        const { error } = await supabase.from('inventory').insert(payload);
        if (error) throw error;
        toast({ title: 'Item added' });
      }
      qc.invalidateQueries({ queryKey: ['inventory'] });
      setDialogOpen(false);
      setEditId(null);
      form.reset();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  const handleEdit = (item: any) => {
    setEditId(item.id);
    form.reset({ sku: item.sku, product_name: item.product_name, aliases: (item.aliases ?? []).join(', '), average_cost_price: item.average_cost_price, average_selling_price: item.average_selling_price ?? 0, total_bulk_stock_in: item.total_bulk_stock_in, delivery_fee: item.delivery_fee ?? 0, stock_added_date: (item as any).stock_added_date ?? new Date().toISOString().slice(0, 10) });
    setDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this item?')) return;
    const { error } = await supabase.from('inventory').delete().eq('id', id);
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    qc.invalidateQueries({ queryKey: ['inventory'] });
    toast({ title: 'Item deleted' });
  };

  const fmt = (n: number) => '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 2 });

  const handleExport = () => {
    exportToXlsx({
      filename: `SAVS_Inventory_${new Date().toISOString().slice(0, 10)}.xlsx`,
      sheetName: 'Inventory',
      title: 'SAVS BuyHub - Inventory Report',
      rows: filtered.map(i => ({
        SKU: i.sku,
        'Product Name': i.product_name,
        'Cost Price (₹)': i.average_cost_price,
        'Selling Price (₹)': i.average_selling_price ?? 0,
        'Current Stock': currentStocks[i.id] ?? 0,
        'Delivery Fee (₹)': i.delivery_fee ?? 0,
        'Stock Value (₹)': (currentStocks[i.id] ?? 0) * i.average_cost_price,
      })),
    });
  };

  const handleImport = async (rows: Record<string, string>[]) => {
    let success = 0;
    const errors: string[] = [];
    for (const row of rows) {
      const sku = row.sku || row.SKU || '';
      const product_name = row.product_name || row.product || row['Product Name'] || '';
      const average_cost_price = parseFloat(row.average_cost_price || row['Cost Price'] || '0');
      const average_selling_price = parseFloat(row.average_selling_price || row['Selling Price'] || '0');
      const total_bulk_stock_in = parseInt(row.total_bulk_stock_in || row.bulk_stock_in || row['Bulk Stock In'] || '0', 10);
      const delivery_fee = parseFloat(row.delivery_fee || row['Delivery Fee'] || '0');
      if (!sku || !product_name) { errors.push(`Missing SKU/name: ${sku}`); continue; }
      const { error } = await supabase.from('inventory').insert({ sku, product_name, average_cost_price, average_selling_price, total_bulk_stock_in, delivery_fee });
      if (error) errors.push(`${sku}: ${error.message}`);
      else success++;
    }
    qc.invalidateQueries({ queryKey: ['inventory'] });
    return { success, errors };
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">Inventory</h2>
          <p className="text-sm text-muted-foreground">Stock Holding Value: <span className="font-semibold text-primary">{fmt(totalStockValue)}</span></p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleExport}><Download className="mr-1 h-4 w-4" />Export Excel</Button>
          {admin && <CsvImportButton onImport={handleImport} expectedColumns={['sku', 'product_name', 'average_cost_price', 'average_selling_price', 'total_bulk_stock_in']} label="Import CSV" />}
          {admin && (
            <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) { setEditId(null); form.reset(); } }}>
              <DialogTrigger asChild>
                <Button size="sm"><Plus className="mr-1 h-4 w-4" />Add Item</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>{editId ? 'Edit Item' : 'Add Item'}</DialogTitle></DialogHeader>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <div><Label>SKU</Label><Input {...form.register('sku')} />{form.formState.errors.sku && <p className="text-sm text-destructive">{form.formState.errors.sku.message}</p>}</div>
                  <div><Label>Product Name</Label><Input {...form.register('product_name')} />{form.formState.errors.product_name && <p className="text-sm text-destructive">{form.formState.errors.product_name.message}</p>}</div>
                  <div><Label>Aliases (comma-separated, used to match product names from bills)</Label><Input placeholder="e.g. Blue Tee, Cotton T-shirt Blue" {...form.register('aliases')} /></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>Cost Price (₹)</Label><Input type="number" step="0.01" {...form.register('average_cost_price', { valueAsNumber: true })} /></div>
                    <div><Label>Selling Price (₹)</Label><Input type="number" step="0.01" {...form.register('average_selling_price', { valueAsNumber: true })} /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>Bulk Stock In</Label><Input type="number" {...form.register('total_bulk_stock_in', { valueAsNumber: true })} /></div>
                    <div><Label>Delivery Fee (₹)</Label><Input type="number" step="0.01" {...form.register('delivery_fee', { valueAsNumber: true })} /></div>
                  </div>
                  <div><Label>Stock Added Date</Label><Input type="date" {...form.register('stock_added_date')} /></div>
                  <Button type="submit" className="w-full">{editId ? 'Update' : 'Add'}</Button>
                </form>
              </DialogContent>
            </Dialog>
          )}
          
          {admin && (
            <Dialog open={restockDialogOpen} onOpenChange={(o) => { setRestockDialogOpen(o); if (!o) { setRestockItem(null); restockForm.reset(); } }}>
              <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2 text-indigo-600">
                    <PackagePlus className="h-5 w-5" />
                    Restock Item (New Batch)
                  </DialogTitle>
                  <div className="text-xs text-muted-foreground mt-1">
                    Adding new stock for "{restockItem?.product_name}" at a different price point. This creates a new batch SKU to preserve history.
                  </div>
                </DialogHeader>
                <form onSubmit={restockForm.handleSubmit(onRestockSubmit)} className="space-y-4 pt-2">
                  <div>
                    <Label>Batch SKU *</Label>
                    <Input {...restockForm.register('sku')} />
                    {restockForm.formState.errors.sku && <p className="text-sm text-destructive">{restockForm.formState.errors.sku.message}</p>}
                  </div>
                  <div>
                    <Label>Product Name *</Label>
                    <Input {...restockForm.register('product_name')} />
                    {restockForm.formState.errors.product_name && <p className="text-sm text-destructive">{restockForm.formState.errors.product_name.message}</p>}
                  </div>
                  <div>
                    <Label>Aliases (comma-separated)</Label>
                    <Input placeholder="e.g. Blue Tee, Cotton T-shirt Blue" {...restockForm.register('aliases')} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>New Cost Price (₹) *</Label>
                      <Input type="number" step="0.01" {...restockForm.register('average_cost_price', { valueAsNumber: true })} />
                      {restockForm.formState.errors.average_cost_price && <p className="text-sm text-destructive">{restockForm.formState.errors.average_cost_price.message}</p>}
                    </div>
                    <div>
                      <Label>Selling Price (₹) *</Label>
                      <Input type="number" step="0.01" {...restockForm.register('average_selling_price', { valueAsNumber: true })} />
                      {restockForm.formState.errors.average_selling_price && <p className="text-sm text-destructive">{restockForm.formState.errors.average_selling_price.message}</p>}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Bulk Stock In *</Label>
                      <Input type="number" {...restockForm.register('total_bulk_stock_in', { valueAsNumber: true })} />
                      {restockForm.formState.errors.total_bulk_stock_in && <p className="text-sm text-destructive">{restockForm.formState.errors.total_bulk_stock_in.message}</p>}
                    </div>
                    <div>
                      <Label>Delivery Fee (₹) *</Label>
                      <Input type="number" step="0.01" {...restockForm.register('delivery_fee', { valueAsNumber: true })} />
                      {restockForm.formState.errors.delivery_fee && <p className="text-sm text-destructive">{restockForm.formState.errors.delivery_fee.message}</p>}
                    </div>
                  </div>
                  <div>
                    <Label>Stock Added Date</Label>
                    <Input type="date" {...restockForm.register('stock_added_date')} />
                  </div>
                  <Button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700 text-white">Add Batch Stock</Button>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="md:col-span-1 glass-card shadow-sm border-0 bg-gradient-to-br from-indigo-50 to-white dark:from-slate-900 dark:to-slate-950">
          <CardContent className="p-6 flex flex-col justify-center h-full">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Total Locked Capital</h3>
            <p className="text-4xl font-bold text-indigo-600 dark:text-indigo-400">{fmt(totalStockValue)}</p>
            <p className="text-sm mt-4 text-slate-500">Capital tied up in physical inventory across <span className="font-semibold text-slate-700 dark:text-slate-300">{filtered.length} SKUs</span>.</p>
          </CardContent>
        </Card>
        <Card className="md:col-span-2 glass-card shadow-sm border-0 h-48">
          <CardContent className="p-4 h-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={filtered.map(i => {
                return { name: i.sku, value: (currentStocks[i.id] ?? 0) * (i.average_cost_price || 0) };
              }).sort((a,b) => b.value - a.value).slice(0, 10)}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="name" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis tickFormatter={(v) => `₹${v}`} fontSize={10} tickLine={false} axisLine={false} />
                <Tooltip formatter={(v: number) => `₹${v.toFixed(2)}`} cursor={{ fill: 'transparent' }} />
                <Bar dataKey="value" fill="hsl(238, 81%, 65%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Search inventory..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>SKU</TableHead>
              <TableHead>Product Name</TableHead>
              <TableHead className="text-right">Cost Price</TableHead>
              <TableHead className="text-right">Selling Price</TableHead>
              <TableHead className="text-right">Current Stock</TableHead>
              <TableHead className="text-right">Delivery Fee</TableHead>
              <TableHead>Stock Added</TableHead>
              {admin && <TableHead className="text-right">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map(item => (
              <TableRow key={item.id}>
                <TableCell className="font-mono text-sm">{item.sku}</TableCell>
                <TableCell>{item.product_name}</TableCell>
                <TableCell className="text-right">{fmt(item.average_cost_price)}</TableCell>
                <TableCell className="text-right">{fmt(item.average_selling_price ?? 0)}</TableCell>
                <TableCell className="text-right font-semibold">
                  <div className="flex items-center justify-end gap-2">
                    {(currentStocks[item.id] ?? 0) <= 5 && (
                      <AlertTriangle className="h-4 w-4 text-amber-500" title="Low Stock Warning" />
                    )}
                    {currentStocks[item.id] ?? '—'}
                  </div>
                </TableCell>
                <TableCell className="text-right">{fmt(item.delivery_fee ?? 0)}</TableCell>
                <TableCell>{(item as any).stock_added_date ?? '—'}</TableCell>
                {admin && (
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      {!/_B\d+$/.test(item.sku) && (
                        <Button variant="ghost" size="icon" title="Restock (New Batch)" onClick={() => handleRestockInit(item)} className="text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50"><PackagePlus className="h-4 w-4" /></Button>
                      )}
                      <Button variant="ghost" size="icon" title="Edit Item" onClick={() => handleEdit(item)}><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" title="Delete Item" onClick={() => handleDelete(item.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow><TableCell colSpan={admin ? 9 : 8} className="text-center text-muted-foreground py-8">No inventory items found</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
