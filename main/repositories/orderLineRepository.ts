import { asc, eq, inArray } from 'drizzle-orm';
import type { AppDb } from '../db/client';
import { orderLines, type OrderLineRow, type OrderLineInsert } from '../db/schema';

export const orderLineRepository = {
  async listForOrder(db: AppDb, orderId: string): Promise<OrderLineRow[]> {
    return db
      .select()
      .from(orderLines)
      .where(eq(orderLines.orderId, orderId))
      .orderBy(asc(orderLines.id));
  },

  /** All lines for any of the given order ids — used by Dashboard COGS. */
  async listForOrders(db: AppDb, orderIds: string[]): Promise<OrderLineRow[]> {
    if (orderIds.length === 0) return [];
    return db
      .select()
      .from(orderLines)
      .where(inArray(orderLines.orderId, orderIds));
  },

  async insertMany(db: AppDb, rows: OrderLineInsert[]): Promise<OrderLineRow[]> {
    if (rows.length === 0) return [];
    return db.insert(orderLines).values(rows).returning();
  },
};
