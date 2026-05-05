import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { NAV_ITEMS } from './navItems';

export function AppShell() {
  const location = useLocation();
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
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col bg-background-primary">
        <TopBar title={active?.label ?? 'Laurans'} />
        <main className="min-h-0 flex-1 overflow-auto px-5 py-4">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
