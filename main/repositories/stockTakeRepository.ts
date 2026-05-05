import { and, desc, eq, type SQL } from 'drizzle-orm';
import type { AppDb } from '../db/client';
import { stockTakes, type StockTakeRow, type StockTakeInsert } from '../db/schema';
import type { StockTakeStatus } from '@shared/schemas/stockTake';

export type StockTakeFilter = {
  status?: StockTakeStatus;
  limit?: number;
};

export const stockTakeRepository = {
  list(db: AppDb, tenantId: number, filter: StockTakeFilter = {}): StockTakeRow[] {
    const conditions: SQL[] = [eq(stockTakes.tenantId, tenantId)];
    if (filter.status) conditions.push(eq(stockTakes.status, filter.status));
    return db
      .select()
      .from(stockTakes)
      .where(and(...conditions))
      .orderBy(desc(stockTakes.startedAt))
      .limit(Math.max(1, Math.min(500, filter.limit ?? 100)))
      .all();
  },

  findById(db: AppDb, tenantId: number, id: string): StockTakeRow | undefined {
    return db
      .select()
      .from(stockTakes)
      .where(and(eq(stockTakes.tenantId, tenantId), eq(stockTakes.id, id)))
      .get();
  },

  findInProgress(db: AppDb, tenantId: number): StockTakeRow | undefined {
    return db
      .select()
      .from(stockTakes)
      .where(and(eq(stockTakes.tenantId, tenantId), eq(stockTakes.status, 'in_progress')))
      .get();
  },

  insert(db: AppDb, row: StockTakeInsert): StockTakeRow {
    return db.insert(stockTakes).values(row).returning().get();
  },

  update(
    db: AppDb,
    tenantId: number,
    id: string,
    patch: Partial<StockTakeInsert>,
  ): StockTakeRow | undefined {
    return db
      .update(stockTakes)
      .set(patch)
      .where(and(eq(stockTakes.tenantId, tenantId), eq(stockTakes.id, id)))
      .returning()
      .get();
  },
};
