import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import type { Ingredient } from '@shared/schemas/ingredient';
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
import { useActiveRecipe } from '@renderer/hooks/ipc/useRecipe';
import { useIngredients } from '@renderer/hooks/ipc/useIngredients';
import { useRecordBatch } from '@renderer/hooks/ipc/useProductionBatches';
import { formatStock } from '@renderer/lib/format';

type Props = {
  parent: Ingredient;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type FormValues = {
  actualYield: number;
  notes: string;
};

export function MakeBatchDialog({ parent, open, onOpenChange }: Props) {
  const { data: recipe = null } = useActiveRecipe(parent.id, 'ingredient');
  const { data: ingredients = [] } = useIngredients({ includeInactive: false });
  const record = useRecordBatch();
  const [serverError, setServerError] = useState<string | null>(null);

  const { register, handleSubmit, reset, formState } = useForm<FormValues>({
    defaultValues: { actualYield: recipe?.targetYield ?? 0, notes: '' },
  });

  useEffect(() => {
    if (open) {
      reset({ actualYield: recipe?.targetYield ?? 0, notes: '' });
      setServerError(null);
    }
  }, [open, recipe?.targetYield, reset]);

  const ingredientById = (id: string) => ingredients.find((i) => i.id === id);

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      await record.mutateAsync({
        preparedIngredientId: parent.id,
        actualYield: Number(values.actualYield),
        notes: values.notes.trim() || null,
      });
      onOpenChange(false);
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Could not record batch');
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Make a batch — {parent.name}</DialogTitle>
          <DialogDescription>
            Deducts inputs at recipe quantities, increments {parent.name}'s stock by actual yield, and logs prep loss if actual is below expected.
          </DialogDescription>
        </DialogHeader>

        {!recipe ? (
          <div className="rounded-md bg-background-warning px-2.5 py-2 text-[12px] text-text-warning">
            No active recipe. Define one in the Recipe tab first.
          </div>
        ) : (
          <form onSubmit={onSubmit} className="grid gap-3">
            <div className="rounded-md border border-border-tertiary bg-background-secondary p-3">
              <div className="text-[10px] uppercase tracking-wider text-text-tertiary">
                Recipe v{recipe.versionNumber} — yields {formatStock(recipe.targetYield, parent.baseUnit)}
              </div>
              <ul className="mt-1.5 grid gap-0.5 text-[12px] text-text-primary">
                {recipe.ingredients.map((row) => {
                  const child = ingredientById(row.childIngredientId);
                  return (
                    <li key={row.id} className="flex justify-between">
                      <span>{child?.name ?? row.childIngredientId}</span>
                      <span className="tabular-nums text-text-secondary">
                        {row.quantity} {row.unit}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="grid gap-1">
                <Label htmlFor="expected">Expected yield</Label>
                <Input
                  id="expected"
                  value={formatStock(recipe.targetYield, parent.baseUnit)}
                  disabled
                />
              </div>
              <div className="grid gap-1">
                <Label htmlFor="actual">Actual yield ({parent.baseUnit})</Label>
                <Input
                  id="actual"
                  type="number"
                  step="any"
                  min={0}
                  autoFocus
                  {...register('actualYield', { valueAsNumber: true, required: true, min: 0.000001 })}
                />
              </div>
            </div>
            <div className="grid gap-1">
              <Label htmlFor="batch-notes">Notes</Label>
              <Input id="batch-notes" maxLength={500} {...register('notes')} />
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
                disabled={formState.isSubmitting || record.isPending}
              >
                Record batch
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
