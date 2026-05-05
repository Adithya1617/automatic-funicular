import type { Ingredient } from '@shared/schemas/ingredient';
import type { SupplierItemMapping } from '@shared/schemas/supplierItemMapping';
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
import { useSupplierItemSuggestions } from '@renderer/hooks/ipc/useSupplierItemMapping';
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
  onApplySuggestion: (suggestion: AppliedSuggestion) => void;
  onPickIngredient: (ingredientId: string) => void;
};

export function DescriptionMappingPopover({
  open,
  onOpenChange,
  anchor,
  supplierId,
  partial,
  ingredients,
  selectedIngredientId,
  onApplySuggestion,
  onPickIngredient,
}: Props) {
  const { data: suggestions = [] } = useSupplierItemSuggestions(
    supplierId ? { supplierId, partial, limit: 8 } : null,
  );

  const ingredientById = new Map(ingredients.map((i) => [i.id, i]));

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
            No mappings yet for this supplier. Pick an ingredient below to map this line.
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
        <div className="mt-1 border-t border-border-tertiary px-2 pt-2">
          <div className="text-[10px] uppercase tracking-wider text-text-tertiary">
            Map to ingredient
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
