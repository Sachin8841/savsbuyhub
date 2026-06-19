import { useEffect } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { supabase } from '@/integrations/supabase/client';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { setUser, setRole, setLoading, fetchRole } = useAuthStore();

  useEffect(() => {
    let isActive = true;
    let isBootstrapped = false;

    const applySession = (user: Awaited<ReturnType<typeof supabase.auth.getSession>>['data']['session'] extends infer S ? S extends { user: infer U } ? U | null : null : null) => {
      if (!isActive) return;

      isBootstrapped = true;
      setUser(user);

      if (user) {
        setLoading(true);
        void fetchRole(user.id).finally(() => {
          if (isActive && useAuthStore.getState().user?.id === user.id) {
            setLoading(false);
          }
        });
      } else {
        setRole(null);
        setLoading(false);
      }
    };

    const bootstrapTimeout = window.setTimeout(() => {
      if (isActive && !isBootstrapped) {
        setLoading(false);
      }
    }, 2500);

    void supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        applySession(session?.user ?? null);
      })
      .catch(() => {
        if (!isActive) return;
        setUser(null);
        setRole(null);
        setLoading(false);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      applySession(session?.user ?? null);
    });

    return () => {
      isActive = false;
      window.clearTimeout(bootstrapTimeout);
      subscription.unsubscribe();
    };
  }, [setUser, setRole, setLoading, fetchRole]);

  return <>{children}</>;
}
