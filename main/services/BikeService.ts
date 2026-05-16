import type { AppDb } from '../db/client';
import { newId } from '../lib/ids';
import { bikeRepository } from '../repositories/bikeRepository';
import { bikeTypeRepository } from '../repositories/bikeTypeRepository';
import type {
  Bike,
  BikeType,
  CreateBikeInput,
  ListBikeTypesInput,
  ListBikesInput,
  UpdateBikeInput,
} from '@shared/schemas/bike';
import { ConflictError, NotFoundError } from '@shared/errors/DomainError';
import { SYSTEM_USER_ID } from '@shared/constants/system';

function toBike(row: ReturnType<typeof bikeRepository.findById>): Bike {
  if (!row) throw new Error('toBike called with empty row');
  return row as unknown as Bike;
}

function toBikeType(row: ReturnType<typeof bikeTypeRepository.findById>): BikeType {
  if (!row) throw new Error('toBikeType called with empty row');
  return row as unknown as BikeType;
}

export const BikeService = {
  listTypes(db: AppDb, tenantId: number, filter: ListBikeTypesInput): BikeType[] {
    return bikeTypeRepository
      .list(db, tenantId, filter)
      .map((row) => row as unknown as BikeType);
  },

  list(db: AppDb, tenantId: number, filter: ListBikesInput): Bike[] {
    return bikeRepository
      .list(db, tenantId, filter)
      .map((row) => row as unknown as Bike);
  },

  get(db: AppDb, tenantId: number, id: string): Bike {
    const row = bikeRepository.findById(db, tenantId, id);
    if (!row) throw new NotFoundError('Bike', id);
    return toBike(row);
  },

  create(
    db: AppDb,
    tenantId: number,
    input: CreateBikeInput,
    actorId: string = SYSTEM_USER_ID,
  ): Bike {
    const bikeType = bikeTypeRepository.findById(db, tenantId, input.bikeTypeId);
    if (!bikeType) throw new NotFoundError('BikeType', input.bikeTypeId);

    const dup = bikeRepository.findByBikeNumber(db, tenantId, input.bikeNumber);
    if (dup) {
      throw new ConflictError(`A bike numbered "${input.bikeNumber}" already exists`, {
        bikeNumber: 'duplicate',
      });
    }
    const now = Date.now();
    const row = bikeRepository.insert(db, {
      id: newId(),
      tenantId,
      bikeNumber: input.bikeNumber,
      bikeTypeId: input.bikeTypeId,
      licensePlate: input.licensePlate?.trim() || null,
      odometerKm: input.odometerKm ?? null,
      notes: input.notes,
      isActive: true,
      createdAt: now,
      updatedAt: now,
      createdBy: actorId,
      updatedBy: actorId,
    });
    return toBike(row);
  },

  update(
    db: AppDb,
    tenantId: number,
    input: UpdateBikeInput,
    actorId: string = SYSTEM_USER_ID,
  ): Bike {
    const existing = bikeRepository.findById(db, tenantId, input.id);
    if (!existing) throw new NotFoundError('Bike', input.id);

    if (input.bikeTypeId && input.bikeTypeId !== existing.bikeTypeId) {
      const bikeType = bikeTypeRepository.findById(db, tenantId, input.bikeTypeId);
      if (!bikeType) throw new NotFoundError('BikeType', input.bikeTypeId);
    }

    if (input.bikeNumber && input.bikeNumber !== existing.bikeNumber) {
      const dup = bikeRepository.findByBikeNumber(db, tenantId, input.bikeNumber);
      if (dup && dup.id !== existing.id) {
        throw new ConflictError(
          `A bike numbered "${input.bikeNumber}" already exists`,
          { bikeNumber: 'duplicate' },
        );
      }
    }

    const patch: Record<string, unknown> = { updatedAt: Date.now(), updatedBy: actorId };
    if (input.bikeNumber !== undefined) patch['bikeNumber'] = input.bikeNumber;
    if (input.bikeTypeId !== undefined) patch['bikeTypeId'] = input.bikeTypeId;
    if (input.licensePlate !== undefined)
      patch['licensePlate'] = input.licensePlate?.trim() || null;
    if (input.odometerKm !== undefined) patch['odometerKm'] = input.odometerKm;
    if (input.notes !== undefined) patch['notes'] = input.notes;
    if (input.isActive !== undefined) patch['isActive'] = input.isActive;

    const row = bikeRepository.update(db, tenantId, input.id, patch);
    if (!row) throw new NotFoundError('Bike', input.id);
    return toBike(row);
  },

  deactivate(
    db: AppDb,
    tenantId: number,
    id: string,
    actorId: string = SYSTEM_USER_ID,
  ): Bike {
    const existing = bikeRepository.findById(db, tenantId, id);
    if (!existing) throw new NotFoundError('Bike', id);
    const row = bikeRepository.update(db, tenantId, id, {
      isActive: false,
      updatedAt: Date.now(),
      updatedBy: actorId,
    });
    if (!row) throw new NotFoundError('Bike', id);
    return toBike(row);
  },

  // Used by future ServiceTemplate code to validate a bikeTypeId reference.
  // Re-exported here so callers don't have to import the repository directly.
  getType(db: AppDb, tenantId: number, id: string): BikeType {
    const row = bikeTypeRepository.findById(db, tenantId, id);
    if (!row) throw new NotFoundError('BikeType', id);
    return toBikeType(row);
  },
};
