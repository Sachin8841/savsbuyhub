import { useState } from 'react';
import { useReturns, useSales } from '@/hooks/useData';
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
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { exportToCsv } from '@/lib/csv';
import { Plus, Download, Trash2, Search } from 'lucide-react';
import { CsvImportButton } from '@/components/CsvImportButton';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

const schema = z.object({
  sales_id: z.string().min(1, 'Select a sale'),
  return_type: z.enum(['Customer Return', 'RTO']),
  quantity_returned: z.number().int().min(1),
  is_restockable: z.boolean(),
});
type FormData = z.infer<typeof schema>;

export default function Returns() {
  const { data: returns = [] } = useReturns();
  const { data: sales = [] } = useSales();
  const { isAdmin } = useAuthStore();
  const admin = isAdmin();
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const qc = useQueryClient();
  const { toast } = useToast();

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { sales_id: '', return_type: 'Customer Return', quantity_returned: 1, is_restockable: false },
  });

  // Sales that don't already have a return
  const returnedSaleIds = new Set(returns.map(r => r.sales_id));
  const availableSales = sales.filter(s => !returnedSaleIds.has(s.id));

  const filtered = returns.filter(r => {
    const sale = r.sales as any;
    const inv = sale?.inventory;
    return search === '' ||
      inv?.sku?.toLowerCase().includes(search.toLowerCase()) ||
      inv?.product_name?.toLowerCase().includes(search.toLowerCase()) ||
      r.return_type.toLowerCase().includes(search.toLowerCase());
  });

  const onSubmit = async (values: FormData) => {
    try {
      const penalty_amount = values.return_type === 'Customer Return' ? 160 : 0;
      const { error } = await supabase.from('returns').insert({
        ...values,
        penalty_amount,
      });
      if (error) throw error;
      toast({ title: 'Return recorded' });
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
    toast({ title: 'Return deleted' });
  };

  const handleExport = () => {
    exportToCsv('returns.csv', filtered.map(r => {
      const sale = r.sales as any;
      const inv = sale?.inventory;
      return {
        'Sale ID': r.sales_id.slice(0, 8), SKU: inv?.sku ?? '', Product: inv?.product_name ?? '',
        'Return Type': r.return_type, 'Qty Returned': r.quantity_returned,
        Restockable: r.is_restockable ? 'Yes' : 'No', Penalty: r.penalty_amount,
      };
    }));
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-2xl font-bold">Returns</h2>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleExport}><Download className="mr-1 h-4 w-4" />Export CSV</Button>
          {admin && (
            <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) form.reset(); }}>
              <DialogTrigger asChild><Button size="sm"><Plus className="mr-1 h-4 w-4" />Log Return</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Log Return</DialogTitle></DialogHeader>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <div>
                    <Label>Sales Order</Label>
                    <Controller name="sales_id" control={form.control} render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger><SelectValue placeholder="Select sale" /></SelectTrigger>
                        <SelectContent>
                          {availableSales.map(s => {
                            const inv = s.inventory as any;
                            return <SelectItem key={s.id} value={s.id}>{s.id.slice(0, 8)} — {inv?.sku} ({s.platform})</SelectItem>;
                          })}
                        </SelectContent>
                      </Select>
                    )} />
                    {form.formState.errors.sales_id && <p className="text-sm text-destructive">{form.formState.errors.sales_id.message}</p>}
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
                  <div className="flex items-center gap-2">
                    <Controller name="is_restockable" control={form.control} render={({ field }) => (
                      <Checkbox checked={field.value} onCheckedChange={field.onChange} id="restockable" />
                    )} />
                    <Label htmlFor="restockable">Restockable (adds back to current stock)</Label>
                  </div>
                  <Button type="submit" className="w-full">Log Return</Button>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Search returns..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Sale ID</TableHead>
              <TableHead>SKU</TableHead>
              <TableHead>Product</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="text-right">Qty</TableHead>
              <TableHead>Restockable</TableHead>
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
                  <TableCell className="font-mono text-sm">{r.sales_id.slice(0, 8)}</TableCell>
                  <TableCell className="font-mono text-sm">{inv?.sku}</TableCell>
                  <TableCell>{inv?.product_name}</TableCell>
                  <TableCell><Badge variant={r.return_type === 'RTO' ? 'outline' : 'secondary'}>{r.return_type}</Badge></TableCell>
                  <TableCell className="text-right">{r.quantity_returned}</TableCell>
                  <TableCell>{r.is_restockable ? <Badge variant="default">Yes</Badge> : <Badge variant="outline">No</Badge>}</TableCell>
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
              <TableRow><TableCell colSpan={admin ? 8 : 7} className="text-center text-muted-foreground py-8">No returns found</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
