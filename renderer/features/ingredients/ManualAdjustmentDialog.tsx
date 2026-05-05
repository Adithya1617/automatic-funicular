import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import type { Ingredient } from '@shared/schemas/ingredient';
import {
  MANUAL_ADJUSTMENT_REASONS,
  type ManualAdjustmentReason,
} from '@shared/constants/enums';
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
import { useApplyMovement } from '@renderer/hooks/ipc/useApplyMovement';
import { unitsCompatibleWithBase } from '@shared/constants/unitConversions';

type Props = {
  ingredient: Ingredient | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type FormValues = {
  quantity: number;
  unit: string;
  reason: ManualAdjustmentReason;
  direction: '1' | '-1';
  notes: string;
};

const FORCED_NEGATIVE: ManualAdjustmentReason[] = ['wastage', 'prep_loss', 'staff_meal'];

export function ManualAdjustmentDialog({ ingredient, open, onOpenChange }: Props) {
  const apply = useApplyMovement();
  const [serverError, setServerError] = useState<string | null>(null);

  const { register, handleSubmit, watch, setValue, reset, formState } = useForm<FormValues>({
    defaultValues: {
      quantity: 0,
      unit: ingredient?.baseUnit ?? 'g',
      reason: 'adjustment',
      direction: '-1',
      notes: '',
    },
  });

  // Reset form when ingredient changes or dialog opens.
  useEffect(() => {
    if (open && ingredient) {
      reset({
        quantity: 0,
        unit: ingredient.baseUnit,
        reason: 'adjustment',
        direction: '-1',
        notes: '',
      });
      setServerError(null);
    }
  }, [open, ingredient, reset]);

  const reason = watch('reason');
  const direction = watch('direction');
  const unit = watch('unit');
  const directionLocked = FORCED_NEGATIVE.includes(reason);

  useEffect(() => {
    if (directionLocked && direction !== '-1') {
      setValue('direction', '-1');
    }
  }, [directionLocked, direction, setValue]);

  if (!ingredient) return null;
  const compatibleUnits = unitsCompatibleWithBase(ingredient.baseUnit);

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      await apply.mutateAsync({
        ingredientId: ingredient.id,
        quantity: Number(values.quantity),
        unit: values.unit,
        reason: values.reason,
        direction: values.direction === '1' ? 1 : -1,
        ...(values.notes ? { notes: values.notes } : {}),
      });
      onOpenChange(false);
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Could not save movement');
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Adjust stock — {ingredient.name}</DialogTitle>
          <DialogDescription>
            Writes a stock movement and updates the cached quantity in one transaction.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="grid gap-3">
          <div className="grid grid-cols-[1fr_120px] gap-2">
            <div className="grid gap-1">
              <Label htmlFor="qty">Quantity</Label>
              <Input
                id="qty"
                type="number"
                step="any"
                min={0}
                {...register('quantity', { valueAsNumber: true, required: true, min: 0 })}
                autoFocus
              />
            </div>
            <div className="grid gap-1">
              <Label>Unit</Label>
              <Select value={unit} onValueChange={(v) => setValue('unit', v)}>
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
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="grid gap-1">
              <Label>Reason</Label>
              <Select
                value={reason}
                onValueChange={(v) => setValue('reason', v as ManualAdjustmentReason)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MANUAL_ADJUSTMENT_REASONS.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r.replace('_', ' ')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1">
              <Label>Direction</Label>
              <Select
                value={direction}
                onValueChange={(v) => setValue('direction', v as '1' | '-1')}
                disabled={directionLocked}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="-1">Decrease (−)</SelectItem>
                  <SelectItem value="1">Increase (+)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-1">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Input id="notes" type="text" {...register('notes')} maxLength={500} />
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
              type="submit"
              variant="primary"
              size="md"
              disabled={formState.isSubmitting || apply.isPending}
            >
              Save adjustment
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
