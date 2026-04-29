import { NavLink } from 'react-router-dom';
import { cn } from '@renderer/lib/cn';
import { NAV_ITEMS, type NavItem } from './navItems';

const groupOrder: Array<{ key: 'operations' | 'system'; label: string }> = [
  { key: 'operations', label: 'Operations' },
  { key: 'system', label: 'System' },
];

export function Sidebar() {
  return (
    <aside className="flex w-[138px] shrink-0 flex-col gap-0.5 border-r border-border-tertiary bg-background-secondary px-2.5 py-3.5">
      <div className="flex items-center gap-2 px-1.5 pb-3.5 pt-1">
        <div className="flex h-[22px] w-[22px] items-center justify-center rounded-[6px] bg-text-primary text-[12px] font-medium text-background-primary">
          L
        </div>
        <span className="text-[13px] font-medium text-text-primary">Laurans</span>
      </div>

      {groupOrder.map((group) => (
        <div key={group.key} className="flex flex-col gap-0.5">
          <div className="px-1.5 pb-1 pt-2.5 text-[10px] uppercase tracking-wider text-text-tertiary">
            {group.label}
          </div>
          {NAV_ITEMS.filter((item) => item.group === group.key).map((item) => (
            <SidebarLink key={item.path} item={item} />
          ))}
        </div>
      ))}
    </aside>
  );
}

function SidebarLink({ item }: { item: NavItem }) {
  const Icon = item.icon;
  const isIndex = item.path === '/';

  return (
    <NavLink
      to={item.path}
      end={isIndex}
      className={({ isActive }) =>
        cn(
          'flex min-h-[32px] items-center gap-2 rounded-[6px] px-2 py-1.5 text-[12px] text-text-secondary transition-colors',
          'hover:bg-background-tertiary',
          isActive &&
            'border border-border-tertiary bg-background-primary font-medium text-text-primary hover:bg-background-primary',
        )
      }
    >
      <Icon className="h-[13px] w-[13px] shrink-0" strokeWidth={1.5} />
      <span className="truncate">{item.label}</span>
      {typeof item.badge === 'number' && item.badge > 0 ? (
        <span className="ml-auto rounded-[8px] bg-background-danger px-1.5 py-px text-[10px] font-medium text-text-danger">
          {item.badge}
        </span>
      ) : null}
    </NavLink>
  );
}
