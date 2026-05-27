import {
  LayoutGrid,
  ClipboardList,
  Package,
  Bike,
  Wrench,
  ShoppingCart,
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
  { label: 'Services', path: '/services', icon: ClipboardList, group: 'operations' },
  { label: 'Parts', path: '/parts', icon: Package, group: 'operations' },
  { label: 'Bikes', path: '/bikes', icon: Bike, group: 'operations' },
  { label: 'Service templates', path: '/services/templates', icon: Wrench, group: 'operations' },
  { label: 'Buy Parts', path: '/buy-parts', icon: ShoppingCart, group: 'operations' },
  { label: 'CSV import', path: '/import', icon: FileUp, group: 'system' },
  { label: 'Settings', path: '/settings', icon: Settings, group: 'system' },
];
