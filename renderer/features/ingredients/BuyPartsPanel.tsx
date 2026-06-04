import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Plus } from 'lucide-react';
import { Button } from '@renderer/components/ui/button';
import { Input } from '@renderer/components/ui/input';
import { Label } from '@renderer/components/ui/label';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@renderer/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@renderer/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@renderer/components/ui/table';
import { NewIngredientDialog } from '@renderer/features/ingredients/NewIngredientDialog';
import { useIngredients } from '@renderer/hooks/ipc/useIngredients';
import { useRecordPurchase } from '@renderer/hooks/ipc/useApplyMovement';
import { usePurchaseHistory } from '@renderer/hooks/ipc/useStockMovements';
import { unitsCompatibleWithBase } from '@shared/constants/unitConversions';
import { formatINR } from '@shared/utils/currency';
import { formatDateTime, formatStock } from '@renderer/lib/format';
import type { Ingredient } from '@shared/schemas/ingredient';

// ---------------------------------------------------------------------------
// Panel — the "Buy parts" tab of the Parts page: a purchase log plus the
// dialog that records a new purchase against live part stock.
// ---------------------------------------------------------------------------

export function BuyPartsPanel() {
  // Include inactive so historical purchases of a since-deactivated part still
  // resolve to a name in the log below.
  const { data: parts = [] } = useIngredients({ includeInactive: true });
  const { data: purchases = [], isLoading } = usePurchaseHistory(50);

  const activeParts = useMemo(() => parts.filter((p) => p.isActive), [parts]);
  const partsById = useMemo(
    () => new Map(parts.map((p) => [p.id, p])),
    [parts],
  );

  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-[12px] text-text-tertiary">
          Recent purchases — each adds stock and updates the part's average cost.
        </p>
        <Button
          type="button"
          variant="primary"
          size="md"
          onClick={() => setDialogOpen(true)}
        >
          <Plus className="h-3.5 w-3.5" /> Buy part
        </Button>
      </div>

      <div className="overflow-hidden rounded-lg border border-border-tertiary bg-background-primary">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Part</TableHead>
              <TableHead className="text-right">Qty added</TableHead>
              <TableHead className="text-right">Cost / unit</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-right">When</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {purchases.map((m) => {
              const part = partsById.get(m.ingredientId);
              const baseUnit = part?.baseUnit ?? 'each';
              const hasCost = m.costPerUnitAtTime != null;
              return (
                <TableRow key={m.id}>
                  <TableCell className="font-medium text-text-primary">
                    {part?.name ?? 'Unknown part'}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-text-secondary">
                    +{formatStock(Math.abs(m.changeQuantity), baseUnit)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-text-secondary">
                    {hasCost
                      ? `${formatINR(m.costPerUnitAtTime!, { showPaise: true })} /${baseUnit}`
                      : '—'}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-text-primary">
                    {hasCost
                      ? formatINR(Math.abs(m.changeQuantity) * m.costPerUnitAtTime!)
                      : '—'}
                  </TableCell>
                  <TableCell className="text-right text-text-tertiary">
                    {formatDateTime(m.occurredAt)}
                  </TableCell>
                </TableRow>
              );
            })}
            {!isLoading && purchases.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-text-tertiary">
                  No purchases yet — click <span className="font-medium">+ Buy part</span> to record one.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>

      <BuyPartDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        parts={activeParts}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dialog
// ---------------------------------------------------------------------------

type FormValues = {
  ingredientId: string;
  quantity: string;
  unit: string;
  costPerUnit: string;
};

type DialogProps = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  parts: Ingredient[];
};

function BuyPartDialog({ open, onOpenChange, parts }: DialogProps) {
  const recordPurchase = useRecordPurchase();
  const [serverError, setServerError] = useState<string | null>(null);
  const [newPartOpen, setNewPartOpen] = useState(false);

  const { register, handleSubmit, reset, watch, setValue, formState } = useForm<FormValues>({
    defaultValues: { ingredientId: '', quantity: '', unit: '', costPerUnit: '' },
  });

  useEffect(() => {
    if (open) {
      reset({ ingredientId: '', quantity: '', unit: '', costPerUnit: '' });
      setServerError(null);
    }
  }, [open, reset]);

  const ingredientId = watch('ingredientId');
  const unit = watch('unit');
  const selectedPart = parts.find((p) => p.id === ingredientId);
  const compatibleUnits = selectedPart
    ? unitsCompatibleWithBase(selectedPart.baseUnit)
    : [];

  // When the part changes, default the unit to its base unit.
  function handlePartChange(id: string) {
    setValue('ingredientId', id, { shouldValidate: true });
    const part = parts.find((p) => p.id === id);
    setValue('unit', part?.baseUnit ?? '');
  }

  // A part created from here is inserted into the parts inventory by
  // NewIngredientDialog (useCreateIngredient); we just preselect it for this
  // purchase. The parts list refreshes via query invalidation.
  function handlePartCreated(part: Ingredient) {
    setValue('ingredientId', part.id, { shouldValidate: true });
    setValue('unit', part.baseUnit);
    setNewPartOpen(false);
  }

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    const quantity = Number(values.quantity);
    const costStr = values.costPerUnit.trim();
    const cost = costStr === '' ? undefined : Number(costStr);
    try {
      await recordPurchase.mutateAsync({
        ingredientId: values.ingredientId,
        quantity,
        unit: values.unit,
        ...(cost !== undefined && !Number.isNaN(cost) ? { costPerUnit: cost } : {}),
      });
      onOpenChange(false);
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Could not record purchase');
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Buy part</DialogTitle>
          <DialogDescription>
            Adds stock to the selected part and updates its average cost in one transaction.
          </DialogDescription>
        </DialogHeader>

        {parts.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-md border border-dashed border-border-tertiary bg-background-secondary px-3 py-6 text-center text-text-tertiary">
            <span>No parts yet — create one to add it to the inventory and buy stock.</span>
            <Button type="button" variant="primary" size="md" onClick={() => setNewPartOpen(true)}>
              <Plus className="h-3.5 w-3.5" /> New part
            </Button>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="grid gap-3">
            <div className="grid gap-1">
              <div className="flex items-center justify-between">
                <Label>Part</Label>
                <button
                  type="button"
                  onClick={() => setNewPartOpen(true)}
                  className="inline-flex items-center gap-1 text-[12px] font-medium text-text-info hover:underline"
                >
                  <Plus className="h-3 w-3" /> New part
                </button>
              </div>
              <Select value={ingredientId} onValueChange={handlePartChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a part…" />
                </SelectTrigger>
                <SelectContent>
                  {parts.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} · {formatStock(p.stockQuantity, p.baseUnit)} in stock
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {/* register keeps the field in the form state for validation */}
              <input type="hidden" {...register('ingredientId', { required: true })} />
            </div>

            <div className="grid grid-cols-[1fr_120px] gap-2">
              <div className="grid gap-1">
                <Label htmlFor="bp-qty">Quantity bought</Label>
                <Input
                  id="bp-qty"
                  type="number"
                  min={0}
                  step="any"
                  placeholder="0"
                  {...register('quantity', { required: true, min: 0 })}
                />
              </div>
              <div className="grid gap-1">
                <Label>Unit</Label>
                <Select
                  value={unit}
                  onValueChange={(v) => setValue('unit', v)}
                  disabled={!selectedPart}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="—" />
                  </SelectTrigger>
                  <SelectContent>
                    {compatibleUnits.map((u) => (
                      <SelectItem key={u} value={u}>{u}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-1">
              <Label htmlFor="bp-cost">Cost per unit (₹) · optional</Label>
              <Input
                id="bp-cost"
                type="number"
                min={0}
                step="any"
                placeholder="0.00"
                {...register('costPerUnit', { min: 0 })}
              />
            </div>

            {serverError ? (
              <div className="rounded-md bg-background-danger px-2.5 py-1.5 text-[12px] text-text-danger">
                {serverError}
              </div>
            ) : null}

            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="ghost" size="md">Cancel</Button>
              </DialogClose>
              <Button
                type="submit"
                variant="primary"
                size="md"
                disabled={!ingredientId || !unit || formState.isSubmitting || recordPurchase.isPending}
              >
                Add to stock
              </Button>
            </DialogFooter>
          </form>
        )}

        <NewIngredientDialog
          open={newPartOpen}
          onOpenChange={setNewPartOpen}
          onCreated={handlePartCreated}
        />
      </DialogContent>
    </Dialog>
  );
}
