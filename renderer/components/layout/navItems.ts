import {
  LayoutGrid,
  ClipboardList,
  Package,
  Bike,
  Receipt,
  ClipboardCheck,
  FileUp,
  Settings,
  type LucideIcon,
} from 'lucide-react';

export type NavGroup = 'operations' | 'system';

export type NavItem = {
  label: string;
  path: string;
  icon: LucideIcon;
  group: NavGroup;
  badge?: number;
};

export const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', path: '/', icon: LayoutGrid, group: 'operations' },
  { label: 'Live orders', path: '/orders/live', icon: ClipboardList, group: 'operations' },
  { label: 'Parts', path: '/parts', icon: Package, group: 'operations' },
  { label: 'Bikes', path: '/bikes', icon: Bike, group: 'operations' },
  { label: 'Invoices', path: '/invoices', icon: Receipt, group: 'operations' },
  { label: 'Stock take', path: '/stock-take', icon: ClipboardCheck, group: 'operations' },
  { label: 'CSV import', path: '/import', icon: FileUp, group: 'system' },
  { label: 'Settings', path: '/settings', icon: Settings, group: 'system' },
];
