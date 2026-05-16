import { afterEach, describe, expect, it, vi } from 'vitest';
import { BikeService } from '../../main/services/BikeService';
import { bikeRepository } from '../../main/repositories/bikeRepository';
import { bikeTypeRepository } from '../../main/repositories/bikeTypeRepository';
import { DEFAULT_TENANT_ID, SYSTEM_USER_ID } from '@shared/constants/system';
import { ConflictError, NotFoundError } from '@shared/errors/DomainError';
import type { BikeRow, BikeTypeRow } from '../../main/db/schema';

const TYPE_ID_110 = '01900000-0000-7000-8000-0000000000a1';
const TYPE_ID_125 = '01900000-0000-7000-8000-0000000000a2';
const BIKE_ID = '01900000-0000-7000-8000-0000000000b1';

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

function bikeRow(overrides: Partial<BikeRow> = {}): BikeRow {
  return {
    id: BIKE_ID,
    tenantId: DEFAULT_TENANT_ID,
    bikeNumber: 'HYP-001',
    bikeTypeId: TYPE_ID_110,
    licensePlate: null,
    odometerKm: null,
    notes: null,
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

describe('BikeService.create', () => {
  it('rejects when bike_type does not exist', () => {
    vi.spyOn(bikeTypeRepository, 'findById').mockReturnValue(undefined);

    expect(() =>
      BikeService.create({} as never, DEFAULT_TENANT_ID, {
        bikeNumber: 'HYP-001',
        bikeTypeId: TYPE_ID_110,
        licensePlate: null,
        odometerKm: null,
        notes: null,
      }),
    ).toThrow(NotFoundError);
  });

  it('rejects duplicate bike numbers within a tenant', () => {
    vi.spyOn(bikeTypeRepository, 'findById').mockReturnValue(bikeTypeRow());
    vi.spyOn(bikeRepository, 'findByBikeNumber').mockReturnValue(bikeRow());

    expect(() =>
      BikeService.create({} as never, DEFAULT_TENANT_ID, {
        bikeNumber: 'HYP-001',
        bikeTypeId: TYPE_ID_110,
        licensePlate: null,
        odometerKm: null,
        notes: null,
      }),
    ).toThrow(ConflictError);
  });

  it('inserts a fresh bike when type exists and number is unique', () => {
    vi.spyOn(bikeTypeRepository, 'findById').mockReturnValue(bikeTypeRow());
    vi.spyOn(bikeRepository, 'findByBikeNumber').mockReturnValue(undefined);
    const insertSpy = vi
      .spyOn(bikeRepository, 'insert')
      .mockImplementation((_db, row) => row as BikeRow);

    const created = BikeService.create({} as never, DEFAULT_TENANT_ID, {
      bikeNumber: 'HYP-001',
      bikeTypeId: TYPE_ID_110,
      licensePlate: 'TS09AB1234',
      odometerKm: 1500,
      notes: null,
    });

    expect(insertSpy).toHaveBeenCalledOnce();
    expect(created.bikeNumber).toBe('HYP-001');
    expect(created.licensePlate).toBe('TS09AB1234');
    expect(created.odometerKm).toBe(1500);
    expect(created.isActive).toBe(true);
  });

  it('normalises a blank-trimmed license plate to null', () => {
    vi.spyOn(bikeTypeRepository, 'findById').mockReturnValue(bikeTypeRow());
    vi.spyOn(bikeRepository, 'findByBikeNumber').mockReturnValue(undefined);
    vi.spyOn(bikeRepository, 'insert').mockImplementation((_db, row) => row as BikeRow);

    const created = BikeService.create({} as never, DEFAULT_TENANT_ID, {
      bikeNumber: 'HYP-002',
      bikeTypeId: TYPE_ID_110,
      licensePlate: '   ',
      odometerKm: null,
      notes: null,
    });

    expect(created.licensePlate).toBeNull();
  });
});

describe('BikeService.update', () => {
  it('throws NotFoundError when bike does not exist', () => {
    vi.spyOn(bikeRepository, 'findById').mockReturnValue(undefined);

    expect(() =>
      BikeService.update({} as never, DEFAULT_TENANT_ID, {
        id: BIKE_ID,
        bikeNumber: 'HYP-099',
      }),
    ).toThrow(NotFoundError);
  });

  it('rejects duplicate bike number on rename', () => {
    vi.spyOn(bikeRepository, 'findById').mockReturnValue(bikeRow());
    vi.spyOn(bikeRepository, 'findByBikeNumber').mockReturnValue(
      bikeRow({ id: 'different-bike', bikeNumber: 'HYP-002' }),
    );

    expect(() =>
      BikeService.update({} as never, DEFAULT_TENANT_ID, {
        id: BIKE_ID,
        bikeNumber: 'HYP-002',
      }),
    ).toThrow(ConflictError);
  });

  it('validates the new bike_type when changing types', () => {
    vi.spyOn(bikeRepository, 'findById').mockReturnValue(bikeRow());
    vi.spyOn(bikeTypeRepository, 'findById').mockReturnValue(undefined);

    expect(() =>
      BikeService.update({} as never, DEFAULT_TENANT_ID, {
        id: BIKE_ID,
        bikeTypeId: TYPE_ID_125,
      }),
    ).toThrow(NotFoundError);
  });

  it('patches odometer + notes when supplied', () => {
    vi.spyOn(bikeRepository, 'findById').mockReturnValue(bikeRow());
    const updateSpy = vi
      .spyOn(bikeRepository, 'update')
      .mockImplementation((_db, _tenant, _id, patch) =>
        bikeRow({ ...patch } as Partial<BikeRow>),
      );

    const updated = BikeService.update({} as never, DEFAULT_TENANT_ID, {
      id: BIKE_ID,
      odometerKm: 2700,
      notes: 'replaced front brake pads',
    });

    expect(updateSpy).toHaveBeenCalledOnce();
    expect(updated.odometerKm).toBe(2700);
    expect(updated.notes).toBe('replaced front brake pads');
  });
});

describe('BikeService.deactivate', () => {
  it('flips isActive to false', () => {
    vi.spyOn(bikeRepository, 'findById').mockReturnValue(bikeRow());
    const updateSpy = vi
      .spyOn(bikeRepository, 'update')
      .mockImplementation((_db, _tenant, _id, patch) =>
        bikeRow({ ...patch } as Partial<BikeRow>),
      );

    const result = BikeService.deactivate({} as never, DEFAULT_TENANT_ID, BIKE_ID);

    expect(updateSpy).toHaveBeenCalled();
    expect(result.isActive).toBe(false);
  });

  it('throws NotFoundError when bike does not exist', () => {
    vi.spyOn(bikeRepository, 'findById').mockReturnValue(undefined);

    expect(() =>
      BikeService.deactivate({} as never, DEFAULT_TENANT_ID, BIKE_ID),
    ).toThrow(NotFoundError);
  });
});

describe('BikeService.listTypes', () => {
  it('delegates to repository and maps rows', () => {
    vi.spyOn(bikeTypeRepository, 'list').mockReturnValue([
      bikeTypeRow(),
      bikeTypeRow({ id: TYPE_ID_125, name: '125cc Ntorq', engineCc: 125, displayOrder: 2 }),
    ]);

    const types = BikeService.listTypes({} as never, DEFAULT_TENANT_ID, {
      includeInactive: false,
    });

    expect(types).toHaveLength(2);
    expect(types[0]!.name).toBe('110cc Activa');
    expect(types[1]!.engineCc).toBe(125);
  });
});
