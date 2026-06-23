import { useState, useEffect } from 'react';
import { useInventory } from '@/hooks/useData';
import { useAuthStore } from '@/stores/authStore';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { exportToXlsx } from '@/lib/xlsx-export';
import { Card, CardContent } from '@/components/ui/card';
import { Plus, Download, Pencil, Trash2, Search, AlertTriangle, PackagePlus, Package, Boxes, TrendingUp, BarChart2 } from 'lucide-react';
import { PageHeader, StatCard, SectionCard, EmptyState } from '@/components/PageHeader';
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
      // Each restock is its OWN unique SKU (no parent linking) so batches are
      // independently tracked, costed and sold against.
      const payload = {
        sku: values.sku,
        product_name: values.product_name,
        parent_inventory_id: null,
        aliases,
        average_cost_price: values.average_cost_price,
        average_selling_price: values.average_selling_price,
        total_bulk_stock_in: values.total_bulk_stock_in,
        delivery_fee: values.delivery_fee,
        stock_added_date: values.stock_added_date || new Date().toISOString().slice(0, 10),
      };
      const { error } = await supabase.from('inventory').insert(payload);
      if (error) throw error;
      toast({ title: 'New batch added as unique SKU' });
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
      const { error } = await supabase.from('inventory').insert({ sku, product_name, average_cost_price, average_selling_price, total_bulk_stock_in, delivery_fee, stock_added_date: new Date().toISOString().slice(0, 10) });
      if (error) errors.push(`${sku}: ${error.message}`);
      else success++;
    }
    qc.invalidateQueries({ queryKey: ['inventory'] });
    return { success, errors };
  };

  // Each SKU row (including restocked batches) is treated as a unique SKU.
  const totalSkus = inventory.length;
  const lowStockCount = inventory.filter(i => (currentStocks[i.id] ?? 0) <= 5).length;
  const totalBulk = inventory.reduce((s, i) => s + i.total_bulk_stock_in, 0);


  return (
    <div className="space-y-5 animate-in">
      <PageHeader
        title="Inventory"
        subtitle={`${totalSkus} unique SKUs · Stock Holding Value: ${fmt(totalStockValue)}`}
        icon={<Package className="h-5 w-5 text-indigo-500" />}
        actions={<>
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
                    New batch from "{restockItem?.product_name}". This batch is logged as its own <b>unique SKU</b> with its own cost basis so resale margins stay accurate.
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
        </>}
      />

      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard title="Locked Capital" value={fmt(totalStockValue)} icon={<Package />} color="primary" subtitle={`${totalSkus} unique SKUs`} />
        <StatCard title="Total Stock In" value={totalBulk.toLocaleString()} icon={<Boxes />} color="slate" subtitle="All batches" />
        <StatCard title="Low Stock" value={lowStockCount} icon={<AlertTriangle />} color={lowStockCount > 0 ? 'amber' : 'emerald'} subtitle="≤ 5 units remaining" />
        <StatCard title="Unique SKUs" value={totalSkus} icon={<BarChart2 />} color="slate" subtitle="Every batch counted" />
      </div>

      {/* Chart */}
      <SectionCard title="Top 10 SKUs by Stock Value" noPadding={false}>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={filtered.map(i => ({ name: i.sku, value: (currentStocks[i.id] ?? 0) * (i.average_cost_price || 0) })).sort((a,b) => b.value - a.value).slice(0, 10)}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
              <XAxis dataKey="name" fontSize={10} tickLine={false} axisLine={false} />
              <YAxis tickFormatter={(v) => `₹${(v/1000).toFixed(0)}k`} fontSize={10} tickLine={false} axisLine={false} />
              <Tooltip formatter={(v: number) => [`₹${v.toLocaleString('en-IN')}`, 'Stock Value']} contentStyle={{ borderRadius: '8px', fontSize: '12px' }} cursor={{ fill: 'hsl(var(--primary)/0.05)' }} />
              <Bar dataKey="value" fill="hsl(238, 81%, 65%)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </SectionCard>

      {/* Search & Table */}
      <SectionCard
        title="Stock Ledger"
        description={`${filtered.length} items`}
        action={
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search SKU or name..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-8 w-56 text-sm" />
          </div>
        }
        noPadding
      >
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead className="font-semibold">SKU</TableHead>
                <TableHead className="font-semibold">Type</TableHead>
                <TableHead className="font-semibold">Product Name</TableHead>
                <TableHead className="text-right font-semibold">Cost Price</TableHead>
                <TableHead className="text-right font-semibold">Selling Price</TableHead>
                <TableHead className="text-right font-semibold">In Stock</TableHead>
                <TableHead className="text-right font-semibold">Delivery Fee</TableHead>
                <TableHead className="font-semibold">Date Added</TableHead>
                {admin && <TableHead className="text-right font-semibold">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(item => {
                const stock = currentStocks[item.id] ?? 0;
                const isLow = stock <= 5;
                return (
                  <TableRow key={item.id} className="hover:bg-primary/5 transition-colors group">
                    <TableCell className="font-mono text-xs font-medium text-primary">{item.sku}</TableCell>
                    <TableCell>
                      {(item as any).parent_inventory_id ? <Badge variant="secondary" className="text-[10px]">Child</Badge> : <Badge variant="outline" className="text-[10px]">Unique</Badge>}
                    </TableCell>
                    <TableCell className="font-medium">{item.product_name}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{fmt(item.average_cost_price)}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{fmt(item.average_selling_price ?? 0)}</TableCell>
                    <TableCell className="text-right">
                      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold ${
                        isLow ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                      }`}>
                        {isLow && <AlertTriangle className="h-3 w-3" />}
                        {stock}
                      </span>
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">{fmt(item.delivery_fee ?? 0)}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{(item as any).stock_added_date ?? '—'}</TableCell>
                    {admin && (
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          {!/_B\d+$/.test(item.sku) && (
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-indigo-500 hover:text-indigo-700 hover:bg-indigo-50" title="Restock (New Batch)" onClick={() => handleRestockInit(item)}><PackagePlus className="h-4 w-4" /></Button>
                          )}
                          <Button variant="ghost" size="icon" className="h-8 w-8" title="Edit" onClick={() => handleEdit(item)}><Pencil className="h-3.5 w-3.5" /></Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10" title="Delete" onClick={() => handleDelete(item.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
              {filtered.length === 0 && (
                <TableRow>
                    <TableCell colSpan={admin ? 9 : 8} className="py-16">
                    <EmptyState icon={<Package className="h-8 w-8" />} title="No inventory items found" description="Add your first product or adjust your search." />
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
