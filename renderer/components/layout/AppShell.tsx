import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { NAV_ITEMS } from './navItems';
import { UserMenu } from '../../features/auth/UserMenu';

export function AppShell() {
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Close the mobile nav drawer whenever the route changes.
  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  // /orders/* and /invoices/* all live under their parent nav entry.
  let normalizedPath = location.pathname;
  if (normalizedPath.startsWith('/orders/')) normalizedPath = '/orders/live';
  else if (normalizedPath.startsWith('/invoices/')) normalizedPath = '/invoices';
  const active =
    NAV_ITEMS.find(
      (item) =>
        item.path === '/'
          ? normalizedPath === '/'
          : normalizedPath.startsWith(item.path),
    ) ?? NAV_ITEMS[0];

  return (
    <div className="flex h-full bg-background-secondary">
      {/* Static sidebar on tablet/desktop. */}
      <Sidebar className="hidden md:flex" />

      {/* Slide-over drawer on mobile. */}
      {drawerOpen ? (
        <div className="fixed inset-0 z-40 flex md:hidden">
          <button
            type="button"
            aria-label="Close menu"
            className="absolute inset-0 bg-black/40"
            onClick={() => setDrawerOpen(false)}
          />
          <Sidebar className="relative z-50 h-full shadow-xl" onNavigate={() => setDrawerOpen(false)} />
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col bg-background-primary">
        <TopBar
          title={active?.label ?? 'Hyprride'}
          rightSlot={<UserMenu />}
          onMenuClick={() => setDrawerOpen(true)}
        />
        <main className="min-h-0 flex-1 overflow-auto px-3 py-4 md:px-5">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
