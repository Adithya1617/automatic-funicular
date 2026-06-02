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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@renderer/components/ui/table';
import { useBikes, useBikeTypes } from '@renderer/hooks/ipc/useBikes';
import { useIngredients } from '@renderer/hooks/ipc/useIngredients';
import { useCreateAdHocServiceEvent } from '@renderer/hooks/ipc/useServiceEvents';
import { StatusPicker } from '@renderer/features/maintenance/StatusPicker';
import type { SettableServiceEventStatus } from '@shared/schemas/serviceEvent';
import { formatBikeTypeLabel } from '@shared/utils/bikeType';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pre-select this bike (used by quick-actions elsewhere). */
  initialBikeId?: string;
};

type PartSelection = {
  /** Empty string until user types a quantity; positive number means ticked. */
  quantity: string;
  /** True if the operator ticked this part for this repair. */
  checked: boolean;
};

/**
 * Ad-hoc repair = tick whichever parts the fix consumed and enter quantities.
 * Submitting creates a completed `kind='repair'` event and deducts every ticked
 * part's stock in one transaction; if any part is short the whole thing rolls
 * back.
 */
export function RepairDialog({ open, onOpenChange, initialBikeId }: Props) {
  const { data: bikes = [] } = useBikes({ includeInactive: false });
  const { data: bikeTypes = [] } = useBikeTypes();
  const { data: parts = [] } = useIngredients({ includeInactive: false });
  const create = useCreateAdHocServiceEvent();

  const [bikeId, setBikeId] = useState('');
  const [selections, setSelections] = useState<Record<string, PartSelection>>({});
  const [odometer, setOdometer] = useState('');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState<SettableServiceEventStatus>('requested');
  const [serverError, setServerError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setBikeId(initialBikeId ?? '');
      setSelections({});
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

  const checkedCount = Object.values(selections).filter((s) => s.checked).length;

  function togglePart(id: string, checked: boolean) {
    setSelections((prev) => ({
      ...prev,
      [id]: { quantity: prev[id]?.quantity ?? '', checked },
    }));
  }

  function setQuantity(id: string, quantity: string) {
    setSelections((prev) => ({
      ...prev,
      [id]: { quantity, checked: true },
    }));
  }

  async function onSubmit() {
    setServerError(null);
    if (!bikeId) {
      setServerError('Pick a bike first');
      return;
    }
    const lines: Array<{
      ingredientId: string;
      quantity: number;
      unit: string;
      notes: string | null;
    }> = [];
    for (const part of parts) {
      const sel = selections[part.id];
      if (!sel || !sel.checked) continue;
      const qty = Number.parseFloat(sel.quantity);
      if (!Number.isFinite(qty) || qty <= 0) {
        setServerError(`Enter a positive quantity for "${part.name}" (or untick it)`);
        return;
      }
      lines.push({
        ingredientId: part.id,
        quantity: qty,
        unit: part.baseUnit,
        notes: null,
      });
    }
    if (lines.length === 0) {
      setServerError('Tick at least one part the repair used');
      return;
    }
    const odo = odometer.trim() === '' ? null : Number.parseFloat(odometer);
    const odoFinal = odo != null && Number.isFinite(odo) && odo >= 0 ? odo : null;
    const trimmedNotes = notes.trim();
    try {
      await create.mutateAsync({
        bikeId,
        kind: 'repair',
        status,
        lines,
        odometerKm: odoFinal,
        notes: trimmedNotes === '' ? null : trimmedNotes,
      });
      onOpenChange(false);
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Could not record repair');
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[820px]">
        <DialogHeader>
          <DialogTitle>Request repair</DialogTitle>
          <DialogDescription>
            Pick a bike, tick the parts the repair will use, and enter
            quantities. Stock isn't deducted until you mark the repair
            completed.
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
              <Label htmlFor="rep-odo">Odometer (km)</Label>
              <Input
                id="rep-odo"
                type="number"
                min={0}
                step="any"
                value={odometer}
                onChange={(e) => setOdometer(e.target.value)}
                placeholder="optional"
              />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <Label>Parts used</Label>
            <span className="text-[11px] text-text-tertiary">{checkedCount} ticked</span>
          </div>
          <div className="max-h-[320px] overflow-y-auto rounded-lg border border-border-tertiary">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[42px]" />
                  <TableHead>Part</TableHead>
                  <TableHead className="w-[120px]">Stock</TableHead>
                  <TableHead className="w-[140px]">Quantity used</TableHead>
                  <TableHead className="w-[60px]">Unit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {parts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-text-tertiary">
                      No parts yet — add some via the Parts page or CSV import.
                    </TableCell>
                  </TableRow>
                ) : (
                  parts.map((p) => {
                    const sel = selections[p.id];
                    const checked = sel?.checked ?? false;
                    return (
                      <TableRow
                        key={p.id}
                        className={checked ? 'bg-background-secondary' : undefined}
                      >
                        <TableCell>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => togglePart(p.id, e.target.checked)}
                            className="h-3.5 w-3.5 cursor-pointer"
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="font-medium text-text-primary">{p.name}</span>
                            <span className="text-[10px] text-text-tertiary">
                              {p.category}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="tabular-nums text-text-secondary">
                            {p.stockQuantity.toLocaleString('en-IN')} {p.baseUnit}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min={0}
                            step="any"
                            value={sel?.quantity ?? ''}
                            onChange={(e) => setQuantity(p.id, e.target.value)}
                            disabled={!checked}
                            placeholder={checked ? 'required' : ''}
                          />
                        </TableCell>
                        <TableCell>
                          <span className="text-text-tertiary">{p.baseUnit}</span>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1">
              <Label>Status</Label>
              <StatusPicker value={status} onChange={setStatus} />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="rep-notes">Notes</Label>
              <Input
                id="rep-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="optional — e.g. what was repaired"
              />
            </div>
          </div>
          {status !== 'completed' ? (
            <span className="text-[11px] text-text-tertiary">
              Parts are recorded but not deducted until you mark the repair completed.
            </span>
          ) : null}
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
              ? 'Complete repair'
              : status === 'in_progress'
                ? 'Mark under service'
                : 'Request repair'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
