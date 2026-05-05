import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, Sliders, Users } from 'lucide-react';
import { Button } from '@renderer/components/ui/button';
import { Input } from '@renderer/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@renderer/components/ui/select';
import { useIngredients } from '@renderer/hooks/ipc/useIngredients';
import { IngredientsTable } from '@renderer/features/ingredients/IngredientsTable';
import { IngredientDetailPanel } from '@renderer/features/ingredients/IngredientDetailPanel';
import { ManualAdjustmentDialog } from '@renderer/features/ingredients/ManualAdjustmentDialog';
import { NewIngredientDialog } from '@renderer/features/ingredients/NewIngredientDialog';
import { ManageSuppliersDialog } from '@renderer/features/suppliers/ManageSuppliersDialog';
import { INGREDIENT_TYPES, type IngredientType } from '@shared/constants/enums';

const TYPE_FILTER_VALUES = ['all', ...INGREDIENT_TYPES] as const;
type TypeFilter = (typeof TYPE_FILTER_VALUES)[number];

export function IngredientsPage() {
  const [params, setParams] = useSearchParams();
  const selectedId = params.get('selected') ?? undefined;

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');

  const filter = useMemo(() => {
    const f: Parameters<typeof useIngredients>[0] = { includeInactive: false };
    if (search.trim()) f.search = search.trim();
    if (typeFilter !== 'all') f.type = typeFilter as IngredientType;
    return f;
  }, [search, typeFilter]);

  const { data: ingredients = [], isLoading } = useIngredients(filter);

  const selectedIngredient = useMemo(
    () => ingredients.find((i) => i.id === selectedId),
    [ingredients, selectedId],
  );

  const [adjustOpen, setAdjustOpen] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [suppliersOpen, setSuppliersOpen] = useState(false);

  function handleSelect(id: string) {
    const next = new URLSearchParams(params);
    next.set('selected', id);
    setParams(next, { replace: true });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-1 items-center gap-2">
          <Input
            placeholder="Search ingredients…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-[320px]"
          />
          <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as TypeFilter)}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Type: all</SelectItem>
              {INGREDIENT_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            size="md"
            onClick={() => setSuppliersOpen(true)}
          >
            <Users className="h-3.5 w-3.5" /> Manage suppliers
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="md"
            disabled={!selectedIngredient}
            onClick={() => setAdjustOpen(true)}
          >
            <Sliders className="h-3.5 w-3.5" /> Adjust stock
          </Button>
          <Button
            type="button"
            variant="primary"
            size="md"
            onClick={() => setNewOpen(true)}
          >
            <Plus className="h-3.5 w-3.5" /> New ingredient
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="rounded-lg border border-border-tertiary bg-background-primary px-4 py-6 text-text-tertiary">
          Loading ingredients…
        </div>
      ) : (
        <IngredientsTable rows={ingredients} selectedId={selectedId} onSelect={handleSelect} />
      )}

      {selectedIngredient ? (
        <IngredientDetailPanel ingredient={selectedIngredient} />
      ) : null}

      <ManualAdjustmentDialog
        open={adjustOpen}
        onOpenChange={setAdjustOpen}
        ingredient={selectedIngredient ?? null}
      />
      <NewIngredientDialog open={newOpen} onOpenChange={setNewOpen} />
      <ManageSuppliersDialog open={suppliersOpen} onOpenChange={setSuppliersOpen} />
    </div>
  );
}
