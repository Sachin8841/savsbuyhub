import { useState } from 'react';
import { useInventory, useCurrentStocks } from '@/hooks/useData';
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
  supplier_name: z.string().max(160).optional(),
  supplier_contact: z.string().max(80).optional(),
  supplier_invoice_number: z.string().max(80).optional(),
  transport_provider: z.string().max(120).optional(),
  transport_bill_number: z.string().max(80).optional(),
  purchase_notes: z.string().max(500).optional(),
  pay_source: z.enum(['account', 'hot', 'none']).optional(),
});
type FormData = z.infer<typeof schema>;

const emptyPurchase = {
  supplier_name: '', supplier_contact: '', supplier_invoice_number: '',
  transport_provider: '', transport_bill_number: '', purchase_notes: '',
  pay_source: 'account' as const,
};


export default function Inventory() {
  const { data: inventory = [] } = useInventory();
  const { isAdmin } = useAuthStore();
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const currentStocks = useCurrentStocks();
  const qc = useQueryClient();
  const { toast } = useToast();
  const admin = isAdmin();

  const form = useForm<FormData>({ resolver: zodResolver(schema), defaultValues: { sku: '', product_name: '', aliases: '', average_cost_price: 0, average_selling_price: 0, total_bulk_stock_in: 0, delivery_fee: 0, stock_added_date: new Date().toISOString().slice(0, 10), ...emptyPurchase } });

  const [restockDialogOpen, setRestockDialogOpen] = useState(false);
  const [restockItem, setRestockItem] = useState<any>(null);

  const restockForm = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { sku: '', product_name: '', aliases: '', average_cost_price: 0, average_selling_price: 0, total_bulk_stock_in: 0, delivery_fee: 0, stock_added_date: new Date().toISOString().slice(0, 10), ...emptyPurchase }
  });

  // Batch numbering: parent = Batch 1, each restock creates the next batch child row.
  const childrenOf = (parentId: string) => inventory.filter((i: any) => i.parent_inventory_id === parentId);

  const handleRestockInit = (item: any) => {
    // Restock always anchors to the parent SKU, never to a batch child.
    const parent = item.parent_inventory_id
      ? (inventory.find((i: any) => i.id === item.parent_inventory_id) ?? item)
      : item;
    const nextBatch = childrenOf(parent.id).length + 2;
    setRestockItem({ ...parent, nextBatch });
    restockForm.reset({
      sku: `${parent.sku}-B${nextBatch}`,
      product_name: `${parent.product_name} (Batch ${nextBatch})`,
      aliases: (parent.aliases ?? []).join(', '),
      average_cost_price: parent.average_cost_price ?? 0,
      average_selling_price: parent.average_selling_price ?? 0,
      total_bulk_stock_in: 0,
      delivery_fee: 0,
      stock_added_date: new Date().toISOString().slice(0, 10),
      ...emptyPurchase,
    });
    setRestockDialogOpen(true);
  };

  // Stock purchases consume real money: goods value + transport bill leave the bank / cash box.
  const recordPurchaseSpend = async (values: FormData, label: string) => {
    const source = values.pay_source ?? 'account';
    if (source === 'none') return;
    const goods = (Number(values.total_bulk_stock_in) || 0) * (Number(values.average_cost_price) || 0);
    const freight = Number(values.delivery_fee) || 0;
    const total = goods + freight;
    if (total <= 0) return;
    const { error } = await supabase.rpc('record_cash_movement', {
      _movement_type: 'inventory_purchase',
      _amount: total,
      _hot_cash_delta: source === 'hot' ? -total : 0,
      _account_delta: source === 'account' ? -total : 0,
      _reference_table: 'inventory',
      _reference_id: null as any,
      _notes: `Stock purchase — ${label} · goods ${goods.toFixed(2)} + transport ${freight.toFixed(2)}${values.supplier_name ? ` · supplier ${values.supplier_name}` : ''}${values.transport_bill_number ? ` · transport bill ${values.transport_bill_number}` : ''}`,
    });
    if (error) {
      toast({ title: 'Stock saved, but cash not deducted', description: error.message, variant: 'destructive' });
      return;
    }
    qc.invalidateQueries({ queryKey: ['capital_accounts'] });
    qc.invalidateQueries({ queryKey: ['cash_movements'] });
    toast({ title: `₹${total.toLocaleString('en-IN')} deducted`, description: source === 'hot' ? 'Taken from hot cash.' : 'Taken from bank / account holding value.' });
  };

  const onRestockSubmit = async (values: FormData) => {
    if (!restockItem) return;
    try {
      const aliases = (values.aliases ?? '').split(',').map(s => s.trim()).filter(Boolean);
      // New batch is stored as a child row of the parent SKU — it is NOT a unique SKU.
      const { error } = await supabase.from('inventory').insert({
        sku: values.sku,
        product_name: values.product_name,
        aliases,
        average_cost_price: values.average_cost_price,
        average_selling_price: values.average_selling_price || restockItem.average_selling_price || 0,
        total_bulk_stock_in: values.total_bulk_stock_in,
        delivery_fee: values.delivery_fee ?? 0,
        stock_added_date: values.stock_added_date || new Date().toISOString().slice(0, 10),
        supplier_name: values.supplier_name || null,
        supplier_contact: values.supplier_contact || null,
        supplier_invoice_number: values.supplier_invoice_number || null,
        transport_provider: values.transport_provider || null,
        transport_bill_number: values.transport_bill_number || null,
        purchase_notes: values.purchase_notes || null,
        parent_inventory_id: restockItem.id,
      } as any);
      if (error) throw error;

      await recordPurchaseSpend(values, `Batch ${restockItem.nextBatch} of ${restockItem.sku}`);

      toast({ title: `Batch ${restockItem.nextBatch} added`, description: `+${values.total_bulk_stock_in} units under ${restockItem.sku}` });
      qc.invalidateQueries({ queryKey: ['inventory'] });
      setRestockDialogOpen(false);
      setRestockItem(null);
      restockForm.reset();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };



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
        supplier_name: values.supplier_name || null,
        supplier_contact: values.supplier_contact || null,
        supplier_invoice_number: values.supplier_invoice_number || null,
        transport_provider: values.transport_provider || null,
        transport_bill_number: values.transport_bill_number || null,
        purchase_notes: values.purchase_notes || null,
      };
      if (editId) {
        const { error } = await supabase.from('inventory').update(payload).eq('id', editId);
        if (error) throw error;
        toast({ title: 'Item updated' });
      } else {
        const { error } = await supabase.from('inventory').insert(payload);
        if (error) throw error;
        toast({ title: 'Item added' });
        await recordPurchaseSpend(values, payload.sku);
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
    form.reset({ sku: item.sku, product_name: item.product_name, aliases: (item.aliases ?? []).join(', '), average_cost_price: item.average_cost_price, average_selling_price: item.average_selling_price ?? 0, total_bulk_stock_in: item.total_bulk_stock_in, delivery_fee: item.delivery_fee ?? 0, stock_added_date: (item as any).stock_added_date ?? new Date().toISOString().slice(0, 10), supplier_name: (item as any).supplier_name ?? '', supplier_contact: (item as any).supplier_contact ?? '', supplier_invoice_number: (item as any).supplier_invoice_number ?? '', transport_provider: (item as any).transport_provider ?? '', transport_bill_number: (item as any).transport_bill_number ?? '', purchase_notes: (item as any).purchase_notes ?? '', pay_source: 'none' });
    setDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this item?')) return;
    const { error } = await supabase.from('inventory').delete().eq('id', id);
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    qc.invalidateQueries({ queryKey: ['inventory'] });
    toast({ title: 'Item deleted' });
  };

  const fmt = (n: number | null | undefined) => { const v = Number(n); return '₹' + (Number.isFinite(v) ? v : 0).toLocaleString('en-IN', { maximumFractionDigits: 2 }); };

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

  // Restock batches are child rows of a parent SKU, so they never count as unique SKUs.
  const totalSkus = new Set(inventory.filter((i: any) => !i.parent_inventory_id).map(i => String(i.sku).trim().toUpperCase())).size;
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
                  <div className="rounded-lg border bg-muted/20 p-3 space-y-3">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Supplier & Transport Bill</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div><Label>Supplier Name</Label><Input placeholder="e.g. Tirupur Textiles" {...form.register('supplier_name')} /></div>
                      <div><Label>Supplier Contact</Label><Input placeholder="Phone / email" {...form.register('supplier_contact')} /></div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div><Label>Supplier Invoice No.</Label><Input {...form.register('supplier_invoice_number')} /></div>
                      <div><Label>Transport Provider</Label><Input placeholder="e.g. VRL Logistics" {...form.register('transport_provider')} /></div>
                    </div>
                    <div><Label>Transport Bill No.</Label><Input {...form.register('transport_bill_number')} /></div>
                    <div><Label>Purchase Notes</Label><Input placeholder="Optional remarks" {...form.register('purchase_notes')} /></div>
                    <div>
                      <Label>Pay purchase from</Label>
                      <select
                        className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                        {...form.register('pay_source')}
                      >
                        <option value="account">Bank / Account holding value</option>
                        <option value="hot">Hot cash</option>
                        <option value="none">Do not deduct</option>
                      </select>
                      <p className="text-[11px] text-muted-foreground mt-1">
                        Goods value (units × cost price) plus the transport bill is deducted from the selected balance.
                      </p>
                    </div>
                  </div>

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
                    Restock "{restockItem?.product_name}"
                  </DialogTitle>
                  <div className="text-xs text-muted-foreground mt-1">
                    Creates <b>Batch {restockItem?.nextBatch}</b> under parent SKU <b>{restockItem?.sku}</b>. The batch keeps the same product name with the batch tag, and is never counted as a unique SKU.
                  </div>
                </DialogHeader>
                <form onSubmit={restockForm.handleSubmit(onRestockSubmit)} className="space-y-4 pt-2">
                  <div>
                    <Label>Batch SKU (auto)</Label>
                    <Input {...restockForm.register('sku')} readOnly className="bg-muted/40" />
                  </div>
                  <div>
                    <Label>Batch Product Name (auto)</Label>
                    <Input {...restockForm.register('product_name')} readOnly className="bg-muted/40" />
                  </div>

                  <div>
                    <Label>Aliases (comma-separated, optional)</Label>
                    <Input placeholder="e.g. Blue Tee, Cotton T-shirt Blue" {...restockForm.register('aliases')} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>New Batch Cost/Unit (₹) *</Label>
                      <Input type="number" step="0.01" {...restockForm.register('average_cost_price', { valueAsNumber: true })} />
                      {restockForm.formState.errors.average_cost_price && <p className="text-sm text-destructive">{restockForm.formState.errors.average_cost_price.message}</p>}
                    </div>
                    <div>
                      <Label>Selling Price (₹, optional update)</Label>
                      <Input type="number" step="0.01" {...restockForm.register('average_selling_price', { valueAsNumber: true })} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Units Added *</Label>
                      <Input type="number" {...restockForm.register('total_bulk_stock_in', { valueAsNumber: true })} />
                      {restockForm.formState.errors.total_bulk_stock_in && <p className="text-sm text-destructive">{restockForm.formState.errors.total_bulk_stock_in.message}</p>}
                    </div>
                    <div>
                      <Label>Additional Freight (₹)</Label>
                      <Input type="number" step="0.01" {...restockForm.register('delivery_fee', { valueAsNumber: true })} />
                    </div>
                  </div>
                  <div className="rounded-lg border bg-muted/20 p-3 space-y-3">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Supplier & Transport Bill</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div><Label>Supplier Name</Label><Input placeholder="e.g. Tirupur Textiles" {...restockForm.register('supplier_name')} /></div>
                      <div><Label>Supplier Contact</Label><Input placeholder="Phone / email" {...restockForm.register('supplier_contact')} /></div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div><Label>Supplier Invoice No.</Label><Input {...restockForm.register('supplier_invoice_number')} /></div>
                      <div><Label>Transport Provider</Label><Input placeholder="e.g. VRL Logistics" {...restockForm.register('transport_provider')} /></div>
                    </div>
                    <div><Label>Transport Bill No.</Label><Input {...restockForm.register('transport_bill_number')} /></div>
                    <div><Label>Purchase Notes</Label><Input placeholder="Optional remarks" {...restockForm.register('purchase_notes')} /></div>
                    <div>
                      <Label>Pay purchase from</Label>
                      <select
                        className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                        {...restockForm.register('pay_source')}
                      >
                        <option value="account">Bank / Account holding value</option>
                        <option value="hot">Hot cash</option>
                        <option value="none">Do not deduct</option>
                      </select>
                      <p className="text-[11px] text-muted-foreground mt-1">
                        Goods value (units × batch cost) plus the transport bill is deducted from the selected balance.
                      </p>
                    </div>
                  </div>
                  <Button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700 text-white">Add Batch {restockItem?.nextBatch}</Button>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </>}
      />

      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard title="Locked Capital" value={fmt(totalStockValue)} icon={<Package />} color="primary" subtitle={`${totalSkus} unique SKUs`} />
        <StatCard title="Total Stock In" value={totalBulk.toLocaleString()} icon={<Boxes />} color="slate" subtitle="Including restocks" />
        <StatCard title="Low Stock" value={lowStockCount} icon={<AlertTriangle />} color={lowStockCount > 0 ? 'amber' : 'emerald'} subtitle="≤ 5 units remaining" />
        <StatCard title="Unique SKUs" value={totalSkus} icon={<BarChart2 />} color="slate" subtitle="Restock batches excluded" />

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
                <TableHead className="font-semibold">Aliases</TableHead>
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
                const isBatch = !!(item as any).parent_inventory_id;
                return (
                  <TableRow key={item.id} className="hover:bg-primary/5 transition-colors group">
                    <TableCell className="font-mono text-xs font-medium text-primary">
                      <span className={isBatch ? 'pl-3 text-muted-foreground' : ''}>{item.sku}</span>
                    </TableCell>
                    <TableCell className="max-w-[160px] truncate text-xs text-muted-foreground" title={(item.aliases ?? []).join(', ')}>
                      {(item.aliases ?? []).length ? (item.aliases as string[]).join(', ') : '—'}
                    </TableCell>

                    <TableCell className="font-medium">
                      <span className="inline-flex items-center gap-2">
                        {item.product_name}
                        {isBatch && <Badge variant="secondary" className="text-[10px]">Batch</Badge>}
                      </span>
                    </TableCell>

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
                        <div className="flex items-center justify-end gap-0.5 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                          {!isBatch && (
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-indigo-500 hover:text-indigo-700 hover:bg-indigo-50" title="Restock (adds a new batch under this SKU)" onClick={() => handleRestockInit(item)}><PackagePlus className="h-4 w-4" /></Button>
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
