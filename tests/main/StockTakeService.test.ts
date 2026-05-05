import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StockTakeService } from '../../main/services/StockTakeService';
import { InventoryService } from '../../main/services/InventoryService';
import { AvailabilityService } from '../../main/services/AvailabilityService';
import { ingredientRepository } from '../../main/repositories/ingredientRepository';
import { stockTakeLineRepository } from '../../main/repositories/stockTakeLineRepository';
import { stockTakeRepository } from '../../main/repositories/stockTakeRepository';
import { stockTakeLock } from '../../main/lib/stockTakeLock';
import { DEFAULT_TENANT_ID, SYSTEM_USER_ID } from '@shared/constants/system';
import { ConflictError, ValidationError } from '@shared/errors/DomainError';
import type {
  IngredientRow,
  StockTakeLineRow,
  StockTakeRow,
} from '../../main/db/schema';

const TAKE_ID = '01900000-0000-7000-8000-0000000c0001';
const ING_A = '01900000-0000-7000-8000-0000000c00a1';
const ING_B = '01900000-0000-7000-8000-0000000c00a2';
const LINE_A = '01900000-0000-7000-8000-0000000c00b1';
const LINE_B = '01900000-0000-7000-8000-0000000c00b2';

function ing(overrides: Partial<IngredientRow>): IngredientRow {
  return {
    id: ING_A,
    tenantId: DEFAULT_TENANT_ID,
    name: 'Ingredient A',
    category: 'Test',
    type: 'raw',
    baseUnit: 'g',
    stockQuantity: 100,
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

function take(overrides: Partial<StockTakeRow>): StockTakeRow {
  return {
    id: TAKE_ID,
    tenantId: DEFAULT_TENANT_ID,
    startedAt: 1_000,
    completedAt: null,
    status: 'in_progress',
    notes: null,
    createdAt: 1_000,
    updatedAt: 1_000,
    createdBy: SYSTEM_USER_ID,
    updatedBy: SYSTEM_USER_ID,
    ...overrides,
  };
}

function line(overrides: Partial<StockTakeLineRow>): StockTakeLineRow {
  return {
    id: LINE_A,
    stockTakeId: TAKE_ID,
    ingredientId: ING_A,
    bookQuantity: 100,
    countedQuantity: null,
    difference: null,
    ...overrides,
  };
}

function makeFakeDb() {
  const fakeDb = {
    transaction: vi.fn((fn: (tx: unknown) => unknown) => fn(fakeDb)),
  };
  return fakeDb;
}

beforeEach(() => {
  stockTakeLock.value = null;
  vi.spyOn(AvailabilityService, 'recomputeForIngredients').mockImplementation(() => undefined);
});

afterEach(() => {
  stockTakeLock.value = null;
  vi.restoreAllMocks();
});

describe('StockTakeService.start', () => {
  it('snapshots active ingredients into book_quantity and sets the stockTakeLock', () => {
    const db = makeFakeDb();
    vi.spyOn(stockTakeRepository, 'findInProgress').mockReturnValue(undefined);
    vi.spyOn(ingredientRepository, 'list').mockReturnValue([
      ing({ id: ING_A, stockQuantity: 100 }),
      ing({ id: ING_B, name: 'Ingredient B', stockQuantity: 250 }),
    ]);
    vi.spyOn(stockTakeRepository, 'insert').mockImplementation((_db, row) => row as StockTakeRow);
    const insertLines = vi
      .spyOn(stockTakeLineRepository, 'insertMany')
      .mockImplementation((_db, rows) => rows as StockTakeLineRow[]);

    const result = StockTakeService.start(db as never, DEFAULT_TENANT_ID, { notes: null });

    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(insertLines).toHaveBeenCalledTimes(1);
    const inserted = insertLines.mock.calls[0]![1] as StockTakeLineRow[];
    expect(inserted).toHaveLength(2);
    expect(inserted.map((l) => l.bookQuantity).sort()).toEqual([100, 250]);
    expect(inserted.every((l) => l.countedQuantity === null)).toBe(true);
    expect(stockTakeLock.value).toBe(result.id);
  });

  it('refuses to start a second take while one is in_progress', () => {
    const db = makeFakeDb();
    vi.spyOn(stockTakeRepository, 'findInProgress').mockReturnValue(take({}));

    expect(() =>
      StockTakeService.start(db as never, DEFAULT_TENANT_ID, { notes: null }),
    ).toThrow(ConflictError);
  });

  it('refuses when there are no active ingredients', () => {
    const db = makeFakeDb();
    vi.spyOn(stockTakeRepository, 'findInProgress').mockReturnValue(undefined);
    vi.spyOn(ingredientRepository, 'list').mockReturnValue([]);

    expect(() =>
      StockTakeService.start(db as never, DEFAULT_TENANT_ID, { notes: null }),
    ).toThrow(ValidationError);
  });
});

describe('StockTakeService.commit', () => {
  function setupCommit(opts: { lines: StockTakeLineRow[] }) {
    vi.spyOn(stockTakeRepository, 'findById').mockReturnValue(take({}));
    vi.spyOn(stockTakeLineRepository, 'listForTake').mockReturnValue(opts.lines);
    vi.spyOn(stockTakeLineRepository, 'setDifference').mockImplementation(() => undefined);
    vi.spyOn(stockTakeRepository, 'update').mockImplementation((_db, _tid, _id, patch) =>
      take({ status: (patch.status as 'committed') ?? 'in_progress', completedAt: 2_000 }),
    );
    vi.spyOn(ingredientRepository, 'findById').mockImplementation((_db, _tid, id) => {
      if (id === ING_A) return ing({ id: ING_A, stockQuantity: 100 });
      if (id === ING_B) return ing({ id: ING_B, stockQuantity: 250 });
      return undefined;
    });
    vi.spyOn(StockTakeService, 'get').mockReturnValue({} as never);
  }

  it('writes one adjustment movement per line where counted ≠ book and skips zero-diff lines', () => {
    const db = makeFakeDb();
    setupCommit({
      lines: [
        line({ id: LINE_A, ingredientId: ING_A, bookQuantity: 100, countedQuantity: 95 }), // -5
        line({ id: LINE_B, ingredientId: ING_B, bookQuantity: 250, countedQuantity: 250 }), // 0 — skipped
      ],
    });
    const apply = vi
      .spyOn(InventoryService, 'applyMovement')
      .mockReturnValue({ movement: {} as never, newStockQuantity: 95 });
    stockTakeLock.value = TAKE_ID;

    StockTakeService.commit(db as never, DEFAULT_TENANT_ID, { id: TAKE_ID, notes: null });

    expect(apply).toHaveBeenCalledTimes(1);
    const call = apply.mock.calls[0]!;
    expect(call[2].reason).toBe('adjustment');
    expect(call[2].referenceType).toBe('stock_take');
    expect(call[2].referenceId).toBe(TAKE_ID);
    expect(call[2].quantity).toBe(5);
    expect(call[2].direction).toBe(-1);
    expect(call[2].ingredientId).toBe(ING_A);
    // Lock released on successful commit.
    expect(stockTakeLock.value).toBeNull();
  });

  it('skips lines where counted_quantity is null (operator never counted them)', () => {
    const db = makeFakeDb();
    setupCommit({
      lines: [
        line({ id: LINE_A, ingredientId: ING_A, bookQuantity: 100, countedQuantity: null }),
        line({ id: LINE_B, ingredientId: ING_B, bookQuantity: 250, countedQuantity: 240 }), // -10
      ],
    });
    const apply = vi
      .spyOn(InventoryService, 'applyMovement')
      .mockReturnValue({ movement: {} as never, newStockQuantity: 240 });

    StockTakeService.commit(db as never, DEFAULT_TENANT_ID, { id: TAKE_ID, notes: null });

    expect(apply).toHaveBeenCalledTimes(1);
    expect(apply.mock.calls[0]![2].ingredientId).toBe(ING_B);
  });

  it('positive variance writes a +1 direction adjustment', () => {
    const db = makeFakeDb();
    setupCommit({
      lines: [
        line({ id: LINE_A, ingredientId: ING_A, bookQuantity: 100, countedQuantity: 130 }), // +30
      ],
    });
    const apply = vi
      .spyOn(InventoryService, 'applyMovement')
      .mockReturnValue({ movement: {} as never, newStockQuantity: 130 });

    StockTakeService.commit(db as never, DEFAULT_TENANT_ID, { id: TAKE_ID, notes: null });

    expect(apply).toHaveBeenCalledTimes(1);
    expect(apply.mock.calls[0]![2].direction).toBe(1);
    expect(apply.mock.calls[0]![2].quantity).toBe(30);
  });

  it('refuses to commit a take that is already closed', () => {
    const db = makeFakeDb();
    vi.spyOn(stockTakeRepository, 'findById').mockReturnValue(take({ status: 'committed' }));

    expect(() =>
      StockTakeService.commit(db as never, DEFAULT_TENANT_ID, { id: TAKE_ID, notes: null }),
    ).toThrow(ConflictError);
  });
});

describe('StockTakeService.discard', () => {
  it('closes the take without writing any movements and releases the lock', () => {
    const db = makeFakeDb();
    vi.spyOn(stockTakeRepository, 'findById').mockReturnValue(take({}));
    const update = vi
      .spyOn(stockTakeRepository, 'update')
      .mockReturnValue(take({ status: 'discarded', completedAt: 2_000 }));
    vi.spyOn(StockTakeService, 'get').mockReturnValue({} as never);
    const apply = vi.spyOn(InventoryService, 'applyMovement');
    stockTakeLock.value = TAKE_ID;

    StockTakeService.discard(db as never, DEFAULT_TENANT_ID, { id: TAKE_ID });

    expect(apply).not.toHaveBeenCalled();
    expect(update.mock.calls[0]![3].status).toBe('discarded');
    expect(stockTakeLock.value).toBeNull();
  });

  it('refuses to discard a take that is already closed', () => {
    const db = makeFakeDb();
    vi.spyOn(stockTakeRepository, 'findById').mockReturnValue(take({ status: 'discarded' }));

    expect(() =>
      StockTakeService.discard(db as never, DEFAULT_TENANT_ID, { id: TAKE_ID }),
    ).toThrow(ConflictError);
  });
});
