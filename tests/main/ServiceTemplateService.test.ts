import { afterEach, describe, expect, it, vi } from 'vitest';
import { ServiceTemplateService } from '../../main/services/ServiceTemplateService';
import { serviceTemplateRepository } from '../../main/repositories/serviceTemplateRepository';
import { bikeTypeRepository } from '../../main/repositories/bikeTypeRepository';
import { DEFAULT_TENANT_ID, SYSTEM_USER_ID } from '@shared/constants/system';
import { ConflictError, NotFoundError } from '@shared/errors/DomainError';
import type { BikeTypeRow, ServiceTemplateRow } from '../../main/db/schema';

const TYPE_ID_110 = '01900000-0000-7000-8000-0000000000a1';
const TYPE_ID_125 = '01900000-0000-7000-8000-0000000000a2';
const TPL_ID = '01900000-0000-7000-8000-0000000000c1';

function bikeTypeRow(overrides: Partial<BikeTypeRow> = {}): BikeTypeRow {
  return {
    id: TYPE_ID_110,
    tenantId: DEFAULT_TENANT_ID,
    name: '110cc Activa',
    engineCc: 110,
    displayOrder: 1,
    isActive: true,
    createdAt: 0,
    updatedAt: 0,
    createdBy: SYSTEM_USER_ID,
    updatedBy: SYSTEM_USER_ID,
    ...overrides,
  };
}

function tplRow(overrides: Partial<ServiceTemplateRow> = {}): ServiceTemplateRow {
  return {
    id: TPL_ID,
    tenantId: DEFAULT_TENANT_ID,
    name: 'Standard service',
    bikeTypeId: TYPE_ID_110,
    displayOrder: 0,
    isActive: true,
    createdAt: 0,
    updatedAt: 0,
    createdBy: SYSTEM_USER_ID,
    updatedBy: SYSTEM_USER_ID,
    ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ServiceTemplateService.create', () => {
  it('rejects when bike_type does not exist', () => {
    vi.spyOn(bikeTypeRepository, 'findById').mockReturnValue(undefined);
    expect(() =>
      ServiceTemplateService.create({} as never, DEFAULT_TENANT_ID, {
        name: 'Standard service',
        bikeTypeId: TYPE_ID_110,
        displayOrder: 0,
      }),
    ).toThrow(NotFoundError);
  });

  it('rejects when a same-name template already exists for the same bike type', () => {
    vi.spyOn(bikeTypeRepository, 'findById').mockReturnValue(bikeTypeRow());
    vi.spyOn(serviceTemplateRepository, 'findByNameAndType').mockReturnValue(tplRow());
    expect(() =>
      ServiceTemplateService.create({} as never, DEFAULT_TENANT_ID, {
        name: 'Standard service',
        bikeTypeId: TYPE_ID_110,
        displayOrder: 0,
      }),
    ).toThrow(ConflictError);
  });

  it('allows the same name across different bike types', () => {
    vi.spyOn(bikeTypeRepository, 'findById').mockReturnValue(
      bikeTypeRow({ id: TYPE_ID_125, name: '125cc Ntorq', engineCc: 125 }),
    );
    vi.spyOn(serviceTemplateRepository, 'findByNameAndType').mockReturnValue(undefined);
    const insertSpy = vi
      .spyOn(serviceTemplateRepository, 'insert')
      .mockImplementation((_db, row) => row as ServiceTemplateRow);

    const created = ServiceTemplateService.create({} as never, DEFAULT_TENANT_ID, {
      name: 'Standard service',
      bikeTypeId: TYPE_ID_125,
      displayOrder: 0,
    });

    expect(insertSpy).toHaveBeenCalledOnce();
    expect(created.name).toBe('Standard service');
    expect(created.bikeTypeId).toBe(TYPE_ID_125);
    expect(created.isActive).toBe(true);
  });
});

describe('ServiceTemplateService.update', () => {
  it('throws NotFoundError when template does not exist', () => {
    vi.spyOn(serviceTemplateRepository, 'findById').mockReturnValue(undefined);
    expect(() =>
      ServiceTemplateService.update({} as never, DEFAULT_TENANT_ID, {
        id: TPL_ID,
        name: 'X',
      }),
    ).toThrow(NotFoundError);
  });

  it('validates the new bike_type when changing types', () => {
    vi.spyOn(serviceTemplateRepository, 'findById').mockReturnValue(tplRow());
    vi.spyOn(bikeTypeRepository, 'findById').mockReturnValue(undefined);
    expect(() =>
      ServiceTemplateService.update({} as never, DEFAULT_TENANT_ID, {
        id: TPL_ID,
        bikeTypeId: TYPE_ID_125,
      }),
    ).toThrow(NotFoundError);
  });

  it('rejects rename collision with an existing template for the same bike type', () => {
    vi.spyOn(serviceTemplateRepository, 'findById').mockReturnValue(tplRow());
    vi.spyOn(serviceTemplateRepository, 'findByNameAndType').mockReturnValue(
      tplRow({ id: 'other-tpl', name: 'Oil change' }),
    );
    expect(() =>
      ServiceTemplateService.update({} as never, DEFAULT_TENANT_ID, {
        id: TPL_ID,
        name: 'Oil change',
      }),
    ).toThrow(ConflictError);
  });

  it('patches displayOrder when supplied', () => {
    vi.spyOn(serviceTemplateRepository, 'findById').mockReturnValue(tplRow());
    const updateSpy = vi
      .spyOn(serviceTemplateRepository, 'update')
      .mockImplementation((_db, _tenant, _id, patch) =>
        tplRow({ ...patch } as Partial<ServiceTemplateRow>),
      );

    const updated = ServiceTemplateService.update({} as never, DEFAULT_TENANT_ID, {
      id: TPL_ID,
      displayOrder: 5,
    });

    expect(updateSpy).toHaveBeenCalledOnce();
    expect(updated.displayOrder).toBe(5);
  });
});

describe('ServiceTemplateService.deactivate', () => {
  it('flips isActive to false', () => {
    vi.spyOn(serviceTemplateRepository, 'findById').mockReturnValue(tplRow());
    const updateSpy = vi
      .spyOn(serviceTemplateRepository, 'update')
      .mockImplementation((_db, _tenant, _id, patch) =>
        tplRow({ ...patch } as Partial<ServiceTemplateRow>),
      );
    const result = ServiceTemplateService.deactivate(
      {} as never,
      DEFAULT_TENANT_ID,
      TPL_ID,
    );
    expect(updateSpy).toHaveBeenCalled();
    expect(result.isActive).toBe(false);
  });
});

describe('ServiceTemplateService.list', () => {
  it('delegates to the repository and maps rows', () => {
    vi.spyOn(serviceTemplateRepository, 'list').mockReturnValue([
      tplRow(),
      tplRow({ id: 'tpl-2', name: 'Oil change' }),
    ]);
    const out = ServiceTemplateService.list({} as never, DEFAULT_TENANT_ID, {
      includeInactive: false,
    });
    expect(out).toHaveLength(2);
    expect(out[1]!.name).toBe('Oil change');
  });
});
