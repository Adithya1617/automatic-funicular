import { and, asc, eq } from 'drizzle-orm';
import type { AppDb } from '../db/client';
import {
  orderingChannels,
  type OrderingChannelRow,
  type OrderingChannelInsert,
} from '../db/schema';

export const orderingChannelRepository = {
  list(
    db: AppDb,
    tenantId: number,
    enabledOnly: boolean = false,
  ): OrderingChannelRow[] {
    const conditions = [eq(orderingChannels.tenantId, tenantId)];
    if (enabledOnly) conditions.push(eq(orderingChannels.enabled, true));
    return db
      .select()
      .from(orderingChannels)
      .where(and(...conditions))
      .orderBy(asc(orderingChannels.displayName))
      .all();
  },

  findByKey(db: AppDb, tenantId: number, key: string): OrderingChannelRow | undefined {
    return db
      .select()
      .from(orderingChannels)
      .where(and(eq(orderingChannels.tenantId, tenantId), eq(orderingChannels.key, key)))
      .get();
  },

  insert(db: AppDb, row: OrderingChannelInsert): OrderingChannelRow {
    return db.insert(orderingChannels).values(row).returning().get();
  },
};
