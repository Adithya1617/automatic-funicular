import type { Ingredient } from '@shared/schemas/ingredient';
import type { RecipeIngredient } from '@shared/schemas/recipe';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@renderer/components/ui/dialog';
import { Button } from '@renderer/components/ui/button';

type DraftRow = {
  childIngredientId: string;
  quantity: number;
  unit: string;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ingredients: Ingredient[];
  activeRows: RecipeIngredient[];
  draftRows: DraftRow[];
};

type DiffEntry =
  | { kind: 'added'; ingredientId: string; quantity: number; unit: string }
  | { kind: 'removed'; ingredientId: string; quantity: number; unit: string }
  | {
      kind: 'changed';
      ingredientId: string;
      from: { quantity: number; unit: string };
      to: { quantity: number; unit: string };
    }
  | { kind: 'unchanged'; ingredientId: string; quantity: number; unit: string };

function diff(active: RecipeIngredient[], draft: DraftRow[]): DiffEntry[] {
  const out: DiffEntry[] = [];
  const draftById = new Map<string, DraftRow>();
  for (const row of draft) {
    if (row.childIngredientId) draftById.set(row.childIngredientId, row);
  }
  const seenInDraft = new Set<string>();

  for (const a of active) {
    const d = draftById.get(a.childIngredientId);
    if (!d) {
      out.push({
        kind: 'removed',
        ingredientId: a.childIngredientId,
        quantity: a.quantity,
        unit: a.unit,
      });
      continue;
    }
    seenInDraft.add(a.childIngredientId);
    if (d.quantity !== a.quantity || d.unit !== a.unit) {
      out.push({
        kind: 'changed',
        ingredientId: a.childIngredientId,
        from: { quantity: a.quantity, unit: a.unit },
        to: { quantity: d.quantity, unit: d.unit },
      });
    } else {
      out.push({
        kind: 'unchanged',
        ingredientId: a.childIngredientId,
        quantity: a.quantity,
        unit: a.unit,
      });
    }
  }
  for (const d of draft) {
    if (!d.childIngredientId) continue;
    if (seenInDraft.has(d.childIngredientId)) continue;
    out.push({
      kind: 'added',
      ingredientId: d.childIngredientId,
      quantity: d.quantity,
      unit: d.unit,
    });
  }
  return out;
}

export function RecipeDiffModal({ open, onOpenChange, ingredients, activeRows, draftRows }: Props) {
  const entries = diff(activeRows, draftRows);
  const ingredientById = new Map(ingredients.map((i) => [i.id, i]));

  const added = entries.filter((e): e is Extract<DiffEntry, { kind: 'added' }> => e.kind === 'added');
  const removed = entries.filter(
    (e): e is Extract<DiffEntry, { kind: 'removed' }> => e.kind === 'removed',
  );
  const changed = entries.filter(
    (e): e is Extract<DiffEntry, { kind: 'changed' }> => e.kind === 'changed',
  );

  const summary = `${added.length} added · ${removed.length} removed · ${changed.length} changed`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[640px]">
        <DialogHeader>
          <DialogTitle>Recipe diff</DialogTitle>
          <DialogDescription>{summary}</DialogDescription>
        </DialogHeader>

        {entries.length === 0 ? (
          <div className="rounded-md border border-dashed border-border-tertiary bg-background-secondary px-3 py-4 text-center text-text-tertiary">
            No changes vs. active version.
          </div>
        ) : (
          <div className="grid gap-2">
            {added.map((e) => (
              <Row
                key={`a-${e.ingredientId}`}
                bar="bg-text-success"
                label={ingredientById.get(e.ingredientId)?.name ?? e.ingredientId}
                detail={`${e.quantity} ${e.unit} (added)`}
                kind="added"
              />
            ))}
            {removed.map((e) => (
              <Row
                key={`r-${e.ingredientId}`}
                bar="bg-text-danger"
                label={ingredientById.get(e.ingredientId)?.name ?? e.ingredientId}
                detail={`${e.quantity} ${e.unit} (removed)`}
                kind="removed"
              />
            ))}
            {changed.map((e) => (
              <Row
                key={`c-${e.ingredientId}`}
                bar="bg-text-warning"
                label={ingredientById.get(e.ingredientId)?.name ?? e.ingredientId}
                detail={`${e.from.quantity} ${e.from.unit} → ${e.to.quantity} ${e.to.unit}`}
                kind="changed"
              />
            ))}
          </div>
        )}

        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="primary" size="md">Close</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Row({
  bar,
  label,
  detail,
  kind,
}: {
  bar: string;
  label: string;
  detail: string;
  kind: 'added' | 'removed' | 'changed';
}) {
  const tagClass =
    kind === 'added'
      ? 'bg-background-success text-text-success'
      : kind === 'removed'
        ? 'bg-background-danger text-text-danger'
        : 'bg-background-warning text-text-warning';
  return (
    <div className="flex items-center gap-3 rounded-md border border-border-tertiary bg-background-primary p-2">
      <div className={`h-7 w-1 shrink-0 rounded-full ${bar}`} />
      <div className="flex-1">
        <div className="text-[12px] font-medium text-text-primary">{label}</div>
        <div className="text-[11px] text-text-secondary">{detail}</div>
      </div>
      <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${tagClass}`}>{kind}</span>
    </div>
  );
}
