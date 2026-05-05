import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CsvImportService } from '../../main/services/CsvImportService';
import { RecipeService } from '../../main/services/RecipeService';
import { ingredientRepository } from '../../main/repositories/ingredientRepository';
import { menuItemRepository } from '../../main/repositories/menuItemRepository';
import { supplierRepository } from '../../main/repositories/supplierRepository';
import { stockMovementRepository } from '../../main/repositories/stockMovementRepository';
import { DEFAULT_TENANT_ID, SYSTEM_USER_ID } from '@shared/constants/system';
import type {
  IngredientRow,
  MenuItemRow,
  SupplierRow,
} from '../../main/db/schema';

const ING_RICE = '01900000-0000-7000-8000-0000000e00a1';
const ING_OIL = '01900000-0000-7000-8000-0000000e00a2';
const SUP_HSC = '01900000-0000-7000-8000-0000000e00b1';
const MI_BIRYANI = '01900000-0000-7000-8000-0000000e00c1';

function ing(overrides: Partial<IngredientRow>): IngredientRow {
  return {
    id: ING_RICE,
    tenantId: DEFAULT_TENANT_ID,
    name: 'Rice',
    category: 'Grains',
    type: 'raw',
    baseUnit: 'g',
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

function makeFakeDb() {
  const fake = {
    transaction: vi.fn((fn: (tx: unknown) => unknown) => fn(fake)),
  };
  return fake;
}

beforeEach(() => {
  vi.spyOn(ingredientRepository, 'list').mockReturnValue([]);
  vi.spyOn(menuItemRepository, 'list').mockReturnValue([]);
  vi.spyOn(supplierRepository, 'list').mockReturnValue([]);
  vi.spyOn(stockMovementRepository, 'list').mockReturnValue([]);
  vi.spyOn(ingredientRepository, 'insert').mockImplementation((_db, row) => row as IngredientRow);
  vi.spyOn(ingredientRepository, 'update').mockImplementation(() => undefined);
  vi.spyOn(menuItemRepository, 'insert').mockImplementation((_db, row) => row as MenuItemRow);
  vi.spyOn(menuItemRepository, 'update').mockImplementation(() => undefined);
  vi.spyOn(supplierRepository, 'insert').mockImplementation((_db, row) => row as SupplierRow);
  vi.spyOn(supplierRepository, 'update').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('CsvImportService.run — ingredients', () => {
  it('reports a clean dry-run summary and writes nothing', () => {
    const db = makeFakeDb();
    const csv =
      'name,category,type,base_unit,low_stock_threshold,density_g_per_ml\n' +
      'Rice,Grains,raw,g,5000,\n' +
      'Sunflower Oil,Oils,raw,ml,1000,0.92\n';

    const result = CsvImportService.run(db as never, DEFAULT_TENANT_ID, {
      kind: 'ingredients',
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
      ing({ id: ING_RICE, name: 'Rice', baseUnit: 'g' }),
    ]);
    const csv =
      'name,category,type,base_unit,low_stock_threshold,density_g_per_ml\n' +
      'Rice,Grains,raw,g,5000,\n' + // matches existing → update
      'Salt,Spices,raw,g,500,\n'; // new → create

    const result = CsvImportService.run(db as never, DEFAULT_TENANT_ID, {
      kind: 'ingredients',
      content: csv,
      dryRun: false,
    });

    expect(result.issues).toHaveLength(0);
    expect(result.committed).toBe(true);
    expect(result.summary).toEqual({ totalRows: 2, toCreate: 1, toUpdate: 1, skipped: 0 });
    expect(ingredientRepository.insert).toHaveBeenCalledTimes(1);
    expect(ingredientRepository.update).toHaveBeenCalledTimes(1);
  });

  it('refuses base_unit change on an ingredient with movements', () => {
    const db = makeFakeDb();
    vi.spyOn(ingredientRepository, 'list').mockReturnValue([
      ing({ id: ING_RICE, name: 'Rice', baseUnit: 'g' }),
    ]);
    vi.spyOn(stockMovementRepository, 'list').mockReturnValue([
      { id: 'm1' } as never, // any non-empty array signals movements exist
    ]);
    const csv =
      'name,category,type,base_unit,low_stock_threshold,density_g_per_ml\n' +
      'Rice,Grains,raw,each,0,\n';

    const result = CsvImportService.run(db as never, DEFAULT_TENANT_ID, {
      kind: 'ingredients',
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
      'name,category,type,base_unit,low_stock_threshold,density_g_per_ml\n' +
      ',Grains,raw,g,0,\n' + // missing name
      'X,Spices,exotic,g,0,\n' + // bad type
      'Y,Spices,raw,liters,0,\n'; // bad base_unit

    const result = CsvImportService.run(db as never, DEFAULT_TENANT_ID, {
      kind: 'ingredients',
      content: csv,
      dryRun: false,
    });

    expect(result.committed).toBe(false);
    const fields = result.issues.map((i) => i.field).sort();
    expect(fields).toContain('name');
    expect(fields).toContain('type');
    expect(fields).toContain('base_unit');
    expect(ingredientRepository.insert).not.toHaveBeenCalled();
  });

  it('flags missing required headers', () => {
    const db = makeFakeDb();
    const csv = 'name,category\nRice,Grains\n';
    const result = CsvImportService.run(db as never, DEFAULT_TENANT_ID, {
      kind: 'ingredients',
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
        id: SUP_HSC,
        tenantId: DEFAULT_TENANT_ID,
        name: 'Hyderabad Spice Co.',
        contactInfo: 'old@hsc',
        notes: null,
        isActive: true,
        createdAt: 0,
        updatedAt: 0,
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      } as SupplierRow,
    ]);
    const csv =
      'name,contact_info,notes\nHyderabad Spice Co.,new@hsc,Calls Mon-Sat\n';

    const result = CsvImportService.run(db as never, DEFAULT_TENANT_ID, {
      kind: 'suppliers',
      content: csv,
      dryRun: false,
    });

    expect(result.committed).toBe(true);
    expect(supplierRepository.insert).not.toHaveBeenCalled();
    expect(supplierRepository.update).toHaveBeenCalledTimes(1);
    expect(supplierRepository.update.mock.calls[0]![3]).toMatchObject({
      contactInfo: 'new@hsc',
    });
  });
});

describe('CsvImportService.run — recipes', () => {
  it('groups rows by parent and calls RecipeService.saveVersion once per parent', () => {
    const db = makeFakeDb();
    vi.spyOn(menuItemRepository, 'list').mockReturnValue([
      {
        id: MI_BIRYANI,
        tenantId: DEFAULT_TENANT_ID,
        name: 'Chicken Biryani (Half)',
        category: 'Mains',
        sellingPrice: 220,
        variantGroupId: null,
        displayOrder: 0,
        isActive: true,
        createdAt: 0,
        updatedAt: 0,
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      } as MenuItemRow,
    ]);
    vi.spyOn(ingredientRepository, 'list').mockReturnValue([
      ing({ id: ING_RICE, name: 'Rice', baseUnit: 'g' }),
      ing({ id: ING_OIL, name: 'Oil', baseUnit: 'ml' }),
    ]);
    const save = vi.spyOn(RecipeService, 'saveVersion').mockReturnValue({} as never);

    const csv =
      'parent_name,parent_type,child_ingredient_name,quantity,unit,notes\n' +
      'Chicken Biryani (Half),menu_item,Rice,200,g,\n' +
      'Chicken Biryani (Half),menu_item,Oil,15,ml,\n';

    const result = CsvImportService.run(db as never, DEFAULT_TENANT_ID, {
      kind: 'recipes',
      content: csv,
      dryRun: false,
    });

    expect(result.issues).toHaveLength(0);
    expect(result.committed).toBe(true);
    expect(save).toHaveBeenCalledTimes(1);
    const callInput = save.mock.calls[0]![2];
    expect(callInput.parentId).toBe(MI_BIRYANI);
    expect(callInput.rows.map((r) => r.childIngredientId)).toEqual([ING_RICE, ING_OIL]);
  });

  it('flags an unknown parent and skips that row', () => {
    const db = makeFakeDb();
    vi.spyOn(menuItemRepository, 'list').mockReturnValue([]);
    vi.spyOn(ingredientRepository, 'list').mockReturnValue([
      ing({ id: ING_RICE, name: 'Rice' }),
    ]);
    const csv =
      'parent_name,parent_type,child_ingredient_name,quantity,unit,notes\n' +
      'Phantom Dish,menu_item,Rice,100,g,\n';

    const result = CsvImportService.run(db as never, DEFAULT_TENANT_ID, {
      kind: 'recipes',
      content: csv,
      dryRun: true,
    });

    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]!.field).toBe('parent_name');
  });

  it('flags ingredient parent of type=raw', () => {
    const db = makeFakeDb();
    vi.spyOn(ingredientRepository, 'list').mockReturnValue([
      ing({ id: ING_RICE, name: 'Masala', type: 'raw' }),
      ing({ id: ING_OIL, name: 'Cardamom', type: 'raw' }),
    ]);
    const csv =
      'parent_name,parent_type,child_ingredient_name,quantity,unit,notes\n' +
      'Masala,ingredient,Cardamom,5,g,\n';

    const result = CsvImportService.run(db as never, DEFAULT_TENANT_ID, {
      kind: 'recipes',
      content: csv,
      dryRun: true,
    });

    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]!.field).toBe('parent_type');
    expect(result.issues[0]!.message).toMatch(/type=prepared/);
  });
});

describe('CsvImportService.run — menu_items', () => {
  it('mints one shared variant_group_id for sibling rows in the same import', () => {
    const db = makeFakeDb();
    const csv =
      'name,category,selling_price,variant_group,display_order\n' +
      'Chicken Biryani (Half),Mains,220,biryani,0\n' +
      'Chicken Biryani (Full),Mains,380,biryani,1\n';

    const result = CsvImportService.run(db as never, DEFAULT_TENANT_ID, {
      kind: 'menu_items',
      content: csv,
      dryRun: false,
    });

    expect(result.committed).toBe(true);
    expect(menuItemRepository.insert).toHaveBeenCalledTimes(2);
    const groupA = menuItemRepository.insert.mock.calls[0]![1].variantGroupId;
    const groupB = menuItemRepository.insert.mock.calls[1]![1].variantGroupId;
    expect(groupA).toBeTruthy();
    expect(groupA).toBe(groupB);
  });
});
