import { and, asc, eq, inArray } from 'drizzle-orm';
import type { AppDb } from '../db/client';
import {
  serviceEventLines,
  type ServiceEventLineRow,
  type ServiceEventLineInsert,
} from '../db/schema';

export const serviceEventLineRepository = {
  async listForEvent(db: AppDb, serviceEventId: string): Promise<ServiceEventLineRow[]> {
    return db
      .select()
      .from(serviceEventLines)
      .where(eq(serviceEventLines.serviceEventId, serviceEventId))
      .orderBy(asc(serviceEventLines.displayOrder), asc(serviceEventLines.id));
  },

  /** Used by H6 dashboard tiles that aggregate per-event line totals. */
  async listForEvents(
    db: AppDb,
    serviceEventIds: string[],
  ): Promise<ServiceEventLineRow[]> {
    if (serviceEventIds.length === 0) return [];
    return db
      .select()
      .from(serviceEventLines)
      .where(inArray(serviceEventLines.serviceEventId, serviceEventIds));
  },

  async insertMany(
    db: AppDb,
    rows: ServiceEventLineInsert[],
  ): Promise<ServiceEventLineRow[]> {
    if (rows.length === 0) return [];
    return db.insert(serviceEventLines).values(rows).returning();
  },

  /** Delete every line for an event — used when an event is removed. */
  async deleteForEvent(db: AppDb, serviceEventId: string): Promise<void> {
    await db
      .delete(serviceEventLines)
      .where(eq(serviceEventLines.serviceEventId, serviceEventId));
  },

  /** Replace all lines for an event — used by updateLines while in_progress. */
  async replaceLines(
    db: AppDb,
    serviceEventId: string,
    rows: ServiceEventLineInsert[],
  ): Promise<ServiceEventLineRow[]> {
    await db
      .delete(serviceEventLines)
      .where(eq(serviceEventLines.serviceEventId, serviceEventId));
    if (rows.length === 0) return [];
    return db.insert(serviceEventLines).values(rows).returning();
  },

  // Kept for symmetry with orderLineRepository — useful if a single-line patch
  // is ever needed without rewriting the full set.
  async updateOne(
    db: AppDb,
    id: string,
    patch: Partial<ServiceEventLineInsert>,
  ): Promise<ServiceEventLineRow | undefined> {
    const [updated] = await db
      .update(serviceEventLines)
      .set(patch)
      .where(and(eq(serviceEventLines.id, id)))
      .returning();
    return updated;
  },
};
