import { and, asc, desc, eq, like } from 'drizzle-orm';
import type { AppDb } from '../db/client';
import {
  supplierItemMappings,
  type SupplierItemMappingRow,
  type SupplierItemMappingInsert,
} from '../db/schema';

function normalize(description: string): string {
  return description.trim().toLowerCase();
}

export const supplierItemMappingRepository = {
  async listForSupplier(
    db: AppDb,
    tenantId: number,
    supplierId: string,
  ): Promise<SupplierItemMappingRow[]> {
    return db
      .select()
      .from(supplierItemMappings)
      .where(
        and(
          eq(supplierItemMappings.tenantId, tenantId),
          eq(supplierItemMappings.supplierId, supplierId),
        ),
      )
      .orderBy(desc(supplierItemMappings.lastUsedAt));
  },

  async suggest(
    db: AppDb,
    tenantId: number,
    supplierId: string,
    partial: string,
    limit: number,
  ): Promise<SupplierItemMappingRow[]> {
    const conditions = [
      eq(supplierItemMappings.tenantId, tenantId),
      eq(supplierItemMappings.supplierId, supplierId),
    ];
    const trimmed = partial.trim();
    if (trimmed.length > 0) {
      conditions.push(like(supplierItemMappings.rawDescription, `%${trimmed.toLowerCase()}%`));
    }
    return db
      .select()
      .from(supplierItemMappings)
      .where(and(...conditions))
      .orderBy(desc(supplierItemMappings.lastUsedAt), asc(supplierItemMappings.rawDescription))
      .limit(Math.max(1, Math.min(50, limit)));
  },

  async findByDescription(
    db: AppDb,
    tenantId: number,
    supplierId: string,
    rawDescription: string,
  ): Promise<SupplierItemMappingRow | undefined> {
    const rows = await db
      .select()
      .from(supplierItemMappings)
      .where(
        and(
          eq(supplierItemMappings.tenantId, tenantId),
          eq(supplierItemMappings.supplierId, supplierId),
          eq(supplierItemMappings.rawDescription, normalize(rawDescription)),
        ),
      );
    return rows[0];
  },

  async insert(db: AppDb, row: SupplierItemMappingInsert): Promise<SupplierItemMappingRow> {
    const [inserted] = await db
      .insert(supplierItemMappings)
      .values({ ...row, rawDescription: normalize(row.rawDescription) })
      .returning();
    if (!inserted) throw new Error('supplier item mapping insert returned no row');
    return inserted;
  },

  async update(
    db: AppDb,
    id: string,
    patch: Partial<SupplierItemMappingInsert>,
  ): Promise<SupplierItemMappingRow | undefined> {
    const next: Partial<SupplierItemMappingInsert> = patch.rawDescription
      ? { ...patch, rawDescription: normalize(patch.rawDescription) }
      : patch;
    const [updated] = await db
      .update(supplierItemMappings)
      .set(next)
      .where(eq(supplierItemMappings.id, id))
      .returning();
    return updated;
  },
};
