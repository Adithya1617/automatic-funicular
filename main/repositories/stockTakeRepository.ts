import { and, desc, eq, type SQL } from 'drizzle-orm';
import type { AppDb } from '../db/client';
import { stockTakes, type StockTakeRow, type StockTakeInsert } from '../db/schema';
import type { StockTakeStatus } from '@shared/schemas/stockTake';

export type StockTakeFilter = {
  status?: StockTakeStatus;
  limit?: number;
};

export const stockTakeRepository = {
  async list(db: AppDb, tenantId: number, filter: StockTakeFilter = {}): Promise<StockTakeRow[]> {
    const conditions: SQL[] = [eq(stockTakes.tenantId, tenantId)];
    if (filter.status) conditions.push(eq(stockTakes.status, filter.status));
    return db
      .select()
      .from(stockTakes)
      .where(and(...conditions))
      .orderBy(desc(stockTakes.startedAt))
      .limit(Math.max(1, Math.min(500, filter.limit ?? 100)));
  },

  async findById(db: AppDb, tenantId: number, id: string): Promise<StockTakeRow | undefined> {
    const rows = await db
      .select()
      .from(stockTakes)
      .where(and(eq(stockTakes.tenantId, tenantId), eq(stockTakes.id, id)));
    return rows[0];
  },

  async findInProgress(db: AppDb, tenantId: number): Promise<StockTakeRow | undefined> {
    const rows = await db
      .select()
      .from(stockTakes)
      .where(and(eq(stockTakes.tenantId, tenantId), eq(stockTakes.status, 'in_progress')));
    return rows[0];
  },

  async insert(db: AppDb, row: StockTakeInsert): Promise<StockTakeRow> {
    const [inserted] = await db.insert(stockTakes).values(row).returning();
    if (!inserted) throw new Error('stock take insert returned no row');
    return inserted;
  },

  async update(
    db: AppDb,
    tenantId: number,
    id: string,
    patch: Partial<StockTakeInsert>,
  ): Promise<StockTakeRow | undefined> {
    const [updated] = await db
      .update(stockTakes)
      .set(patch)
      .where(and(eq(stockTakes.tenantId, tenantId), eq(stockTakes.id, id)))
      .returning();
    return updated;
  },
};
