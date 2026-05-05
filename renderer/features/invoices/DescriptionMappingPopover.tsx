import type { Ingredient } from '@shared/schemas/ingredient';
import type { SupplierItemMapping } from '@shared/schemas/supplierItemMapping';
import type { IngredientSuggestion } from '@shared/invoiceTemplates/types';
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from '@renderer/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@renderer/components/ui/select';
import { Button } from '@renderer/components/ui/button';
import { useSupplierItemSuggestions } from '@renderer/hooks/ipc/useSupplierItemMapping';
import { rankIngredientMatches } from '@shared/invoiceTemplates/match';
import { formatINR } from '@shared/utils/currency';
import { formatDateDMY } from '@shared/utils/date';

export type AppliedSuggestion = {
  ingredientId: string;
  defaultQuantity: number;
  defaultUnit: string;
  lastUnitCost: number;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  anchor: React.ReactNode;
  supplierId: string | null;
  partial: string;
  ingredients: Ingredient[];
  selectedIngredientId: string | null;
  /** Suggested name+unit+category derived from the parsed line. Null when no template suggestion is available. */
  suggestion: IngredientSuggestion | null;
  onApplySuggestion: (suggestion: AppliedSuggestion) => void;
  onPickIngredient: (ingredientId: string) => void;
  onCreateNew: (suggestion: IngredientSuggestion) => void;
};

export function DescriptionMappingPopover({
  open,
  onOpenChange,
  anchor,
  supplierId,
  partial,
  ingredients,
  selectedIngredientId,
  suggestion,
  onApplySuggestion,
  onPickIngredient,
  onCreateNew,
}: Props) {
  const { data: suggestions = [] } = useSupplierItemSuggestions(
    supplierId ? { supplierId, partial, limit: 8 } : null,
  );
  const ingredientById = new Map(ingredients.map((i) => [i.id, i]));

  // Fuzzy-match candidates from the suggestion (when no past mapping rules the row).
  const fuzzyCandidates = suggestion
    ? rankIngredientMatches(suggestion.name, ingredients)
    : [];

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverAnchor asChild>{anchor}</PopoverAnchor>
      <PopoverContent
        className="w-[420px] max-w-none"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {!supplierId ? (
          <div className="px-2 py-2 text-[11px] text-text-tertiary">
            Pick a supplier first to see history.
          </div>
        ) : suggestions.length === 0 ? (
          <div className="px-2 py-2 text-[11px] text-text-tertiary">
            No mappings yet for this supplier.
          </div>
        ) : (
          <>
            <div className="px-2 pb-1 pt-1 text-[10px] uppercase tracking-wider text-text-tertiary">
              Past mappings
            </div>
            <div className="flex flex-col">
              {suggestions.map((s: SupplierItemMapping) => {
                const ing = ingredientById.get(s.ingredientId);
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() =>
                      onApplySuggestion({
                        ingredientId: s.ingredientId,
                        defaultQuantity: s.defaultQuantity,
                        defaultUnit: s.defaultUnit,
                        lastUnitCost: s.lastUnitCost,
                      })
                    }
                    className="flex flex-col gap-0.5 rounded-md px-2 py-1.5 text-left hover:bg-background-tertiary"
                  >
                    <span className="text-[12px] text-text-primary">
                      {s.rawDescription}
                      <span className="ml-1 text-text-tertiary">→</span>{' '}
                      <span className="font-medium">{ing?.name ?? s.ingredientId}</span>
                    </span>
                    <span className="text-[10px] text-text-tertiary">
                      last: {s.defaultQuantity} {s.defaultUnit} @ {formatINR(s.lastUnitCost)}
                      /{s.defaultUnit} · {formatDateDMY(s.lastUsedAt)}
                    </span>
                  </button>
                );
              })}
            </div>
          </>
        )}

        {fuzzyCandidates.length > 0 ? (
          <div className="mt-1 border-t border-border-tertiary px-2 pt-2">
            <div className="text-[10px] uppercase tracking-wider text-text-tertiary">
              Looks like
            </div>
            <div className="mt-1 flex flex-wrap gap-1">
              {fuzzyCandidates.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => onPickIngredient(c.id)}
                  className="rounded-md border border-border-tertiary bg-background-secondary px-2 py-1 text-[11px] text-text-primary hover:bg-background-tertiary"
                >
                  {c.name}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {suggestion ? (
          <div className="mt-1 border-t border-border-tertiary px-2 pt-2">
            <Button
              type="button"
              variant="primary"
              size="sm"
              className="w-full"
              onClick={() => onCreateNew(suggestion)}
            >
              + Create new ingredient: {suggestion.name || '(name this)'}
              {suggestion.baseUnit ? ` (${suggestion.baseUnit}` : ''}
              {suggestion.category ? `, ${suggestion.category})` : suggestion.baseUnit ? ')' : ''}
            </Button>
          </div>
        ) : null}

        <div className="mt-1 border-t border-border-tertiary px-2 pt-2">
          <div className="text-[10px] uppercase tracking-wider text-text-tertiary">
            Map to existing ingredient
          </div>
          <div className="mt-1">
            <Select
              value={selectedIngredientId ?? undefined}
              onValueChange={(v) => onPickIngredient(v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Pick ingredient" />
              </SelectTrigger>
              <SelectContent>
                {ingredients
                  .filter((i) => i.isActive)
                  .map((ing) => (
                    <SelectItem key={ing.id} value={ing.id}>
                      {ing.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
