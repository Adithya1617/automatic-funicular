import type { AppDb } from '../db/client';
import { newId } from '../lib/ids';
import { supplierRepository } from '../repositories/supplierRepository';
import type {
  CreateSupplierInput,
  ListSuppliersInput,
  Supplier,
  UpdateSupplierInput,
} from '@shared/schemas/supplier';
import { ConflictError, NotFoundError } from '@shared/errors/DomainError';
import { SYSTEM_USER_ID } from '@shared/constants/system';

function toSupplier(
  row: Awaited<ReturnType<typeof supplierRepository.findById>>,
): Supplier {
  if (!row) throw new Error('toSupplier called with empty row');
  return row as unknown as Supplier;
}

export const SupplierService = {
  async list(db: AppDb, tenantId: number, filter: ListSuppliersInput): Promise<Supplier[]> {
    const rows = await supplierRepository.list(db, tenantId, filter);
    return rows.map((row) => row as unknown as Supplier);
  },

  async get(db: AppDb, tenantId: number, id: string): Promise<Supplier> {
    const row = await supplierRepository.findById(db, tenantId, id);
    if (!row) throw new NotFoundError('Supplier', id);
    return toSupplier(row);
  },

  async create(
    db: AppDb,
    tenantId: number,
    input: CreateSupplierInput,
    actorId: string = SYSTEM_USER_ID,
  ): Promise<Supplier> {
    const dup = await supplierRepository.findByName(db, tenantId, input.name);
    if (dup) {
      throw new ConflictError(`A supplier named "${input.name}" already exists`, {
        name: 'duplicate',
      });
    }
    const now = Date.now();
    const row = await supplierRepository.insert(db, {
      id: newId(),
      tenantId,
      name: input.name,
      contactInfo: input.contactInfo,
      gstin: input.gstin?.trim() || null,
      notes: input.notes,
      isActive: true,
      createdAt: now,
      updatedAt: now,
      createdBy: actorId,
      updatedBy: actorId,
    });
    return toSupplier(row);
  },

  async update(
    db: AppDb,
    tenantId: number,
    input: UpdateSupplierInput,
    actorId: string = SYSTEM_USER_ID,
  ): Promise<Supplier> {
    const existing = await supplierRepository.findById(db, tenantId, input.id);
    if (!existing) throw new NotFoundError('Supplier', input.id);

    if (input.name && input.name !== existing.name) {
      const dup = await supplierRepository.findByName(db, tenantId, input.name);
      if (dup && dup.id !== existing.id) {
        throw new ConflictError(`A supplier named "${input.name}" already exists`, {
          name: 'duplicate',
        });
      }
    }

    const patch: Record<string, unknown> = { updatedAt: Date.now(), updatedBy: actorId };
    if (input.name !== undefined) patch['name'] = input.name;
    if (input.contactInfo !== undefined) patch['contactInfo'] = input.contactInfo;
    if (input.gstin !== undefined) patch['gstin'] = input.gstin?.trim() || null;
    if (input.notes !== undefined) patch['notes'] = input.notes;
    if (input.isActive !== undefined) patch['isActive'] = input.isActive;

    const row = await supplierRepository.update(db, tenantId, input.id, patch);
    if (!row) throw new NotFoundError('Supplier', input.id);
    return toSupplier(row);
  },

  async deactivate(
    db: AppDb,
    tenantId: number,
    id: string,
    actorId: string = SYSTEM_USER_ID,
  ): Promise<Supplier> {
    const existing = await supplierRepository.findById(db, tenantId, id);
    if (!existing) throw new NotFoundError('Supplier', id);
    const row = await supplierRepository.update(db, tenantId, id, {
      isActive: false,
      updatedAt: Date.now(),
      updatedBy: actorId,
    });
    if (!row) throw new NotFoundError('Supplier', id);
    return toSupplier(row);
  },
};
