import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/AppSidebar';
import { Outlet } from 'react-router-dom';

export function AppLayout() {
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full animated-gradient-bg">
        <div className="glass-sidebar shadow-2xl z-20">
          <AppSidebar />
        </div>
        <div className="flex-1 flex flex-col min-w-0 z-10 backdrop-blur-sm bg-background/40">
          <header className="h-14 flex items-center border-b border-white/20 dark:border-slate-800/40 glass px-4 sticky top-0 z-30 shadow-sm">
            <SidebarTrigger className="mr-4 hover:scale-110 transition-transform" />
            <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-500 to-emerald-500 dark:from-indigo-400 dark:to-emerald-400">
              SAVS Command Center
            </h1>
          </header>
          <main className="flex-1 overflow-auto p-4 md:p-6 pb-24">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
