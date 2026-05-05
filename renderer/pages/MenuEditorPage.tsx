import { useEffect, useState } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import type { MenuItem } from '@shared/schemas/menuItem';
import { Button } from '@renderer/components/ui/button';
import { useIngredients } from '@renderer/hooks/ipc/useIngredients';
import { useAvailability } from '@renderer/hooks/ipc/useAvailability';
import {
  useCreateMenuItem,
  useMenuItem,
  useMenuItems,
  useUpdateMenuItem,
} from '@renderer/hooks/ipc/useMenuItems';
import { useActiveRecipe } from '@renderer/hooks/ipc/useRecipe';
import { MenuBasicsForm, type MenuBasicsValues } from '@renderer/features/menu/MenuBasicsForm';
import { MenuSummaryCard } from '@renderer/features/menu/MenuSummaryCard';
import { VariantGroupPicker } from '@renderer/features/menu/VariantGroupPicker';
import { RecipeBuilder } from '@renderer/features/recipes/RecipeBuilder';
import type { DraftRow } from '@renderer/features/recipes/RecipeRow';

const DEFAULT_VALUES: MenuBasicsValues = {
  name: '',
  category: '',
  sellingPrice: 0,
  variantGroupId: null,
  displayOrder: 0,
  isActive: true,
};

export function MenuEditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isNew = !id;

  const { data: existing } = useMenuItem(id);
  const { data: allItems = [] } = useMenuItems({ includeInactive: true });
  const { data: ingredients = [] } = useIngredients({ includeInactive: false });
  const { data: activeRecipe = null } = useActiveRecipe(id, 'menu_item');
  const { data: availabilityList = [] } = useAvailability(id ? { menuItemIds: [id] } : {});
  const savedAvailability = id
    ? availabilityList.find((a) => a.menuItemId === id) ?? null
    : null;

  const create = useCreateMenuItem();
  const update = useUpdateMenuItem();
  const [serverError, setServerError] = useState<string | null>(null);
  const [draftRows, setDraftRows] = useState<DraftRow[]>([]);

  const methods = useForm<MenuBasicsValues>({ defaultValues: DEFAULT_VALUES });
  const { handleSubmit, reset, formState, watch, setValue } = methods;

  useEffect(() => {
    if (existing) {
      reset({
        name: existing.name,
        category: existing.category,
        sellingPrice: existing.sellingPrice,
        variantGroupId: existing.variantGroupId,
        displayOrder: existing.displayOrder,
        isActive: existing.isActive,
      });
    } else if (isNew) {
      reset(DEFAULT_VALUES);
    }
  }, [existing?.id, isNew, reset]);

  const sellingPrice = watch('sellingPrice');
  const variantGroupId = watch('variantGroupId');

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      if (isNew) {
        const created: MenuItem = await create.mutateAsync({
          name: values.name.trim(),
          category: values.category.trim(),
          sellingPrice: values.sellingPrice,
          variantGroupId: values.variantGroupId,
          displayOrder: values.displayOrder,
        });
        navigate(`/menu/${created.id}/edit`, { replace: true });
      } else if (existing) {
        await update.mutateAsync({
          id: existing.id,
          name: values.name.trim(),
          category: values.category.trim(),
          sellingPrice: values.sellingPrice,
          variantGroupId: values.variantGroupId,
          displayOrder: values.displayOrder,
          isActive: values.isActive,
        });
      }
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Could not save menu item');
    }
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-[12px] text-text-secondary">
          <Link to="/menu" className="inline-flex items-center gap-1 hover:text-text-primary">
            <ArrowLeft className="h-3 w-3" /> Menu
          </Link>
          <span className="text-text-tertiary">/</span>
          <span className="text-text-primary">{isNew ? 'New menu item' : existing?.name ?? '…'}</span>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="ghost" size="md" onClick={() => navigate('/menu')}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            size="md"
            onClick={onSubmit}
            disabled={formState.isSubmitting || create.isPending || update.isPending}
          >
            {isNew ? 'Create menu item' : 'Save'}
          </Button>
        </div>
      </div>

      <FormProvider {...methods}>
        <form onSubmit={onSubmit} className="grid gap-4">
          <section className="rounded-lg border border-border-tertiary bg-background-primary p-4">
            <h2 className="mb-3 text-[13px] font-medium text-text-primary">Basics</h2>
            <MenuBasicsForm />
            <div className="mt-3 max-w-[320px]">
              <VariantGroupPicker
                value={variantGroupId}
                onChange={(v) => setValue('variantGroupId', v, { shouldDirty: true })}
                menuItems={allItems}
                selfId={id}
              />
            </div>
          </section>

          {serverError ? (
            <div className="rounded-md bg-background-danger px-2.5 py-1.5 text-[12px] text-text-danger">
              {serverError}
            </div>
          ) : null}
        </form>
      </FormProvider>

      <section className="rounded-lg border border-border-tertiary bg-background-primary p-4">
        <h2 className="mb-3 text-[13px] font-medium text-text-primary">Recipe · per 1 serving</h2>
        {!id ? (
          <div className="rounded-md border border-dashed border-border-tertiary bg-background-secondary px-3 py-6 text-center text-text-tertiary">
            Save the menu item first, then add the recipe.
          </div>
        ) : !existing ? (
          <div className="px-1 py-4 text-text-tertiary">Loading…</div>
        ) : (
          <RecipeBuilder
            parentId={existing.id}
            parentType="menu_item"
            parentName={existing.name}
            ingredients={ingredients}
            active={activeRecipe}
            showTargetYield={false}
            onDraftChange={setDraftRows}
            rightSummary={
              <MenuSummaryCard
                rows={draftRows}
                ingredients={ingredients}
                sellingPrice={sellingPrice}
                activeVersion={activeRecipe ?? null}
                savedAvailability={savedAvailability}
              />
            }
          />
        )}
      </section>
    </div>
  );
}
