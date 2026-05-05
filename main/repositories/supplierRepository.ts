import { and, asc, eq, like } from 'drizzle-orm';
import type { AppDb } from '../db/client';
import { suppliers, type SupplierRow, type SupplierInsert } from '../db/schema';

export type SupplierFilter = {
  search?: string;
  includeInactive?: boolean;
};

export const supplierRepository = {
  list(db: AppDb, tenantId: number, filter: SupplierFilter = {}): SupplierRow[] {
    const conditions = [eq(suppliers.tenantId, tenantId)];
    if (!filter.includeInactive) conditions.push(eq(suppliers.isActive, true));
    if (filter.search) {
      conditions.push(like(suppliers.name, `%${filter.search.toLowerCase()}%`));
    }
    return db
      .select()
      .from(suppliers)
      .where(and(...conditions))
      .orderBy(asc(suppliers.name))
      .all();
  },

  findById(db: AppDb, tenantId: number, id: string): SupplierRow | undefined {
    return db
      .select()
      .from(suppliers)
      .where(and(eq(suppliers.tenantId, tenantId), eq(suppliers.id, id)))
      .get();
  },

  findByName(db: AppDb, tenantId: number, name: string): SupplierRow | undefined {
    return db
      .select()
      .from(suppliers)
      .where(and(eq(suppliers.tenantId, tenantId), eq(suppliers.name, name)))
      .get();
  },

  findByGstin(db: AppDb, tenantId: number, gstin: string): SupplierRow | undefined {
    return db
      .select()
      .from(suppliers)
      .where(and(eq(suppliers.tenantId, tenantId), eq(suppliers.gstin, gstin)))
      .get();
  },

  insert(db: AppDb, row: SupplierInsert): SupplierRow {
    return db.insert(suppliers).values(row).returning().get();
  },

  update(
    db: AppDb,
    tenantId: number,
    id: string,
    patch: Partial<SupplierInsert>,
  ): SupplierRow | undefined {
    return db
      .update(suppliers)
      .set(patch)
      .where(and(eq(suppliers.tenantId, tenantId), eq(suppliers.id, id)))
      .returning()
      .get();
  },
};
