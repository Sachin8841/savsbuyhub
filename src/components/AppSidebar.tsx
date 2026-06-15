import { LayoutDashboard, Package, Receipt, RotateCcw, Settings, LogOut, BarChart3, FileText } from 'lucide-react';
import { NavLink } from '@/components/NavLink';
import { useAuthStore } from '@/stores/authStore';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  useSidebar,
} from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';

const navItems = [
  { title: 'Dashboard', url: '/', icon: LayoutDashboard },
  { title: 'Inventory', url: '/inventory', icon: Package },
  { title: 'Sales Ledger', url: '/sales', icon: Receipt },
  { title: 'Returns', url: '/returns', icon: RotateCcw },
  { title: 'P&L Statement', url: '/pnl', icon: FileText },
  { title: 'Investor Portal', url: '/invest', icon: BarChart3 },
  { title: 'Settings', url: '/settings', icon: Settings },
];

const adminItems = [
  { title: 'Settings', url: '/settings', icon: Settings },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';
  const { isAdmin, signOut, user } = useAuthStore();

  return (
    <Sidebar collapsible="icon">
      <SidebarContent>
        <div className="flex items-center gap-3 px-4 py-6 border-b border-sidebar-border/50 bg-sidebar-background/50 backdrop-blur-sm">
          <div className="h-9 w-9 rounded-xl bg-white flex items-center justify-center flex-shrink-0 shadow-lg border border-sidebar-border relative overflow-hidden p-0.5">
            <img src="/savs-logo-placeholder.png" alt="SAVS Logo" className="h-full w-full object-contain" />
          </div>
          {!collapsed && (
            <div className="flex flex-col">
              <span className="text-lg font-bold text-sidebar-foreground tracking-tight leading-tight">SAVS ERP</span>
              <span className="text-[10px] uppercase font-bold tracking-widest text-indigo-500">BuyHub Core</span>
            </div>
          )}
        </div>

        <SidebarGroup className="pt-4">
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => {
                // If not admin, only show Investor Portal and Settings
                if (!isAdmin() && item.url !== '/invest' && item.url !== '/settings') return null;
                
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild>
                      <NavLink to={item.url} end={item.url === '/'} className="hover:bg-sidebar-accent/50" activeClassName="bg-sidebar-accent text-sidebar-primary font-medium">
                        <item.icon className="mr-2 h-4 w-4" />
                        {!collapsed && <span>{item.title}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>


      </SidebarContent>

      <SidebarFooter className="p-4">
        {!collapsed && (
          <p className="mb-2 truncate text-xs text-sidebar-foreground/70">{user?.email}</p>
        )}
        <Button variant="ghost" size="sm" className="w-full justify-start text-sidebar-foreground/70 hover:text-sidebar-foreground" onClick={signOut}>
          <LogOut className="mr-2 h-4 w-4" />
          {!collapsed && 'Sign Out'}
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
