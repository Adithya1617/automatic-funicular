import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RecipeService } from '../../main/services/RecipeService';
import { AvailabilityService } from '../../main/services/AvailabilityService';
import { ingredientRepository } from '../../main/repositories/ingredientRepository';
import { menuItemRepository } from '../../main/repositories/menuItemRepository';
import { recipeRepository } from '../../main/repositories/recipeRepository';
import { serviceTemplateRepository } from '../../main/repositories/serviceTemplateRepository';
import { DEFAULT_TENANT_ID, SYSTEM_USER_ID } from '@shared/constants/system';
import { ConflictError, NotFoundError, ValidationError } from '@shared/errors/DomainError';
import type { IngredientRow, RecipeIngredientRow, RecipeVersionRow } from '../../main/db/schema';

beforeEach(() => {
  vi.spyOn(AvailabilityService, 'recomputeForIngredients').mockImplementation(() => undefined);
  vi.spyOn(AvailabilityService, 'recomputeForMenuItem').mockImplementation(() => undefined);
});

const PARENT_ID = '01900000-0000-7000-8000-000000000001';
const RAW_A = '01900000-0000-7000-8000-00000000000a';
const RAW_B = '01900000-0000-7000-8000-00000000000b';
const PREP_C = '01900000-0000-7000-8000-00000000000c';

function ing(overrides: Partial<IngredientRow>): IngredientRow {
  return {
    id: PARENT_ID,
    tenantId: DEFAULT_TENANT_ID,
    name: 'Biryani Masala',
    category: 'Spices',
    type: 'prepared',
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
  const fakeDb = {
    transaction: vi.fn((fn: (tx: unknown) => unknown) => fn(fakeDb)),
  };
  return fakeDb;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('RecipeService.saveVersion — invariants', () => {
  it('accepts parent_type=menu_item and resolves the parent via menuItemRepository', () => {
    const db = makeFakeDb();
    const menuId = '01900000-0000-7000-8000-0000000000f1';
    vi.spyOn(menuItemRepository, 'findById').mockReturnValue({
      id: menuId,
      tenantId: DEFAULT_TENANT_ID,
      name: 'Veg Biryani',
      category: 'Biryani',
      sellingPrice: 220,
      variantGroupId: null,
      displayOrder: 0,
      isActive: true,
      createdAt: 0,
      updatedAt: 0,
      createdBy: SYSTEM_USER_ID,
      updatedBy: SYSTEM_USER_ID,
    });
    vi.spyOn(ingredientRepository, 'findById').mockImplementation((_db, _tid, id) => {
      if (id === RAW_A) return ing({ id: RAW_A, type: 'raw', baseUnit: 'g' });
      return undefined;
    });
    vi.spyOn(recipeRepository, 'findActiveVersion').mockReturnValue(undefined);
    vi.spyOn(recipeRepository, 'ingredientsForVersion').mockReturnValue([]);
    vi.spyOn(recipeRepository, 'clearCurrentFlag').mockImplementation(() => undefined);
    vi.spyOn(recipeRepository, 'nextVersionNumber').mockReturnValue(1);
    vi.spyOn(recipeRepository, 'insertVersion').mockImplementation((_db, row) => ({ ...row, isCurrent: true }) as RecipeVersionRow);
    vi.spyOn(recipeRepository, 'insertIngredients').mockImplementation((_db, rows) => rows as RecipeIngredientRow[]);

    const result = RecipeService.saveVersion(db as never, DEFAULT_TENANT_ID, {
      parentId: menuId,
      parentType: 'menu_item',
      targetYield: 1,
      notes: null,
      rows: [
        { childIngredientId: RAW_A, quantity: 200, unit: 'g', notes: null, displayOrder: 0 },
      ],
    });

    expect(result.parentType).toBe('menu_item');
    // Menu-item recipe edits trigger a single-menu availability recompute.
    expect(AvailabilityService.recomputeForMenuItem).toHaveBeenCalledWith(
      db,
      DEFAULT_TENANT_ID,
      menuId,
    );
  });

  it('refuses recipes for raw ingredients', () => {
    const db = makeFakeDb();
    vi.spyOn(ingredientRepository, 'findById').mockReturnValue(ing({ type: 'raw' }));

    expect(() =>
      RecipeService.saveVersion(db as never, DEFAULT_TENANT_ID, {
        parentId: PARENT_ID,
        parentType: 'ingredient',
        targetYield: 1,
        notes: null,
        rows: [
          { childIngredientId: RAW_A, quantity: 1, unit: 'g', notes: null, displayOrder: 0 },
        ],
      }),
    ).toThrow(ValidationError);
  });

  it('refuses self-referential rows', () => {
    const db = makeFakeDb();
    vi.spyOn(ingredientRepository, 'findById').mockReturnValue(ing({}));

    expect(() =>
      RecipeService.saveVersion(db as never, DEFAULT_TENANT_ID, {
        parentId: PARENT_ID,
        parentType: 'ingredient',
        targetYield: 1,
        notes: null,
        rows: [
          { childIngredientId: PARENT_ID, quantity: 1, unit: 'g', notes: null, displayOrder: 0 },
        ],
      }),
    ).toThrow(ValidationError);
  });

  it('rejects BoM cycles (A → B → A)', () => {
    const db = makeFakeDb();

    // Lookups: parent (PREP_C), raw child (RAW_A), prepared child (PREP_C cycle target)
    vi.spyOn(ingredientRepository, 'findById').mockImplementation((_db, _tid, id) => {
      if (id === PARENT_ID) return ing({ id: PARENT_ID, name: 'A' });
      if (id === PREP_C) return ing({ id: PREP_C, type: 'prepared', name: 'B' });
      if (id === RAW_A) return ing({ id: RAW_A, type: 'raw', name: 'salt' });
      return undefined;
    });

    // PREP_C's active recipe references PARENT_ID — closing the loop.
    vi.spyOn(recipeRepository, 'findActiveVersion').mockImplementation((_db, sel) => {
      if (sel.parentId === PREP_C)
        return { id: 'rv-c', parentId: PREP_C, parentType: 'ingredient' } as RecipeVersionRow;
      return undefined;
    });
    vi.spyOn(recipeRepository, 'ingredientsForVersion').mockImplementation((_db, versionId) => {
      if (versionId === 'rv-c')
        return [{ childIngredientId: PARENT_ID } as RecipeIngredientRow];
      return [];
    });

    expect(() =>
      RecipeService.saveVersion(db as never, DEFAULT_TENANT_ID, {
        parentId: PARENT_ID,
        parentType: 'ingredient',
        targetYield: 1,
        notes: null,
        rows: [
          { childIngredientId: PREP_C, quantity: 1, unit: 'g', notes: null, displayOrder: 0 },
        ],
      }),
    ).toThrow(ConflictError);
  });

  it('rejects unknown child ingredients', () => {
    const db = makeFakeDb();
    vi.spyOn(ingredientRepository, 'findById').mockImplementation((_db, _tid, id) => {
      if (id === PARENT_ID) return ing({});
      return undefined;
    });

    expect(() =>
      RecipeService.saveVersion(db as never, DEFAULT_TENANT_ID, {
        parentId: PARENT_ID,
        parentType: 'ingredient',
        targetYield: 1,
        notes: null,
        rows: [
          { childIngredientId: RAW_A, quantity: 1, unit: 'g', notes: null, displayOrder: 0 },
        ],
      }),
    ).toThrow(NotFoundError);
  });

  it('rejects rows with units incompatible with the child base unit', () => {
    const db = makeFakeDb();
    vi.spyOn(ingredientRepository, 'findById').mockImplementation((_db, _tid, id) => {
      if (id === PARENT_ID) return ing({});
      if (id === RAW_A) return ing({ id: RAW_A, type: 'raw', baseUnit: 'g', densityGPerMl: null });
      return undefined;
    });

    expect(() =>
      RecipeService.saveVersion(db as never, DEFAULT_TENANT_ID, {
        parentId: PARENT_ID,
        parentType: 'ingredient',
        targetYield: 1,
        notes: null,
        rows: [
          { childIngredientId: RAW_A, quantity: 1, unit: 'ml', notes: null, displayOrder: 0 },
        ],
      }),
    ).toThrow(ValidationError);
  });

  it('flips current flag, bumps version_number, inserts rows in one transaction', () => {
    const db = makeFakeDb();

    vi.spyOn(ingredientRepository, 'findById').mockImplementation((_db, _tid, id) => {
      if (id === PARENT_ID) return ing({});
      if (id === RAW_A) return ing({ id: RAW_A, type: 'raw', baseUnit: 'g' });
      if (id === RAW_B) return ing({ id: RAW_B, type: 'raw', baseUnit: 'g' });
      return undefined;
    });
    vi.spyOn(recipeRepository, 'findActiveVersion').mockReturnValue(undefined);
    vi.spyOn(recipeRepository, 'ingredientsForVersion').mockReturnValue([]);

    const clearCurrent = vi.spyOn(recipeRepository, 'clearCurrentFlag').mockImplementation(() => undefined);
    vi.spyOn(recipeRepository, 'nextVersionNumber').mockReturnValue(3);
    const insertVersion = vi
      .spyOn(recipeRepository, 'insertVersion')
      .mockImplementation((_db, row) => ({ ...row, isCurrent: true }) as RecipeVersionRow);
    const insertIngs = vi
      .spyOn(recipeRepository, 'insertIngredients')
      .mockImplementation((_db, rows) => rows as RecipeIngredientRow[]);

    const result = RecipeService.saveVersion(db as never, DEFAULT_TENANT_ID, {
      parentId: PARENT_ID,
      parentType: 'ingredient',
      targetYield: 1000,
      notes: null,
      rows: [
        { childIngredientId: RAW_A, quantity: 200, unit: 'g', notes: null, displayOrder: 0 },
        { childIngredientId: RAW_B, quantity: 150, unit: 'g', notes: null, displayOrder: 1 },
      ],
    });

    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(clearCurrent).toHaveBeenCalledTimes(1);
    expect(insertVersion).toHaveBeenCalledTimes(1);
    expect(insertVersion.mock.calls[0]![1].versionNumber).toBe(3);
    expect(insertVersion.mock.calls[0]![1].isCurrent).toBe(true);
    expect(insertIngs.mock.calls[0]![1]).toHaveLength(2);
    expect(result.versionNumber).toBe(3);
  });
});

describe('RecipeService.walkBoM', () => {
  it('returns empty when no active recipe', () => {
    const db = makeFakeDb();
    vi.spyOn(recipeRepository, 'findActiveVersion').mockReturnValue(undefined);
    expect(
      RecipeService.walkBoM(db as never, DEFAULT_TENANT_ID, PARENT_ID, 'ingredient'),
    ).toEqual([]);
  });

  it('expands prepared children but not raw children', () => {
    const db = makeFakeDb();

    vi.spyOn(ingredientRepository, 'findById').mockImplementation((_db, _tid, id) => {
      if (id === PARENT_ID) return ing({});
      if (id === RAW_A) return ing({ id: RAW_A, type: 'raw', name: 'Salt' });
      if (id === PREP_C) return ing({ id: PREP_C, type: 'prepared', name: 'Garam Masala' });
      return undefined;
    });

    vi.spyOn(recipeRepository, 'findActiveVersion').mockImplementation((_db, sel) => {
      if (sel.parentId === PARENT_ID) return { id: 'rv-parent' } as RecipeVersionRow;
      if (sel.parentId === PREP_C) return { id: 'rv-c' } as RecipeVersionRow;
      return undefined;
    });
    vi.spyOn(recipeRepository, 'ingredientsForVersion').mockImplementation((_db, vid) => {
      if (vid === 'rv-parent') {
        return [
          { childIngredientId: RAW_A, quantity: 200, unit: 'g', notes: null, displayOrder: 0 } as RecipeIngredientRow,
          { childIngredientId: PREP_C, quantity: 50, unit: 'g', notes: null, displayOrder: 1 } as RecipeIngredientRow,
        ];
      }
      if (vid === 'rv-c') {
        return [
          { childIngredientId: RAW_A, quantity: 30, unit: 'g', notes: null, displayOrder: 0 } as RecipeIngredientRow,
        ];
      }
      return [];
    });

    const tree = RecipeService.walkBoM(db as never, DEFAULT_TENANT_ID, PARENT_ID, 'ingredient');
    expect(tree).toHaveLength(2);
    expect(tree[0]!.type).toBe('raw');
    expect(tree[0]!.children).toEqual([]);
    expect(tree[1]!.type).toBe('prepared');
    expect(tree[1]!.children).toHaveLength(1);
    expect(tree[1]!.children[0]!.ingredientId).toBe(RAW_A);
  });
});

describe('RecipeService.saveVersion — service_template parent (Hyprride)', () => {
  it('resolves the parent via serviceTemplateRepository and skips availability recompute', () => {
    const db = makeFakeDb();
    const tplId = '01900000-0000-7000-8000-0000000000d1';
    vi.spyOn(serviceTemplateRepository, 'findById').mockReturnValue({
      id: tplId,
      tenantId: DEFAULT_TENANT_ID,
      name: 'Standard service',
      bikeTypeId: '01900000-0000-7000-8000-0000000000a1',
      displayOrder: 0,
      isActive: true,
      createdAt: 0,
      updatedAt: 0,
      createdBy: SYSTEM_USER_ID,
      updatedBy: SYSTEM_USER_ID,
    });
    vi.spyOn(ingredientRepository, 'findById').mockImplementation((_db, _tid, id) => {
      if (id === RAW_A) return ing({ id: RAW_A, type: 'raw', baseUnit: 'ml' });
      return undefined;
    });
    vi.spyOn(recipeRepository, 'findActiveVersion').mockReturnValue(undefined);
    vi.spyOn(recipeRepository, 'ingredientsForVersion').mockReturnValue([]);
    vi.spyOn(recipeRepository, 'clearCurrentFlag').mockImplementation(() => undefined);
    vi.spyOn(recipeRepository, 'nextVersionNumber').mockReturnValue(1);
    vi.spyOn(recipeRepository, 'insertVersion').mockImplementation((_db, row) =>
      ({ ...row, isCurrent: true }) as RecipeVersionRow,
    );
    vi.spyOn(recipeRepository, 'insertIngredients').mockImplementation((_db, rows) => rows as RecipeIngredientRow[]);

    const result = RecipeService.saveVersion(db as never, DEFAULT_TENANT_ID, {
      parentId: tplId,
      parentType: 'service_template',
      targetYield: 1,
      notes: null,
      rows: [
        { childIngredientId: RAW_A, quantity: 800, unit: 'ml', notes: null, displayOrder: 0 },
      ],
    });

    expect(result.parentType).toBe('service_template');
    // Service templates have no availability cache — neither recompute should fire.
    expect(AvailabilityService.recomputeForMenuItem).not.toHaveBeenCalled();
    expect(AvailabilityService.recomputeForIngredients).not.toHaveBeenCalled();
  });

  it('throws NotFoundError when the service_template parent does not exist', () => {
    const db = makeFakeDb();
    vi.spyOn(serviceTemplateRepository, 'findById').mockReturnValue(undefined);

    expect(() =>
      RecipeService.saveVersion(db as never, DEFAULT_TENANT_ID, {
        parentId: '01900000-0000-7000-8000-0000000000d9',
        parentType: 'service_template',
        targetYield: 1,
        notes: null,
        rows: [
          { childIngredientId: RAW_A, quantity: 1, unit: 'ml', notes: null, displayOrder: 0 },
        ],
      }),
    ).toThrow(NotFoundError);
  });
});
