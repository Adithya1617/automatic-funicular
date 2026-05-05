import { and, asc, desc, eq, gte, lt, type SQL } from 'drizzle-orm';
import type { AppDb } from '../db/client';
import { orders, type OrderRow, type OrderInsert } from '../db/schema';
import type { OrderStatus } from '@shared/schemas/order';
import type { OrderSource } from '@shared/constants/enums';

export type OrderDateRange = { startMs: number; endMs: number };

export type OrderFilter = {
  status?: OrderStatus;
  source?: OrderSource;
  limit?: number;
};

export const orderRepository = {
  list(db: AppDb, tenantId: number, filter: OrderFilter = {}): OrderRow[] {
    const conditions: SQL[] = [eq(orders.tenantId, tenantId)];
    if (filter.status) conditions.push(eq(orders.status, filter.status));
    if (filter.source) conditions.push(eq(orders.source, filter.source));
    return db
      .select()
      .from(orders)
      .where(and(...conditions))
      .orderBy(desc(orders.placedAt))
      .limit(Math.max(1, Math.min(500, filter.limit ?? 200)))
      .all();
  },

  findById(db: AppDb, tenantId: number, id: string): OrderRow | undefined {
    return db
      .select()
      .from(orders)
      .where(and(eq(orders.tenantId, tenantId), eq(orders.id, id)))
      .get();
  },

  findByExternalId(
    db: AppDb,
    tenantId: number,
    source: OrderSource,
    externalOrderId: string,
  ): OrderRow | undefined {
    return db
      .select()
      .from(orders)
      .where(
        and(
          eq(orders.tenantId, tenantId),
          eq(orders.source, source),
          eq(orders.externalOrderId, externalOrderId),
        ),
      )
      .get();
  },

  insert(db: AppDb, row: OrderInsert): OrderRow {
    return db.insert(orders).values(row).returning().get();
  },

  update(
    db: AppDb,
    tenantId: number,
    id: string,
    patch: Partial<OrderInsert>,
  ): OrderRow | undefined {
    return db
      .update(orders)
      .set(patch)
      .where(and(eq(orders.tenantId, tenantId), eq(orders.id, id)))
      .returning()
      .get();
  },

  /**
   * Orders placed in [start, end). Filtered to a status if provided.
   * Drives revenue / order-volume by channel.
   */
  listInRange(
    db: AppDb,
    tenantId: number,
    range: OrderDateRange,
    status?: OrderStatus,
  ): OrderRow[] {
    const conditions: SQL[] = [
      eq(orders.tenantId, tenantId),
      gte(orders.placedAt, range.startMs),
      lt(orders.placedAt, range.endMs),
    ];
    if (status) conditions.push(eq(orders.status, status));
    return db
      .select()
      .from(orders)
      .where(and(...conditions))
      .orderBy(asc(orders.placedAt))
      .all();
  },
};
