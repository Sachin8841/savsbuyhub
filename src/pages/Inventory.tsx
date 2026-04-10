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
import { exportToCsv } from '@/lib/csv';
import { Plus, Download, Pencil, Trash2, Search } from 'lucide-react';
import { CsvImportButton } from '@/components/CsvImportButton';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

const schema = z.object({
  sku: z.string().min(1, 'SKU required').max(50),
  product_name: z.string().min(1, 'Product name required').max(255),
  average_cost_price: z.number().min(0),
  total_bulk_stock_in: z.number().int().min(0),
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

  const form = useForm<FormData>({ resolver: zodResolver(schema), defaultValues: { sku: '', product_name: '', average_cost_price: 0, total_bulk_stock_in: 0 } });

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

  const onSubmit = async (values: FormData) => {
    try {
      if (editId) {
        const { error } = await supabase.from('inventory').update(values).eq('id', editId);
        if (error) throw error;
        toast({ title: 'Item updated' });
      } else {
        const { error } = await supabase.from('inventory').insert(values);
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
    form.reset({ sku: item.sku, product_name: item.product_name, average_cost_price: item.average_cost_price, total_bulk_stock_in: item.total_bulk_stock_in });
    setDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this item?')) return;
    const { error } = await supabase.from('inventory').delete().eq('id', id);
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    qc.invalidateQueries({ queryKey: ['inventory'] });
    toast({ title: 'Item deleted' });
  };

  const handleExport = () => {
    exportToCsv('inventory.csv', filtered.map(i => ({
      SKU: i.sku, Product: i.product_name, 'Avg Cost Price': i.average_cost_price,
      'Bulk Stock In': i.total_bulk_stock_in, 'Current Stock': currentStocks[i.id] ?? 'N/A',
    })));
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-2xl font-bold">Inventory</h2>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleExport}><Download className="mr-1 h-4 w-4" />Export CSV</Button>
          {admin && <CsvImportButton onImport={handleImport} expectedColumns={['sku', 'product_name', 'average_cost_price', 'total_bulk_stock_in']} label="Import CSV" />}
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
                  <div><Label>Average Cost Price</Label><Input type="number" step="0.01" {...form.register('average_cost_price', { valueAsNumber: true })} /></div>
                  <div><Label>Total Bulk Stock In</Label><Input type="number" {...form.register('total_bulk_stock_in', { valueAsNumber: true })} /></div>
                  <Button type="submit" className="w-full">{editId ? 'Update' : 'Add'}</Button>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </div>
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
              <TableHead className="text-right">Avg Cost Price</TableHead>
              <TableHead className="text-right">Bulk Stock In</TableHead>
              <TableHead className="text-right">Current Stock</TableHead>
              {admin && <TableHead className="text-right">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map(item => (
              <TableRow key={item.id}>
                <TableCell className="font-mono text-sm">{item.sku}</TableCell>
                <TableCell>{item.product_name}</TableCell>
                <TableCell className="text-right">₹{item.average_cost_price}</TableCell>
                <TableCell className="text-right">{item.total_bulk_stock_in}</TableCell>
                <TableCell className="text-right font-semibold">{currentStocks[item.id] ?? '—'}</TableCell>
                {admin && (
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => handleEdit(item)}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(item.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow><TableCell colSpan={admin ? 6 : 5} className="text-center text-muted-foreground py-8">No inventory items found</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
