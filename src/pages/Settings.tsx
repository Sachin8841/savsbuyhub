import { useState, useEffect } from 'react';
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Shield, Users, AlertTriangle, FileDown, RotateCcw, Database, Bell, Palette } from 'lucide-react';
import { Navigate } from 'react-router-dom';
import { exportDashboardReport } from '@/lib/xlsx-export';
import { useSales, useInventory, useReturns, useAdExpenses } from '@/hooks/useData';
import { Switch } from '@/components/ui/switch';

interface UserWithProfile {
  user_id: string;
  role: string;
  email: string;
  full_name: string;
}

export default function SettingsPage() {
  const { isAdmin } = useAuthStore();
  const [users, setUsers] = useState<UserWithProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [disclosureOpen, setDisclosureOpen] = useState(false);
  const [disclosureConfirm, setDisclosureConfirm] = useState('');
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: sales = [] } = useSales();
  const { data: inventory = [] } = useInventory();
  const { data: returns = [] } = useReturns();
  const { data: adExpenses = [] } = useAdExpenses();

  const admin = isAdmin();

  useEffect(() => {
    if (!admin) return;
    const fetchUsers = async () => {
      setLoading(true);
      const { data: roles } = await supabase.from('user_roles').select('user_id, role');
      const { data: profiles } = await supabase.from('profiles').select('user_id, email, full_name');
      const profileMap = new Map((profiles ?? []).map(p => [p.user_id, p]));
      setUsers((roles ?? []).map(r => {
        const prof = profileMap.get(r.user_id);
        return { user_id: r.user_id, role: r.role, email: prof?.email ?? 'Unknown', full_name: prof?.full_name ?? '—' };
      }));
      setLoading(false);
    };
    fetchUsers();
  }, [admin]);

  if (!admin) return <Navigate to="/" replace />;

  const updateRole = async (userId: string, newRole: string) => {
    const { error } = await supabase.from('user_roles').update({ role: newRole as any }).eq('user_id', userId);
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Role updated' });
    setUsers(prev => prev.map(u => u.user_id === userId ? { ...u, role: newRole } : u));
  };

  const handleMonthlyDisclosure = async () => {
    if (disclosureConfirm !== 'CONFIRM') {
      toast({ title: 'Type CONFIRM to proceed', variant: 'destructive' });
      return;
    }
    const { error: e1 } = await supabase.from('returns').delete().gte('created_at', '2000-01-01');
    const { error: e2 } = await supabase.from('sales').delete().gte('created_at', '2000-01-01');
    const { error: e3 } = await supabase.from('ad_expenses').delete().gte('created_at', '2000-01-01');
    if (e1 || e2 || e3) {
      toast({ title: 'Error during disclosure', description: (e1 || e2 || e3)?.message, variant: 'destructive' });
      return;
    }
    qc.invalidateQueries({ queryKey: ['sales'] });
    qc.invalidateQueries({ queryKey: ['returns'] });
    qc.invalidateQueries({ queryKey: ['ad_expenses'] });
    qc.invalidateQueries({ queryKey: ['inventory'] });
    toast({ title: 'Monthly Disclosure Complete', description: 'All accounts have been zeroed.' });
    setDisclosureOpen(false);
    setDisclosureConfirm('');
  };

  const handleFullExport = () => exportDashboardReport(sales, inventory, returns, adExpenses, {});

  // Stats
  const totalSales = sales.length;
  const totalReturns = returns.length;
  const totalProducts = inventory.length;
  const adminCount = users.filter(u => u.role === 'admin').length;
  const userCount = users.filter(u => u.role === 'user').length;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Shield className="h-6 w-6 text-primary" />
        <h2 className="text-2xl font-bold">Settings & Administration</h2>
      </div>

      {/* System Overview */}
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
        <Card><CardContent className="p-4 text-center"><p className="text-xs text-muted-foreground">Products</p><p className="text-xl font-bold text-primary">{totalProducts}</p></CardContent></Card>
        <Card><CardContent className="p-4 text-center"><p className="text-xs text-muted-foreground">Total Sales</p><p className="text-xl font-bold text-primary">{totalSales}</p></CardContent></Card>
        <Card><CardContent className="p-4 text-center"><p className="text-xs text-muted-foreground">Returns</p><p className="text-xl font-bold text-destructive">{totalReturns}</p></CardContent></Card>
        <Card><CardContent className="p-4 text-center"><p className="text-xs text-muted-foreground">Admins</p><p className="text-xl font-bold text-primary">{adminCount}</p></CardContent></Card>
        <Card><CardContent className="p-4 text-center"><p className="text-xs text-muted-foreground">Users</p><p className="text-xl font-bold text-muted-foreground">{userCount}</p></CardContent></Card>
      </div>

      {/* Quick Actions */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <FileDown className="h-5 w-5 text-primary" />
            <div className="flex-1">
              <p className="font-medium text-sm">Full Data Export</p>
              <p className="text-xs text-muted-foreground">Download complete Excel report</p>
            </div>
            <Button size="sm" variant="outline" onClick={handleFullExport}>Export</Button>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Database className="h-5 w-5 text-primary" />
            <div className="flex-1">
              <p className="font-medium text-sm">Data Summary</p>
              <p className="text-xs text-muted-foreground">{totalSales} sales · {totalProducts} products · {totalReturns} returns</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-destructive/30">
          <CardContent className="p-4 flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <div className="flex-1">
              <p className="font-medium text-sm">Monthly Disclosure</p>
              <p className="text-xs text-muted-foreground">Zero all accounts (CMO approval)</p>
            </div>
            <Dialog open={disclosureOpen} onOpenChange={setDisclosureOpen}>
              <DialogTrigger asChild>
                <Button size="sm" variant="destructive"><RotateCcw className="mr-1 h-3 w-3" />Reset</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle className="text-destructive">⚠️ Monthly Disclosure — Zero Accounts</DialogTitle>
                </DialogHeader>
                <p className="text-sm text-muted-foreground">
                  This will permanently delete <strong>ALL sales, returns, and ad expenses</strong>. Inventory will remain but stock counts will reset. This action is irreversible.
                </p>
                <p className="text-sm font-medium mt-2">Download a backup report before proceeding!</p>
                <Button variant="outline" size="sm" className="w-fit" onClick={handleFullExport}>
                  <FileDown className="mr-1 h-4 w-4" />Download Backup Report
                </Button>
                <div className="mt-4">
                  <Label>Type <strong>CONFIRM</strong> to proceed</Label>
                  <Input value={disclosureConfirm} onChange={e => setDisclosureConfirm(e.target.value)} placeholder="CONFIRM" className="mt-1" />
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setDisclosureOpen(false)}>Cancel</Button>
                  <Button variant="destructive" onClick={handleMonthlyDisclosure} disabled={disclosureConfirm !== 'CONFIRM'}>Zero All Accounts</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </CardContent>
        </Card>
      </div>

      {/* User Management */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Users className="h-4 w-4" />User Management</CardTitle>
          <CardDescription>Manage user roles and permissions. {users.length} total users.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Current Role</TableHead>
                  <TableHead>Change Role</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map(u => (
                  <TableRow key={u.user_id}>
                    <TableCell className="text-sm">{u.email}</TableCell>
                    <TableCell className="text-sm">{u.full_name}</TableCell>
                    <TableCell><Badge variant={u.role === 'admin' ? 'default' : 'secondary'}>{u.role.toUpperCase()}</Badge></TableCell>
                    <TableCell>
                      <Select value={u.role} onValueChange={(v) => updateRole(u.user_id, v)}>
                        <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="user">USER</SelectItem>
                          <SelectItem value="admin">ADMIN</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                  </TableRow>
                ))}
                {users.length === 0 && !loading && (
                  <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">No users found</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
