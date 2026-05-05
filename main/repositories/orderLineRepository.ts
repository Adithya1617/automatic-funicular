import { asc, eq, inArray } from 'drizzle-orm';
import type { AppDb } from '../db/client';
import { orderLines, type OrderLineRow, type OrderLineInsert } from '../db/schema';

export const orderLineRepository = {
  listForOrder(db: AppDb, orderId: string): OrderLineRow[] {
    return db
      .select()
      .from(orderLines)
      .where(eq(orderLines.orderId, orderId))
      .orderBy(asc(orderLines.id))
      .all();
  },

  /** All lines for any of the given order ids — used by Dashboard COGS. */
  listForOrders(db: AppDb, orderIds: string[]): OrderLineRow[] {
    if (orderIds.length === 0) return [];
    return db
      .select()
      .from(orderLines)
      .where(inArray(orderLines.orderId, orderIds))
      .all();
  },

  insertMany(db: AppDb, rows: OrderLineInsert[]): OrderLineRow[] {
    if (rows.length === 0) return [];
    return db.insert(orderLines).values(rows).returning().all();
  },
};
