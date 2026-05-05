import type { Order, OrderStatus } from '@shared/schemas/order';
import { cn } from '@renderer/lib/cn';

type Filter = 'all' | OrderStatus;

const FILTERS: Array<{ key: Filter; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'preparing', label: 'Preparing' },
  { key: 'delivered', label: 'Delivered' },
  { key: 'cancelled', label: 'Cancelled' },
];

type Props = {
  value: Filter;
  onChange: (next: Filter) => void;
  orders: Order[];
};

export function OrderFilterChips({ value, onChange, orders }: Props) {
  const counts = orders.reduce(
    (acc, o) => {
      acc[o.status] = (acc[o.status] ?? 0) + 1;
      return acc;
    },
    { pending: 0, preparing: 0, delivered: 0, cancelled: 0 } as Record<OrderStatus, number>,
  );

  return (
    <div className="flex items-center gap-2">
      {FILTERS.map((f, idx) => {
        const count = f.key === 'all' ? orders.length : counts[f.key];
        const active = value === f.key;
        return (
          <button
            key={f.key}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(f.key)}
            className={cn(
              'inline-flex h-[28px] items-center gap-1.5 rounded-full border px-3 text-[11px] font-medium transition-colors',
              active
                ? 'border-text-primary bg-text-primary text-background-primary'
                : 'border-border-tertiary bg-background-primary text-text-secondary hover:bg-background-tertiary',
              idx === FILTERS.length - 1 && 'ml-auto',
            )}
          >
            <span>{f.label}</span>
            <span
              className={cn(
                'inline-flex h-[16px] min-w-[16px] items-center justify-center rounded-full px-1 text-[10px]',
                active
                  ? 'bg-background-primary/20 text-background-primary'
                  : 'bg-background-tertiary text-text-tertiary',
              )}
            >
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
