import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import type { OrderSource } from '@shared/constants/enums';
import type { OrderStatus } from '@shared/schemas/order';
import { Button } from '@renderer/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@renderer/components/ui/select';
import { useMenuItems } from '@renderer/hooks/ipc/useMenuItems';
import { useOrders } from '@renderer/hooks/ipc/useOrders';
import { OrderCard } from '@renderer/features/orders/OrderCard';
import { OrderFilterChips } from '@renderer/features/orders/OrderFilterChips';
import { SOURCE_LABEL } from '@renderer/features/orders/orderHelpers';

type StatusFilter = 'all' | OrderStatus;
type ChannelFilter = 'all' | OrderSource;

const CHANNEL_OPTIONS: ChannelFilter[] = [
  'all',
  'mock_online',
  'mock_offline',
  'manual_entry',
];

export function LiveOrdersPage() {
  const navigate = useNavigate();
  const { data: orders = [], isLoading } = useOrders();
  const { data: menuItems = [] } = useMenuItems({ includeInactive: true });

  const menuItemsById = useMemo(
    () => new Map(menuItems.map((m) => [m.id, m])),
    [menuItems],
  );

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [channelFilter, setChannelFilter] = useState<ChannelFilter>('all');

  const filtered = useMemo(() => {
    return orders.filter((o) => {
      if (statusFilter !== 'all' && o.status !== statusFilter) return false;
      if (channelFilter !== 'all' && o.source !== channelFilter) return false;
      return true;
    });
  }, [orders, statusFilter, channelFilter]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <Select value={channelFilter} onValueChange={(v) => setChannelFilter(v as ChannelFilter)}>
          <SelectTrigger className="w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All channels</SelectItem>
            {CHANNEL_OPTIONS.filter((c) => c !== 'all').map((c) => (
              <SelectItem key={c} value={c}>
                {SOURCE_LABEL[c as OrderSource]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant="primary"
          size="md"
          onClick={() => navigate('/orders/new')}
        >
          <Plus className="h-3.5 w-3.5" /> Fire test order
        </Button>
      </div>

      <OrderFilterChips
        value={statusFilter}
        onChange={setStatusFilter}
        orders={orders}
      />

      {isLoading ? (
        <div className="rounded-lg border border-border-tertiary bg-background-primary px-4 py-6 text-text-tertiary">
          Loading orders…
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border-tertiary bg-background-secondary px-4 py-10 text-center text-text-tertiary">
          No active orders. New orders will appear here automatically (polling every 30s).
          <div className="mt-2">
            <Button
              type="button"
              variant="primary"
              size="md"
              onClick={() => navigate('/orders/new')}
            >
              Fire a test order
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((order) => (
            <OrderCard key={order.id} order={order} menuItemsById={menuItemsById} />
          ))}
        </div>
      )}
    </div>
  );
}
