import { asc, eq } from 'drizzle-orm';
import type { AppDb } from '../db/client';
import {
  stockTakeLines,
  type StockTakeLineRow,
  type StockTakeLineInsert,
} from '../db/schema';

export const stockTakeLineRepository = {
  async listForTake(db: AppDb, stockTakeId: string): Promise<StockTakeLineRow[]> {
    return db
      .select()
      .from(stockTakeLines)
      .where(eq(stockTakeLines.stockTakeId, stockTakeId))
      .orderBy(asc(stockTakeLines.id));
  },

  async findById(db: AppDb, id: string): Promise<StockTakeLineRow | undefined> {
    const rows = await db.select().from(stockTakeLines).where(eq(stockTakeLines.id, id));
    return rows[0];
  },

  async insertMany(db: AppDb, rows: StockTakeLineInsert[]): Promise<StockTakeLineRow[]> {
    if (rows.length === 0) return [];
    return db.insert(stockTakeLines).values(rows).returning();
  },

  async updateCounted(
    db: AppDb,
    id: string,
    countedQuantity: number | null,
  ): Promise<StockTakeLineRow | undefined> {
    const [updated] = await db
      .update(stockTakeLines)
      .set({ countedQuantity })
      .where(eq(stockTakeLines.id, id))
      .returning();
    return updated;
  },

  async setDifference(db: AppDb, id: string, difference: number | null): Promise<void> {
    await db
      .update(stockTakeLines)
      .set({ difference })
      .where(eq(stockTakeLines.id, id));
  },
};
