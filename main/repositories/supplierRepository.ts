import { and, asc, eq, like } from 'drizzle-orm';
import type { AppDb } from '../db/client';
import { suppliers, type SupplierRow, type SupplierInsert } from '../db/schema';

export type SupplierFilter = {
  search?: string;
  includeInactive?: boolean;
};

export const supplierRepository = {
  async list(
    db: AppDb,
    tenantId: number,
    filter: SupplierFilter = {},
  ): Promise<SupplierRow[]> {
    const conditions = [eq(suppliers.tenantId, tenantId)];
    if (!filter.includeInactive) conditions.push(eq(suppliers.isActive, true));
    if (filter.search) {
      conditions.push(like(suppliers.name, `%${filter.search.toLowerCase()}%`));
    }
    return db
      .select()
      .from(suppliers)
      .where(and(...conditions))
      .orderBy(asc(suppliers.name));
  },

  async findById(db: AppDb, tenantId: number, id: string): Promise<SupplierRow | undefined> {
    const rows = await db
      .select()
      .from(suppliers)
      .where(and(eq(suppliers.tenantId, tenantId), eq(suppliers.id, id)));
    return rows[0];
  },

  async findByName(db: AppDb, tenantId: number, name: string): Promise<SupplierRow | undefined> {
    const rows = await db
      .select()
      .from(suppliers)
      .where(and(eq(suppliers.tenantId, tenantId), eq(suppliers.name, name)));
    return rows[0];
  },

  async findByGstin(
    db: AppDb,
    tenantId: number,
    gstin: string,
  ): Promise<SupplierRow | undefined> {
    const rows = await db
      .select()
      .from(suppliers)
      .where(and(eq(suppliers.tenantId, tenantId), eq(suppliers.gstin, gstin)));
    return rows[0];
  },

  async insert(db: AppDb, row: SupplierInsert): Promise<SupplierRow> {
    const [inserted] = await db.insert(suppliers).values(row).returning();
    if (!inserted) throw new Error('supplier insert returned no row');
    return inserted;
  },

  async update(
    db: AppDb,
    tenantId: number,
    id: string,
    patch: Partial<SupplierInsert>,
  ): Promise<SupplierRow | undefined> {
    const [updated] = await db
      .update(suppliers)
      .set(patch)
      .where(and(eq(suppliers.tenantId, tenantId), eq(suppliers.id, id)))
      .returning();
    return updated;
  },
};
