import type { Ingredient } from '@shared/schemas/ingredient';
import { toBase } from '@shared/utils/unitConverter';

type Row = {
  childIngredientId: string;
  quantity: number;
  unit: string;
};

/**
 * Sum row quantity (converted to child base unit) × child.currentAvgCostPerUnit.
 * Mirrors the eventual server-side compute. If a row references an unknown
 * ingredient or an incompatible unit, that row contributes 0 — keeps the UI
 * from blowing up while the user is mid-edit.
 */
export function computeRecipeCost(rows: Row[], ingredients: Ingredient[]): number {
  const byId = new Map(ingredients.map((i) => [i.id, i]));
  let total = 0;
  for (const row of rows) {
    const child = byId.get(row.childIngredientId);
    if (!child) continue;
    try {
      const baseQty = toBase(row.quantity, row.unit, child.baseUnit, {
        densityGPerMl: child.densityGPerMl ?? undefined,
      });
      total += baseQty * child.currentAvgCostPerUnit;
    } catch {
      /* incompatible unit — render as 0 contribution */
    }
  }
  return total;
}

export function computeFoodCostPercent(recipeCost: number, sellingPrice: number): number | null {
  if (sellingPrice <= 0) return null;
  return (recipeCost / sellingPrice) * 100;
}
