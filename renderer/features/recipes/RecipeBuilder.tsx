import { useEffect, useState } from 'react';
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { Plus } from 'lucide-react';
import type { Ingredient } from '@shared/schemas/ingredient';
import type { RecipeWithIngredients } from '@shared/schemas/recipe';
import type { RecipeParentType } from '@shared/constants/recipe';
import { Button } from '@renderer/components/ui/button';
import { Input } from '@renderer/components/ui/input';
import { Label } from '@renderer/components/ui/label';
import { Table, TableBody, TableHead, TableHeader, TableRow } from '@renderer/components/ui/table';
import { useSaveRecipeVersion } from '@renderer/hooks/ipc/useRecipe';
import { RecipeRow, type DraftRow } from './RecipeRow';
import { RecipeDiffModal } from '@renderer/features/menu/RecipeDiffModal';

type Props = {
  parentId: string;
  parentType: RecipeParentType;
  /** Display label for the parent — shown next to "Save new version". */
  parentName: string;
  /** Used to label "Target yield (unit)"; falls back to "serving(s)" for menu items. */
  parentBaseUnit?: 'g' | 'ml' | 'each';
  /** Drives the unit-compatibility checks; raw + prepared. */
  ingredients: Ingredient[];
  active: RecipeWithIngredients | null;
  /** Whether to show the target-yield input. Menu items default to 1 serving. */
  showTargetYield?: boolean;
  /** Optional summary card rendered to the right of the basic fields. */
  rightSummary?: React.ReactNode;
  /** Called whenever the in-memory draft changes — parent uses this to drive
   *  the live food-cost / availability summary. */
  onDraftChange?: (rows: DraftRow[]) => void;
};

let rowKeyCounter = 0;
const nextRowKey = (): string => `r-${++rowKeyCounter}`;

function emptyRow(): DraftRow {
  return { key: nextRowKey(), childIngredientId: '', quantity: 0, unit: 'g', notes: '' };
}

function rowsFromActive(active: RecipeWithIngredients | null): DraftRow[] {
  if (!active) return [emptyRow()];
  return active.ingredients
    .slice()
    .sort((a, b) => a.displayOrder - b.displayOrder)
    .map((row) => ({
      key: nextRowKey(),
      childIngredientId: row.childIngredientId,
      quantity: row.quantity,
      unit: row.unit,
      notes: row.notes ?? '',
    }));
}

export function RecipeBuilder({
  parentId,
  parentType,
  parentName,
  parentBaseUnit,
  ingredients,
  active,
  showTargetYield = true,
  rightSummary,
  onDraftChange,
}: Props) {
  const save = useSaveRecipeVersion();
  const [rows, setRows] = useState<DraftRow[]>(() => rowsFromActive(active));
  const [targetYield, setTargetYield] = useState<number>(active?.targetYield ?? 1);
  const [notes, setNotes] = useState<string>(active?.notes ?? '');
  const [serverError, setServerError] = useState<string | null>(null);
  const [diffOpen, setDiffOpen] = useState(false);

  useEffect(() => {
    setRows(rowsFromActive(active));
    setTargetYield(active?.targetYield ?? 1);
    setNotes(active?.notes ?? '');
  }, [active?.id]);

  useEffect(() => {
    onDraftChange?.(rows);
  }, [rows, onDraftChange]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const allRowsValid = rows.every((r) => r.childIngredientId && r.quantity > 0 && r.unit);

  function handleDragEnd(event: DragEndEvent) {
    const { active: a, over } = event;
    if (!over || a.id === over.id) return;
    setRows((prev) => {
      const oldIndex = prev.findIndex((r) => r.key === a.id);
      const newIndex = prev.findIndex((r) => r.key === over.id);
      if (oldIndex < 0 || newIndex < 0) return prev;
      return arrayMove(prev, oldIndex, newIndex);
    });
  }

  async function handleSave() {
    setServerError(null);
    try {
      await save.mutateAsync({
        parentId,
        parentType,
        targetYield: showTargetYield ? targetYield : 1,
        notes: notes.trim() || null,
        rows: rows.map((row, idx) => ({
          childIngredientId: row.childIngredientId,
          quantity: row.quantity,
          unit: row.unit,
          notes: row.notes.trim() || null,
          displayOrder: idx,
        })),
      });
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Could not save recipe');
    }
  }

  const yieldUnitLabel = parentBaseUnit ?? 'serving';

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-end justify-between gap-3">
        <div className="grid max-w-[460px] flex-1 grid-cols-2 gap-2">
          {showTargetYield ? (
            <div className="grid gap-1">
              <Label htmlFor="target-yield">Target yield ({yieldUnitLabel})</Label>
              <Input
                id="target-yield"
                type="number"
                min={0}
                step="any"
                value={Number.isFinite(targetYield) ? targetYield : ''}
                onChange={(e) => setTargetYield(Number(e.target.value))}
              />
            </div>
          ) : (
            <div />
          )}
          <div className="grid gap-1">
            <Label htmlFor="recipe-notes">Notes</Label>
            <Input
              id="recipe-notes"
              maxLength={500}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="optional"
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          {active ? (
            <span className="text-[11px] text-text-tertiary">
              v{active.versionNumber} active · {parentName}
            </span>
          ) : (
            <span className="text-[11px] text-text-tertiary">Draft v1 · {parentName}</span>
          )}
          {active ? (
            <Button type="button" variant="secondary" size="md" onClick={() => setDiffOpen(true)}>
              Show diff
            </Button>
          ) : null}
          <Button
            type="button"
            variant="primary"
            size="md"
            onClick={handleSave}
            disabled={
              save.isPending ||
              rows.length === 0 ||
              !allRowsValid ||
              (showTargetYield && !(targetYield > 0))
            }
          >
            {active ? 'Save new version' : 'Save recipe'}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-[1fr_auto] gap-4">
        <div className="overflow-hidden rounded-lg border border-border-tertiary bg-background-primary">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead />
                <TableHead>Ingredient</TableHead>
                <TableHead>Qty</TableHead>
                <TableHead>Unit</TableHead>
                <TableHead>Notes</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={rows.map((r) => r.key)} strategy={verticalListSortingStrategy}>
                  {rows.map((row, idx) => (
                    <RecipeRow
                      key={row.key}
                      draft={row}
                      ingredients={ingredients}
                      excludeIngredientId={parentType === 'ingredient' ? parentId : undefined}
                      onChange={(next) =>
                        setRows((prev) => prev.map((r, i) => (i === idx ? next : r)))
                      }
                      onRemove={() =>
                        setRows((prev) => (prev.length === 1 ? [emptyRow()] : prev.filter((_, i) => i !== idx)))
                      }
                    />
                  ))}
                </SortableContext>
              </DndContext>
            </TableBody>
          </Table>
          <button
            type="button"
            onClick={() => setRows((prev) => [...prev, emptyRow()])}
            className="flex w-full items-center justify-center gap-1 border-t border-border-tertiary py-2 text-[11px] italic text-text-info hover:bg-background-tertiary"
          >
            <Plus className="h-3 w-3" /> Add ingredient
          </button>
        </div>
        {rightSummary ? <div className="w-[200px]">{rightSummary}</div> : null}
      </div>

      {serverError ? (
        <div className="rounded-md bg-background-danger px-2.5 py-1.5 text-[12px] text-text-danger">
          {serverError}
        </div>
      ) : null}

      {active ? (
        <RecipeDiffModal
          open={diffOpen}
          onOpenChange={setDiffOpen}
          ingredients={ingredients}
          activeRows={active.ingredients.slice().sort((a, b) => a.displayOrder - b.displayOrder)}
          draftRows={rows.map((row, idx) => ({
            childIngredientId: row.childIngredientId,
            quantity: row.quantity,
            unit: row.unit,
            displayOrder: idx,
          }))}
        />
      ) : null}
    </div>
  );
}
