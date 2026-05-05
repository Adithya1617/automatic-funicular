import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Trash2 } from 'lucide-react';
import type { Ingredient } from '@shared/schemas/ingredient';
import { Badge } from '@renderer/components/ui/badge';
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

export type DraftRow = {
  /** Stable per-row id used for drag-and-drop tracking; not persisted. */
  key: string;
  childIngredientId: string;
  quantity: number;
  unit: string;
  notes: string;
};

type Props = {
  draft: DraftRow;
  ingredients: Ingredient[];
  excludeIngredientId?: string;
  onChange: (next: DraftRow) => void;
  onRemove: () => void;
};

export function RecipeRow({ draft, ingredients, excludeIngredientId, onChange, onRemove }: Props) {
  const sortable = useSortable({ id: draft.key });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(sortable.transform),
    transition: sortable.transition,
    opacity: sortable.isDragging ? 0.4 : 1,
  };

  const child = ingredients.find((i) => i.id === draft.childIngredientId);
  const compatibleUnits = child ? unitsCompatibleWithBase(child.baseUnit) : ['g', 'ml', 'each'];
  const pickable = ingredients.filter((i) => i.isActive && i.id !== excludeIngredientId);

  return (
    <TableRow ref={sortable.setNodeRef} style={style}>
      <TableCell className="w-[28px] px-1">
        <button
          type="button"
          {...sortable.attributes}
          {...sortable.listeners}
          aria-label="Drag to reorder"
          className="flex h-[28px] w-[20px] cursor-grab items-center justify-center text-text-tertiary hover:text-text-primary active:cursor-grabbing"
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>
      </TableCell>
      <TableCell className="w-[40%]">
        <Select
          value={draft.childIngredientId || undefined}
          onValueChange={(v) => {
            const picked = ingredients.find((i) => i.id === v);
            onChange({
              ...draft,
              childIngredientId: v,
              unit: picked ? picked.baseUnit : draft.unit,
            });
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder="Pick ingredient" />
          </SelectTrigger>
          <SelectContent>
            {pickable.map((ing) => (
              <SelectItem key={ing.id} value={ing.id}>
                <span className="inline-flex items-center gap-1.5">
                  {ing.name}
                  {ing.type === 'prepared' ? (
                    <Badge variant="prepared" className="text-[9px]">
                      prep
                    </Badge>
                  ) : null}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell className="w-[100px]">
        <Input
          type="number"
          step="any"
          min={0}
          value={Number.isFinite(draft.quantity) ? draft.quantity : ''}
          onChange={(e) => onChange({ ...draft, quantity: Number(e.target.value) })}
        />
      </TableCell>
      <TableCell className="w-[90px]">
        <Select
          value={draft.unit}
          onValueChange={(v) => onChange({ ...draft, unit: v })}
          disabled={!child}
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
      <TableCell>
        <Input
          placeholder="optional notes"
          value={draft.notes}
          onChange={(e) => onChange({ ...draft, notes: e.target.value })}
          maxLength={200}
        />
      </TableCell>
      <TableCell className="w-[44px] text-right">
        <Button type="button" variant="ghost" size="sm" onClick={onRemove} aria-label="Remove row">
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </TableCell>
    </TableRow>
  );
}
