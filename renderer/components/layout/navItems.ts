import {
  LayoutGrid,
  ClipboardList,
  Wrench,
  Droplet,
  Package,
  Bike,
  ShoppingCart,
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
  { label: 'Repairs', path: '/repairs', icon: Wrench, group: 'operations' },
  { label: 'Wash', path: '/wash', icon: Droplet, group: 'operations' },
  { label: 'Parts', path: '/parts', icon: Package, group: 'operations' },
  { label: 'Bikes', path: '/bikes', icon: Bike, group: 'operations' },
  { label: 'Buy Parts', path: '/buy-parts', icon: ShoppingCart, group: 'operations' },
  { label: 'Settings', path: '/settings', icon: Settings, group: 'system' },
];
