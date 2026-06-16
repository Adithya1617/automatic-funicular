import type { AppDb } from '../db/client';
import { newId } from '../lib/ids';
import { supplierItemMappingRepository } from '../repositories/supplierItemMappingRepository';
import type { SupplierItemMapping } from '@shared/schemas/supplierItemMapping';
import { SYSTEM_USER_ID } from '@shared/constants/system';

export type UpsertMappingInput = {
  supplierId: string;
  rawDescription: string;
  ingredientId: string;
  defaultQuantity: number;
  defaultUnit: string;
  lastUnitCost: number;
};

function toDomain(
  row: Awaited<ReturnType<typeof supplierItemMappingRepository.findByDescription>>,
): SupplierItemMapping | null {
  if (!row) return null;
  return row as unknown as SupplierItemMapping;
}

export const SupplierItemMappingService = {
  async suggest(
    db: AppDb,
    tenantId: number,
    supplierId: string,
    partial: string,
    limit: number,
  ): Promise<SupplierItemMapping[]> {
    const rows = await supplierItemMappingRepository.suggest(
      db,
      tenantId,
      supplierId,
      partial,
      limit,
    );
    return rows.map((row) => row as unknown as SupplierItemMapping);
  },

  async upsert(
    db: AppDb,
    tenantId: number,
    input: UpsertMappingInput,
    _actorId: string = SYSTEM_USER_ID,
  ): Promise<SupplierItemMapping> {
    const now = Date.now();
    const existing = await supplierItemMappingRepository.findByDescription(
      db,
      tenantId,
      input.supplierId,
      input.rawDescription,
    );
    if (existing) {
      const updated = await supplierItemMappingRepository.update(db, existing.id, {
        ingredientId: input.ingredientId,
        defaultQuantity: input.defaultQuantity,
        defaultUnit: input.defaultUnit,
        lastUnitCost: input.lastUnitCost,
        lastUsedAt: now,
        updatedAt: now,
      });
      return toDomain(updated)!;
    }
    const inserted = await supplierItemMappingRepository.insert(db, {
      id: newId(),
      tenantId,
      supplierId: input.supplierId,
      rawDescription: input.rawDescription,
      ingredientId: input.ingredientId,
      defaultQuantity: input.defaultQuantity,
      defaultUnit: input.defaultUnit,
      lastUnitCost: input.lastUnitCost,
      lastUsedAt: now,
      createdAt: now,
      updatedAt: now,
    });
    return toDomain(inserted)!;
  },
};
