import { Minus, Plus } from 'lucide-react';
import type { MenuItem } from '@shared/schemas/menuItem';
import type { ManualSubmitChannel } from '@shared/schemas/ordering';
import { Button } from '@renderer/components/ui/button';
import { Input } from '@renderer/components/ui/input';
import { Label } from '@renderer/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@renderer/components/ui/select';
import { formatINR } from '@shared/utils/currency';

export type CartLine = {
  menuItemId: string;
  quantity: number;
};

type Props = {
  channel: ManualSubmitChannel;
  onChannelChange: (next: ManualSubmitChannel) => void;
  externalRef: string;
  onExternalRefChange: (next: string) => void;
  cart: CartLine[];
  menuItemsById: Map<string, MenuItem>;
  onIncrement: (menuItemId: string) => void;
  onDecrement: (menuItemId: string) => void;
  onSubmit: () => void;
  isSubmitting: boolean;
  serverError: string | null;
};

const CHANNEL_OPTIONS: Array<{ key: ManualSubmitChannel; label: string }> = [
  { key: 'manual_entry', label: 'Manual entry' },
  { key: 'mock_online', label: 'Mock online (Swiggy)' },
  { key: 'mock_offline', label: 'Mock offline POS' },
];

export function ManualOrderSummary({
  channel,
  onChannelChange,
  externalRef,
  onExternalRefChange,
  cart,
  menuItemsById,
  onIncrement,
  onDecrement,
  onSubmit,
  isSubmitting,
  serverError,
}: Props) {
  const subtotal = cart.reduce((acc, line) => {
    const item = menuItemsById.get(line.menuItemId);
    return acc + (item?.sellingPrice ?? 0) * line.quantity;
  }, 0);
  const totalItems = cart.reduce((acc, l) => acc + l.quantity, 0);
  const empty = cart.length === 0;

  return (
    <aside className="flex flex-col gap-3 rounded-lg border border-border-tertiary bg-background-secondary p-3">
      <div className="text-[12px] font-medium text-text-primary">Order summary</div>

      <div className="grid gap-1">
        <Label>Channel</Label>
        <Select
          value={channel}
          onValueChange={(v) => onChannelChange(v as ManualSubmitChannel)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CHANNEL_OPTIONS.map((opt) => (
              <SelectItem key={opt.key} value={opt.key}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-1">
        <Label htmlFor="ext-ref">External reference</Label>
        <Input
          id="ext-ref"
          placeholder="Table number, receipt #…"
          value={externalRef}
          onChange={(e) => onExternalRefChange(e.target.value)}
          maxLength={120}
        />
      </div>

      <div className="h-px w-full bg-border-tertiary" />

      <div className="flex flex-col gap-1.5">
        {empty ? (
          <div className="rounded-md border border-dashed border-border-tertiary bg-background-primary px-3 py-4 text-center text-[11px] text-text-tertiary">
            Add a dish to begin.
          </div>
        ) : (
          cart.map((line) => {
            const item = menuItemsById.get(line.menuItemId);
            return (
              <div
                key={line.menuItemId}
                className="flex items-center justify-between gap-2 rounded-md bg-background-primary px-2.5 py-1.5"
              >
                <div className="flex flex-col">
                  <span className="text-[12px] font-medium text-text-primary">
                    {item?.name ?? '?'}
                  </span>
                  <span className="text-[10px] text-text-tertiary">
                    {line.quantity} × {formatINR(item?.sellingPrice ?? 0)}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label="Decrement"
                    onClick={() => onDecrement(line.menuItemId)}
                  >
                    <Minus className="h-3 w-3" />
                  </Button>
                  <span className="min-w-[20px] text-center text-[12px] font-medium tabular-nums">
                    {line.quantity}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label="Increment"
                    onClick={() => onIncrement(line.menuItemId)}
                  >
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="rounded-md border border-border-tertiary bg-background-primary px-2.5 py-2">
        <div className="flex items-center justify-between text-[11px] text-text-secondary">
          <span>Subtotal</span>
          <span className="tabular-nums">{formatINR(subtotal)}</span>
        </div>
        <div className="text-[10px] text-text-tertiary">
          {empty
            ? 'Add a dish to begin'
            : `${cart.length} ${cart.length === 1 ? 'dish' : 'dishes'} · ${totalItems} ${totalItems === 1 ? 'item' : 'items'}`}
        </div>
        <div className="mt-2 flex items-center justify-between border-t border-border-tertiary pt-2 text-[13px] font-medium">
          <span>Total</span>
          <span className="tabular-nums">{formatINR(subtotal)}</span>
        </div>
      </div>

      {serverError ? (
        <div className="rounded-md bg-background-danger px-2.5 py-1.5 text-[11px] text-text-danger">
          {serverError}
        </div>
      ) : null}

      <Button
        type="button"
        variant="primary"
        size="lg"
        onClick={onSubmit}
        disabled={empty || isSubmitting}
      >
        {channel === 'manual_entry'
          ? 'Submit order'
          : 'Submit (queue for adapter)'}
      </Button>
    </aside>
  );
}
