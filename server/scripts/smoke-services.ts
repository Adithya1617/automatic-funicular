/**
 * W1 round-trip smoke test: drive the now-async services against the Docker
 * Postgres. Exercises reads, a transaction-bearing write (recordPurchase →
 * stock_movement + stock update in one tx), and reconciliation.
 *
 *   npx tsx server/scripts/smoke-services.ts
 */
import { join } from 'node:path';
import { openDb } from '../db/client';
import { DEFAULT_TENANT_ID } from '../../shared/constants/system';
import { IngredientService } from '../../main/services/IngredientService';
import { BikeService } from '../../main/services/BikeService';
import { InventoryService } from '../../main/services/InventoryService';
import { runReconciliation } from '../../main/jobs/reconciliation';

async function main(): Promise<void> {
  const connectionString =
    process.env.DATABASE_URL ?? 'postgres://hyprride:hyprride@localhost:5433/hyprride';
  const migrationsFolder = join(process.cwd(), 'server', 'db', 'migrations');
  const { db, close } = await openDb({ connectionString, migrationsFolder });

  const parts = await IngredientService.list(db, DEFAULT_TENANT_ID, { includeInactive: false });
  console.log(`IngredientService.list      -> ${parts.length} parts`);

  const bikeTypes = await BikeService.listTypes(db, DEFAULT_TENANT_ID, { includeInactive: false });
  console.log(`BikeService.listTypes       -> ${bikeTypes.length} bike types`);

  // Transaction path: purchase Engine oil; confirm stock + weighted-avg cost move.
  const engineOil = parts.find((p) => p.name === 'Engine oil');
  if (engineOil) {
    const before = await IngredientService.get(db, DEFAULT_TENANT_ID, engineOil.id);
    const res = await InventoryService.recordPurchase(db, DEFAULT_TENANT_ID, {
      ingredientId: engineOil.id,
      quantity: 1000,
      unit: 'ml',
      costPerUnit: 0.5,
    });
    const after = await IngredientService.get(db, DEFAULT_TENANT_ID, engineOil.id);
    console.log(
      `recordPurchase Engine oil   -> stock ${before.stockQuantity} -> ${res.newStockQuantity} ml, ` +
        `avg cost ${before.currentAvgCostPerUnit} -> ${after.currentAvgCostPerUnit}`,
    );
  }

  const drifts = await runReconciliation(db, DEFAULT_TENANT_ID);
  console.log(`runReconciliation           -> ${drifts.length} drift(s) ${drifts.length === 0 ? '(stock == sum of movements ✓)' : ''}`);

  await close();
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
