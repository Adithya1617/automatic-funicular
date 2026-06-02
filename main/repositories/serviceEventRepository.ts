import { and, asc, desc, eq, gte, lt, type SQL } from 'drizzle-orm';
import type { AppDb } from '../db/client';
import {
  serviceEvents,
  type ServiceEventRow,
  type ServiceEventInsert,
} from '../db/schema';
import type {
  ServiceEventKind,
  ServiceEventStatus,
} from '@shared/schemas/serviceEvent';

export type ServiceEventFilter = {
  status?: ServiceEventStatus;
  kind?: ServiceEventKind;
  bikeId?: string;
  serviceTemplateId?: string;
  limit?: number;
};

export const serviceEventRepository = {
  list(
    db: AppDb,
    tenantId: number,
    filter: ServiceEventFilter = {},
  ): ServiceEventRow[] {
    const conditions: SQL[] = [eq(serviceEvents.tenantId, tenantId)];
    if (filter.status) conditions.push(eq(serviceEvents.status, filter.status));
    if (filter.kind) conditions.push(eq(serviceEvents.kind, filter.kind));
    if (filter.bikeId) conditions.push(eq(serviceEvents.bikeId, filter.bikeId));
    if (filter.serviceTemplateId)
      conditions.push(eq(serviceEvents.serviceTemplateId, filter.serviceTemplateId));
    return db
      .select()
      .from(serviceEvents)
      .where(and(...conditions))
      .orderBy(desc(serviceEvents.startedAt))
      .limit(Math.max(1, Math.min(500, filter.limit ?? 200)))
      .all();
  },

  findById(
    db: AppDb,
    tenantId: number,
    id: string,
  ): ServiceEventRow | undefined {
    return db
      .select()
      .from(serviceEvents)
      .where(
        and(eq(serviceEvents.tenantId, tenantId), eq(serviceEvents.id, id)),
      )
      .get();
  },

  insert(db: AppDb, row: ServiceEventInsert): ServiceEventRow {
    return db.insert(serviceEvents).values(row).returning().get();
  },

  update(
    db: AppDb,
    tenantId: number,
    id: string,
    patch: Partial<ServiceEventInsert>,
  ): ServiceEventRow | undefined {
    return db
      .update(serviceEvents)
      .set(patch)
      .where(
        and(eq(serviceEvents.tenantId, tenantId), eq(serviceEvents.id, id)),
      )
      .returning()
      .get();
  },

  /**
   * Bike + range query used by the cost-per-bike dashboard tile (lands in H6).
   * `bikeId` is optional — when omitted, returns every event in range.
   */
  listInRange(
    db: AppDb,
    tenantId: number,
    range: { startMs: number; endMs: number },
    opts: { status?: ServiceEventStatus; kind?: ServiceEventKind; bikeId?: string } = {},
  ): ServiceEventRow[] {
    const conditions: SQL[] = [
      eq(serviceEvents.tenantId, tenantId),
      gte(serviceEvents.startedAt, range.startMs),
      lt(serviceEvents.startedAt, range.endMs),
    ];
    if (opts.status) conditions.push(eq(serviceEvents.status, opts.status));
    if (opts.kind) conditions.push(eq(serviceEvents.kind, opts.kind));
    if (opts.bikeId) conditions.push(eq(serviceEvents.bikeId, opts.bikeId));
    return db
      .select()
      .from(serviceEvents)
      .where(and(...conditions))
      .orderBy(asc(serviceEvents.startedAt))
      .all();
  },

  /**
   * Most recent completed event per bike for a given kind, keyed by bikeId →
   * latest `startedAt`. Drives the maintenance-countdown dashboard tiles
   * (service due / wash due) and the per-bike schedule columns. Returns one
   * entry only for bikes that have at least one completed event of that kind.
   */
  lastCompletedAtByBike(
    db: AppDb,
    tenantId: number,
    kind: ServiceEventKind,
  ): Map<string, number> {
    const rows = db
      .select({ bikeId: serviceEvents.bikeId, startedAt: serviceEvents.startedAt })
      .from(serviceEvents)
      .where(
        and(
          eq(serviceEvents.tenantId, tenantId),
          eq(serviceEvents.kind, kind),
          eq(serviceEvents.status, 'completed'),
        ),
      )
      .all();
    const byBike = new Map<string, number>();
    for (const r of rows) {
      const prev = byBike.get(r.bikeId);
      if (prev === undefined || r.startedAt > prev) byBike.set(r.bikeId, r.startedAt);
    }
    return byBike;
  },
};
