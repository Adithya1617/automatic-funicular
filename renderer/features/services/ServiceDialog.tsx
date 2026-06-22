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
import { useIngredients } from '@renderer/hooks/ipc/useIngredients';
import { useCreateAdHocServiceEvent } from '@renderer/hooks/ipc/useServiceEvents';
import { StatusPicker } from '@renderer/features/maintenance/StatusPicker';
import { DEFAULT_SERVICE_OIL_ML } from '@shared/constants/system';
import type { SettableServiceEventStatus } from '@shared/schemas/serviceEvent';
import { formatBikeTypeLabel } from '@shared/utils/bikeType';
import { eventDateToMs, formatStock, todayDateInput } from '@renderer/lib/format';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pre-select this bike (used by the dashboard "service due" alert). */
  initialBikeId?: string;
};

/**
 * Scheduled service = oil change. Only the Engine oil part is offered, with an
 * editable ml quantity pre-filled to DEFAULT_SERVICE_OIL_ML. Submitting creates
 * a completed `kind='service'` event and deducts the oil in one transaction,
 * which also resets the bike's 45-day service countdown.
 */
export function ServiceDialog({ open, onOpenChange, initialBikeId }: Props) {
  const { data: bikes = [] } = useBikes({ includeInactive: false });
  const { data: bikeTypes = [] } = useBikeTypes();
  const { data: parts = [] } = useIngredients({ includeInactive: false });
  const create = useCreateAdHocServiceEvent();

  const [bikeId, setBikeId] = useState('');
  const [quantity, setQuantity] = useState(String(DEFAULT_SERVICE_OIL_ML));
  const [eventDate, setEventDate] = useState(todayDateInput());
  const [odometer, setOdometer] = useState('');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState<SettableServiceEventStatus>('requested');
  const [serverError, setServerError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setBikeId(initialBikeId ?? '');
      setQuantity(String(DEFAULT_SERVICE_OIL_ML));
      setEventDate(todayDateInput());
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

  // Engine oil is the only part used in a service. Prefer the exact "Engine oil"
  // part; fall back to the first Oil-category part if it was renamed.
  const engineOil = useMemo(() => {
    const byName = parts.find(
      (p) => p.name.trim().toLowerCase() === 'engine oil',
    );
    if (byName) return byName;
    return parts.find((p) => p.category === 'Oil') ?? null;
  }, [parts]);

  async function onSubmit() {
    setServerError(null);
    if (!bikeId) {
      setServerError('Pick a bike first');
      return;
    }
    if (!engineOil) {
      setServerError('No Engine oil part found — add one on the Parts page first');
      return;
    }
    const qty = Number.parseFloat(quantity);
    if (!Number.isFinite(qty) || qty <= 0) {
      setServerError('Enter the engine-oil quantity used (ml)');
      return;
    }
    const odo = odometer.trim() === '' ? null : Number.parseFloat(odometer);
    const odoFinal = odo != null && Number.isFinite(odo) && odo >= 0 ? odo : null;
    const trimmedNotes = notes.trim();
    try {
      await create.mutateAsync({
        bikeId,
        kind: 'service',
        status,
        occurredAt: eventDateToMs(eventDate),
        lines: [
          {
            ingredientId: engineOil.id,
            quantity: qty,
            unit: engineOil.baseUnit,
            notes: null,
          },
        ],
        odometerKm: odoFinal,
        notes: trimmedNotes === '' ? null : trimmedNotes,
      });
      onOpenChange(false);
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Could not record service');
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Request service (oil change)</DialogTitle>
          <DialogDescription>
            Pick a bike and confirm the engine-oil quantity used. Stock isn't
            deducted until you mark the service completed.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
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

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1">
              <Label htmlFor="svc-date">Date</Label>
              <Input
                id="svc-date"
                type="date"
                max={todayDateInput()}
                value={eventDate}
                onChange={(e) => setEventDate(e.target.value)}
              />
              <span className="text-[11px] text-text-tertiary">
                Pick a past date to log an old service.
              </span>
            </div>
            <div className="grid gap-1">
              <Label htmlFor="svc-odo">Odometer (km)</Label>
              <Input
                id="svc-odo"
                type="number"
                min={0}
                step="any"
                value={odometer}
                onChange={(e) => setOdometer(e.target.value)}
                placeholder="optional"
              />
            </div>
          </div>

          <div className="grid gap-1">
            <Label htmlFor="svc-oil">Engine oil (ml)</Label>
            <Input
              id="svc-oil"
              type="number"
              min={0}
              step="any"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              disabled={!engineOil}
            />
            <span className="text-[11px] text-text-tertiary">
              {engineOil
                ? `In stock: ${formatStock(engineOil.stockQuantity, engineOil.baseUnit)}`
                : 'No Engine oil part configured.'}
            </span>
          </div>

          <div className="grid gap-1">
            <Label>Status</Label>
            <StatusPicker value={status} onChange={setStatus} />
            <span className="text-[11px] text-text-tertiary">
              {status === 'completed'
                ? 'Deducts the oil now and restarts the 45-day countdown.'
                : 'Records the service without deducting oil yet — mark it completed later.'}
            </span>
          </div>

          <div className="grid gap-1">
            <Label htmlFor="svc-notes">Notes</Label>
            <Input
              id="svc-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="optional — e.g. customer name, service notes"
            />
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
              ? 'Complete service'
              : status === 'in_progress'
                ? 'Mark under service'
                : 'Request service'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
