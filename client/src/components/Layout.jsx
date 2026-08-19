import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  CheckSquare,
  Flame,
  StickyNote,
  Calendar as CalendarIcon,
  MessageSquare,
  BarChart3,
  Search,
  Settings as SettingsIcon,
  Shield,
  Moon,
  Sun,
  LogOut,
  Bell,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { useNotifications } from '@/context/NotificationContext';
import InstallPrompt from '@/components/InstallPrompt';
import BrandFooter from '@/components/BrandFooter';
import { Button } from '@/components/ui/button';
import { cn, formatDate } from '@/lib/utils';

const nav = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/tasks', label: 'Tasks', icon: CheckSquare },
  { to: '/habits', label: 'Habits', icon: Flame },
  { to: '/notes', label: 'Notes', icon: StickyNote },
  { to: '/calendar', label: 'Calendar', icon: CalendarIcon },
  { to: '/assistant', label: 'Assistant', icon: MessageSquare },
  { to: '/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/search', label: 'Search', icon: Search },
  { to: '/settings', label: 'Settings', icon: SettingsIcon },
  { to: '/admin', label: 'Admin', icon: Shield, adminOnly: true },
];

export default function Layout() {
  const { user, logout } = useAuth();
  // The Admin entry only renders for admins; everyone else never sees the link.
  const navItems = nav.filter((item) => !item.adminOnly || user?.role === 'ADMIN');
  const { theme, toggle } = useTheme();
  const { notifications, unread, markAllRead } = useNotifications();
  const navigate = useNavigate();
  const [bellOpen, setBellOpen] = useState(false);

  const toggleBell = () => {
    setBellOpen((o) => {
      if (!o) markAllRead();
      return !o;
    });
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-60 flex-col border-r bg-card p-4 md:flex">
        <div className="mb-6 px-2 text-lg font-bold tracking-tight">Productivity</div>
        <nav className="flex flex-1 flex-col gap-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  isActive ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'
                )
              }
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-4 border-t pt-4 text-xs text-muted-foreground">{user?.email}</div>
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b bg-card px-4 py-3">
          <div className="text-sm font-semibold md:hidden">Productivity</div>
          <div className="ml-auto flex items-center gap-2">
            <InstallPrompt />
            <div className="relative">
              <Button variant="ghost" size="icon" onClick={toggleBell} aria-label="Notifications">
                <Bell className="h-4 w-4" />
                {unread > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] text-destructive-foreground">
                    {unread}
                  </span>
                )}
              </Button>
              {bellOpen && (
                <div className="absolute right-0 z-10 mt-2 w-72 rounded-md border bg-card p-2 shadow-lg">
                  <p className="px-2 py-1 text-xs font-semibold text-muted-foreground">Reminders</p>
                  {notifications.length === 0 ? (
                    <p className="px-2 py-2 text-sm text-muted-foreground">No notifications.</p>
                  ) : (
                    notifications.slice(0, 10).map((n) => (
                      <div key={`${n.id}-${n.at}`} className="rounded px-2 py-1.5 text-sm hover:bg-accent">
                        <div>{n.message}</div>
                        <div className="text-xs text-muted-foreground">{formatDate(n.remindAt, { withTime: true })}</div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
            <Button variant="ghost" size="icon" onClick={toggle} aria-label="Toggle theme">
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            <Button variant="ghost" size="sm" onClick={handleLogout}>
              <LogOut className="h-4 w-4" /> Logout
            </Button>
          </div>
        </header>

        {/* Mobile navigation: the sidebar is hidden < md, so expose a scrollable nav row. */}
        <nav className="flex gap-1 overflow-x-auto border-b bg-card px-2 py-2 md:hidden">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  'flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium',
                  isActive ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'
                )
              }
            >
              <item.icon className="h-3.5 w-3.5" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <main className="dashboard flex-1 p-4 md:p-6">
          <Outlet />
        </main>

        <footer className="border-t bg-card px-4 py-3 text-center text-xs text-muted-foreground">
          <BrandFooter />
        </footer>
      </div>
    </div>
  );
}
