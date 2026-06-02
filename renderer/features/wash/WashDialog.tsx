import { useEffect, useMemo, useState } from 'react';
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
import { Input } from '@renderer/components/ui/input';
import { Label } from '@renderer/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@renderer/components/ui/select';
import { useBikes, useBikeTypes } from '@renderer/hooks/ipc/useBikes';
import { useCreateAdHocServiceEvent } from '@renderer/hooks/ipc/useServiceEvents';
import { StatusPicker } from '@renderer/features/maintenance/StatusPicker';
import type { SettableServiceEventStatus } from '@shared/schemas/serviceEvent';
import { formatBikeTypeLabel } from '@shared/utils/bikeType';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pre-select this bike (used by the dashboard "wash due" alert). */
  initialBikeId?: string;
};

/**
 * Wash = a dated cleaning record. No parts, no stock movements. Submitting
 * creates a completed `kind='wash'` event and restarts the bike's 15-day wash
 * countdown.
 */
export function WashDialog({ open, onOpenChange, initialBikeId }: Props) {
  const { data: bikes = [] } = useBikes({ includeInactive: false });
  const { data: bikeTypes = [] } = useBikeTypes();
  const create = useCreateAdHocServiceEvent();

  const [bikeId, setBikeId] = useState('');
  const [odometer, setOdometer] = useState('');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState<SettableServiceEventStatus>('requested');
  const [serverError, setServerError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setBikeId(initialBikeId ?? '');
      setOdometer('');
      setNotes('');
      setStatus('requested');
      setServerError(null);
    }
  }, [open, initialBikeId]);

  const bikeTypeById = useMemo(
    () => new Map(bikeTypes.map((t) => [t.id, t])),
    [bikeTypes],
  );

  async function onSubmit() {
    setServerError(null);
    if (!bikeId) {
      setServerError('Pick a bike first');
      return;
    }
    const odo = odometer.trim() === '' ? null : Number.parseFloat(odometer);
    const odoFinal = odo != null && Number.isFinite(odo) && odo >= 0 ? odo : null;
    const trimmedNotes = notes.trim();
    try {
      await create.mutateAsync({
        bikeId,
        kind: 'wash',
        status,
        lines: [],
        odometerKm: odoFinal,
        notes: trimmedNotes === '' ? null : trimmedNotes,
      });
      onOpenChange(false);
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Could not record wash');
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Request wash</DialogTitle>
          <DialogDescription>
            Pick the bike to be washed. No parts are used. The 15-day countdown
            restarts when you mark the wash completed.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1">
              <Label>Bike</Label>
              <Select value={bikeId} onValueChange={setBikeId}>
                <SelectTrigger>
                  <SelectValue placeholder="Pick a bike…" />
                </SelectTrigger>
                <SelectContent>
                  {bikes.map((b) => {
                    const t = bikeTypeById.get(b.bikeTypeId);
                    return (
                      <SelectItem key={b.id} value={b.id}>
                        #{b.bikeNumber}
                        {t ? ` · ${formatBikeTypeLabel(t)}` : ''}
                        {b.licensePlate ? ` · ${b.licensePlate}` : ''}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1">
              <Label htmlFor="wash-odo">Odometer (km)</Label>
              <Input
                id="wash-odo"
                type="number"
                min={0}
                step="any"
                value={odometer}
                onChange={(e) => setOdometer(e.target.value)}
                placeholder="optional"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1">
              <Label>Status</Label>
              <StatusPicker value={status} onChange={setStatus} />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="wash-notes">Notes</Label>
              <Input
                id="wash-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="optional — e.g. exterior + chain clean"
              />
            </div>
          </div>
        </div>

        {serverError ? (
          <div className="rounded-md bg-background-danger px-2.5 py-1.5 text-[12px] text-text-danger">
            {serverError}
          </div>
        ) : null}

        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="ghost" size="md">
              Cancel
            </Button>
          </DialogClose>
          <Button
            type="button"
            variant="primary"
            size="md"
            onClick={onSubmit}
            disabled={create.isPending}
          >
            {status === 'completed'
              ? 'Complete wash'
              : status === 'in_progress'
                ? 'Mark under wash'
                : 'Request wash'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
