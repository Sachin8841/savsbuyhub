import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/AppSidebar';
import { Outlet, useLocation } from 'react-router-dom';

const PAGE_TITLES: Record<string, string> = {
  '/': 'Dashboard',
  '/inventory': 'Inventory',
  '/sales': 'Sales Ledger',
  '/returns': 'Returns',
  '/pnl': 'P&L Statement',
  '/invest': 'Investor Portal',
  '/settings': 'Settings',
};

export function AppLayout() {
  const location = useLocation();
  const pageTitle = PAGE_TITLES[location.pathname] ?? 'SAVS ERP';

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full animated-gradient-bg">
        <div className="glass-sidebar shadow-2xl z-20">
          <AppSidebar />
        </div>
        <div className="flex-1 flex flex-col min-w-0 z-10 backdrop-blur-sm bg-background/40">
          <header className="h-14 flex items-center justify-between border-b border-white/20 dark:border-slate-800/40 glass px-4 sticky top-0 z-30 shadow-sm">
            <div className="flex items-center gap-3">
              <SidebarTrigger className="mr-1 hover:scale-110 transition-transform" />
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold gradient-text hidden sm:block">
                  SAVS Command Center
                </h1>
                <span className="text-muted-foreground hidden sm:block text-sm">·</span>
                <span className="text-sm font-medium text-muted-foreground hidden sm:block">{pageTitle}</span>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="pulse-dot" />
              <span className="hidden sm:block">Live</span>
            </div>
          </header>
          <main className="flex-1 overflow-auto p-4 md:p-6 pb-24">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
