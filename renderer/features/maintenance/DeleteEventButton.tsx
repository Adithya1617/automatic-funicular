import { useState } from 'react';
import { Trash2 } from 'lucide-react';
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
import { useDeleteServiceEvent } from '@renderer/hooks/ipc/useServiceEvents';
import type { ServiceEventKind } from '@shared/schemas/serviceEvent';

const KIND_NOUN: Record<ServiceEventKind, string> = {
  service: 'service',
  repair: 'repair',
  wash: 'wash',
};

type Props = {
  eventId: string;
  kind: ServiceEventKind;
  /** True when the event is completed — deleting it restores parts to stock. */
  completed: boolean;
  /** Called after a successful delete (e.g. navigate away from the editor). */
  onDeleted?: () => void;
  /** Render as a labelled button instead of an icon-only one. */
  label?: string;
};

/**
 * Trash action + confirm dialog for removing a service / repair / wash. For a
 * completed event the confirm copy tells the operator the parts go back to
 * stock (the service writes service_reversal movements). Stops row-click
 * propagation so it's safe to drop into a clickable table row.
 */
export function DeleteEventButton({ eventId, kind, completed, onDeleted, label }: Props) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const del = useDeleteServiceEvent();
  const noun = KIND_NOUN[kind];

  async function onConfirm() {
    setError(null);
    try {
      await del.mutateAsync({ id: eventId });
      setOpen(false);
      onDeleted?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Could not delete ${noun}`);
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size={label ? 'md' : 'sm'}
        className="text-text-danger"
        onClick={(e) => {
          e.stopPropagation();
          setError(null);
          setOpen(true);
        }}
        title={`Delete ${noun}`}
      >
        <Trash2 className="h-3.5 w-3.5" />
        {label ? <span className="ml-1">{label}</span> : null}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent onClick={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle>Delete this {noun}?</DialogTitle>
            <DialogDescription>
              {completed
                ? `The parts used will be added back to inventory. This can't be undone.`
                : `This record will be removed. This can't be undone.`}
            </DialogDescription>
          </DialogHeader>

          {error ? (
            <div className="rounded-md bg-background-danger px-2.5 py-1.5 text-[12px] text-text-danger">
              {error}
            </div>
          ) : null}

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="ghost" size="md">
                Keep it
              </Button>
            </DialogClose>
            <Button
              type="button"
              variant="primary"
              size="md"
              className="bg-text-danger hover:bg-text-danger/90"
              onClick={onConfirm}
              disabled={del.isPending}
            >
              Delete {noun}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
