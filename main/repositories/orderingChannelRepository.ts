import { and, asc, eq } from 'drizzle-orm';
import type { AppDb } from '../db/client';
import {
  orderingChannels,
  type OrderingChannelRow,
  type OrderingChannelInsert,
} from '../db/schema';

export const orderingChannelRepository = {
  async list(
    db: AppDb,
    tenantId: number,
    enabledOnly: boolean = false,
  ): Promise<OrderingChannelRow[]> {
    const conditions = [eq(orderingChannels.tenantId, tenantId)];
    if (enabledOnly) conditions.push(eq(orderingChannels.enabled, true));
    return db
      .select()
      .from(orderingChannels)
      .where(and(...conditions))
      .orderBy(asc(orderingChannels.displayName));
  },

  async findByKey(
    db: AppDb,
    tenantId: number,
    key: string,
  ): Promise<OrderingChannelRow | undefined> {
    const rows = await db
      .select()
      .from(orderingChannels)
      .where(and(eq(orderingChannels.tenantId, tenantId), eq(orderingChannels.key, key)));
    return rows[0];
  },

  async insert(db: AppDb, row: OrderingChannelInsert): Promise<OrderingChannelRow> {
    const [inserted] = await db.insert(orderingChannels).values(row).returning();
    if (!inserted) throw new Error('ordering channel insert returned no row');
    return inserted;
  },
};
