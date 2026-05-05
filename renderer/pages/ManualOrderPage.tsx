import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import type { MenuItem } from '@shared/schemas/menuItem';
import type { ManualSubmitChannel } from '@shared/schemas/ordering';
import { useAvailability } from '@renderer/hooks/ipc/useAvailability';
import { useMenuItems } from '@renderer/hooks/ipc/useMenuItems';
import { useSubmitManualOrder } from '@renderer/hooks/ipc/useOrders';
import {
  ManualOrderMenuPicker,
} from '@renderer/features/orders/ManualOrderMenuPicker';
import {
  ManualOrderSummary,
  type CartLine,
} from '@renderer/features/orders/ManualOrderSummary';

export function ManualOrderPage() {
  const navigate = useNavigate();
  const { data: menuItems = [] } = useMenuItems({ includeInactive: false });
  const { data: availabilityList = [] } = useAvailability();
  const submit = useSubmitManualOrder();

  const menuItemsById = useMemo(
    () => new Map(menuItems.map((m) => [m.id, m])),
    [menuItems],
  );
  const availability = useMemo(
    () => new Map(availabilityList.map((a) => [a.menuItemId, a])),
    [availabilityList],
  );

  const [channel, setChannel] = useState<ManualSubmitChannel>('manual_entry');
  const [externalRef, setExternalRef] = useState('');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [serverError, setServerError] = useState<string | null>(null);

  const cartQty = useMemo(
    () => new Map(cart.map((l) => [l.menuItemId, l.quantity])),
    [cart],
  );

  function add(item: MenuItem) {
    setCart((prev) => {
      const existing = prev.find((l) => l.menuItemId === item.id);
      if (existing) {
        return prev.map((l) =>
          l.menuItemId === item.id ? { ...l, quantity: l.quantity + 1 } : l,
        );
      }
      return [...prev, { menuItemId: item.id, quantity: 1 }];
    });
  }

  function decrement(menuItemId: string) {
    setCart((prev) =>
      prev
        .map((l) =>
          l.menuItemId === menuItemId ? { ...l, quantity: l.quantity - 1 } : l,
        )
        .filter((l) => l.quantity > 0),
    );
  }

  async function handleSubmit() {
    setServerError(null);
    const lines = cart.map((line) => {
      const item = menuItemsById.get(line.menuItemId);
      return {
        menuItemId: line.menuItemId,
        quantity: line.quantity,
        unitPrice: item?.sellingPrice ?? 0,
      };
    });
    try {
      await submit.mutateAsync({
        channel,
        externalRef: externalRef.trim() || null,
        notes: null,
        lines,
      });
      navigate('/orders/live');
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Could not submit order');
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-[12px] text-text-secondary">
          <Link to="/orders/live" className="inline-flex items-center gap-1 hover:text-text-primary">
            <ArrowLeft className="h-3 w-3" /> Live orders
          </Link>
          <span className="text-text-tertiary">/</span>
          <span className="text-text-primary">New order</span>
        </div>
        <span className="text-[11px] text-text-tertiary">{menuItems.length} menu items</span>
      </div>

      <div className="grid grid-cols-[1fr_280px] gap-4">
        <ManualOrderMenuPicker
          menuItems={menuItems}
          availability={availability}
          cartQty={cartQty}
          onAdd={add}
        />
        <ManualOrderSummary
          channel={channel}
          onChannelChange={setChannel}
          externalRef={externalRef}
          onExternalRefChange={setExternalRef}
          cart={cart}
          menuItemsById={menuItemsById}
          onIncrement={(id) => {
            const item = menuItemsById.get(id);
            if (item) add(item);
          }}
          onDecrement={decrement}
          onSubmit={handleSubmit}
          isSubmitting={submit.isPending}
          serverError={serverError}
        />
      </div>
    </div>
  );
}
