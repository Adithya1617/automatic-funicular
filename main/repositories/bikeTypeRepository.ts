import { and, asc, eq } from 'drizzle-orm';
import type { AppDb } from '../db/client';
import { bikeTypes, type BikeTypeRow, type BikeTypeInsert } from '../db/schema';

export type BikeTypeFilter = {
  includeInactive?: boolean;
};

export const bikeTypeRepository = {
  list(db: AppDb, tenantId: number, filter: BikeTypeFilter = {}): BikeTypeRow[] {
    const conditions = [eq(bikeTypes.tenantId, tenantId)];
    if (!filter.includeInactive) conditions.push(eq(bikeTypes.isActive, true));
    return db
      .select()
      .from(bikeTypes)
      .where(and(...conditions))
      .orderBy(asc(bikeTypes.displayOrder), asc(bikeTypes.name))
      .all();
  },

  findById(db: AppDb, tenantId: number, id: string): BikeTypeRow | undefined {
    return db
      .select()
      .from(bikeTypes)
      .where(and(eq(bikeTypes.tenantId, tenantId), eq(bikeTypes.id, id)))
      .get();
  },

  insert(db: AppDb, row: BikeTypeInsert): BikeTypeRow {
    return db.insert(bikeTypes).values(row).returning().get();
  },
};
