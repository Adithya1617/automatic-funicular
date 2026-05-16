import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import type { ServiceTemplate } from '@shared/schemas/serviceTemplate';
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
import { useIngredients } from '@renderer/hooks/ipc/useIngredients';
import { useBikeTypes } from '@renderer/hooks/ipc/useBikes';
import { useActiveRecipe } from '@renderer/hooks/ipc/useRecipe';
import {
  useCreateServiceTemplate,
  useServiceTemplate,
  useUpdateServiceTemplate,
} from '@renderer/hooks/ipc/useServiceTemplates';
import { RecipeBuilder } from '@renderer/features/recipes/RecipeBuilder';

type FormValues = {
  name: string;
  bikeTypeId: string;
  displayOrder: number;
  isActive: boolean;
};

const DEFAULT_VALUES: FormValues = {
  name: '',
  bikeTypeId: '',
  displayOrder: 0,
  isActive: true,
};

export function ServiceTemplateEditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isNew = !id;

  const { data: existing } = useServiceTemplate(id);
  const { data: bikeTypes = [] } = useBikeTypes();
  const { data: ingredients = [] } = useIngredients({ includeInactive: false });
  const { data: activeRecipe = null } = useActiveRecipe(id, 'service_template');

  const create = useCreateServiceTemplate();
  const update = useUpdateServiceTemplate();
  const [values, setValues] = useState<FormValues>(DEFAULT_VALUES);
  const [serverError, setServerError] = useState<string | null>(null);

  useEffect(() => {
    if (existing) {
      setValues({
        name: existing.name,
        bikeTypeId: existing.bikeTypeId,
        displayOrder: existing.displayOrder,
        isActive: existing.isActive,
      });
    } else if (isNew && bikeTypes.length > 0 && !values.bikeTypeId) {
      // Preselect first model so the dropdown isn't empty on /new.
      setValues((prev) => ({ ...prev, bikeTypeId: bikeTypes[0]!.id }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existing?.id, isNew, bikeTypes.length]);

  async function onSave() {
    setServerError(null);
    try {
      const name = values.name.trim();
      if (!name) {
        setServerError('Name is required');
        return;
      }
      if (!values.bikeTypeId) {
        setServerError('Pick a bike model');
        return;
      }
      if (isNew) {
        const created: ServiceTemplate = await create.mutateAsync({
          name,
          bikeTypeId: values.bikeTypeId,
          displayOrder: values.displayOrder,
        });
        navigate(`/services/templates/${created.id}/edit`, { replace: true });
      } else if (existing) {
        await update.mutateAsync({
          id: existing.id,
          name,
          bikeTypeId: values.bikeTypeId,
          displayOrder: values.displayOrder,
          isActive: values.isActive,
        });
      }
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Could not save template');
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-[12px] text-text-secondary">
          <Link
            to="/services/templates"
            className="inline-flex items-center gap-1 hover:text-text-primary"
          >
            <ArrowLeft className="h-3 w-3" /> Templates
          </Link>
          <span className="text-text-tertiary">/</span>
          <span className="text-text-primary">
            {isNew ? 'New service template' : existing?.name ?? '…'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="md"
            onClick={() => navigate('/services/templates')}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            size="md"
            onClick={onSave}
            disabled={create.isPending || update.isPending}
          >
            {isNew ? 'Create template' : 'Save'}
          </Button>
        </div>
      </div>

      <section className="rounded-lg border border-border-tertiary bg-background-primary p-4">
        <h2 className="mb-3 text-[13px] font-medium text-text-primary">Basics</h2>
        <div className="grid grid-cols-3 gap-3">
          <div className="grid gap-1">
            <Label htmlFor="tpl-name">Name</Label>
            <Input
              id="tpl-name"
              value={values.name}
              onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))}
              placeholder="e.g. Standard service"
            />
          </div>
          <div className="grid gap-1">
            <Label>Bike model</Label>
            <Select
              value={values.bikeTypeId}
              onValueChange={(v) => setValues((prev) => ({ ...prev, bikeTypeId: v }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Pick a model…" />
              </SelectTrigger>
              <SelectContent>
                {bikeTypes.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1">
            <Label htmlFor="tpl-order">Display order</Label>
            <Input
              id="tpl-order"
              type="number"
              value={values.displayOrder}
              onChange={(e) =>
                setValues((v) => ({
                  ...v,
                  displayOrder: Number(e.target.value) || 0,
                }))
              }
            />
          </div>
        </div>
      </section>

      {serverError ? (
        <div className="rounded-md bg-background-danger px-2.5 py-1.5 text-[12px] text-text-danger">
          {serverError}
        </div>
      ) : null}

      <section className="rounded-lg border border-border-tertiary bg-background-primary p-4">
        <h2 className="mb-3 text-[13px] font-medium text-text-primary">
          Parts consumed · per service
        </h2>
        {!id ? (
          <div className="rounded-md border border-dashed border-border-tertiary bg-background-secondary px-3 py-6 text-center text-text-tertiary">
            Save the template first, then add the parts list.
          </div>
        ) : !existing ? (
          <div className="px-1 py-4 text-text-tertiary">Loading…</div>
        ) : (
          <RecipeBuilder
            parentId={existing.id}
            parentType="service_template"
            parentName={existing.name}
            ingredients={ingredients}
            active={activeRecipe}
            showTargetYield={false}
          />
        )}
      </section>
    </div>
  );
}
