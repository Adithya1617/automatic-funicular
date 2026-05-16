import type { AppDb } from '../db/client';
import { newId } from '../lib/ids';
import { bikeTypeRepository } from '../repositories/bikeTypeRepository';
import { serviceTemplateRepository } from '../repositories/serviceTemplateRepository';
import type {
  CreateServiceTemplateInput,
  ListServiceTemplatesInput,
  ServiceTemplate,
  UpdateServiceTemplateInput,
} from '@shared/schemas/serviceTemplate';
import { ConflictError, NotFoundError } from '@shared/errors/DomainError';
import { SYSTEM_USER_ID } from '@shared/constants/system';

function toTemplate(
  row: ReturnType<typeof serviceTemplateRepository.findById>,
): ServiceTemplate {
  if (!row) throw new Error('toTemplate called with empty row');
  return row as unknown as ServiceTemplate;
}

export const ServiceTemplateService = {
  list(
    db: AppDb,
    tenantId: number,
    filter: ListServiceTemplatesInput,
  ): ServiceTemplate[] {
    return serviceTemplateRepository
      .list(db, tenantId, filter)
      .map((row) => row as unknown as ServiceTemplate);
  },

  get(db: AppDb, tenantId: number, id: string): ServiceTemplate {
    const row = serviceTemplateRepository.findById(db, tenantId, id);
    if (!row) throw new NotFoundError('ServiceTemplate', id);
    return toTemplate(row);
  },

  create(
    db: AppDb,
    tenantId: number,
    input: CreateServiceTemplateInput,
    actorId: string = SYSTEM_USER_ID,
  ): ServiceTemplate {
    const bikeType = bikeTypeRepository.findById(db, tenantId, input.bikeTypeId);
    if (!bikeType) throw new NotFoundError('BikeType', input.bikeTypeId);

    const dup = serviceTemplateRepository.findByNameAndType(
      db,
      tenantId,
      input.name,
      input.bikeTypeId,
    );
    if (dup) {
      throw new ConflictError(
        `A service template named "${input.name}" already exists for ${bikeType.name}`,
        { name: 'duplicate' },
      );
    }

    const now = Date.now();
    const row = serviceTemplateRepository.insert(db, {
      id: newId(),
      tenantId,
      name: input.name,
      bikeTypeId: input.bikeTypeId,
      displayOrder: input.displayOrder ?? 0,
      isActive: true,
      createdAt: now,
      updatedAt: now,
      createdBy: actorId,
      updatedBy: actorId,
    });
    return toTemplate(row);
  },

  update(
    db: AppDb,
    tenantId: number,
    input: UpdateServiceTemplateInput,
    actorId: string = SYSTEM_USER_ID,
  ): ServiceTemplate {
    const existing = serviceTemplateRepository.findById(db, tenantId, input.id);
    if (!existing) throw new NotFoundError('ServiceTemplate', input.id);

    if (input.bikeTypeId && input.bikeTypeId !== existing.bikeTypeId) {
      const bikeType = bikeTypeRepository.findById(db, tenantId, input.bikeTypeId);
      if (!bikeType) throw new NotFoundError('BikeType', input.bikeTypeId);
    }

    const nextName = input.name ?? existing.name;
    const nextTypeId = input.bikeTypeId ?? existing.bikeTypeId;
    if (
      (input.name && input.name !== existing.name) ||
      (input.bikeTypeId && input.bikeTypeId !== existing.bikeTypeId)
    ) {
      const dup = serviceTemplateRepository.findByNameAndType(
        db,
        tenantId,
        nextName,
        nextTypeId,
      );
      if (dup && dup.id !== existing.id) {
        throw new ConflictError(
          `A service template named "${nextName}" already exists for this bike type`,
          { name: 'duplicate' },
        );
      }
    }

    const patch: Record<string, unknown> = {
      updatedAt: Date.now(),
      updatedBy: actorId,
    };
    if (input.name !== undefined) patch['name'] = input.name;
    if (input.bikeTypeId !== undefined) patch['bikeTypeId'] = input.bikeTypeId;
    if (input.displayOrder !== undefined) patch['displayOrder'] = input.displayOrder;
    if (input.isActive !== undefined) patch['isActive'] = input.isActive;

    const row = serviceTemplateRepository.update(db, tenantId, input.id, patch);
    if (!row) throw new NotFoundError('ServiceTemplate', input.id);
    return toTemplate(row);
  },

  deactivate(
    db: AppDb,
    tenantId: number,
    id: string,
    actorId: string = SYSTEM_USER_ID,
  ): ServiceTemplate {
    const existing = serviceTemplateRepository.findById(db, tenantId, id);
    if (!existing) throw new NotFoundError('ServiceTemplate', id);
    const row = serviceTemplateRepository.update(db, tenantId, id, {
      isActive: false,
      updatedAt: Date.now(),
      updatedBy: actorId,
    });
    if (!row) throw new NotFoundError('ServiceTemplate', id);
    return toTemplate(row);
  },
};
