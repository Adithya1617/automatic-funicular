import { and, asc, eq, like, or } from 'drizzle-orm';
import type { AppDb } from '../db/client';
import { bikes, type BikeRow, type BikeInsert } from '../db/schema';

export type BikeFilter = {
  search?: string;
  bikeTypeId?: string;
  includeInactive?: boolean;
};

export const bikeRepository = {
  async list(db: AppDb, tenantId: number, filter: BikeFilter = {}): Promise<BikeRow[]> {
    const conditions = [eq(bikes.tenantId, tenantId)];
    if (!filter.includeInactive) conditions.push(eq(bikes.isActive, true));
    if (filter.bikeTypeId) conditions.push(eq(bikes.bikeTypeId, filter.bikeTypeId));
    if (filter.search) {
      const term = `%${filter.search.toLowerCase()}%`;
      // Plate numbers are the operator's real-world identifier — match on
      // either the internal bike_number or the license_plate so a typed
      // "TG08X0007" or "8345" both land.
      const matcher = or(
        like(bikes.bikeNumber, term),
        like(bikes.licensePlate, term),
      );
      if (matcher) conditions.push(matcher);
    }
    return db
      .select()
      .from(bikes)
      .where(and(...conditions))
      .orderBy(asc(bikes.bikeNumber));
  },

  async findById(db: AppDb, tenantId: number, id: string): Promise<BikeRow | undefined> {
    const rows = await db
      .select()
      .from(bikes)
      .where(and(eq(bikes.tenantId, tenantId), eq(bikes.id, id)));
    return rows[0];
  },

  async findByBikeNumber(
    db: AppDb,
    tenantId: number,
    bikeNumber: string,
  ): Promise<BikeRow | undefined> {
    const rows = await db
      .select()
      .from(bikes)
      .where(and(eq(bikes.tenantId, tenantId), eq(bikes.bikeNumber, bikeNumber)));
    return rows[0];
  },

  async insert(db: AppDb, row: BikeInsert): Promise<BikeRow> {
    const [inserted] = await db.insert(bikes).values(row).returning();
    if (!inserted) throw new Error('bike insert returned no row');
    return inserted;
  },

  async update(
    db: AppDb,
    tenantId: number,
    id: string,
    patch: Partial<BikeInsert>,
  ): Promise<BikeRow | undefined> {
    const [updated] = await db
      .update(bikes)
      .set(patch)
      .where(and(eq(bikes.tenantId, tenantId), eq(bikes.id, id)))
      .returning();
    return updated;
  },
};
