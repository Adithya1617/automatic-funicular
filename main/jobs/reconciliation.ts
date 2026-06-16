import type { AppDb } from '../db/client';
import { ingredientRepository } from '../repositories/ingredientRepository';
import { stockMovementRepository } from '../repositories/stockMovementRepository';

export type ReconciliationDrift = {
  ingredientId: string;
  ingredientName: string;
  storedStock: number;
  movementSum: number;
  drift: number;
};

const DRIFT_TOLERANCE = 1e-6;

/**
 * Sum every ingredient's signed stock movements and compare to the
 * cached stock_quantity. Per locked decision §3.1 / §5.1, any drift is
 * a defect — never silently ignored. Returns drift entries; main process
 * logs them and surfaces via `app:reconciliation` later.
 */
export async function runReconciliation(
  db: AppDb,
  tenantId: number,
): Promise<ReconciliationDrift[]> {
  const ingredients = await ingredientRepository.list(db, tenantId, { includeInactive: true });
  const sums = await stockMovementRepository.sumByIngredient(db, tenantId);
  const sumByIngredientId = new Map(sums.map((s) => [s.ingredientId, s.total]));

  const drifts: ReconciliationDrift[] = [];
  for (const ing of ingredients) {
    const movementSum = sumByIngredientId.get(ing.id) ?? 0;
    const drift = ing.stockQuantity - movementSum;
    if (Math.abs(drift) > DRIFT_TOLERANCE) {
      drifts.push({
        ingredientId: ing.id,
        ingredientName: ing.name,
        storedStock: ing.stockQuantity,
        movementSum,
        drift,
      });
    }
  }
  latest = { ranAtMs: Date.now(), drifts };
  return drifts;
}

export type ReconciliationSnapshot = {
  ranAtMs: number;
  drifts: ReconciliationDrift[];
};

let latest: ReconciliationSnapshot | null = null;

export function latestReconciliationSnapshot(): ReconciliationSnapshot | null {
  return latest;
}
