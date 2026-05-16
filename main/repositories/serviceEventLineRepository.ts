import { and, asc, eq, inArray } from 'drizzle-orm';
import type { AppDb } from '../db/client';
import {
  serviceEventLines,
  type ServiceEventLineRow,
  type ServiceEventLineInsert,
} from '../db/schema';

export const serviceEventLineRepository = {
  listForEvent(db: AppDb, serviceEventId: string): ServiceEventLineRow[] {
    return db
      .select()
      .from(serviceEventLines)
      .where(eq(serviceEventLines.serviceEventId, serviceEventId))
      .orderBy(asc(serviceEventLines.displayOrder), asc(serviceEventLines.id))
      .all();
  },

  /** Used by H6 dashboard tiles that aggregate per-event line totals. */
  listForEvents(db: AppDb, serviceEventIds: string[]): ServiceEventLineRow[] {
    if (serviceEventIds.length === 0) return [];
    return db
      .select()
      .from(serviceEventLines)
      .where(inArray(serviceEventLines.serviceEventId, serviceEventIds))
      .all();
  },

  insertMany(
    db: AppDb,
    rows: ServiceEventLineInsert[],
  ): ServiceEventLineRow[] {
    if (rows.length === 0) return [];
    return db.insert(serviceEventLines).values(rows).returning().all();
  },

  /** Replace all lines for an event — used by updateLines while in_progress. */
  replaceLines(
    db: AppDb,
    serviceEventId: string,
    rows: ServiceEventLineInsert[],
  ): ServiceEventLineRow[] {
    db.delete(serviceEventLines)
      .where(eq(serviceEventLines.serviceEventId, serviceEventId))
      .run();
    if (rows.length === 0) return [];
    return db.insert(serviceEventLines).values(rows).returning().all();
  },

  // Kept for symmetry with orderLineRepository — useful if a single-line patch
  // is ever needed without rewriting the full set.
  updateOne(
    db: AppDb,
    id: string,
    patch: Partial<ServiceEventLineInsert>,
  ): ServiceEventLineRow | undefined {
    return db
      .update(serviceEventLines)
      .set(patch)
      .where(and(eq(serviceEventLines.id, id)))
      .returning()
      .get();
  },
};
