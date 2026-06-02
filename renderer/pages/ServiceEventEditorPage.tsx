import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Trash2 } from 'lucide-react';
import type { ServiceEventLine, ServiceEventLineInput } from '@shared/schemas/serviceEvent';
import type { Ingredient } from '@shared/schemas/ingredient';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@renderer/components/ui/table';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@renderer/components/ui/dialog';
import { useBikes } from '@renderer/hooks/ipc/useBikes';
import { useIngredients } from '@renderer/hooks/ipc/useIngredients';
import { useServiceTemplate } from '@renderer/hooks/ipc/useServiceTemplates';
import {
  useCancelServiceEvent,
  useCompleteServiceEvent,
  useServiceEvent,
  useUpdateServiceEventLines,
} from '@renderer/hooks/ipc/useServiceEvents';
import { unitsCompatibleWithBase } from '@shared/constants/unitConversions';
import { formatINR } from '@shared/utils/currency';
import { formatStock } from '@renderer/lib/format';
import { ServiceStatusBadge } from '@renderer/features/maintenance/ServiceStatusBadge';

const KIND_LABELS: Record<'service' | 'repair' | 'wash', string> = {
  service: 'Service (oil change)',
  repair: 'Repair',
  wash: 'Wash',
};

type DraftLine = {
  key: string;
  ingredientId: string;
  quantity: number;
  unit: string;
};

let draftKeyCounter = 0;
const nextKey = () => `dl-${++draftKeyCounter}`;

function linesToDraft(lines: ServiceEventLine[]): DraftLine[] {
  return lines.map((l) => ({
    key: nextKey(),
    ingredientId: l.ingredientId,
    quantity: l.quantity,
    unit: l.unit,
  }));
}

function draftToInputs(rows: DraftLine[]): ServiceEventLineInput[] {
  return rows.map((r, idx) => ({
    ingredientId: r.ingredientId,
    quantity: r.quantity,
    unit: r.unit,
    notes: null,
    displayOrder: idx,
  }));
}

function defaultUnitForIngredient(ing: Ingredient): string {
  return ing.baseUnit;
}

export function ServiceEventEditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: event } = useServiceEvent(id);
  const { data: ingredients = [] } = useIngredients({ includeInactive: false });
  const { data: bikes = [] } = useBikes({ includeInactive: true });
  const { data: template } = useServiceTemplate(event?.serviceTemplateId);

  const update = useUpdateServiceEventLines();
  const complete = useCompleteServiceEvent();
  const cancel = useCancelServiceEvent();

  const [draft, setDraft] = useState<DraftLine[]>([]);
  const [serverError, setServerError] = useState<string | null>(null);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancelPartsUsed, setCancelPartsUsed] = useState<boolean>(false);

  useEffect(() => {
    if (event) setDraft(linesToDraft(event.lines));
  }, [event?.id, event?.lines]);

  const bike = useMemo(
    () => (event ? bikes.find((b) => b.id === event.bikeId) ?? null : null),
    [bikes, event],
  );
  const ingredientById = useMemo(
    () => new Map(ingredients.map((i) => [i.id, i])),
    [ingredients],
  );

  if (!id) return null;
  if (!event) {
    return <div className="px-1 py-4 text-text-tertiary">Loading…</div>;
  }

  // 'requested' and 'in_progress' are both pre-completion, editable states.
  const isOpen = event.status === 'in_progress' || event.status === 'requested';
  const isCompleted = event.status === 'completed';
  const isCancelled = event.status === 'cancelled';

  const kindLabel = event.serviceTemplateId
    ? template?.name ?? 'Template service'
    : KIND_LABELS[event.kind];

  const allValid = draft.every(
    (r) => r.ingredientId && r.quantity > 0 && r.unit,
  );

  async function onSaveLines() {
    setServerError(null);
    try {
      await update.mutateAsync({ id: id!, lines: draftToInputs(draft) });
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Could not save lines');
    }
  }

  async function onComplete() {
    setServerError(null);
    try {
      // Save any pending edits first so completion uses the current draft.
      if (draft.length > 0 && allValid) {
        await update.mutateAsync({ id: id!, lines: draftToInputs(draft) });
      }
      await complete.mutateAsync(id!);
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Could not complete service');
    }
  }

  async function onCancel(partsUsed: boolean | undefined) {
    setServerError(null);
    try {
      await cancel.mutateAsync({
        id: id!,
        ...(partsUsed !== undefined ? { partsUsed } : {}),
      });
      setCancelDialogOpen(false);
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Could not cancel service');
    }
  }

  function addRow() {
    const firstIng = ingredients[0];
    if (!firstIng) return;
    setDraft((d) => [
      ...d,
      {
        key: nextKey(),
        ingredientId: firstIng.id,
        quantity: 0,
        unit: defaultUnitForIngredient(firstIng),
      },
    ]);
  }

  function removeRow(key: string) {
    setDraft((d) => d.filter((r) => r.key !== key));
  }

  function patchRow(key: string, patch: Partial<DraftLine>) {
    setDraft((d) =>
      d.map((r) => {
        if (r.key !== key) return r;
        const next = { ...r, ...patch };
        // When ingredient changes, snap unit to its base unit if the previous
        // unit is no longer compatible.
        if (patch.ingredientId && patch.ingredientId !== r.ingredientId) {
          const ing = ingredientById.get(patch.ingredientId);
          if (ing) {
            const compatible = unitsCompatibleWithBase(ing.baseUnit);
            if (!compatible.includes(next.unit as never)) {
              next.unit = ing.baseUnit;
            }
          }
        }
        return next;
      }),
    );
  }

  const totalCost = useMemo(() => {
    let acc = 0;
    for (const r of draft) {
      const ing = ingredientById.get(r.ingredientId);
      if (!ing) continue;
      acc += r.quantity * ing.currentAvgCostPerUnit;
    }
    return acc;
  }, [draft, ingredientById]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-[12px] text-text-secondary">
          <Link
            to="/services"
            className="inline-flex items-center gap-1 hover:text-text-primary"
          >
            <ArrowLeft className="h-3 w-3" /> Services
          </Link>
          <span className="text-text-tertiary">/</span>
          <span className="text-text-primary">
            {bike?.bikeNumber ?? '…'} · {kindLabel}
          </span>
          <ServiceStatusBadge status={event.status} />
        </div>
        <div className="flex items-center gap-2">
          {isOpen ? (
            <>
              <Button
                type="button"
                variant="ghost"
                size="md"
                onClick={() => setCancelDialogOpen(true)}
                className="text-text-danger"
              >
                Cancel service
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="md"
                onClick={onSaveLines}
                disabled={!allValid || update.isPending}
              >
                Save lines
              </Button>
              <Button
                type="button"
                variant="primary"
                size="md"
                onClick={onComplete}
                disabled={!allValid || complete.isPending || draft.length === 0}
              >
                Complete & deduct stock
              </Button>
            </>
          ) : isCompleted ? (
            <Button
              type="button"
              variant="ghost"
              size="md"
              onClick={() => setCancelDialogOpen(true)}
              className="text-text-danger"
            >
              Cancel & adjust
            </Button>
          ) : null}
        </div>
      </div>

      <section className="rounded-lg border border-border-tertiary bg-background-primary p-4">
        <h2 className="mb-3 text-[13px] font-medium text-text-primary">Details</h2>
        <div className="grid grid-cols-4 gap-3 text-[12px]">
          <Detail label="Bike" value={bike?.bikeNumber ?? '—'} />
          <Detail label="Type" value={kindLabel} />
          <Detail
            label="Odometer"
            value={event.odometerKm != null ? `${event.odometerKm.toLocaleString('en-IN')} km` : '—'}
          />
          <Detail
            label="Theoretical cost"
            value={totalCost > 0 ? formatINR(totalCost) : '—'}
          />
        </div>
        {event.notes ? (
          <div className="mt-3 rounded-md bg-background-secondary p-2 text-[12px] text-text-secondary">
            {event.notes}
          </div>
        ) : null}
      </section>

      <section className="rounded-lg border border-border-tertiary bg-background-primary p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[13px] font-medium text-text-primary">
            Parts {isOpen ? '· editable until you complete' : ''}
          </h2>
          {isOpen ? (
            <Button type="button" variant="ghost" size="sm" onClick={addRow}>
              + Add row
            </Button>
          ) : null}
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Part</TableHead>
              <TableHead className="w-[120px]">Quantity</TableHead>
              <TableHead className="w-[100px]">Unit</TableHead>
              <TableHead className="text-right">Stock</TableHead>
              {isOpen ? <TableHead className="w-[40px]" /> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {draft.length === 0 ? (
              <TableRow>
                <TableCell colSpan={isOpen ? 5 : 4} className="text-center text-text-tertiary">
                  No parts on this service yet.
                </TableCell>
              </TableRow>
            ) : (
              draft.map((row) => {
                const ing = ingredientById.get(row.ingredientId);
                const compatibleUnits = ing ? unitsCompatibleWithBase(ing.baseUnit) : [];
                return (
                  <TableRow key={row.key}>
                    <TableCell>
                      {isOpen ? (
                        <Select
                          value={row.ingredientId}
                          onValueChange={(v) => patchRow(row.key, { ingredientId: v })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {ingredients.map((i) => (
                              <SelectItem key={i.id} value={i.id}>
                                {i.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <span className="text-text-primary">{ing?.name ?? '—'}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {isOpen ? (
                        <Input
                          type="number"
                          min={0}
                          step="any"
                          value={row.quantity}
                          onChange={(e) =>
                            patchRow(row.key, { quantity: Number(e.target.value) || 0 })
                          }
                        />
                      ) : (
                        <span className="tabular-nums text-text-secondary">{row.quantity}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {isOpen && compatibleUnits.length > 0 ? (
                        <Select
                          value={row.unit}
                          onValueChange={(v) => patchRow(row.key, { unit: v })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {compatibleUnits.map((u) => (
                              <SelectItem key={u} value={u}>
                                {u}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <span className="text-text-secondary">{row.unit}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-text-tertiary">
                      {ing ? formatStock(ing.stockQuantity, ing.baseUnit) : '—'}
                    </TableCell>
                    {isOpen ? (
                      <TableCell>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeRow(row.key)}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-text-danger" />
                        </Button>
                      </TableCell>
                    ) : null}
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </section>

      {serverError ? (
        <div className="rounded-md bg-background-danger px-2.5 py-1.5 text-[12px] text-text-danger">
          {serverError}
        </div>
      ) : null}

      {isCancelled ? (
        <div className="rounded-md border border-border-tertiary bg-background-secondary px-3 py-2 text-[12px] text-text-tertiary">
          This service was cancelled {event.cancelledPartsUsed != null
            ? `(parts ${event.cancelledPartsUsed ? 'already used — recorded as wastage' : 'not used — stock restored'})`
            : 'before any parts were consumed.'}
        </div>
      ) : null}

      <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel service</DialogTitle>
            <DialogDescription>
              {isCompleted
                ? 'This service was already completed. Choose whether the parts were physically used.'
                : 'No stock has been deducted yet — cancel without any movements?'}
            </DialogDescription>
          </DialogHeader>

          {isCompleted ? (
            <div className="grid gap-2">
              <label className="flex items-start gap-2 rounded-md border border-border-tertiary p-2 hover:bg-background-secondary">
                <input
                  type="radio"
                  checked={cancelPartsUsed === false}
                  onChange={() => setCancelPartsUsed(false)}
                />
                <div>
                  <div className="text-[12px] font-medium text-text-primary">
                    Parts were not used (restore stock)
                  </div>
                  <div className="text-[11px] text-text-tertiary">
                    Writes a service_reversal movement per line. Stock is added back.
                  </div>
                </div>
              </label>
              <label className="flex items-start gap-2 rounded-md border border-border-tertiary p-2 hover:bg-background-secondary">
                <input
                  type="radio"
                  checked={cancelPartsUsed === true}
                  onChange={() => setCancelPartsUsed(true)}
                />
                <div>
                  <div className="text-[12px] font-medium text-text-primary">
                    Parts were already installed (record wastage)
                  </div>
                  <div className="text-[11px] text-text-tertiary">
                    Writes a wastage movement per line. Stock stays deducted.
                  </div>
                </div>
              </label>
            </div>
          ) : null}

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="ghost" size="md">Don't cancel</Button>
            </DialogClose>
            <Button
              type="button"
              variant="primary"
              size="md"
              onClick={() => onCancel(isCompleted ? cancelPartsUsed : undefined)}
              disabled={cancel.isPending}
            >
              {isCompleted ? 'Confirm cancel' : 'Cancel service'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] uppercase tracking-wider text-text-tertiary">{label}</span>
      <span className="font-medium text-text-primary">{value}</span>
    </div>
  );
}
