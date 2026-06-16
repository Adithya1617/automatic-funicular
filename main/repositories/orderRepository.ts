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
  async list(db: AppDb, tenantId: number, filter: OrderFilter = {}): Promise<OrderRow[]> {
    const conditions: SQL[] = [eq(orders.tenantId, tenantId)];
    if (filter.status) conditions.push(eq(orders.status, filter.status));
    if (filter.source) conditions.push(eq(orders.source, filter.source));
    return db
      .select()
      .from(orders)
      .where(and(...conditions))
      .orderBy(desc(orders.placedAt))
      .limit(Math.max(1, Math.min(500, filter.limit ?? 200)));
  },

  async findById(db: AppDb, tenantId: number, id: string): Promise<OrderRow | undefined> {
    const rows = await db
      .select()
      .from(orders)
      .where(and(eq(orders.tenantId, tenantId), eq(orders.id, id)));
    return rows[0];
  },

  async findByExternalId(
    db: AppDb,
    tenantId: number,
    source: OrderSource,
    externalOrderId: string,
  ): Promise<OrderRow | undefined> {
    const rows = await db
      .select()
      .from(orders)
      .where(
        and(
          eq(orders.tenantId, tenantId),
          eq(orders.source, source),
          eq(orders.externalOrderId, externalOrderId),
        ),
      );
    return rows[0];
  },

  async insert(db: AppDb, row: OrderInsert): Promise<OrderRow> {
    const [inserted] = await db.insert(orders).values(row).returning();
    if (!inserted) throw new Error('order insert returned no row');
    return inserted;
  },

  async update(
    db: AppDb,
    tenantId: number,
    id: string,
    patch: Partial<OrderInsert>,
  ): Promise<OrderRow | undefined> {
    const [updated] = await db
      .update(orders)
      .set(patch)
      .where(and(eq(orders.tenantId, tenantId), eq(orders.id, id)))
      .returning();
    return updated;
  },

  /**
   * Orders placed in [start, end). Filtered to a status if provided.
   * Drives revenue / order-volume by channel.
   */
  async listInRange(
    db: AppDb,
    tenantId: number,
    range: OrderDateRange,
    status?: OrderStatus,
  ): Promise<OrderRow[]> {
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
      .orderBy(asc(orders.placedAt));
  },
};
