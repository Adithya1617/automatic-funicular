import { useMemo, useState } from 'react';
import type { MenuItem } from '@shared/schemas/menuItem';
import type { MenuItemAvailability } from '@shared/schemas/availability';
import { Badge } from '@renderer/components/ui/badge';
import { Input } from '@renderer/components/ui/input';
import { cn } from '@renderer/lib/cn';
import { formatINR } from '@shared/utils/currency';

type Props = {
  menuItems: MenuItem[];
  availability: Map<string, MenuItemAvailability>;
  cartQty: Map<string, number>;
  onAdd: (item: MenuItem) => void;
};

export function ManualOrderMenuPicker({ menuItems, availability, cartQty, onAdd }: Props) {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<string>('all');

  const categories = useMemo(() => {
    const seen = new Set<string>();
    for (const item of menuItems) seen.add(item.category);
    return [...seen].sort();
  }, [menuItems]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return menuItems.filter((item) => {
      if (!item.isActive) return false;
      if (category !== 'all' && item.category !== category) return false;
      if (q && !item.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [menuItems, search, category]);

  return (
    <div className="flex flex-col gap-3">
      <Input
        placeholder="Search dishes…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <div className="flex flex-wrap gap-1.5">
        {(['all', ...categories] as const).map((c) => (
          <button
            key={c}
            type="button"
            aria-pressed={category === c}
            onClick={() => setCategory(c)}
            className={cn(
              'inline-flex h-[26px] items-center rounded-full border px-2.5 text-[11px] font-medium transition-colors',
              category === c
                ? 'border-text-primary bg-text-primary text-background-primary'
                : 'border-border-tertiary bg-background-primary text-text-secondary hover:bg-background-tertiary',
            )}
          >
            {c === 'all' ? 'All' : c}
          </button>
        ))}
      </div>
      {filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border-tertiary bg-background-secondary px-4 py-10 text-center text-text-tertiary">
          {menuItems.length === 0
            ? 'No menu items yet — add some via the Menu page.'
            : 'No dishes match the filter.'}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {filtered.map((item) => (
            <MenuCard
              key={item.id}
              item={item}
              availability={availability.get(item.id) ?? null}
              cartQty={cartQty.get(item.id) ?? 0}
              onAdd={onAdd}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function MenuCard({
  item,
  availability,
  cartQty,
  onAdd,
}: {
  item: MenuItem;
  availability: MenuItemAvailability | null;
  cartQty: number;
  onAdd: (item: MenuItem) => void;
}) {
  const servings = availability?.maxServingsAvailable ?? null;
  const isOutOfStock = servings === 0;
  const remaining = servings == null ? null : Math.max(0, servings - cartQty);

  return (
    <button
      type="button"
      onClick={() => !isOutOfStock && onAdd(item)}
      disabled={isOutOfStock}
      className={cn(
        'relative flex flex-col items-start rounded-md border border-border-tertiary bg-background-primary p-3 text-left transition-colors',
        isOutOfStock
          ? 'opacity-55'
          : 'hover:border-text-info hover:bg-background-info/30',
      )}
    >
      {cartQty > 0 ? (
        <span className="absolute right-2 top-2 inline-flex h-[20px] min-w-[20px] items-center justify-center rounded-full bg-text-primary px-1.5 text-[11px] font-medium text-background-primary">
          {cartQty}
        </span>
      ) : null}
      <span className="text-[12px] font-medium text-text-primary">{item.name}</span>
      <span className="text-[10px] text-text-tertiary">{item.category}</span>
      <div className="mt-2 flex w-full items-center justify-between">
        <span className="text-[12px] tabular-nums text-text-primary">
          {formatINR(item.sellingPrice)}
        </span>
        {remaining == null ? (
          <Badge variant="neutral">—</Badge>
        ) : remaining === 0 ? (
          <Badge variant="danger">Out of stock</Badge>
        ) : remaining < 5 ? (
          <Badge variant="warning">{remaining} left</Badge>
        ) : (
          <Badge variant="success">{remaining} left</Badge>
        )}
      </div>
    </button>
  );
}
