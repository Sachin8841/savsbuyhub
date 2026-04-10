import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/stores/authStore';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Shield } from 'lucide-react';
import { Navigate } from 'react-router-dom';

interface UserWithRole {
  user_id: string;
  role: string;
}

export default function SettingsPage() {
  const { isAdmin } = useAuthStore();
  const [users, setUsers] = useState<UserWithRole[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const admin = isAdmin();

  useEffect(() => {
    if (!admin) return;
    const fetchUsers = async () => {
      setLoading(true);
      const { data: roles } = await supabase.from('user_roles').select('user_id, role');
      setUsers((roles ?? []).map(r => ({ user_id: r.user_id, role: r.role })));
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

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Shield className="h-6 w-6 text-primary" />
        <h2 className="text-2xl font-bold">Settings — User Management</h2>
      </div>
      <p className="text-muted-foreground">Manage user roles. Promote users to Admin for full CRUD access.</p>
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User ID</TableHead>
              <TableHead>Current Role</TableHead>
              <TableHead>Change Role</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map(u => (
              <TableRow key={u.user_id}>
                <TableCell className="font-mono text-sm">{u.user_id}</TableCell>
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
              <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-8">No users found</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
