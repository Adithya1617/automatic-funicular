import { and, asc, eq, like } from 'drizzle-orm';
import type { AppDb } from '../db/client';
import { bikes, type BikeRow, type BikeInsert } from '../db/schema';

export type BikeFilter = {
  search?: string;
  bikeTypeId?: string;
  includeInactive?: boolean;
};

export const bikeRepository = {
  list(db: AppDb, tenantId: number, filter: BikeFilter = {}): BikeRow[] {
    const conditions = [eq(bikes.tenantId, tenantId)];
    if (!filter.includeInactive) conditions.push(eq(bikes.isActive, true));
    if (filter.bikeTypeId) conditions.push(eq(bikes.bikeTypeId, filter.bikeTypeId));
    if (filter.search) {
      conditions.push(like(bikes.bikeNumber, `%${filter.search.toLowerCase()}%`));
    }
    return db
      .select()
      .from(bikes)
      .where(and(...conditions))
      .orderBy(asc(bikes.bikeNumber))
      .all();
  },

  findById(db: AppDb, tenantId: number, id: string): BikeRow | undefined {
    return db
      .select()
      .from(bikes)
      .where(and(eq(bikes.tenantId, tenantId), eq(bikes.id, id)))
      .get();
  },

  findByBikeNumber(
    db: AppDb,
    tenantId: number,
    bikeNumber: string,
  ): BikeRow | undefined {
    return db
      .select()
      .from(bikes)
      .where(and(eq(bikes.tenantId, tenantId), eq(bikes.bikeNumber, bikeNumber)))
      .get();
  },

  insert(db: AppDb, row: BikeInsert): BikeRow {
    return db.insert(bikes).values(row).returning().get();
  },

  update(
    db: AppDb,
    tenantId: number,
    id: string,
    patch: Partial<BikeInsert>,
  ): BikeRow | undefined {
    return db
      .update(bikes)
      .set(patch)
      .where(and(eq(bikes.tenantId, tenantId), eq(bikes.id, id)))
      .returning()
      .get();
  },
};
