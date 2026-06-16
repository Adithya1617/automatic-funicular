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
  async list(
    db: AppDb,
    tenantId: number,
    filter: ServiceEventFilter = {},
  ): Promise<ServiceEventRow[]> {
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
      .limit(Math.max(1, Math.min(500, filter.limit ?? 200)));
  },

  async findById(
    db: AppDb,
    tenantId: number,
    id: string,
  ): Promise<ServiceEventRow | undefined> {
    const rows = await db
      .select()
      .from(serviceEvents)
      .where(and(eq(serviceEvents.tenantId, tenantId), eq(serviceEvents.id, id)));
    return rows[0];
  },

  async insert(db: AppDb, row: ServiceEventInsert): Promise<ServiceEventRow> {
    const [inserted] = await db.insert(serviceEvents).values(row).returning();
    if (!inserted) throw new Error('service event insert returned no row');
    return inserted;
  },

  async update(
    db: AppDb,
    tenantId: number,
    id: string,
    patch: Partial<ServiceEventInsert>,
  ): Promise<ServiceEventRow | undefined> {
    const [updated] = await db
      .update(serviceEvents)
      .set(patch)
      .where(and(eq(serviceEvents.tenantId, tenantId), eq(serviceEvents.id, id)))
      .returning();
    return updated;
  },

  /**
   * Bike + range query used by the cost-per-bike dashboard tile (lands in H6).
   * `bikeId` is optional — when omitted, returns every event in range.
   */
  async listInRange(
    db: AppDb,
    tenantId: number,
    range: { startMs: number; endMs: number },
    opts: { status?: ServiceEventStatus; kind?: ServiceEventKind; bikeId?: string } = {},
  ): Promise<ServiceEventRow[]> {
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
      .orderBy(asc(serviceEvents.startedAt));
  },

  /**
   * Most recent completed event per bike for a given kind, keyed by bikeId →
   * latest `startedAt`. Drives the maintenance-countdown dashboard tiles
   * (service due / wash due) and the per-bike schedule columns. Returns one
   * entry only for bikes that have at least one completed event of that kind.
   */
  async lastCompletedAtByBike(
    db: AppDb,
    tenantId: number,
    kind: ServiceEventKind,
  ): Promise<Map<string, number>> {
    const rows = await db
      .select({ bikeId: serviceEvents.bikeId, startedAt: serviceEvents.startedAt })
      .from(serviceEvents)
      .where(
        and(
          eq(serviceEvents.tenantId, tenantId),
          eq(serviceEvents.kind, kind),
          eq(serviceEvents.status, 'completed'),
        ),
      );
    const byBike = new Map<string, number>();
    for (const r of rows) {
      const prev = byBike.get(r.bikeId);
      if (prev === undefined || r.startedAt > prev) byBike.set(r.bikeId, r.startedAt);
    }
    return byBike;
  },
};
