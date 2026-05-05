import { asc, eq } from 'drizzle-orm';
import type { AppDb } from '../db/client';
import {
  stockTakeLines,
  type StockTakeLineRow,
  type StockTakeLineInsert,
} from '../db/schema';

export const stockTakeLineRepository = {
  listForTake(db: AppDb, stockTakeId: string): StockTakeLineRow[] {
    return db
      .select()
      .from(stockTakeLines)
      .where(eq(stockTakeLines.stockTakeId, stockTakeId))
      .orderBy(asc(stockTakeLines.id))
      .all();
  },

  findById(db: AppDb, id: string): StockTakeLineRow | undefined {
    return db
      .select()
      .from(stockTakeLines)
      .where(eq(stockTakeLines.id, id))
      .get();
  },

  insertMany(db: AppDb, rows: StockTakeLineInsert[]): StockTakeLineRow[] {
    if (rows.length === 0) return [];
    return db.insert(stockTakeLines).values(rows).returning().all();
  },

  updateCounted(
    db: AppDb,
    id: string,
    countedQuantity: number | null,
  ): StockTakeLineRow | undefined {
    return db
      .update(stockTakeLines)
      .set({ countedQuantity })
      .where(eq(stockTakeLines.id, id))
      .returning()
      .get();
  },

  setDifference(
    db: AppDb,
    id: string,
    difference: number | null,
  ): void {
    db.update(stockTakeLines)
      .set({ difference })
      .where(eq(stockTakeLines.id, id))
      .run();
  },
};
