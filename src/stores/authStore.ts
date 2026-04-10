import { create } from 'zustand';
import { supabase } from '@/integrations/supabase/client';
import type { User } from '@supabase/supabase-js';

interface AuthState {
  user: User | null;
  role: 'admin' | 'user' | null;
  loading: boolean;
  setUser: (user: User | null) => void;
  setRole: (role: 'admin' | 'user' | null) => void;
  setLoading: (loading: boolean) => void;
  isAdmin: () => boolean;
  signOut: () => Promise<void>;
  fetchRole: (userId: string) => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  role: null,
  loading: true,
  setUser: (user) => set({ user }),
  setRole: (role) => set({ role }),
  setLoading: (loading) => set({ loading }),
  isAdmin: () => get().role === 'admin',
  signOut: async () => {
    await supabase.auth.signOut();
    set({ user: null, role: null });
  },
  fetchRole: async (userId: string) => {
    const { data } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .maybeSingle();
    set({ role: (data?.role as 'admin' | 'user') ?? 'user' });
  },
}));
