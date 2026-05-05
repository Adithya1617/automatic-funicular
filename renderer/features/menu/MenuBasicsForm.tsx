import { useFormContext } from 'react-hook-form';
import { Input } from '@renderer/components/ui/input';
import { Label } from '@renderer/components/ui/label';
import { Switch } from '@renderer/components/ui/switch';

export type MenuBasicsValues = {
  name: string;
  category: string;
  sellingPrice: number;
  variantGroupId: string | null;
  displayOrder: number;
  isActive: boolean;
};

export function MenuBasicsForm() {
  const { register, watch, setValue } = useFormContext<MenuBasicsValues>();
  const isActive = watch('isActive');

  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1">
          <Label htmlFor="mi-name">Name</Label>
          <Input id="mi-name" {...register('name', { required: true, maxLength: 120 })} />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="mi-category">Category</Label>
          <Input
            id="mi-category"
            placeholder="e.g. Biryani, Curry, Sides"
            {...register('category', { required: true, maxLength: 60 })}
          />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="grid gap-1">
          <Label htmlFor="mi-price">Selling price (₹)</Label>
          <Input
            id="mi-price"
            type="number"
            min={0}
            step="any"
            {...register('sellingPrice', { valueAsNumber: true, min: 0 })}
          />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="mi-display">Display order</Label>
          <Input
            id="mi-display"
            type="number"
            step={1}
            {...register('displayOrder', { valueAsNumber: true })}
          />
        </div>
        <div className="grid gap-1">
          <Label>Active on menu</Label>
          <div className="flex h-[32px] items-center">
            <Switch
              checked={isActive}
              onCheckedChange={(v) => setValue('isActive', !!v, { shouldDirty: true })}
              aria-label="Active"
            />
            <span className="ml-2 text-[12px] text-text-secondary">{isActive ? 'Active' : 'Hidden'}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
