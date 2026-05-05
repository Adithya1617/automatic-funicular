import { and, desc, eq } from 'drizzle-orm';
import type { AppDb } from '../db/client';
import {
  productionBatches,
  type ProductionBatchInsert,
  type ProductionBatchRow,
} from '../db/schema';

export type ListBatchesFilter = {
  preparedIngredientId?: string;
  limit?: number;
};

export const productionBatchRepository = {
  list(
    db: AppDb,
    tenantId: number,
    filter: ListBatchesFilter = {},
  ): ProductionBatchRow[] {
    const conditions = [eq(productionBatches.tenantId, tenantId)];
    if (filter.preparedIngredientId) {
      conditions.push(
        eq(productionBatches.preparedIngredientId, filter.preparedIngredientId),
      );
    }
    return db
      .select()
      .from(productionBatches)
      .where(and(...conditions))
      .orderBy(desc(productionBatches.producedAt))
      .limit(Math.max(1, Math.min(200, filter.limit ?? 50)))
      .all();
  },

  insert(db: AppDb, row: ProductionBatchInsert): ProductionBatchRow {
    return db.insert(productionBatches).values(row).returning().get();
  },
};
