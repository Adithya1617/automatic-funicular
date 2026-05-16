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
import { PART_CATEGORIES } from '@shared/constants/enums';

const CATEGORY_FILTER_VALUES = ['all', ...PART_CATEGORIES] as const;
type CategoryFilter = (typeof CATEGORY_FILTER_VALUES)[number];

export function IngredientsPage() {
  const [params, setParams] = useSearchParams();
  const selectedId = params.get('selected') ?? undefined;

  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');

  const filter = useMemo(() => {
    const f: Parameters<typeof useIngredients>[0] = { includeInactive: false };
    if (search.trim()) f.search = search.trim();
    if (categoryFilter !== 'all') f.category = categoryFilter;
    return f;
  }, [search, categoryFilter]);

  const { data: parts = [], isLoading } = useIngredients(filter);

  const selectedPart = useMemo(
    () => parts.find((p) => p.id === selectedId),
    [parts, selectedId],
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
            placeholder="Search parts…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-[320px]"
          />
          <Select value={categoryFilter} onValueChange={(v) => setCategoryFilter(v as CategoryFilter)}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {PART_CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
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
            disabled={!selectedPart}
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
            <Plus className="h-3.5 w-3.5" /> New part
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="rounded-lg border border-border-tertiary bg-background-primary px-4 py-6 text-text-tertiary">
          Loading parts…
        </div>
      ) : (
        <IngredientsTable rows={parts} selectedId={selectedId} onSelect={handleSelect} />
      )}

      {selectedPart ? (
        <IngredientDetailPanel ingredient={selectedPart} />
      ) : null}

      <ManualAdjustmentDialog
        open={adjustOpen}
        onOpenChange={setAdjustOpen}
        ingredient={selectedPart ?? null}
      />
      <NewIngredientDialog open={newOpen} onOpenChange={setNewOpen} />
      <ManageSuppliersDialog open={suppliersOpen} onOpenChange={setSuppliersOpen} />
    </div>
  );
}
