import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InventoryService } from '../../main/services/InventoryService';
import { AvailabilityService } from '../../main/services/AvailabilityService';
import { ingredientRepository } from '../../main/repositories/ingredientRepository';
import { stockMovementRepository } from '../../main/repositories/stockMovementRepository';
import { DEFAULT_TENANT_ID } from '@shared/constants/system';
import { InvariantViolationError, NotFoundError } from '@shared/errors/DomainError';
import type { IngredientRow, StockMovementRow } from '../../main/db/schema';

// Suppress the post-commit availability recompute in every InventoryService
// test — it has its own dedicated test file.
beforeEach(() => {
  vi.spyOn(AvailabilityService, 'recomputeForIngredients').mockImplementation(() => undefined);
});

const baseRow: IngredientRow = {
  id: '01900000-0000-7000-8000-000000000001',
  tenantId: DEFAULT_TENANT_ID,
  name: 'Tomato',
  category: 'Vegetables',
  type: 'raw',
  baseUnit: 'g',
  stockQuantity: 10,
  reservedQuantity: 0,
  lowStockThreshold: 0,
  currentAvgCostPerUnit: 0,
  densityGPerMl: null,
  isActive: true,
  createdAt: 0,
  updatedAt: 0,
  createdBy: 'system',
  updatedBy: 'system',
};

type FakeDb = {
  transaction: ReturnType<typeof vi.fn>;
};

function makeFakeDb(): FakeDb {
  // transaction(fn) runs fn(tx) — for our tests tx === db.
  const fakeDb: FakeDb = {
    transaction: vi.fn((fn: (tx: unknown) => unknown) => fn(fakeDb)),
  };
  return fakeDb;
}

describe('InventoryService.applyMovement — atomicity invariant', () => {
  it('runs the movement insert and stock update inside a single transaction', () => {
    const db = makeFakeDb();
    const find = vi
      .spyOn(ingredientRepository, 'findById')
      .mockReturnValue({ ...baseRow, stockQuantity: 10 });
    const insert = vi
      .spyOn(stockMovementRepository, 'insert')
      .mockReturnValue({ id: 'm1' } as unknown as StockMovementRow);
    const setStock = vi
      .spyOn(ingredientRepository, 'setStockQuantity')
      .mockImplementation(() => undefined);

    const result = InventoryService.applyMovement(db as never, DEFAULT_TENANT_ID, {
      ingredientId: baseRow.id,
      quantity: 2,
      unit: 'g',
      reason: 'wastage',
      referenceType: 'manual',
      direction: -1,
    });

    expect(result.newStockQuantity).toBe(8);
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(insert).toHaveBeenCalledTimes(1);
    expect(setStock).toHaveBeenCalledTimes(1);
    // Both writes called inside the transaction callback (single tx).
    expect(insert.mock.invocationCallOrder[0]).toBeLessThan(setStock.mock.invocationCallOrder[0]!);

    expect(insert.mock.calls[0]![1].changeQuantity).toBe(-2);
    expect(insert.mock.calls[0]![1].reason).toBe('wastage');
    expect(setStock.mock.calls[0]![3]).toBe(8);

    find.mockRestore();
    insert.mockRestore();
    setStock.mockRestore();
  });

  it('forces sign for fixed-direction reasons (purchase always positive)', () => {
    const db = makeFakeDb();
    vi.spyOn(ingredientRepository, 'findById').mockReturnValue({ ...baseRow, stockQuantity: 0 });
    const insert = vi.spyOn(stockMovementRepository, 'insert').mockReturnValue({} as never);
    const setStock = vi.spyOn(ingredientRepository, 'setStockQuantity').mockImplementation(() => undefined);

    InventoryService.applyMovement(db as never, DEFAULT_TENANT_ID, {
      ingredientId: baseRow.id,
      quantity: 5,
      unit: 'g',
      reason: 'purchase',
      referenceType: 'manual',
      direction: -1, // ignored by service
    });

    expect(insert.mock.calls[0]![1].changeQuantity).toBe(5);
    expect(setStock.mock.calls[0]![3]).toBe(5);
    vi.restoreAllMocks();
  });

  it('refuses to drive stock negative and writes nothing', () => {
    const db = makeFakeDb();
    vi.spyOn(ingredientRepository, 'findById').mockReturnValue({ ...baseRow, stockQuantity: 1 });
    const insert = vi.spyOn(stockMovementRepository, 'insert');
    const setStock = vi.spyOn(ingredientRepository, 'setStockQuantity');

    expect(() =>
      InventoryService.applyMovement(db as never, DEFAULT_TENANT_ID, {
        ingredientId: baseRow.id,
        quantity: 5,
        unit: 'g',
        reason: 'wastage',
        referenceType: 'manual',
        direction: -1,
      }),
    ).toThrow(InvariantViolationError);

    expect(db.transaction).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
    expect(setStock).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it('throws NotFoundError when ingredient is missing', () => {
    const db = makeFakeDb();
    vi.spyOn(ingredientRepository, 'findById').mockReturnValue(undefined);

    expect(() =>
      InventoryService.applyMovement(db as never, DEFAULT_TENANT_ID, {
        ingredientId: baseRow.id,
        quantity: 1,
        unit: 'g',
        reason: 'wastage',
        referenceType: 'manual',
        direction: -1,
      }),
    ).toThrow(NotFoundError);

    expect(db.transaction).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it('honors unit conversion at the service boundary', () => {
    const db = makeFakeDb();
    vi.spyOn(ingredientRepository, 'findById').mockReturnValue({ ...baseRow, stockQuantity: 0 });
    const insert = vi.spyOn(stockMovementRepository, 'insert').mockReturnValue({} as never);
    vi.spyOn(ingredientRepository, 'setStockQuantity').mockImplementation(() => undefined);
    vi.spyOn(ingredientRepository, 'setStockAndCost').mockImplementation(() => undefined);

    InventoryService.applyMovement(db as never, DEFAULT_TENANT_ID, {
      ingredientId: baseRow.id,
      quantity: 1.5,
      unit: 'kg',
      reason: 'purchase',
      referenceType: 'manual',
      direction: 1,
    });

    expect(insert.mock.calls[0]![1].changeQuantity).toBe(1500);
    vi.restoreAllMocks();
  });
});

describe('InventoryService.applyMovement — weighted-avg cost recompute', () => {
  it('recomputes currentAvgCostPerUnit on a purchase movement', () => {
    const db = makeFakeDb();
    // Existing stock: 100 g at ₹0.08/g (so ₹80/kg). Purchase: 50 g @ ₹0.12/g.
    // Expected new avg: (100*0.08 + 50*0.12) / 150 = 14/150 = 0.0933…
    vi.spyOn(ingredientRepository, 'findById').mockReturnValue({
      ...baseRow,
      stockQuantity: 100,
      currentAvgCostPerUnit: 0.08,
    });
    vi.spyOn(stockMovementRepository, 'insert').mockImplementation((_db, row) => row as StockMovementRow);
    const setStockAndCost = vi
      .spyOn(ingredientRepository, 'setStockAndCost')
      .mockImplementation(() => undefined);
    vi.spyOn(ingredientRepository, 'setStockQuantity').mockImplementation(() => undefined);

    InventoryService.applyMovement(db as never, DEFAULT_TENANT_ID, {
      ingredientId: baseRow.id,
      quantity: 50,
      unit: 'g',
      reason: 'purchase',
      referenceType: 'invoice_line',
      referenceId: 'l-1',
      direction: 1,
      costPerUnitAtTime: 0.12,
    });

    expect(setStockAndCost).toHaveBeenCalledTimes(1);
    const call = setStockAndCost.mock.calls[0]!;
    expect(call[3]).toBe(150); // newStock
    expect(call[4]).toBeCloseTo((100 * 0.08 + 50 * 0.12) / 150, 6);
    vi.restoreAllMocks();
  });

  it('converts the line unit cost to per-base-unit before storing on the movement', () => {
    const db = makeFakeDb();
    // 5 kg @ ₹120/kg → 5000 g @ ₹0.12/g. Movement records ₹0.12/g.
    vi.spyOn(ingredientRepository, 'findById').mockReturnValue({
      ...baseRow,
      stockQuantity: 0,
      currentAvgCostPerUnit: 0,
    });
    const insert = vi
      .spyOn(stockMovementRepository, 'insert')
      .mockImplementation((_db, row) => row as StockMovementRow);
    vi.spyOn(ingredientRepository, 'setStockAndCost').mockImplementation(() => undefined);
    vi.spyOn(ingredientRepository, 'setStockQuantity').mockImplementation(() => undefined);

    InventoryService.applyMovement(db as never, DEFAULT_TENANT_ID, {
      ingredientId: baseRow.id,
      quantity: 5,
      unit: 'kg',
      reason: 'purchase',
      referenceType: 'invoice_line',
      referenceId: 'l-1',
      direction: 1,
      costPerUnitAtTime: 120,
    });

    expect(insert.mock.calls[0]![1].costPerUnitAtTime).toBeCloseTo(0.12, 8);
    vi.restoreAllMocks();
  });

  it('seeds avg cost from new cost when stock was zero before purchase', () => {
    const db = makeFakeDb();
    vi.spyOn(ingredientRepository, 'findById').mockReturnValue({
      ...baseRow,
      stockQuantity: 0,
      currentAvgCostPerUnit: 0,
    });
    vi.spyOn(stockMovementRepository, 'insert').mockReturnValue({} as never);
    const setStockAndCost = vi
      .spyOn(ingredientRepository, 'setStockAndCost')
      .mockImplementation(() => undefined);
    vi.spyOn(ingredientRepository, 'setStockQuantity').mockImplementation(() => undefined);

    InventoryService.applyMovement(db as never, DEFAULT_TENANT_ID, {
      ingredientId: baseRow.id,
      quantity: 10,
      unit: 'g',
      reason: 'purchase',
      referenceType: 'invoice_line',
      referenceId: 'l-1',
      direction: 1,
      costPerUnitAtTime: 5,
    });

    expect(setStockAndCost.mock.calls[0]![4]).toBeCloseTo(5, 6);
    vi.restoreAllMocks();
  });

  it('does not recompute avg cost on sale / wastage movements', () => {
    const db = makeFakeDb();
    vi.spyOn(ingredientRepository, 'findById').mockReturnValue({
      ...baseRow,
      stockQuantity: 100,
      currentAvgCostPerUnit: 7,
    });
    vi.spyOn(stockMovementRepository, 'insert').mockReturnValue({} as never);
    const setStockAndCost = vi.spyOn(ingredientRepository, 'setStockAndCost');
    const setStockOnly = vi
      .spyOn(ingredientRepository, 'setStockQuantity')
      .mockImplementation(() => undefined);

    InventoryService.applyMovement(db as never, DEFAULT_TENANT_ID, {
      ingredientId: baseRow.id,
      quantity: 10,
      unit: 'g',
      reason: 'wastage',
      referenceType: 'manual',
      direction: -1,
      costPerUnitAtTime: 99, // ignored — wastage doesn't re-price
    });

    expect(setStockAndCost).not.toHaveBeenCalled();
    expect(setStockOnly).toHaveBeenCalledTimes(1);
    vi.restoreAllMocks();
  });
});
