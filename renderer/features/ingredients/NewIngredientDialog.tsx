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
  INGREDIENT_TYPES,
  type BaseUnit,
  type IngredientType,
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
  category: string;
  type: IngredientType;
  baseUnit: BaseUnit;
  lowStockThreshold: number;
  densityGPerMl: string; // textual, blank means null
};

export function NewIngredientDialog({ open, onOpenChange, initial, onCreated }: Props) {
  const create = useCreateIngredient();
  const [serverError, setServerError] = useState<string | null>(null);
  const { register, handleSubmit, reset, watch, setValue, formState } = useForm<FormValues>({
    defaultValues: {
      name: initial?.name ?? '',
      category: initial?.category ?? '',
      type: initial?.type ?? 'raw',
      baseUnit: initial?.baseUnit ?? 'g',
      lowStockThreshold: 0,
      densityGPerMl: '',
    },
  });

  useEffect(() => {
    if (open) {
      reset({
        name: initial?.name ?? '',
        category: initial?.category ?? '',
        type: initial?.type ?? 'raw',
        baseUnit: initial?.baseUnit ?? 'g',
        lowStockThreshold: 0,
        densityGPerMl: '',
      });
      setServerError(null);
    }
  }, [open, initial?.name, initial?.category, initial?.baseUnit, initial?.type, reset]);

  const baseUnit = watch('baseUnit');
  const type = watch('type');

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      const densityNum = values.densityGPerMl.trim() === '' ? null : Number(values.densityGPerMl);
      const created = await create.mutateAsync({
        name: values.name.trim(),
        category: values.category.trim(),
        type: values.type,
        baseUnit: values.baseUnit,
        lowStockThreshold: Number(values.lowStockThreshold) || 0,
        densityGPerMl: densityNum != null && Number.isFinite(densityNum) && densityNum > 0 ? densityNum : null,
      });
      if (onCreated) onCreated(created);
      reset();
      onOpenChange(false);
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Could not save ingredient');
    }
  });

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New ingredient</DialogTitle>
          <DialogDescription>
            Base unit becomes immutable once any movement is recorded.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="grid gap-3">
          <div className="grid gap-1">
            <Label htmlFor="ing-name">Name</Label>
            <Input id="ing-name" {...register('name', { required: true, maxLength: 120 })} autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="grid gap-1">
              <Label htmlFor="ing-category">Category</Label>
              <Input id="ing-category" {...register('category', { required: true, maxLength: 60 })} />
            </div>
            <div className="grid gap-1">
              <Label>Type</Label>
              <Select value={type} onValueChange={(v) => setValue('type', v as IngredientType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {INGREDIENT_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
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
            <div className="grid gap-1">
              <Label htmlFor="ing-low">Low stock at</Label>
              <Input
                id="ing-low"
                type="number"
                min={0}
                step="any"
                {...register('lowStockThreshold', { valueAsNumber: true, min: 0 })}
              />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="ing-density">Density (g/ml)</Label>
              <Input
                id="ing-density"
                type="number"
                min={0}
                step="any"
                placeholder="optional"
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
              Create ingredient
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
