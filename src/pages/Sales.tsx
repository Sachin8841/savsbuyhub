import { useState, useEffect } from 'react';
import { useSales, useInventory } from '@/hooks/useData';
import { useAuthStore } from '@/stores/authStore';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { exportToXlsx } from '@/lib/xlsx-export';
import { Checkbox } from '@/components/ui/checkbox';
import { Plus, Download, Pencil, Trash2, Search, DollarSign, Clock, FileUp, Loader2, SplitSquareHorizontal, TrendingUp, Copy } from 'lucide-react';
import { CsvImportButton } from '@/components/CsvImportButton';
import { PageHeader, StatCard, SectionCard, EmptyState } from '@/components/PageHeader';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
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
  payment_status: z.enum(['Pending', 'Settled', 'Packed', 'Cancelled', 'Dispatched', 'In Transit', 'Order RTO', 'Return']),
  payment_method: z.enum(['Prepaid', 'COD']).optional(),
  order_number: z.string().optional(),
  settlement_date: z.string().optional(),
  split_orders: z.boolean().optional(), // if true, qty>1 -> one row per unit
  log_another: z.boolean().optional(),
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
  const [billUploading, setBillUploading] = useState(false);
  const [billPreview, setBillPreview] = useState<any[] | null>(null);
  const [billPreviewOpen, setBillPreviewOpen] = useState(false);
  const [splitConfirmOpen, setSplitConfirmOpen] = useState(false);
  const qc = useQueryClient();
  const { toast } = useToast();

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { dispatch_date: new Date().toISOString().slice(0, 10), platform: 'Meesho', inventory_id: '', quantity_sold: 1, average_selling_price: 0, courier_partner: '', payment_status: 'Pending', payment_method: 'Prepaid', order_number: '', settlement_date: '', split_orders: false, log_another: false },
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
    const inv = (Array.isArray(s.inventory) ? s.inventory[0] : s.inventory) as any;
    const matchSearch = search === '' || inv?.sku?.toLowerCase().includes(search.toLowerCase()) || inv?.product_name?.toLowerCase().includes(search.toLowerCase()) || (s.courier_partner ?? '').toLowerCase().includes(search.toLowerCase()) || ((s as any).order_number ?? '').toLowerCase().includes(search.toLowerCase());
    const matchPlatform = platformFilter === 'all' || s.platform === platformFilter;
    const matchStatus = statusFilter === 'all' || s.payment_status === statusFilter;
    return matchSearch && matchPlatform && matchStatus;
  });

  const totalRevenue = filtered.reduce((sum, s) => sum + s.quantity_sold * s.average_selling_price, 0);
  const pendingAmount = filtered.filter(s => s.payment_status === 'Pending').reduce((sum, s) => sum + s.quantity_sold * s.average_selling_price, 0);
  const settledAmount = filtered.filter(s => s.payment_status === 'Settled').reduce((sum, s) => sum + s.quantity_sold * s.average_selling_price, 0);
  const totalCostPrice = filtered.filter(s => s.payment_status !== 'Cancelled').reduce((sum, s) => {
    const inv = (Array.isArray(s.inventory) ? s.inventory[0] : s.inventory) as any;
    const cp = s.cost_price ?? inv?.average_cost_price ?? 0;
    return sum + s.quantity_sold * cp;
  }, 0);
  const nonCancelledRevenue = filtered.filter(s => s.payment_status !== 'Cancelled').reduce((sum, s) => sum + s.quantity_sold * s.average_selling_price, 0);
  const totalProfit = nonCancelledRevenue - totalCostPrice;
  const fmt = (n: number) => '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 0 });

  // Generate data for Sales Velocity Chart
  const salesByDate = filtered.reduce((acc: any, curr) => {
    const date = curr.dispatch_date;
    if (!acc[date]) acc[date] = { date, revenue: 0, orders: 0 };
    acc[date].revenue += curr.quantity_sold * curr.average_selling_price;
    acc[date].orders += curr.quantity_sold;
    return acc;
  }, {});

  const velocityData = Object.values(salesByDate).sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime()).slice(-14); // Last 14 days

  const onSubmit = async (values: FormData) => {
    try {
      const orderNumbers = values.order_number
        ? values.order_number.split(/[\n,]+/).map(s => s.trim()).filter(Boolean)
        : [];
      const numOrders = orderNumbers.length > 1 ? orderNumbers.length : 1;
      const totalQty = values.quantity_sold * numOrders;

      if (!editId) {
        try {
          const { data: stock, error: rpcError } = await supabase.rpc('get_current_stock', { inv_id: values.inventory_id });
          
          if (rpcError) {
            console.warn('Stock validation RPC failed (likely schema cache issue). Proceeding with sale log anyway.');
          } else if (stock !== null && totalQty > (stock as number)) {
            toast({ title: 'Insufficient stock', description: `Need ${totalQty} units but only ${stock} units available`, variant: 'destructive' });
            return;
          }
        } catch (e) {
          console.warn('Failed to check stock, continuing...');
        }
      }

      const performSave = async (includeCostPrice = true) => {
        const cp = includeCostPrice ? (selectedInv?.average_cost_price ?? 0) : undefined;
        
        if (editId) {
          const payload: any = {
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
          if (includeCostPrice) {
            payload.cost_price = cp;
          }
          return await supabase.from('sales').update({ ...payload, quantity_sold: values.quantity_sold }).eq('id', editId);
        }

        if (orderNumbers.length <= 1) {
          const payload: any = {
            dispatch_date: values.dispatch_date,
            platform: values.platform,
            inventory_id: values.inventory_id,
            average_selling_price: values.average_selling_price,
            courier_partner: values.courier_partner || null,
            payment_status: values.payment_status,
            payment_method: values.payment_method ?? null,
            order_number: orderNumbers[0] || null,
            settlement_date: values.payment_status === 'Settled' && values.settlement_date ? values.settlement_date : null,
          };
          if (includeCostPrice) {
            payload.cost_price = cp;
          }
          if (values.split_orders && values.quantity_sold > 1) {
            const rows = Array.from({ length: values.quantity_sold }, () => ({ ...payload, quantity_sold: 1 }));
            return await supabase.from('sales').insert(rows as any);
          } else {
            return await supabase.from('sales').insert({ ...payload, quantity_sold: values.quantity_sold } as any);
          }
        }

        // Multiple order numbers -> bulk log
        const rows: any[] = [];
        for (const orderNo of orderNumbers) {
          const payload: any = {
            dispatch_date: values.dispatch_date,
            platform: values.platform,
            inventory_id: values.inventory_id,
            average_selling_price: values.average_selling_price,
            courier_partner: values.courier_partner || null,
            payment_status: values.payment_status,
            payment_method: values.payment_method ?? null,
            order_number: orderNo,
            settlement_date: values.payment_status === 'Settled' && values.settlement_date ? values.settlement_date : null,
          };
          if (includeCostPrice) {
            payload.cost_price = cp;
          }
          if (values.split_orders && values.quantity_sold > 1) {
            for (let i = 0; i < values.quantity_sold; i++) {
              rows.push({ ...payload, quantity_sold: 1 });
            }
          } else {
            rows.push({ ...payload, quantity_sold: values.quantity_sold });
          }
        }
        return await supabase.from('sales').insert(rows as any);
      };

      let { error } = await performSave(true);
      if (error && (error.message?.includes('cost_price') || error.details?.includes('cost_price'))) {
        const retryResult = await performSave(false);
        error = retryResult.error;
      }
      if (error) throw error;

      const totalRowsCreated = values.split_orders && values.quantity_sold > 1
        ? values.quantity_sold * numOrders
        : numOrders;

      toast({ 
        title: editId 
          ? 'Sale updated' 
          : totalRowsCreated > 1 
            ? `Logged ${totalRowsCreated} separate orders` 
            : 'Sale recorded' 
      });

      qc.invalidateQueries({ queryKey: ['sales'] });
      qc.invalidateQueries({ queryKey: ['inventory'] });
      qc.invalidateQueries({ queryKey: ['capital_accounts'] });
      qc.invalidateQueries({ queryKey: ['cash_movements'] });
      
      if (values.log_another) {
        form.reset({
          ...values,
          order_number: '',
          log_another: true,
        });
      } else {
        setDialogOpen(false);
        setEditId(null);
        form.reset();
      }
    } catch (err: any) {
      console.error("Sales log error:", err);
      const errMsg = typeof err === 'object'
        ? `${err.message || ''} | Details: ${err.details || ''} | Hint: ${err.hint || ''} | Code: ${err.code || ''}`
        : String(err);
      toast({ title: 'Error logging sale', description: errMsg, variant: 'destructive' });
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
      log_another: false,
    });
    setDialogOpen(true);
  };

  const handleClone = (s: any) => {
    setEditId(null);
    form.reset({
      dispatch_date: s.dispatch_date, platform: s.platform, inventory_id: s.inventory_id,
      quantity_sold: s.quantity_sold, average_selling_price: s.average_selling_price,
      courier_partner: s.courier_partner ?? '', payment_status: s.payment_status,
      payment_method: s.payment_method ?? 'Prepaid',
      order_number: '',
      settlement_date: s.settlement_date ?? '',
      split_orders: false,
      log_another: false,
    });
    setDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this sale?')) return;
    const { error } = await supabase.from('sales').delete().eq('id', id);
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    qc.invalidateQueries({ queryKey: ['sales'] });
    qc.invalidateQueries({ queryKey: ['capital_accounts'] });
    qc.invalidateQueries({ queryKey: ['cash_movements'] });
    toast({ title: 'Sale deleted' });
  };

  const handleBillUpload = async (file: File) => {
    try {
      setBillUploading(true);
      const reader = new FileReader();
      const base64: string = await new Promise((res, rej) => {
        reader.onload = () => res((reader.result as string).split(',')[1]);
        reader.onerror = rej;
        reader.readAsDataURL(file);
      });
      
      const invSlim = inventory.map((i: any) => ({ sku: i.sku, name: i.product_name, aliases: i.aliases ?? [] }));
      
      const { data, error } = await supabase.functions.invoke('parse-bill', {
        body: { pdfBase64: base64, mimeType: file.type, inventory: invSlim }
      });
      
      if (error) throw error;
      const parsedItems = data?.items ?? [];
      
      const cleanSkuAndExtractQty = (s: string, parsedQty: number) => {
        if (!s) return { qty: parsedQty || 1, baseSku: '' };
        const trimmed = s.trim();
        const prefixMatch = trimmed.match(/^(\d+)x[\s_-]*(.*)$/i);
        if (prefixMatch) {
          return { qty: parseInt(prefixMatch[1], 10), baseSku: prefixMatch[2].trim() };
        }
        const suffixMatch = trimmed.match(/^(.*?)[\s_-]*(\d+)x$/i);
        if (suffixMatch) {
          return { qty: parseInt(suffixMatch[2], 10), baseSku: suffixMatch[1].trim() };
        }
        return { qty: parsedQty || 1, baseSku: trimmed };
      };

      const items: any[] = parsedItems.map((it: any) => {
        const invoiceSku = it.sku || '';
        const invoiceName = it.product_name || '';
        
        const { qty, baseSku } = cleanSkuAndExtractQty(invoiceSku, it.quantity);

        const rawPlatform = (it.platform || '').trim();
        let mappedPlatform: 'Meesho' | 'Flipkart' | 'Amazon' | 'Offline' = 'Meesho';
        if (/meesho/i.test(rawPlatform)) {
          mappedPlatform = 'Meesho';
        } else if (/flipkart/i.test(rawPlatform)) {
          mappedPlatform = 'Flipkart';
        } else if (/amazon/i.test(rawPlatform)) {
          mappedPlatform = 'Amazon';
        } else if (/offline/i.test(rawPlatform)) {
          mappedPlatform = 'Offline';
        }

        let bestMatch = null;
        let bestScore = 0;
        
        const baseSkuLower = baseSku.toLowerCase().replace(/[\s_-]+/g, '');
        const invNameLower = invoiceName.toLowerCase();
        
        for (const item of inventory) {
          let score = 0;
          
          const { baseSku: dbBaseSku } = cleanSkuAndExtractQty(item.sku, 1);
          const dbSkuClean = dbBaseSku.toLowerCase().replace(/[\s_-]+/g, '');
          const dbSkuFull = item.sku.trim().toLowerCase().replace(/[\s_-]+/g, '');
          const dbName = (item.product_name || '').toLowerCase();
          
          if (baseSkuLower === dbSkuClean && baseSkuLower.length > 0) {
            score = 100;
          } else if (baseSkuLower === dbSkuFull && baseSkuLower.length > 0) {
            score = 95;
          } else if (baseSkuLower.length > 2 && (baseSkuLower.includes(dbSkuClean) || dbSkuClean.includes(baseSkuLower))) {
            score = 80;
          } else if (invNameLower && invNameLower === dbName) {
            score = 90;
          } else if (invNameLower && dbName && (invNameLower.includes(dbName) || dbName.includes(invNameLower))) {
            score = 75;
          } else {
            const aliases = item.aliases || [];
            for (const alias of aliases) {
              const aliasLower = alias.toLowerCase();
              if (invNameLower && invNameLower === aliasLower) {
                score = 90;
                break;
              } else if (invNameLower && (invNameLower.includes(aliasLower) || aliasLower.includes(invNameLower))) {
                score = 70;
                break;
              }
            }
          }
          
          if (score < 85 && baseSkuLower.length > 2) {
            if (baseSkuLower.includes('strip') && dbSkuClean.includes('strip')) {
              score = 88;
            } else if (baseSkuLower.includes('sealer') && dbSkuClean.includes('sealer')) {
              score = 88;
            } else if (baseSkuLower.includes('juicer') && dbSkuClean.includes('juicer')) {
              score = 88;
            } else if (baseSkuLower.includes('p9') && (dbSkuClean.includes('p9') || dbName.includes('p9'))) {
              score = 88;
            }
          }
          
          if (score > bestScore) {
            bestScore = score;
            bestMatch = item;
          }
        }

        const matchedInv = bestScore >= 70 ? bestMatch : null;
        
        return { 
          ...it, 
          platform: mappedPlatform,
          quantity: qty,
          matched_inventory_id: matchedInv?.id ?? '', 
          matched_sku: matchedInv?.sku ?? '', 
          matched_name: matchedInv?.product_name ?? it.product_name 
        };
      });

      if (!items.length) { toast({ title: 'No orders detected in document', variant: 'destructive' }); return; }
      setBillPreview(items);
      setBillPreviewOpen(true);
    } catch (err: any) {
      toast({ title: 'Bill parsing failed', description: err.message, variant: 'destructive' });
    } finally {
      setBillUploading(false);
    }
  };

  const confirmBillImport = async () => {
    if (!billPreview) return;
    const today = new Date().toISOString().slice(0, 10);
    const rows: any[] = [];
    const skipped: string[] = [];
    for (const it of billPreview) {
      if (!it.matched_inventory_id) { skipped.push(it.product_name || it.sku || 'unknown'); continue; }
      const inv = inventory.find(i => i.id === it.matched_inventory_id) as any;
      const qty = Math.max(1, parseInt(it.quantity ?? 1, 10));
      const unit_price = inv?.average_selling_price ?? 0;
      // Each order on the bill = one row, with its quantity (1x/2x/...)
      rows.push({
        dispatch_date: today,
        platform: ['Meesho', 'Flipkart', 'Amazon', 'Offline'].includes(it.platform) ? it.platform : 'Meesho',
        inventory_id: it.matched_inventory_id,
        quantity_sold: qty,
        average_selling_price: unit_price,
        cost_price: inv?.average_cost_price ?? 0,
        courier_partner: it.courier_partner || null,
        payment_status: 'Pending',
        payment_method: it.payment_method ?? null,
        order_number: it.order_number ?? null,
      });
    }
    if (rows.length) {
      let { error } = await supabase.from('sales').insert(rows);
      if (error && (error.message?.includes('cost_price') || error.details?.includes('cost_price'))) {
        const fallbackRows = rows.map(({ cost_price, ...rest }) => rest);
        const retryResult = await supabase.from('sales').insert(fallbackRows);
        error = retryResult.error;
      }
      if (error) { toast({ title: 'Insert failed', description: error.message, variant: 'destructive' }); return; }
    }
    qc.invalidateQueries({ queryKey: ['sales'] });
    qc.invalidateQueries({ queryKey: ['inventory'] });
    qc.invalidateQueries({ queryKey: ['capital_accounts'] });
    qc.invalidateQueries({ queryKey: ['cash_movements'] });
    toast({ title: `Imported ${rows.length} order${rows.length !== 1 ? 's' : ''}`, description: skipped.length ? `Skipped (no SKU match): ${skipped.join(', ')}` : undefined });
    setBillPreviewOpen(false);
    setBillPreview(null);
  };

  const requestSplitOrders = (checked: boolean | 'indeterminate') => {
    if (checked === true) {
      setSplitConfirmOpen(true);
      return;
    }
    form.setValue('split_orders', false, { shouldDirty: true });
  };

  const confirmSplitOrders = () => {
    form.setValue('split_orders', true, { shouldDirty: true });
    setSplitConfirmOpen(false);
  };

  // Quick payment status toggle / selection
  const handleStatusChange = async (sale: any, newStatus: string) => {
    if (sale.payment_status === newStatus) return;

    try {
      const settlement_date = newStatus === 'Settled' ? new Date().toISOString().slice(0, 10) : null;
      const { error } = await supabase.from('sales').update({ payment_status: newStatus as any, settlement_date }).eq('id', sale.id);
      if (error) throw error;
      
      // Auto-log return if needed
      if (newStatus === 'Return' || newStatus === 'Order RTO') {
        const return_type = newStatus === 'Return' ? 'Customer Return' : 'RTO';
        const penalty_per_unit = newStatus === 'Return' ? 160 : 0;
        const row = {
          sales_id: sale.id,
          inventory_id: sale.inventory_id,
          return_type: return_type,
          quantity_returned: sale.quantity_sold,
          return_date: new Date().toISOString().slice(0, 10),
          penalty_amount: penalty_per_unit * sale.quantity_sold,
          delivery_status: 'In Transit'
        };
        
        const { error: retError } = await supabase.from('returns').upsert(row as any, { onConflict: 'sales_id' });
        if (retError) {
          toast({ title: 'Status updated, but failed to log return', description: retError.message, variant: 'destructive' });
        } else {
          toast({ title: `Status marked as ${newStatus} & Return logged` });
        }
      } else {
        // Clean up returns record if status changed away from return/RTO
        await supabase.from('returns').delete().eq('sales_id', sale.id);
        toast({ title: `Status marked as ${newStatus}` });
      }

      qc.invalidateQueries({ queryKey: ['sales'] });
      qc.invalidateQueries({ queryKey: ['returns'] });
      qc.invalidateQueries({ queryKey: ['inventory'] });
      qc.invalidateQueries({ queryKey: ['capital_accounts'] });
      qc.invalidateQueries({ queryKey: ['cash_movements'] });
    } catch (err: any) {
      toast({ title: 'Error updating status', description: err.message, variant: 'destructive' });
    }
  };

  const handleExport = () => {
    exportToXlsx({
      filename: `SAVS_Sales_${new Date().toISOString().slice(0, 10)}.xlsx`,
      sheetName: 'Sales',
      title: 'SAVS BuyHub - Sales Report',
      rows: filtered.map(s => {
        const inv = (Array.isArray(s.inventory) ? s.inventory[0] : s.inventory) as any;
        const cp = s.cost_price ?? inv?.average_cost_price ?? 0;
        const sp = s.average_selling_price;
        const qty = s.quantity_sold;
        return {
          'Dispatch Date': s.dispatch_date,
          Platform: s.platform,
          'Order ID': (s as any).order_number ?? '',
          SKU: inv?.sku ?? '',
          'Product Name': inv?.product_name ?? '',
          'Qty Sold': qty,
          'Cost Price (₹)': cp,
          'Selling Price (₹)': sp,
          'Revenue (₹)': qty * sp,
          'Profit/Loss (₹)': qty * (sp - cp),
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
      const payload = {
        dispatch_date, platform: platform as any, inventory_id: inv.id,
        quantity_sold, average_selling_price, cost_price: inv.average_cost_price ?? 0, courier_partner,
        payment_status: (payment_status === 'Settled' ? 'Settled' : 'Pending') as any,
        settlement_date: payment_status === 'Settled' && settlement_date ? settlement_date : null,
      };
      let { error } = await supabase.from('sales').insert(payload);
      if (error && (error.message?.includes('cost_price') || error.details?.includes('cost_price'))) {
        const { cost_price, ...fallbackPayload } = payload;
        const retryResult = await supabase.from('sales').insert(fallbackPayload);
        error = retryResult.error;
      }
      if (error) errors.push(`${sku}: ${error.message}`);
      else success++;
    }
    qc.invalidateQueries({ queryKey: ['sales'] });
    qc.invalidateQueries({ queryKey: ['inventory'] });
    return { success, errors };
  };

  return (
    <div className="space-y-5 animate-in">
      <PageHeader
        title="Sales Ledger"
        subtitle={`${filtered.length} total orders · Estimated Profit: ${fmt(totalProfit)}`}
        icon={<DollarSign className="h-5 w-5 text-indigo-500" />}
        actions={<>
          <Button variant="outline" size="sm" onClick={handleExport}><Download className="mr-1 h-4 w-4" />Export Excel</Button>
          {admin && <CsvImportButton onImport={handleImport} expectedColumns={['sku', 'dispatch_date', 'platform', 'quantity_sold', 'average_selling_price']} label="Import CSV" />}
          {admin && (
            <label>
              <input type="file" accept="application/pdf,image/*" className="hidden" disabled={billUploading} onChange={(e) => { const f = e.target.files?.[0]; if (f) { handleBillUpload(f); e.target.value = ''; } }} />
              <Button asChild variant="outline" size="sm" disabled={billUploading}>
                <span className="cursor-pointer">{billUploading ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <FileUp className="mr-1 h-4 w-4" />}Upload Bill</span>
              </Button>
            </label>
          )}
          {admin && (
            <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) { setEditId(null); form.reset(); } }}>
              <DialogTrigger asChild><Button size="sm"><Plus className="mr-1 h-4 w-4" />Log Sale</Button></DialogTrigger>
              <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg" onCloseAutoFocus={(event) => event.preventDefault()}>
                <DialogHeader><DialogTitle>{editId ? 'Edit Sale' : 'Log New Sale'}</DialogTitle></DialogHeader>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3 pt-1">
                  {/* Row 1: Date + Platform */}
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label className="text-xs font-semibold">Dispatch Date</Label><Input type="date" {...form.register('dispatch_date')} className="mt-1" /></div>
                    <div>
                      <Label className="text-xs font-semibold">Platform</Label>
                      <Controller name="platform" control={form.control} render={({ field }) => (
                        <Select value={field.value} onValueChange={field.onChange}>
                          <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {['Meesho', 'Flipkart', 'Amazon', 'Offline'].map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      )} />
                    </div>
                  </div>

                  {/* Product */}
                  <div>
                    <Label className="text-xs font-semibold">Product (SKU)</Label>
                    <Controller name="inventory_id" control={form.control} render={({ field }) => (
                      <Select value={field.value} onValueChange={(v) => { field.onChange(v); }}>
                        <SelectTrigger className="mt-1"><SelectValue placeholder="Select product" /></SelectTrigger>
                        <SelectContent>
                          {inventory.map(i => <SelectItem key={i.id} value={i.id}>{i.sku} – {i.product_name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    )} />
                    {form.formState.errors.inventory_id && <p className="text-xs text-destructive mt-1">{form.formState.errors.inventory_id.message}</p>}
                  </div>

                  {/* Row: Qty + SP */}
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label className="text-xs font-semibold">Qty / Order</Label><Input type="number" className="mt-1" {...form.register('quantity_sold', { valueAsNumber: true })} /></div>
                    <div><Label className="text-xs font-semibold">Selling Price (₹)</Label><Input type="number" step="0.01" className="mt-1" {...form.register('average_selling_price', { valueAsNumber: true })} /></div>
                  </div>

                  {/* Row: Courier + Payment Method */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs font-semibold">Courier</Label>
                      <Controller name="courier_partner" control={form.control} render={({ field }) => (
                        <Select value={field.value || '_none'} onValueChange={(v) => field.onChange(v === '_none' ? '' : v)}>
                          <SelectTrigger className="mt-1"><SelectValue placeholder="Select courier" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="_none">None</SelectItem>
                            {COURIER_OPTIONS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      )} />
                    </div>
                    <div>
                      <Label className="text-xs font-semibold">Payment Method</Label>
                      <Controller name="payment_method" control={form.control} render={({ field }) => (
                        <Select value={field.value ?? 'Prepaid'} onValueChange={field.onChange}>
                          <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Prepaid">Prepaid</SelectItem>
                            <SelectItem value="COD">COD</SelectItem>
                          </SelectContent>
                        </Select>
                      )} />
                    </div>
                  </div>

                  {/* Row: Status + (Settlement Date if Settled) */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs font-semibold">Payment Status</Label>
                      <Controller name="payment_status" control={form.control} render={({ field }) => (
                        <Select value={field.value} onValueChange={field.onChange}>
                          <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Pending">Pending</SelectItem>
                            <SelectItem value="Packed">Packed</SelectItem>
                            <SelectItem value="Dispatched">Dispatched</SelectItem>
                            <SelectItem value="In Transit">In Transit</SelectItem>
                            <SelectItem value="Settled">Settled</SelectItem>
                            <SelectItem value="Cancelled">Cancelled</SelectItem>
                            <SelectItem value="Order RTO">Order RTO</SelectItem>
                            <SelectItem value="Return">Return</SelectItem>
                          </SelectContent>
                        </Select>
                      )} />
                    </div>
                    {paymentStatus === 'Settled' && (
                      <div><Label className="text-xs font-semibold">Settlement Date</Label><Input type="date" className="mt-1" {...form.register('settlement_date')} /></div>
                    )}
                  </div>

                  {/* Bulk Order IDs — the key time-saver */}
                  <div className="rounded-lg border-2 border-dashed border-indigo-200 dark:border-indigo-800 bg-indigo-50/30 dark:bg-indigo-950/10 p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-bold text-indigo-700 dark:text-indigo-300">⚡ Order ID(s) — Bulk Entry</Label>
                      {(() => {
                        const raw = form.watch('order_number') || '';
                        const count = raw.split(/[\n,]+/).map((s: string) => s.trim()).filter(Boolean).length;
                        return count > 1 ? (
                          <span className="text-[10px] font-bold bg-indigo-600 text-white px-2 py-0.5 rounded-full animate-pulse">
                            {count} orders
                          </span>
                        ) : <span className="text-[10px] text-muted-foreground">optional</span>;
                      })()}
                    </div>
                    <Textarea
                      placeholder={"Paste all Order IDs here (one per line or comma-separated):\n\nAWB001234\nAWB001235\nAWB001236\n\nEach ID = one separate sale row"}
                      {...form.register('order_number')}
                      className="min-h-[90px] font-mono text-xs bg-white dark:bg-background resize-none"
                    />
                    <p className="text-[10px] text-indigo-600 dark:text-indigo-400 font-medium">
                      Same product, courier & price? Paste all AWBs at once — they'll each get their own row automatically.
                    </p>
                  </div>

                  {!editId && (
                    <div className="space-y-2">
                      <div className="flex items-start gap-2 rounded-md border bg-muted/40 p-2.5">
                        <Controller name="split_orders" control={form.control} render={({ field }) => (
                          <Checkbox id="split_orders" checked={field.value ?? false} onCheckedChange={requestSplitOrders} className="mt-0.5" />
                        )} />
                        <label htmlFor="split_orders" className="text-xs leading-tight cursor-pointer">
                          <span className="flex items-center gap-1 font-semibold"><SplitSquareHorizontal className="h-3 w-3" />Split qty into individual orders</span>
                          <span className="text-[10px] text-muted-foreground">Creates one row per unit (qty &gt; 1 → multiple rows).</span>
                        </label>
                      </div>

                      <div className="flex items-center gap-2 rounded-md border border-indigo-100 bg-indigo-50/20 dark:border-indigo-950/40 dark:bg-indigo-950/10 p-2.5">
                        <Controller name="log_another" control={form.control} render={({ field }) => (
                          <Checkbox id="log_another" checked={field.value ?? false} onCheckedChange={field.onChange} />
                        )} />
                        <label htmlFor="log_another" className="text-xs leading-tight cursor-pointer flex-1">
                          <span className="font-semibold text-indigo-700 dark:text-indigo-300">Keep form open after logging</span>
                          <span className="text-[10px] text-muted-foreground block">All fields stay — only Order ID is cleared. Great for different products, same day.</span>
                        </label>
                      </div>
                    </div>
                  )}
                  <Button type="submit" className="w-full mt-1">{editId ? 'Update Sale' : 'Log Sale'}</Button>
                </form>
                <AlertDialog open={splitConfirmOpen} onOpenChange={setSplitConfirmOpen}>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Split quantity into individual rows?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This creates one separate sales ledger row for each unit. Keep it off if this is one order with multiple units.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Keep Off</AlertDialogCancel>
                      <AlertDialogAction onClick={confirmSplitOrders}>Confirm Split</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </DialogContent>
            </Dialog>
          )}
        </>}
      />

      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        <StatCard title="Total Revenue" value={fmt(totalRevenue)} icon={<DollarSign />} color="primary" />
        <StatCard title="Pending Settlement" value={fmt(pendingAmount)} icon={<Clock />} color="amber" />
        <StatCard title="Settled & Realized" value={fmt(settledAmount)} icon={<DollarSign />} color="emerald" />
        <StatCard title="Estimated Profit" value={fmt(totalProfit)} icon={<TrendingUp />} color={totalProfit >= 0 ? 'emerald' : 'red'} />
      </div>

      <SectionCard title="Sales Velocity" description="Last 14 Active Days">
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={velocityData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#4f46e5" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
              <XAxis dataKey="date" tickFormatter={(v) => v.slice(5)} fontSize={10} tickLine={false} axisLine={false} />
              <YAxis tickFormatter={(v) => `₹${v}`} fontSize={10} tickLine={false} axisLine={false} />
              <Tooltip formatter={(val: number) => `₹${val.toFixed(2)}`} labelFormatter={(l) => `Date: ${l}`} />
              <Area dataKey="revenue" stroke="#4f46e5" strokeWidth={2} fillOpacity={1} fill="url(#colorRevenue)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </SectionCard>

      <SectionCard title="Sales Ledger" description="Record and track order dispatches and settlement statuses." noPadding>
        <div className="p-4 border-b border-border/50 flex flex-wrap gap-3">
          <div className="relative max-w-sm flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search sales..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9 text-sm" />
          </div>
          <Select value={platformFilter} onValueChange={setPlatformFilter}>
            <SelectTrigger className="w-36 h-9"><SelectValue placeholder="Platform" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Platforms</SelectItem>
              {['Meesho', 'Flipkart', 'Amazon', 'Offline'].map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-36 h-9"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="Pending">Pending</SelectItem>
              <SelectItem value="Packed">Packed</SelectItem>
              <SelectItem value="Dispatched">Dispatched</SelectItem>
              <SelectItem value="In Transit">In Transit</SelectItem>
              <SelectItem value="Settled">Settled</SelectItem>
              <SelectItem value="Cancelled">Cancelled</SelectItem>
              <SelectItem value="Order RTO">Order RTO</SelectItem>
              <SelectItem value="Return">Return</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead className="font-semibold text-xs">Date</TableHead>
                <TableHead className="font-semibold text-xs">Platform</TableHead>
                <TableHead className="font-semibold text-xs">Order ID</TableHead>
                <TableHead className="font-semibold text-xs">SKU</TableHead>
                <TableHead className="font-semibold text-xs">Product</TableHead>
                <TableHead className="text-right font-semibold text-xs">Qty</TableHead>
                <TableHead className="text-right font-semibold text-xs">CP</TableHead>
                <TableHead className="text-right font-semibold text-xs">SP</TableHead>
                <TableHead className="text-right font-semibold text-xs">P/L</TableHead>
                <TableHead className="font-semibold text-xs">Courier</TableHead>
                <TableHead className="font-semibold text-xs">Status</TableHead>
                {admin && <TableHead className="text-right font-semibold text-xs">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(s => {
                const inv = (Array.isArray(s.inventory) ? s.inventory[0] : s.inventory) as any;
                const cp = s.cost_price ?? inv?.average_cost_price ?? 0;
                const sp = s.average_selling_price;
                const qty = s.quantity_sold;
                const rowProfit = (sp - cp) * qty;
                return (
                  <TableRow key={s.id} className="hover:bg-primary/5 transition-colors group">
                    <TableCell className="text-sm font-medium text-muted-foreground">{s.dispatch_date}</TableCell>
                    <TableCell><Badge variant="outline" className="px-1.5 py-0 text-[10px] uppercase font-bold tracking-wider">{s.platform}</Badge></TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground max-w-[120px] truncate" title={(s as any).order_number ?? ''}>{(s as any).order_number ?? <span className="text-muted-foreground/40">—</span>}</TableCell>
                    <TableCell className="font-mono text-xs text-primary font-medium">{inv?.sku}</TableCell>
                    <TableCell className="max-w-[200px] truncate font-medium">{inv?.product_name}</TableCell>
                    <TableCell className="text-right tabular-nums font-semibold">{qty}</TableCell>
                    <TableCell className="text-right font-mono text-xs text-muted-foreground">{fmt(cp)}</TableCell>
                    <TableCell className="text-right font-mono text-xs text-muted-foreground">{fmt(sp)}</TableCell>
                    <TableCell className={`text-right font-mono text-xs font-bold ${rowProfit > 0 ? 'text-emerald-600 dark:text-emerald-400' : rowProfit < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-500'}`}>
                      {rowProfit >= 0 ? '+' : ''}{fmt(rowProfit)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{s.courier_partner ?? '—'}</TableCell>
                    <TableCell>
                      {admin ? (
                        <Select value={s.payment_status} onValueChange={(v) => handleStatusChange(s, v)}>
                          <SelectTrigger className="h-7 text-xs border-0 bg-transparent px-2 w-[120px] focus:ring-0">
                            <Badge variant={['Settled', 'Packed', 'Dispatched', 'In Transit'].includes(s.payment_status) ? 'default' : s.payment_status === 'Cancelled' ? 'destructive' : 'outline'}>
                              {s.payment_status}
                            </Badge>
                          </SelectTrigger>
                          <SelectContent>
                            {['Pending', 'Packed', 'Dispatched', 'In Transit', 'Settled', 'Cancelled', 'Order RTO', 'Return'].map(opt => (
                              <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Badge variant={['Settled', 'Packed', 'Dispatched', 'In Transit'].includes(s.payment_status) ? 'default' : s.payment_status === 'Cancelled' ? 'destructive' : 'outline'}>
                          {s.payment_status}
                        </Badge>
                      )}
                    </TableCell>
                    {admin && (
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          {s.quantity_sold > 1 && (
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-indigo-500 hover:text-indigo-700 hover:bg-indigo-50" title="Split into individual orders" onClick={async () => {
                              if (!confirm(`Split this row of ${s.quantity_sold} units into ${s.quantity_sold} separate orders of qty 1?`)) return;
                              const base = { 
                                dispatch_date: s.dispatch_date, 
                                platform: s.platform, 
                                inventory_id: s.inventory_id, 
                                average_selling_price: s.average_selling_price, 
                                cost_price: (s as any).cost_price,
                                courier_partner: s.courier_partner, 
                                payment_status: s.payment_status, 
                                payment_method: (s as any).payment_method ?? null, 
                                order_number: (s as any).order_number ?? null, 
                                settlement_date: s.settlement_date 
                              };
                              const rows = Array.from({ length: s.quantity_sold }, () => ({ ...base, quantity_sold: 1 }));
                              let { error: e1 } = await supabase.from('sales').insert(rows as any);
                              if (e1 && (e1.message?.includes('cost_price') || e1.details?.includes('cost_price'))) {
                                const fallbackRows = rows.map(({ cost_price, ...rest }) => rest);
                                const retryResult = await supabase.from('sales').insert(fallbackRows as any);
                                e1 = retryResult.error;
                              }
                              if (e1) { toast({ title: 'Split failed', description: e1.message, variant: 'destructive' }); return; }
                              await supabase.from('sales').delete().eq('id', s.id);
                              qc.invalidateQueries({ queryKey: ['sales'] });
                              qc.invalidateQueries({ queryKey: ['capital_accounts'] });
                              qc.invalidateQueries({ queryKey: ['cash_movements'] });
                              toast({ title: `Split into ${rows.length} orders` });
                            }}><SplitSquareHorizontal className="h-4 w-4" /></Button>
                          )}
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-indigo-500 hover:text-indigo-700 hover:bg-indigo-50" title="Clone / Duplicate" onClick={() => handleClone(s)}><Copy className="h-3.5 w-3.5" /></Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8" title="Edit" onClick={() => handleEdit(s)}><Pencil className="h-3.5 w-3.5" /></Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10" title="Delete" onClick={() => handleDelete(s.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={admin ? 12 : 11} className="py-16">
                    <EmptyState icon={<DollarSign className="h-8 w-8" />} title="No sales found" description="Adjust your filters or record a new sale." />
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </SectionCard>

      <Dialog open={billPreviewOpen} onOpenChange={(o) => { setBillPreviewOpen(o); if (!o) setBillPreview(null); }}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Review Parsed Orders ({billPreview?.length ?? 0})</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Date will be today ({new Date().toISOString().slice(0,10)}). Rows without an SKU match are skipped.</p>
          <div className="overflow-x-auto rounded border max-h-[400px] overflow-y-auto">
            <Table>
              <TableHeader><TableRow><TableHead>SKU</TableHead><TableHead>Product</TableHead><TableHead>Qty</TableHead><TableHead>Order #</TableHead><TableHead>Catalog Price</TableHead><TableHead>Pay</TableHead><TableHead>Courier</TableHead><TableHead>Platform</TableHead></TableRow></TableHeader>
              <TableBody>
                {billPreview?.map((it, i) => {
                  const matchedInv = it.matched_inventory_id ? inventory.find(inv => inv.id === it.matched_inventory_id) : null;
                  return (
                    <TableRow key={i} className={!it.matched_inventory_id ? 'opacity-50' : ''}>
                      <TableCell className="font-mono text-xs">{it.matched_sku || it.sku || '—'}</TableCell>
                      <TableCell className="text-sm">{it.matched_name || it.product_name || '—'}</TableCell>
                      <TableCell>{it.quantity}</TableCell>
                      <TableCell className="text-xs">{it.order_number || '—'}</TableCell>
                      <TableCell>{matchedInv ? `₹${matchedInv.average_selling_price}` : '—'}</TableCell>
                      <TableCell>{it.payment_method || '—'}</TableCell>
                      <TableCell className="text-xs">{it.courier_partner || '—'}</TableCell>
                      <TableCell className="text-xs">{it.platform || '—'}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <div className="flex justify-end gap-2 mt-3">
            <Button variant="outline" onClick={() => setBillPreviewOpen(false)}>Cancel</Button>
            <Button onClick={confirmBillImport}>Import {billPreview?.filter(i => i.matched_inventory_id).length ?? 0} orders</Button>
          </div>
        </DialogContent>
      </Dialog>


    </div>
  );
}
