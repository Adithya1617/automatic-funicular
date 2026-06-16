import { and, asc, eq } from 'drizzle-orm';
import type { AppDb } from '../db/client';
import { bikeTypes, type BikeTypeRow, type BikeTypeInsert } from '../db/schema';

export type BikeTypeFilter = {
  includeInactive?: boolean;
};

export const bikeTypeRepository = {
  async list(
    db: AppDb,
    tenantId: number,
    filter: BikeTypeFilter = {},
  ): Promise<BikeTypeRow[]> {
    const conditions = [eq(bikeTypes.tenantId, tenantId)];
    if (!filter.includeInactive) conditions.push(eq(bikeTypes.isActive, true));
    return db
      .select()
      .from(bikeTypes)
      .where(and(...conditions))
      .orderBy(asc(bikeTypes.displayOrder), asc(bikeTypes.name));
  },

  async findById(db: AppDb, tenantId: number, id: string): Promise<BikeTypeRow | undefined> {
    const rows = await db
      .select()
      .from(bikeTypes)
      .where(and(eq(bikeTypes.tenantId, tenantId), eq(bikeTypes.id, id)));
    return rows[0];
  },

  async insert(db: AppDb, row: BikeTypeInsert): Promise<BikeTypeRow> {
    const [inserted] = await db.insert(bikeTypes).values(row).returning();
    if (!inserted) throw new Error('bike type insert returned no row');
    return inserted;
  },
};
