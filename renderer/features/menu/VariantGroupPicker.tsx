import type { MenuItem } from '@shared/schemas/menuItem';
import { Label } from '@renderer/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@renderer/components/ui/select';

type Props = {
  value: string | null;
  onChange: (next: string | null) => void;
  /** All current menu items — we mine variant_group_id values from them. */
  menuItems: MenuItem[];
  /** The current item's id, so we don't list its own group as an "other" option. */
  selfId?: string;
};

export function VariantGroupPicker({ value, onChange, menuItems, selfId }: Props) {
  // Bucket items by group; show a representative sibling name as the option label.
  const groups = new Map<string, MenuItem[]>();
  for (const item of menuItems) {
    if (!item.variantGroupId) continue;
    if (item.id === selfId) continue;
    const list = groups.get(item.variantGroupId) ?? [];
    list.push(item);
    groups.set(item.variantGroupId, list);
  }

  return (
    <div className="grid gap-1">
      <Label>Variant group</Label>
      <Select
        value={value ?? '__none__'}
        onValueChange={(v) => onChange(v === '__none__' ? null : v)}
      >
        <SelectTrigger>
          <SelectValue placeholder="Standalone" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">Standalone (no group)</SelectItem>
          {[...groups.entries()].map(([groupId, siblings]) => {
            const labelSrc = siblings[0];
            if (!labelSrc) return null;
            return (
              <SelectItem key={groupId} value={groupId}>
                Group of {siblings.length + 1}: {labelSrc.name}
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
      <span className="text-[10px] text-text-tertiary">
        Variants of the same dish (sizes, spice levels) share a group so the menu groups them together.
      </span>
    </div>
  );
}
