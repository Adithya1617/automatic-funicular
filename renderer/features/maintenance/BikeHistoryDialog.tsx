import { useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@renderer/components/ui/dialog';
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
import { useServiceEventHistory } from '@renderer/hooks/ipc/useServiceEvents';
import { formatBikeTypeLabel } from '@shared/utils/bikeType';
import { formatINR } from '@shared/utils/currency';
import { formatDateTimeLong } from '@renderer/lib/format';
import { serviceOilLines } from '@renderer/lib/parts';
import { ServiceStatusBadge } from '@renderer/features/maintenance/ServiceStatusBadge';
import type { ServiceEventKind } from '@shared/schemas/serviceEvent';

const KIND_TITLES: Record<ServiceEventKind, string> = {
  service: 'Service history',
  repair: 'Repair history',
  wash: 'Wash history',
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: ServiceEventKind;
  /** Optional initial bike to show history for. */
  initialBikeId?: string;
};

/**
 * Per-bike history for one section. Pick a bike from the dropdown to see every
 * past event of this kind with its full detail — date/time, parts used (with
 * quantities), odometer, and notes.
 */
export function BikeHistoryDialog({ open, onOpenChange, kind, initialBikeId }: Props) {
  const { data: bikes = [] } = useBikes({ includeInactive: true });
  const { data: bikeTypes = [] } = useBikeTypes();
  const { data: parts = [] } = useIngredients({ includeInactive: true });

  const [bikeId, setBikeId] = useState('');
  const { data: events = [], isLoading } = useServiceEventHistory(bikeId || null, kind);

  useEffect(() => {
    if (open) setBikeId(initialBikeId ?? '');
  }, [open, initialBikeId]);

  const bikeTypeById = useMemo(
    () => new Map(bikeTypes.map((t) => [t.id, t])),
    [bikeTypes],
  );
  const partById = useMemo(() => new Map(parts.map((p) => [p.id, p])), [parts]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[640px]">
        <DialogHeader>
          <DialogTitle>{KIND_TITLES[kind]}</DialogTitle>
          <DialogDescription>
            Pick a bike to see its full {kind} history — date, parts used, and notes.
          </DialogDescription>
        </DialogHeader>

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

        <div className="max-h-[420px] overflow-y-auto">
          {!bikeId ? (
            <p className="py-6 text-center text-[12px] text-text-tertiary">
              Select a bike above to view its history.
            </p>
          ) : isLoading ? (
            <p className="py-6 text-center text-[12px] text-text-tertiary">Loading…</p>
          ) : events.length === 0 ? (
            <p className="py-6 text-center text-[12px] text-text-tertiary">
              No {kind} records for this bike yet.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {events.map((e) => {
                // A service is an oil change — show only its oil line(s)/cost,
                // ignoring any non-oil parts that legacy events may carry.
                const displayLines =
                  kind === 'service' ? serviceOilLines(e.lines, partById) : e.lines;
                const displayCost = displayLines.reduce((acc, l) => acc + l.cost, 0);
                return (
                  <li
                    key={e.id}
                    className="rounded-lg border border-border-tertiary bg-background-primary p-3"
                  >
                    <div className="mb-1.5 flex items-center justify-between gap-2">
                      <span className="text-[12px] font-medium text-text-primary">
                        {formatDateTimeLong(e.completedAt ?? e.startedAt)}
                      </span>
                      <div className="flex items-center gap-2">
                        {e.odometerKm != null ? (
                          <span className="text-[11px] tabular-nums text-text-tertiary">
                            {e.odometerKm.toLocaleString('en-IN')} km
                          </span>
                        ) : null}
                        {kind === 'wash' ? null : (
                          <span className="text-[12px] font-semibold tabular-nums text-text-primary">
                            {e.status === 'completed' ? formatINR(displayCost) : '—'}
                          </span>
                        )}
                        <ServiceStatusBadge status={e.status} />
                      </div>
                    </div>

                    {kind === 'wash' ? null : (
                      <div className="mb-1">
                        <span className="text-[10px] uppercase tracking-wider text-text-tertiary">
                          Parts used
                        </span>
                        {displayLines.length === 0 ? (
                          <div className="text-[12px] text-text-tertiary">No parts recorded.</div>
                        ) : (
                          <ul className="mt-0.5 flex flex-col gap-0.5">
                            {displayLines.map((l) => (
                              <li
                                key={l.id}
                                className="flex items-center justify-between gap-2 text-[12px]"
                              >
                                <span className="text-text-secondary">
                                  {partById.get(l.ingredientId)?.name ?? '(unknown part)'}
                                </span>
                                <span className="flex items-center gap-2 tabular-nums">
                                  <span className="text-text-secondary">
                                    {l.quantity.toLocaleString('en-IN')} {l.unit}
                                  </span>
                                  <span className="w-[64px] text-right text-text-primary">
                                    {formatINR(l.cost)}
                                  </span>
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}

                    {e.notes ? (
                      <div className="mt-1.5 rounded-md bg-background-secondary px-2 py-1 text-[12px] text-text-secondary">
                        {e.notes}
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
