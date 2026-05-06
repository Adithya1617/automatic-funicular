import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import type { Ingredient } from '@shared/schemas/ingredient';
import type { IngredientSuggestion } from '@shared/invoiceTemplates/types';
import { Button } from '@renderer/components/ui/button';
import { Input } from '@renderer/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@renderer/components/ui/select';
import { TableCell, TableRow } from '@renderer/components/ui/table';
import { unitsCompatibleWithBase } from '@shared/constants/unitConversions';
import { DescriptionMappingPopover } from './DescriptionMappingPopover';

export type LineDraftRow = {
  key: string;
  rawDescription: string;
  ingredientId: string | null;
  quantity: number;
  unit: string;
  unitCost: number;
};

type Props = {
  draft: LineDraftRow;
  ingredients: Ingredient[];
  supplierId: string | null;
  /** Per-row template suggestion. Null when this row didn't come from a parsed PDF. */
  suggestion: IngredientSuggestion | null;
  disabled?: boolean;
  onChange: (next: LineDraftRow) => void;
  onRemove: () => void;
  onCreateNew: (suggestion: IngredientSuggestion) => void;
};

export function InvoiceLineRow({
  draft,
  ingredients,
  supplierId,
  suggestion,
  disabled,
  onChange,
  onRemove,
  onCreateNew,
}: Props) {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [totalDraft, setTotalDraft] = useState<string | null>(null);
  const child = draft.ingredientId
    ? ingredients.find((i) => i.id === draft.ingredientId)
    : null;
  const compatibleUnits = child
    ? unitsCompatibleWithBase(child.baseUnit)
    : ['g', 'kg', 'ml', 'L', 'each'];
  const derivedTotal = draft.quantity * draft.unitCost;
  const totalValue =
    totalDraft !== null
      ? totalDraft
      : Number.isFinite(derivedTotal) && derivedTotal !== 0
        ? String(Number(derivedTotal.toFixed(2)))
        : '';

  return (
    <TableRow>
      <TableCell className="w-[36%] align-top">
        <DescriptionMappingPopover
          open={popoverOpen && !disabled}
          onOpenChange={setPopoverOpen}
          supplierId={supplierId}
          partial={draft.rawDescription}
          ingredients={ingredients}
          selectedIngredientId={draft.ingredientId}
          suggestion={suggestion}
          onApplySuggestion={(s) => {
            onChange({
              ...draft,
              ingredientId: s.ingredientId,
              quantity: draft.quantity || s.defaultQuantity,
              unit: draft.unit || s.defaultUnit,
              unitCost: draft.unitCost || s.lastUnitCost,
            });
            setPopoverOpen(false);
          }}
          onPickIngredient={(id) => {
            const picked = ingredients.find((i) => i.id === id);
            onChange({
              ...draft,
              ingredientId: id,
              unit: draft.unit || picked?.baseUnit || draft.unit,
            });
            setPopoverOpen(false);
          }}
          onCreateNew={(s) => {
            setPopoverOpen(false);
            onCreateNew(s);
          }}
          anchor={
            <Input
              placeholder="e.g. DAIRYFRESH PANEER 1KG"
              value={draft.rawDescription}
              onChange={(e) =>
                onChange({ ...draft, rawDescription: e.target.value })
              }
              onFocus={() => setPopoverOpen(true)}
              onClick={() => setPopoverOpen(true)}
              disabled={disabled}
              maxLength={500}
            />
          }
        />
        <div className="mt-1 text-[10px]">
          {child ? (
            <span className="text-text-success">
              mapped → <span className="font-medium">{child.name}</span>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setPopoverOpen(true)}
              disabled={disabled}
              className="text-text-warning underline-offset-2 hover:underline disabled:cursor-not-allowed disabled:opacity-50"
            >
              needs mapping → click to assign
            </button>
          )}
        </div>
      </TableCell>
      <TableCell className="w-[90px] align-top">
        <Input
          type="number"
          step="any"
          min={0}
          value={Number.isFinite(draft.quantity) ? draft.quantity : ''}
          onChange={(e) => {
            const newQty = Number(e.target.value);
            const oldTotal = draft.quantity * draft.unitCost;
            const newUnitCost =
              newQty > 0 && Number.isFinite(oldTotal)
                ? oldTotal / newQty
                : draft.unitCost;
            onChange({ ...draft, quantity: newQty, unitCost: newUnitCost });
          }}
          disabled={disabled}
        />
      </TableCell>
      <TableCell className="w-[80px] align-top">
        <Select
          value={draft.unit || undefined}
          onValueChange={(v) => onChange({ ...draft, unit: v })}
          disabled={disabled || !child}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {compatibleUnits.map((u) => (
              <SelectItem key={u} value={u}>
                {u}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell className="w-[130px] align-top">
        <Input
          type="number"
          step="any"
          min={0}
          value={totalValue}
          onChange={(e) => {
            const v = e.target.value;
            setTotalDraft(v);
            const num = Number(v);
            if (Number.isFinite(num) && draft.quantity > 0) {
              onChange({ ...draft, unitCost: num / draft.quantity });
            } else if (v === '' || num === 0) {
              onChange({ ...draft, unitCost: 0 });
            }
          }}
          onBlur={() => setTotalDraft(null)}
          disabled={disabled}
          className="text-right tabular-nums"
        />
      </TableCell>
      <TableCell className="w-[44px] text-right align-top">
        {!disabled ? (
          <Button type="button" variant="ghost" size="sm" onClick={onRemove} aria-label="Remove row">
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        ) : null}
      </TableCell>
    </TableRow>
  );
}
