'use client';

import React, { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { 
  LayoutDashboard, 
  Users, 
  FileText, 
  Settings as SettingsIcon, 
  LogOut, 
  ShieldCheck, 
  Menu,
  ChevronRight,
  ChevronLeft,
  Sun,
  Moon
} from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { useTheme } from 'next-themes';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, role, signOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);

  useEffect(() => {
    setMounted(true);
    const saved = localStorage.getItem('sidebar-collapsed');
    if (saved) {
      setIsCollapsed(saved === 'true');
    }
  }, []);

  const toggleCollapse = () => {
    const newVal = !isCollapsed;
    setIsCollapsed(newVal);
    localStorage.setItem('sidebar-collapsed', String(newVal));
  };

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  if (loading || !user) {
    return (
      <div className="flex flex-1 items-center justify-center bg-background min-h-screen">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent"></div>
      </div>
    );
  }

  const menuItems = [
    { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    { name: 'Clients', href: '/clients', icon: Users },
    { name: 'Reports', href: '/reports', icon: FileText },
    { name: 'Settings', href: '/settings', icon: SettingsIcon },
  ];

  const renderSidebar = (forceExpanded = false) => {
    const collapsed = isCollapsed && !forceExpanded;
    return (
      <div className="flex flex-col h-full bg-card transition-all duration-300">
        <div className={`flex h-16 items-center ${collapsed ? 'justify-center px-0' : 'justify-between px-6'} border-b border-border`}>
          <div className="flex items-center gap-2 overflow-hidden">
            <ShieldCheck className="h-6 w-6 text-indigo-500 shrink-0" />
            {!collapsed && (
              <span className="font-bold text-lg bg-clip-text text-transparent bg-gradient-to-r from-foreground to-muted-foreground truncate">
                Tracking Health AI
              </span>
            )}
          </div>
          {!collapsed && (
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleCollapse}
              className="h-8 w-8 text-muted-foreground hover:bg-accent rounded-lg cursor-pointer shrink-0"
              title="Collapse sidebar"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
          )}
        </div>

        <nav className="flex-1 space-y-1 px-2 py-6">
          {menuItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
            const Icon = item.icon;
            return (
              <Link
                key={item.name}
                href={item.href}
                className={`flex items-center ${collapsed ? 'justify-center py-3' : 'justify-between px-4 py-3'} rounded-xl text-sm font-medium transition-all duration-200 group cursor-pointer ${
                  isActive
                    ? 'bg-indigo-600/10 text-indigo-500 border-l-2 border-indigo-500 pl-3.5'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                }`}
                title={collapsed ? item.name : undefined}
              >
                <div className="flex items-center gap-3">
                  <Icon className={`h-4 w-4 transition-colors shrink-0 ${isActive ? 'text-indigo-500' : 'text-muted-foreground group-hover:text-foreground'}`} />
                  {!collapsed && <span>{item.name}</span>}
                </div>
                {!collapsed && isActive && <ChevronRight className="h-3.5 w-3.5" />}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-border space-y-3 bg-muted/20">
          {collapsed ? (
            <div className="flex flex-col items-center gap-4">
              {mounted && (
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 rounded-xl border-border bg-background text-foreground hover:bg-accent cursor-pointer"
                  onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                  title="Toggle theme"
                >
                  {theme === 'dark' ? <Sun className="h-4 w-4 text-amber-500" /> : <Moon className="h-4 w-4 text-indigo-500" />}
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                onClick={signOut}
                className="text-red-500 hover:text-red-400 hover:bg-red-500/5 rounded-xl h-8 w-8 cursor-pointer"
                title="Sign Out"
              >
                <LogOut className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleCollapse}
                className="h-8 w-8 text-muted-foreground hover:bg-accent rounded-lg cursor-pointer"
                title="Expand sidebar"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between px-2">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Theme Mode</span>
                {mounted && (
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8 rounded-xl border-border bg-background text-foreground hover:bg-accent cursor-pointer"
                    onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                    title="Toggle theme"
                  >
                    {theme === 'dark' ? <Sun className="h-4 w-4 text-amber-500" /> : <Moon className="h-4 w-4 text-indigo-500" />}
                  </Button>
                )}
              </div>

              <div className="flex items-center gap-3 px-2 py-3 border-t border-border/50">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted font-semibold text-foreground border border-border shrink-0">
                  {user.displayName?.[0] || user.email?.[0]?.toUpperCase() || 'U'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate text-foreground">
                    {user.displayName || 'User'}
                  </p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-indigo-500/30 text-indigo-500 bg-indigo-500/5">
                      {role?.toUpperCase() || 'MEMBER'}
                    </Badge>
                  </div>
                </div>
              </div>

              <Button
                variant="ghost"
                onClick={signOut}
                className="w-full justify-start text-red-500 hover:text-red-400 hover:bg-red-500/5 rounded-xl h-10 cursor-pointer"
              >
                <LogOut className="h-4 w-4 mr-2" />
                <span>Sign Out</span>
              </Button>
            </>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="flex min-h-screen bg-background text-foreground font-sans">
      <aside className={`hidden md:flex flex-col ${isCollapsed ? 'w-16' : 'w-64'} border-r border-border bg-card shrink-0 transition-all duration-300`}>
        {renderSidebar(false)}
      </aside>

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="flex md:hidden h-16 items-center justify-between px-6 border-b border-border bg-card shrink-0">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-indigo-500" />
            <span className="font-bold text-base text-foreground">Tracking Health AI</span>
          </div>
          <Sheet>
            <SheetTrigger render={
              <Button variant="ghost" size="icon" className="text-muted-foreground cursor-pointer">
                <Menu className="h-6 w-6" />
              </Button>
            } />
            <SheetContent side="left" className="p-0 w-64 bg-card border-r-border text-foreground">
              {renderSidebar(true)}
            </SheetContent>
          </Sheet>
        </header>

        <main className="flex-1 overflow-y-auto p-6 md:p-8 bg-background">
          {children}
        </main>
      </div>
    </div>
  );
}
