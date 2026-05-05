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
  listForSupplier(db: AppDb, tenantId: number, supplierId: string): SupplierItemMappingRow[] {
    return db
      .select()
      .from(supplierItemMappings)
      .where(
        and(
          eq(supplierItemMappings.tenantId, tenantId),
          eq(supplierItemMappings.supplierId, supplierId),
        ),
      )
      .orderBy(desc(supplierItemMappings.lastUsedAt))
      .all();
  },

  suggest(
    db: AppDb,
    tenantId: number,
    supplierId: string,
    partial: string,
    limit: number,
  ): SupplierItemMappingRow[] {
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
      .limit(Math.max(1, Math.min(50, limit)))
      .all();
  },

  findByDescription(
    db: AppDb,
    tenantId: number,
    supplierId: string,
    rawDescription: string,
  ): SupplierItemMappingRow | undefined {
    return db
      .select()
      .from(supplierItemMappings)
      .where(
        and(
          eq(supplierItemMappings.tenantId, tenantId),
          eq(supplierItemMappings.supplierId, supplierId),
          eq(supplierItemMappings.rawDescription, normalize(rawDescription)),
        ),
      )
      .get();
  },

  insert(db: AppDb, row: SupplierItemMappingInsert): SupplierItemMappingRow {
    return db
      .insert(supplierItemMappings)
      .values({ ...row, rawDescription: normalize(row.rawDescription) })
      .returning()
      .get();
  },

  update(
    db: AppDb,
    id: string,
    patch: Partial<SupplierItemMappingInsert>,
  ): SupplierItemMappingRow | undefined {
    const next: Partial<SupplierItemMappingInsert> = patch.rawDescription
      ? { ...patch, rawDescription: normalize(patch.rawDescription) }
      : patch;
    return db
      .update(supplierItemMappings)
      .set(next)
      .where(eq(supplierItemMappings.id, id))
      .returning()
      .get();
  },
};
