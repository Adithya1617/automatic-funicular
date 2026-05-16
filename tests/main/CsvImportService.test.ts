import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CsvImportService } from '../../main/services/CsvImportService';
import { RecipeService } from '../../main/services/RecipeService';
import { bikeRepository } from '../../main/repositories/bikeRepository';
import { bikeTypeRepository } from '../../main/repositories/bikeTypeRepository';
import { ingredientRepository } from '../../main/repositories/ingredientRepository';
import { serviceTemplateRepository } from '../../main/repositories/serviceTemplateRepository';
import { supplierRepository } from '../../main/repositories/supplierRepository';
import { stockMovementRepository } from '../../main/repositories/stockMovementRepository';
import { DEFAULT_TENANT_ID, SYSTEM_USER_ID } from '@shared/constants/system';
import type {
  BikeRow,
  BikeTypeRow,
  IngredientRow,
  ServiceTemplateRow,
  SupplierRow,
} from '../../main/db/schema';

const ING_OIL = '01900000-0000-7000-8000-0000000e00a1';
const ING_BRAKE = '01900000-0000-7000-8000-0000000e00a2';
const SUP_BOSCH = '01900000-0000-7000-8000-0000000e00b1';
const TYPE_125_NTORQ = '01900000-0000-7000-8000-0000000e00c1';
const TYPE_110_ACTIVA = '01900000-0000-7000-8000-0000000e00c2';
const BIKE_1 = '01900000-0000-7000-8000-0000000e00d1';
const TPL_STD = '01900000-0000-7000-8000-0000000e00e1';

function ing(overrides: Partial<IngredientRow>): IngredientRow {
  return {
    id: ING_OIL,
    tenantId: DEFAULT_TENANT_ID,
    name: 'Engine oil',
    category: 'Oil',
    type: 'raw',
    baseUnit: 'ml',
    stockQuantity: 0,
    reservedQuantity: 0,
    lowStockThreshold: 0,
    currentAvgCostPerUnit: 0,
    densityGPerMl: null,
    isActive: true,
    createdAt: 0,
    updatedAt: 0,
    createdBy: SYSTEM_USER_ID,
    updatedBy: SYSTEM_USER_ID,
    ...overrides,
  };
}

function bikeType(overrides: Partial<BikeTypeRow>): BikeTypeRow {
  return {
    id: TYPE_125_NTORQ,
    tenantId: DEFAULT_TENANT_ID,
    name: 'Ntorq',
    engineCc: 125,
    displayOrder: 0,
    isActive: true,
    createdAt: 0,
    updatedAt: 0,
    createdBy: SYSTEM_USER_ID,
    updatedBy: SYSTEM_USER_ID,
    ...overrides,
  };
}

function makeFakeDb() {
  const fake = {
    transaction: vi.fn((fn: (tx: unknown) => unknown) => fn(fake)),
  };
  return fake;
}

beforeEach(() => {
  vi.spyOn(ingredientRepository, 'list').mockReturnValue([]);
  vi.spyOn(supplierRepository, 'list').mockReturnValue([]);
  vi.spyOn(stockMovementRepository, 'list').mockReturnValue([]);
  vi.spyOn(bikeRepository, 'list').mockReturnValue([]);
  vi.spyOn(bikeTypeRepository, 'list').mockReturnValue([]);
  vi.spyOn(serviceTemplateRepository, 'list').mockReturnValue([]);
  vi.spyOn(ingredientRepository, 'insert').mockImplementation((_db, row) => row as IngredientRow);
  vi.spyOn(ingredientRepository, 'update').mockImplementation(() => undefined);
  vi.spyOn(supplierRepository, 'insert').mockImplementation((_db, row) => row as SupplierRow);
  vi.spyOn(supplierRepository, 'update').mockImplementation(() => undefined);
  vi.spyOn(bikeRepository, 'insert').mockImplementation((_db, row) => row as BikeRow);
  vi.spyOn(bikeRepository, 'update').mockImplementation(() => undefined);
  vi.spyOn(serviceTemplateRepository, 'insert').mockImplementation(
    (_db, row) => row as ServiceTemplateRow,
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('CsvImportService.run — parts', () => {
  it('reports a clean dry-run summary and writes nothing', () => {
    const db = makeFakeDb();
    const csv =
      'name,category,base_unit,low_stock_threshold,density_g_per_ml\n' +
      'Engine oil,Oil,ml,500,0.87\n' +
      'Brake pad,Brake,each,4,\n';

    const result = CsvImportService.run(db as never, DEFAULT_TENANT_ID, {
      kind: 'parts',
      content: csv,
      dryRun: true,
    });

    expect(result.issues).toHaveLength(0);
    expect(result.committed).toBe(false);
    expect(result.summary).toEqual({ totalRows: 2, toCreate: 2, toUpdate: 0, skipped: 0 });
    expect(ingredientRepository.insert).not.toHaveBeenCalled();
    expect(ingredientRepository.update).not.toHaveBeenCalled();
  });

  it('writes via insert/update once when committed and existing names are matched', () => {
    const db = makeFakeDb();
    vi.spyOn(ingredientRepository, 'list').mockReturnValue([
      ing({ id: ING_OIL, name: 'Engine oil', baseUnit: 'ml' }),
    ]);
    const csv =
      'name,category,base_unit,low_stock_threshold,density_g_per_ml\n' +
      'Engine oil,Oil,ml,500,\n' + // matches existing → update
      'Brake pad,Brake,each,4,\n'; // new → create

    const result = CsvImportService.run(db as never, DEFAULT_TENANT_ID, {
      kind: 'parts',
      content: csv,
      dryRun: false,
    });

    expect(result.issues).toHaveLength(0);
    expect(result.committed).toBe(true);
    expect(result.summary).toEqual({ totalRows: 2, toCreate: 1, toUpdate: 1, skipped: 0 });
    expect(ingredientRepository.insert).toHaveBeenCalledTimes(1);
    expect(ingredientRepository.update).toHaveBeenCalledTimes(1);
  });

  it("creates parts with type='raw' implicitly (no type column required)", () => {
    const db = makeFakeDb();
    const csv = 'name,category,base_unit\nClutch wire,Cable,each\n';

    const result = CsvImportService.run(db as never, DEFAULT_TENANT_ID, {
      kind: 'parts',
      content: csv,
      dryRun: false,
    });

    expect(result.committed).toBe(true);
    expect(ingredientRepository.insert).toHaveBeenCalledTimes(1);
    expect(ingredientRepository.insert.mock.calls[0]![1].type).toBe('raw');
  });

  it('refuses base_unit change on a part with movements', () => {
    const db = makeFakeDb();
    vi.spyOn(ingredientRepository, 'list').mockReturnValue([
      ing({ id: ING_OIL, name: 'Engine oil', baseUnit: 'ml' }),
    ]);
    vi.spyOn(stockMovementRepository, 'list').mockReturnValue([
      { id: 'm1' } as never,
    ]);
    const csv = 'name,category,base_unit\nEngine oil,Oil,each\n';

    const result = CsvImportService.run(db as never, DEFAULT_TENANT_ID, {
      kind: 'parts',
      content: csv,
      dryRun: true,
    });

    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]!.field).toBe('base_unit');
    expect(result.issues[0]!.message).toMatch(/Cannot change base_unit/);
  });

  it('collects all per-row validation errors before any write', () => {
    const db = makeFakeDb();
    const csv =
      'name,category,base_unit\n' +
      ',Oil,ml\n' + // missing name
      'X,Oil,liters\n' + // bad base_unit
      'Y,,each\n'; // missing category

    const result = CsvImportService.run(db as never, DEFAULT_TENANT_ID, {
      kind: 'parts',
      content: csv,
      dryRun: false,
    });

    expect(result.committed).toBe(false);
    const fields = result.issues.map((i) => i.field).sort();
    expect(fields).toContain('name');
    expect(fields).toContain('base_unit');
    expect(fields).toContain('category');
    expect(ingredientRepository.insert).not.toHaveBeenCalled();
  });

  it('flags missing required headers', () => {
    const db = makeFakeDb();
    const csv = 'name,category\nEngine oil,Oil\n';
    const result = CsvImportService.run(db as never, DEFAULT_TENANT_ID, {
      kind: 'parts',
      content: csv,
      dryRun: true,
    });
    expect(result.issues.some((i) => /missing required header/.test(i.message))).toBe(true);
  });
});

describe('CsvImportService.run — suppliers', () => {
  it('matches existing suppliers by name and updates instead of duplicating', () => {
    const db = makeFakeDb();
    vi.spyOn(supplierRepository, 'list').mockReturnValue([
      {
        id: SUP_BOSCH,
        tenantId: DEFAULT_TENANT_ID,
        name: 'Bosch Spares',
        contactInfo: 'old@bosch',
        notes: null,
        isActive: true,
        createdAt: 0,
        updatedAt: 0,
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      } as SupplierRow,
    ]);
    const csv = 'name,contact_info,notes\nBosch Spares,new@bosch,Calls Mon-Sat\n';

    const result = CsvImportService.run(db as never, DEFAULT_TENANT_ID, {
      kind: 'suppliers',
      content: csv,
      dryRun: false,
    });

    expect(result.committed).toBe(true);
    expect(supplierRepository.insert).not.toHaveBeenCalled();
    expect(supplierRepository.update).toHaveBeenCalledTimes(1);
    expect(supplierRepository.update.mock.calls[0]![3]).toMatchObject({
      contactInfo: 'new@bosch',
    });
  });
});

describe('CsvImportService.run — bikes', () => {
  it('resolves (engine_cc, bike_type) to bike_type_id and inserts new bikes', () => {
    const db = makeFakeDb();
    vi.spyOn(bikeTypeRepository, 'list').mockReturnValue([
      bikeType({ id: TYPE_125_NTORQ, name: 'Ntorq', engineCc: 125 }),
      bikeType({ id: TYPE_110_ACTIVA, name: 'Activa', engineCc: 110 }),
    ]);
    const csv =
      'bike_number,engine_cc,bike_type,license_plate,odometer_km,notes\n' +
      '1,125,Ntorq,TG08T0481,,\n' +
      '2,110,Activa,TS08UL8345,1500,Newer\n';

    const result = CsvImportService.run(db as never, DEFAULT_TENANT_ID, {
      kind: 'bikes',
      content: csv,
      dryRun: false,
    });

    expect(result.issues).toHaveLength(0);
    expect(result.committed).toBe(true);
    expect(bikeRepository.insert).toHaveBeenCalledTimes(2);
    expect(bikeRepository.insert.mock.calls[0]![1]).toMatchObject({
      bikeNumber: '1',
      bikeTypeId: TYPE_125_NTORQ,
      licensePlate: 'TG08T0481',
    });
    expect(bikeRepository.insert.mock.calls[1]![1]).toMatchObject({
      bikeNumber: '2',
      bikeTypeId: TYPE_110_ACTIVA,
      odometerKm: 1500,
      notes: 'Newer',
    });
  });

  it('updates an existing bike matched by bike_number', () => {
    const db = makeFakeDb();
    vi.spyOn(bikeTypeRepository, 'list').mockReturnValue([
      bikeType({ id: TYPE_125_NTORQ, name: 'Ntorq', engineCc: 125 }),
    ]);
    vi.spyOn(bikeRepository, 'list').mockReturnValue([
      {
        id: BIKE_1,
        tenantId: DEFAULT_TENANT_ID,
        bikeNumber: 'HYP-001',
        bikeTypeId: TYPE_125_NTORQ,
        licensePlate: null,
        odometerKm: null,
        notes: null,
        isActive: true,
        createdAt: 0,
        updatedAt: 0,
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      } as BikeRow,
    ]);
    const csv =
      'bike_number,engine_cc,bike_type,license_plate,odometer_km,notes\n' +
      'HYP-001,125,Ntorq,TG08T0481,,\n';

    const result = CsvImportService.run(db as never, DEFAULT_TENANT_ID, {
      kind: 'bikes',
      content: csv,
      dryRun: false,
    });

    expect(result.committed).toBe(true);
    expect(bikeRepository.insert).not.toHaveBeenCalled();
    expect(bikeRepository.update).toHaveBeenCalledTimes(1);
    expect(bikeRepository.update.mock.calls[0]![3]).toMatchObject({
      licensePlate: 'TG08T0481',
    });
  });

  it('flags rows whose (engine_cc, bike_type) does not match any seeded type', () => {
    const db = makeFakeDb();
    vi.spyOn(bikeTypeRepository, 'list').mockReturnValue([
      bikeType({ id: TYPE_125_NTORQ, name: 'Ntorq', engineCc: 125 }),
    ]);
    const csv =
      'bike_number,engine_cc,bike_type\n' +
      '1,125,Phantom\n' + // unknown model at known cc
      '2,250,Ntorq\n'; // wrong cc

    const result = CsvImportService.run(db as never, DEFAULT_TENANT_ID, {
      kind: 'bikes',
      content: csv,
      dryRun: false,
    });

    expect(result.committed).toBe(false);
    expect(result.issues).toHaveLength(2);
    expect(result.issues.every((i) => i.field === 'bike_type')).toBe(true);
  });

  it('flags non-numeric engine_cc', () => {
    const db = makeFakeDb();
    vi.spyOn(bikeTypeRepository, 'list').mockReturnValue([
      bikeType({ id: TYPE_125_NTORQ, name: 'Ntorq', engineCc: 125 }),
    ]);
    const csv = 'bike_number,engine_cc,bike_type\n1,abc,Ntorq\n';

    const result = CsvImportService.run(db as never, DEFAULT_TENANT_ID, {
      kind: 'bikes',
      content: csv,
      dryRun: true,
    });

    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]!.field).toBe('engine_cc');
  });
});

describe('CsvImportService.run — service_templates', () => {
  it('groups rows by (template_name, bike_type) and saves one recipe version per group', () => {
    const db = makeFakeDb();
    vi.spyOn(bikeTypeRepository, 'list').mockReturnValue([
      bikeType({ id: TYPE_125_NTORQ, name: 'Ntorq', engineCc: 125 }),
    ]);
    vi.spyOn(ingredientRepository, 'list').mockReturnValue([
      ing({ id: ING_OIL, name: 'Engine oil', baseUnit: 'ml' }),
      ing({ id: ING_BRAKE, name: 'Brake pad', baseUnit: 'each' }),
    ]);
    const save = vi.spyOn(RecipeService, 'saveVersion').mockReturnValue({} as never);

    const csv =
      'template_name,engine_cc,bike_type,part_name,quantity,unit,display_order,notes\n' +
      'Standard service,125,Ntorq,Engine oil,800,ml,0,\n' +
      'Standard service,125,Ntorq,Brake pad,2,each,1,Front\n';

    const result = CsvImportService.run(db as never, DEFAULT_TENANT_ID, {
      kind: 'service_templates',
      content: csv,
      dryRun: false,
    });

    expect(result.issues).toHaveLength(0);
    expect(result.committed).toBe(true);
    expect(serviceTemplateRepository.insert).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledTimes(1);
    const callInput = save.mock.calls[0]![2];
    expect(callInput.parentType).toBe('service_template');
    expect(callInput.rows.map((r) => r.childIngredientId)).toEqual([ING_OIL, ING_BRAKE]);
  });

  it('reuses an existing template (no insert) but still writes a new recipe version', () => {
    const db = makeFakeDb();
    vi.spyOn(bikeTypeRepository, 'list').mockReturnValue([
      bikeType({ id: TYPE_125_NTORQ, name: 'Ntorq', engineCc: 125 }),
    ]);
    vi.spyOn(ingredientRepository, 'list').mockReturnValue([
      ing({ id: ING_OIL, name: 'Engine oil', baseUnit: 'ml' }),
    ]);
    vi.spyOn(serviceTemplateRepository, 'list').mockReturnValue([
      {
        id: TPL_STD,
        tenantId: DEFAULT_TENANT_ID,
        name: 'Standard service',
        bikeTypeId: TYPE_125_NTORQ,
        displayOrder: 0,
        isActive: true,
        createdAt: 0,
        updatedAt: 0,
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      } as ServiceTemplateRow,
    ]);
    const save = vi.spyOn(RecipeService, 'saveVersion').mockReturnValue({} as never);

    const csv =
      'template_name,engine_cc,bike_type,part_name,quantity,unit\n' +
      'Standard service,125,Ntorq,Engine oil,800,ml\n';

    const result = CsvImportService.run(db as never, DEFAULT_TENANT_ID, {
      kind: 'service_templates',
      content: csv,
      dryRun: false,
    });

    expect(result.committed).toBe(true);
    expect(result.summary.toCreate).toBe(0);
    expect(result.summary.toUpdate).toBe(1);
    expect(serviceTemplateRepository.insert).not.toHaveBeenCalled();
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0]![2].parentId).toBe(TPL_STD);
  });

  it('flags rows pointing to an unknown part', () => {
    const db = makeFakeDb();
    vi.spyOn(bikeTypeRepository, 'list').mockReturnValue([
      bikeType({ id: TYPE_125_NTORQ, name: 'Ntorq', engineCc: 125 }),
    ]);
    vi.spyOn(ingredientRepository, 'list').mockReturnValue([]);
    const csv =
      'template_name,engine_cc,bike_type,part_name,quantity,unit\n' +
      'Standard service,125,Ntorq,Phantom part,800,ml\n';

    const result = CsvImportService.run(db as never, DEFAULT_TENANT_ID, {
      kind: 'service_templates',
      content: csv,
      dryRun: true,
    });

    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]!.field).toBe('part_name');
  });

  it('flags rows whose unit cannot be converted to the part base_unit', () => {
    const db = makeFakeDb();
    vi.spyOn(bikeTypeRepository, 'list').mockReturnValue([
      bikeType({ id: TYPE_125_NTORQ, name: 'Ntorq', engineCc: 125 }),
    ]);
    vi.spyOn(ingredientRepository, 'list').mockReturnValue([
      ing({ id: ING_BRAKE, name: 'Brake pad', baseUnit: 'each' }),
    ]);
    const csv =
      'template_name,engine_cc,bike_type,part_name,quantity,unit\n' +
      'Standard service,125,Ntorq,Brake pad,500,ml\n';

    const result = CsvImportService.run(db as never, DEFAULT_TENANT_ID, {
      kind: 'service_templates',
      content: csv,
      dryRun: true,
    });

    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]!.field).toBe('unit');
  });
});
