import { create } from 'zustand';
import { supabase } from '@/integrations/supabase/client';
import type { User } from '@supabase/supabase-js';

interface AuthState {
  user: User | null;
  role: string | null;
  loading: boolean;
  setUser: (user: User | null) => void;
  setRole: (role: string | null) => void;
  setLoading: (loading: boolean) => void;
  isAdmin: () => boolean;
  signOut: () => Promise<void>;
  fetchRole: (userId: string) => Promise<void>;
  forceAdminRestore: () => Promise<boolean>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  role: null,
  loading: true,
  setUser: (user) => set({ user }),
  setRole: (role) => set({ role }),
  setLoading: (loading) => set({ loading }),
  // Only 'admin' (exact, lowercase) is treated as admin — all else is non-admin
  isAdmin: () => get().role === 'admin',
  signOut: async () => {
    await supabase.auth.signOut();
    set({ user: null, role: null, loading: false });
  },
  fetchRole: async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId)
        .maybeSingle();

      if (error) {
        set({ role: 'user' });
        return;
      }

      // Normalise: only accept 'admin', everything else (incl. 'investor', null, unknown) becomes 'user'
      const rawRole = data?.role as string | null;
      const normalised: string = rawRole === 'admin' ? 'admin' : (rawRole ?? 'user');
      set({ role: normalised });
    } catch {
      set({ role: 'user' });
    }
  },
  // Emergency: forces the current user's role in DB to 'admin' then refreshes
  forceAdminRestore: async () => {
    const userId = get().user?.id;
    if (!userId) return false;
    try {
      // Upsert so it works even if no row exists yet
      const { error } = await supabase
        .from('user_roles')
        .upsert({ user_id: userId, role: 'admin' as any }, { onConflict: 'user_id' });
      if (error) return false;
      set({ role: 'admin' });
      return true;
    } catch {
      return false;
    }
  },
}));
