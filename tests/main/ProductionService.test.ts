import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProductionService } from '../../main/services/ProductionService';
import { InventoryService } from '../../main/services/InventoryService';
import { AvailabilityService } from '../../main/services/AvailabilityService';
import { ingredientRepository } from '../../main/repositories/ingredientRepository';
import { productionBatchRepository } from '../../main/repositories/productionBatchRepository';
import { recipeRepository } from '../../main/repositories/recipeRepository';
import { DEFAULT_TENANT_ID, SYSTEM_USER_ID } from '@shared/constants/system';
import { NotFoundError, ValidationError } from '@shared/errors/DomainError';

beforeEach(() => {
  vi.spyOn(AvailabilityService, 'recomputeForIngredients').mockImplementation(() => undefined);
});
import type {
  IngredientRow,
  ProductionBatchRow,
  RecipeIngredientRow,
  RecipeVersionRow,
} from '../../main/db/schema';

const PREP_ID = '01900000-0000-7000-8000-0000000000aa';
const RAW_A = '01900000-0000-7000-8000-0000000000a1';
const RAW_B = '01900000-0000-7000-8000-0000000000a2';
const RECIPE_ID = '01900000-0000-7000-8000-0000000000b0';

function ing(overrides: Partial<IngredientRow>): IngredientRow {
  return {
    id: PREP_ID,
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

describe('ProductionService.recordBatch — invariants', () => {
  function setupHappyPath() {
    vi.spyOn(ingredientRepository, 'findById').mockImplementation((_db, _tid, id) => {
      if (id === PREP_ID) return ing({});
      if (id === RAW_A) return ing({ id: RAW_A, type: 'raw', baseUnit: 'g', currentAvgCostPerUnit: 0.05 });
      if (id === RAW_B) return ing({ id: RAW_B, type: 'raw', baseUnit: 'g', currentAvgCostPerUnit: 0.1 });
      return undefined;
    });
    vi.spyOn(recipeRepository, 'findActiveVersion').mockReturnValue({
      id: RECIPE_ID,
      tenantId: DEFAULT_TENANT_ID,
      parentId: PREP_ID,
      parentType: 'ingredient',
      versionNumber: 1,
      isCurrent: true,
      targetYield: 1000,
      notes: null,
      createdAt: 0,
      createdBy: SYSTEM_USER_ID,
    });
    vi.spyOn(recipeRepository, 'ingredientsForVersion').mockReturnValue([
      {
        id: 'ri-1',
        recipeVersionId: RECIPE_ID,
        childIngredientId: RAW_A,
        quantity: 200,
        unit: 'g',
        notes: null,
        displayOrder: 0,
      },
      {
        id: 'ri-2',
        recipeVersionId: RECIPE_ID,
        childIngredientId: RAW_B,
        quantity: 150,
        unit: 'g',
        notes: null,
        displayOrder: 1,
      },
    ] as RecipeIngredientRow[]);
    vi.spyOn(productionBatchRepository, 'insert').mockImplementation((_db, row) => row as ProductionBatchRow);
  }

  it('writes one production_input per row + one production_output, all in a single transaction', () => {
    const db = makeFakeDb();
    setupHappyPath();
    const apply = vi
      .spyOn(InventoryService, 'applyMovement')
      .mockImplementation((_db, _tid, input) => ({
        movement: {
          id: 'm-' + input.reason,
          tenantId: DEFAULT_TENANT_ID,
          ingredientId: input.ingredientId,
          changeQuantity: input.quantity * input.direction,
          costPerUnitAtTime: null,
          reason: input.reason,
          referenceType: input.referenceType,
          referenceId: input.referenceId ?? null,
          notes: input.notes ?? null,
          occurredAt: 0,
          createdAt: 0,
          createdBy: SYSTEM_USER_ID,
        },
        newStockQuantity: 0,
      }));

    const result = ProductionService.recordBatch(db as never, DEFAULT_TENANT_ID, {
      preparedIngredientId: PREP_ID,
      actualYield: 1000,
      notes: null,
    });

    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(apply).toHaveBeenCalledTimes(3); // 2 inputs + 1 output
    const reasons = apply.mock.calls.map((c) => c[2].reason);
    expect(reasons).toEqual(['production_input', 'production_input', 'production_output']);
    expect(result.movements).toHaveLength(3);

    // All movements share the batch's id as referenceId
    const refIds = apply.mock.calls.map((c) => c[2].referenceId);
    expect(new Set(refIds).size).toBe(1);
  });

  it('writes a prep_loss movement when actual_yield < expected_yield', () => {
    const db = makeFakeDb();
    setupHappyPath();
    const apply = vi
      .spyOn(InventoryService, 'applyMovement')
      .mockImplementation(() => ({ movement: {} as never, newStockQuantity: 0 }));

    ProductionService.recordBatch(db as never, DEFAULT_TENANT_ID, {
      preparedIngredientId: PREP_ID,
      actualYield: 900,
      expectedYield: 1000,
      notes: null,
    });

    const reasons = apply.mock.calls.map((c) => c[2].reason);
    expect(reasons).toEqual([
      'production_input',
      'production_input',
      'production_output',
      'prep_loss',
    ]);
    const lossCall = apply.mock.calls[3]!;
    expect(lossCall[2].quantity).toBeCloseTo(100, 6);
    expect(lossCall[2].direction).toBe(-1);
    expect(lossCall[2].ingredientId).toBe(PREP_ID);
  });

  it('refuses when target ingredient is not prepared', () => {
    const db = makeFakeDb();
    vi.spyOn(ingredientRepository, 'findById').mockReturnValue(ing({ type: 'raw' }));

    expect(() =>
      ProductionService.recordBatch(db as never, DEFAULT_TENANT_ID, {
        preparedIngredientId: PREP_ID,
        actualYield: 100,
        notes: null,
      }),
    ).toThrow(ValidationError);
  });

  it('refuses when no active recipe exists', () => {
    const db = makeFakeDb();
    vi.spyOn(ingredientRepository, 'findById').mockReturnValue(ing({}));
    vi.spyOn(recipeRepository, 'findActiveVersion').mockReturnValue(undefined);

    expect(() =>
      ProductionService.recordBatch(db as never, DEFAULT_TENANT_ID, {
        preparedIngredientId: PREP_ID,
        actualYield: 100,
        notes: null,
      }),
    ).toThrow(NotFoundError);
  });

  it('passes cost_per_unit_at_time on production_output computed from input costs', () => {
    const db = makeFakeDb();
    setupHappyPath();
    // Inputs: 200g of RAW_A @ 0.05/g = 10, 150g of RAW_B @ 0.1/g = 15. Total = 25.
    // Expected yield 1000g → output cost = 25/1000 = 0.025/g.
    const apply = vi
      .spyOn(InventoryService, 'applyMovement')
      .mockReturnValue({ movement: {} as never, newStockQuantity: 0 });

    ProductionService.recordBatch(db as never, DEFAULT_TENANT_ID, {
      preparedIngredientId: PREP_ID,
      actualYield: 1000,
      notes: null,
    });

    const outputCall = apply.mock.calls.find((c) => c[2].reason === 'production_output');
    expect(outputCall).toBeDefined();
    expect(outputCall![2].costPerUnitAtTime).toBeCloseTo(0.025, 8);

    // production_input movements also carry per-row unit cost (same as
    // child.currentAvgCostPerUnit since unit==base unit).
    const inputCalls = apply.mock.calls.filter((c) => c[2].reason === 'production_input');
    expect(inputCalls).toHaveLength(2);
    expect(inputCalls[0]![2].costPerUnitAtTime).toBeCloseTo(0.05, 8);
    expect(inputCalls[1]![2].costPerUnitAtTime).toBeCloseTo(0.1, 8);
  });
});
