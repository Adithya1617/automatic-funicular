import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import type { Ingredient } from '@shared/schemas/ingredient';
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
import { formatINR } from '@shared/utils/currency';
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
  disabled?: boolean;
  onChange: (next: LineDraftRow) => void;
  onRemove: () => void;
};

export function InvoiceLineRow({
  draft,
  ingredients,
  supplierId,
  disabled,
  onChange,
  onRemove,
}: Props) {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const child = draft.ingredientId
    ? ingredients.find((i) => i.id === draft.ingredientId)
    : null;
  const compatibleUnits = child
    ? unitsCompatibleWithBase(child.baseUnit)
    : ['g', 'kg', 'ml', 'L', 'each'];
  const total = draft.quantity * draft.unitCost;

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
          anchor={
            <Input
              placeholder="e.g. DAIRYFRESH PANEER 1KG"
              value={draft.rawDescription}
              onChange={(e) =>
                onChange({ ...draft, rawDescription: e.target.value })
              }
              onFocus={() => setPopoverOpen(true)}
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
            <span className="text-text-warning">needs mapping → click to assign</span>
          )}
        </div>
      </TableCell>
      <TableCell className="w-[90px] align-top">
        <Input
          type="number"
          step="any"
          min={0}
          value={Number.isFinite(draft.quantity) ? draft.quantity : ''}
          onChange={(e) =>
            onChange({ ...draft, quantity: Number(e.target.value) })
          }
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
      <TableCell className="w-[110px] align-top">
        <Input
          type="number"
          step="any"
          min={0}
          value={Number.isFinite(draft.unitCost) ? draft.unitCost : ''}
          onChange={(e) =>
            onChange({ ...draft, unitCost: Number(e.target.value) })
          }
          disabled={disabled}
        />
      </TableCell>
      <TableCell className="w-[110px] text-right align-top tabular-nums">
        {formatINR(total)}
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
