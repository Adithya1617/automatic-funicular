import { useState } from 'react';
import type { MenuItem } from '@shared/schemas/menuItem';
import type { Order, OrderLine } from '@shared/schemas/order';
import { Badge } from '@renderer/components/ui/badge';
import { Button } from '@renderer/components/ui/button';
import { formatINR } from '@shared/utils/currency';
import { formatRelativeTime } from '@renderer/lib/format';
import { useMarkDelivered, useMarkPreparing, useOrder } from '@renderer/hooks/ipc/useOrders';
import { CancelOrderDialog } from './CancelOrderDialog';
import {
  SOURCE_BADGE_VARIANT,
  SOURCE_LABEL,
  STATUS_DOT,
  STATUS_LABEL,
  STATUS_STRIPE,
} from './orderHelpers';

type Props = {
  order: Order;
  menuItemsById: Map<string, MenuItem>;
};

const NEW_PILL_DURATION_MS = 60_000;

function summarizeLines(lines: OrderLine[], menuItemsById: Map<string, MenuItem>): string {
  if (lines.length === 0) return '—';
  return lines
    .map((line) => {
      const menuItem = menuItemsById.get(line.menuItemId);
      return `${line.quantity}× ${menuItem?.name ?? '?'}`;
    })
    .join(', ');
}

export function OrderCard({ order, menuItemsById }: Props) {
  const { data: detail } = useOrder(order.id);
  const markPreparing = useMarkPreparing();
  const markDelivered = useMarkDelivered();
  const [cancelOpen, setCancelOpen] = useState(false);

  const lines = detail?.lines ?? [];
  const isNew =
    order.status === 'pending' && Date.now() - order.placedAt < NEW_PILL_DURATION_MS;

  const refLabel = order.externalOrderId
    ? `#${order.externalOrderId}`
    : `#${order.id.slice(0, 8)}`;

  return (
    <div className="grid grid-cols-[4px_1fr_auto] overflow-hidden rounded-lg border border-border-tertiary bg-background-primary">
      <div className={`${STATUS_STRIPE[order.status]}`} />
      <div className="flex flex-col gap-1.5 px-4 py-3">
        <div className="flex items-center gap-2">
          <Badge variant={SOURCE_BADGE_VARIANT[order.source]}>
            {SOURCE_LABEL[order.source]}
          </Badge>
          <span className="font-mono text-[11px] text-text-secondary">{refLabel}</span>
          {isNew ? (
            <Badge variant="info" className="uppercase">NEW</Badge>
          ) : null}
          <span className="ml-auto text-[10px] text-text-tertiary">
            {formatRelativeTime(order.placedAt)}
          </span>
        </div>
        <div className="text-[12px] text-text-primary">
          {summarizeLines(lines, menuItemsById)}
        </div>
        <div className="flex items-center gap-2 text-[11px] text-text-secondary">
          <span className={`inline-block h-2 w-2 rounded-full ${STATUS_DOT[order.status]}`} />
          <span className="font-medium">{STATUS_LABEL[order.status]}</span>
          <span className="text-text-tertiary">·</span>
          <span className="tabular-nums">{formatINR(order.totalAmount)}</span>
          {order.status === 'delivered' ? (
            <>
              <span className="text-text-tertiary">·</span>
              <span className="text-text-tertiary">Stock deducted</span>
            </>
          ) : null}
          {order.status === 'cancelled' && order.cancelledPrepared !== null ? (
            <>
              <span className="text-text-tertiary">·</span>
              <span className="text-text-tertiary">
                {order.cancelledPrepared ? 'wastage booked' : 'sale reversed'}
              </span>
            </>
          ) : null}
        </div>
      </div>
      <div className="flex flex-col items-stretch justify-center gap-1 border-l border-border-tertiary bg-background-secondary px-3 py-3">
        {order.status === 'pending' ? (
          <Button
            type="button"
            variant="secondary"
            size="md"
            onClick={() => markPreparing.mutate(order.id)}
            disabled={markPreparing.isPending}
          >
            Start preparing
          </Button>
        ) : null}
        {order.status === 'pending' || order.status === 'preparing' ? (
          <>
            <Button
              type="button"
              variant="success"
              size="md"
              onClick={() => markDelivered.mutate(order.id)}
              disabled={markDelivered.isPending}
            >
              Mark delivered
            </Button>
            <Button
              type="button"
              variant="danger"
              size="md"
              onClick={() => setCancelOpen(true)}
            >
              Cancel
            </Button>
          </>
        ) : (
          <Button
            type="button"
            variant="danger"
            size="md"
            onClick={() => setCancelOpen(true)}
            disabled={order.status === 'cancelled'}
          >
            {order.status === 'delivered' ? 'Cancel + refund' : 'Cancelled'}
          </Button>
        )}
      </div>

      <CancelOrderDialog
        order={detail ?? null}
        open={cancelOpen}
        onOpenChange={setCancelOpen}
      />
    </div>
  );
}
