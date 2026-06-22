import { LayoutDashboard, Package, Receipt, RotateCcw, Settings, LogOut, BarChart3, FileText, TrendingUp } from 'lucide-react';
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
  { title: 'Settings', url: '/settings', icon: Settings },
];

export function AppSidebar() {
  const { state, isMobile, setOpenMobile } = useSidebar();
  const collapsed = state === 'collapsed';
  const { signOut, user } = useAuthStore();
  const closeMobileMenu = () => {
    if (isMobile) setOpenMobile(false);
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarContent>
        {/* Logo / Brand */}
        <div className="flex items-center gap-3 px-4 py-5 border-b border-sidebar-border/50 bg-sidebar-background/50 backdrop-blur-sm">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-indigo-500 to-emerald-500 flex items-center justify-center flex-shrink-0 shadow-lg relative overflow-hidden">
            <span className="text-white font-black text-sm select-none">S</span>
          </div>
          {!collapsed && (
            <div className="flex flex-col min-w-0">
              <span className="text-base font-bold text-sidebar-foreground tracking-tight leading-tight truncate">SAVS ERP</span>
              <span className="text-[10px] uppercase font-bold tracking-widest text-indigo-400">BuyHub Core</span>
            </div>
          )}
        </div>

        {/* Role badge */}
        {!collapsed && (
          <div className="px-4 pt-3 pb-1">
            <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300">
              <span className="w-1.5 h-1.5 rounded-full bg-current" />
              Admin
            </span>
          </div>
        )}

        <SidebarGroup className="pt-2">
          <SidebarGroupLabel className="text-xs opacity-50 uppercase tracking-widest px-4">Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => {
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild>
                      <NavLink
                        to={item.url}
                        end={item.url === '/'}
                        className="group flex items-center gap-2.5 px-3 py-2 rounded-lg transition-all duration-200 hover:bg-sidebar-accent/50 text-sidebar-foreground/70 hover:text-sidebar-foreground"
                        activeClassName="bg-gradient-to-r from-indigo-600/30 to-emerald-600/20 text-sidebar-foreground font-semibold border border-indigo-500/20 shadow-sm"
                        onClick={closeMobileMenu}
                      >
                        <item.icon className="h-4 w-4 shrink-0 transition-transform duration-200 group-hover:scale-110" />
                        {!collapsed && <span className="text-sm">{item.title}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-3 border-t border-sidebar-border/50">
        {!collapsed && user?.email && (
          <div className="mb-2 px-1">
            <p className="truncate text-[11px] text-sidebar-foreground/50 font-medium">{user.email}</p>
          </div>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-sidebar-foreground/60 hover:text-destructive hover:bg-destructive/10 transition-colors gap-2"
          onClick={() => {
            closeMobileMenu();
            void signOut();
          }}
        >
          <LogOut className="h-4 w-4 shrink-0" />
          {!collapsed && <span className="text-sm">Sign Out</span>}
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
