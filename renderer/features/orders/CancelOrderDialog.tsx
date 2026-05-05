import { useEffect, useState } from 'react';
import type { OrderWithLines } from '@shared/schemas/order';
import { Button } from '@renderer/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@renderer/components/ui/dialog';
import { useCancelOrder } from '@renderer/hooks/ipc/useOrders';

type Props = {
  order: OrderWithLines | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function CancelOrderDialog({ order, open, onOpenChange }: Props) {
  const cancel = useCancelOrder();
  const [serverError, setServerError] = useState<string | null>(null);

  useEffect(() => {
    if (open) setServerError(null);
  }, [open]);

  if (!order) return null;

  const isDelivered = order.status === 'delivered';
  const inFlight = cancel.isPending;

  async function submit(alreadyPrepared: boolean | undefined) {
    if (!order) return;
    setServerError(null);
    try {
      await cancel.mutateAsync({
        id: order.id,
        ...(alreadyPrepared !== undefined ? { alreadyPrepared } : {}),
      });
      onOpenChange(false);
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Could not cancel order');
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancel order</DialogTitle>
          <DialogDescription>
            {isDelivered
              ? 'This order is already delivered. Was the dish prepared in the kitchen?'
              : 'Cancel this order? No stock movements will be written.'}
          </DialogDescription>
        </DialogHeader>

        {isDelivered ? (
          <div className="grid gap-2">
            <p className="text-[12px] text-text-secondary">
              <strong>Yes</strong> — book the recipe ingredients as wastage. Stock will appear over-deducted until your next stock take.
            </p>
            <p className="text-[12px] text-text-secondary">
              <strong>No</strong> — write reversal movements that restore stock to before delivery.
            </p>
          </div>
        ) : null}

        {serverError ? (
          <div className="rounded-md bg-background-danger px-2.5 py-1.5 text-[12px] text-text-danger">
            {serverError}
          </div>
        ) : null}

        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="ghost" size="md">Keep order</Button>
          </DialogClose>
          {isDelivered ? (
            <>
              <Button
                type="button"
                variant="secondary"
                size="md"
                onClick={() => submit(false)}
                disabled={inFlight}
              >
                No, not prepared
              </Button>
              <Button
                type="button"
                variant="danger"
                size="md"
                onClick={() => submit(true)}
                disabled={inFlight}
              >
                Yes, prepared
              </Button>
            </>
          ) : (
            <Button
              type="button"
              variant="danger"
              size="md"
              onClick={() => submit(undefined)}
              disabled={inFlight}
            >
              Cancel order
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
