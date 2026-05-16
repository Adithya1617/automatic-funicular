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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@renderer/components/ui/select';
import {
  BASE_UNITS,
  PART_CATEGORIES,
  type BaseUnit,
  type IngredientType,
  type PartCategory,
} from '@shared/constants/enums';
import { useCreateIngredient } from '@renderer/hooks/ipc/useIngredients';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: {
    name?: string;
    category?: string;
    baseUnit?: BaseUnit;
    type?: IngredientType;
  };
  onCreated?: (ingredient: Ingredient) => void;
};

type FormValues = {
  name: string;
  category: PartCategory;
  baseUnit: BaseUnit;
  lowStockThreshold: number;
  densityGPerMl: string; // textual, blank means null
};

function asCategory(value: string | undefined): PartCategory {
  return (PART_CATEGORIES as readonly string[]).includes(value ?? '')
    ? (value as PartCategory)
    : 'Misc';
}

export function NewIngredientDialog({ open, onOpenChange, initial, onCreated }: Props) {
  const create = useCreateIngredient();
  const [serverError, setServerError] = useState<string | null>(null);
  const { register, handleSubmit, reset, watch, setValue, formState } = useForm<FormValues>({
    defaultValues: {
      name: initial?.name ?? '',
      category: asCategory(initial?.category),
      baseUnit: initial?.baseUnit ?? 'ml',
      lowStockThreshold: 0,
      densityGPerMl: '',
    },
  });

  useEffect(() => {
    if (open) {
      reset({
        name: initial?.name ?? '',
        category: asCategory(initial?.category),
        baseUnit: initial?.baseUnit ?? 'ml',
        lowStockThreshold: 0,
        densityGPerMl: '',
      });
      setServerError(null);
    }
  }, [open, initial?.name, initial?.category, initial?.baseUnit, reset]);

  const baseUnit = watch('baseUnit');
  const category = watch('category');

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      const densityNum = values.densityGPerMl.trim() === '' ? null : Number(values.densityGPerMl);
      const created = await create.mutateAsync({
        name: values.name.trim(),
        category: values.category,
        // Bike parts are always raw purchases — the prepared/recipe pathway
        // is restaurant-only and stays out of the Hyprride flow.
        type: 'raw',
        baseUnit: values.baseUnit,
        lowStockThreshold: Number(values.lowStockThreshold) || 0,
        densityGPerMl: densityNum != null && Number.isFinite(densityNum) && densityNum > 0 ? densityNum : null,
      });
      if (onCreated) onCreated(created);
      reset();
      onOpenChange(false);
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Could not save part');
    }
  });

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New part</DialogTitle>
          <DialogDescription>
            Base unit becomes immutable once any movement is recorded. Pick the
            unit you'll actually invoice in (mL for oils, each for pads / filters).
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="grid gap-3">
          <div className="grid gap-1">
            <Label htmlFor="part-name">Name</Label>
            <Input
              id="part-name"
              {...register('name', { required: true, maxLength: 120 })}
              autoFocus
              placeholder="e.g. Castrol 10W30 800ml"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="grid gap-1">
              <Label>Category</Label>
              <Select value={category} onValueChange={(v) => setValue('category', v as PartCategory)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PART_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1">
              <Label>Base unit</Label>
              <Select value={baseUnit} onValueChange={(v) => setValue('baseUnit', v as BaseUnit)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {BASE_UNITS.map((u) => (
                    <SelectItem key={u} value={u}>{u}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="grid gap-1">
              <Label htmlFor="part-low">Low stock at</Label>
              <Input
                id="part-low"
                type="number"
                min={0}
                step="any"
                {...register('lowStockThreshold', { valueAsNumber: true, min: 0 })}
              />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="part-density">Density (g/ml)</Label>
              <Input
                id="part-density"
                type="number"
                min={0}
                step="any"
                placeholder="optional · oils only"
                {...register('densityGPerMl')}
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
              <Button type="button" variant="ghost" size="md">Cancel</Button>
            </DialogClose>
            <Button type="submit" variant="primary" size="md" disabled={formState.isSubmitting || create.isPending}>
              Create part
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
