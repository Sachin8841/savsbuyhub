import { useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, isAdmin, signOut } = useAuthStore();

  useEffect(() => {
    if (user && !loading && !isAdmin()) {
      void signOut();
    }
  }, [user, loading, isAdmin, signOut]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  if (!isAdmin()) {
    return <Navigate to="/login?error=unauthorized" replace />;
  }

  return <>{children}</>;
}
