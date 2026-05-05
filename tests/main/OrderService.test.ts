import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OrderService } from '../../main/services/OrderService';
import { InventoryService } from '../../main/services/InventoryService';
import { AvailabilityService } from '../../main/services/AvailabilityService';
import { menuItemRepository } from '../../main/repositories/menuItemRepository';
import { orderRepository } from '../../main/repositories/orderRepository';
import { orderLineRepository } from '../../main/repositories/orderLineRepository';
import { recipeRepository } from '../../main/repositories/recipeRepository';
import { DEFAULT_TENANT_ID, SYSTEM_USER_ID } from '@shared/constants/system';
import { ConflictError, NotFoundError, ValidationError } from '@shared/errors/DomainError';
import type {
  MenuItemRow,
  OrderLineRow,
  OrderRow,
  RecipeIngredientRow,
  RecipeVersionRow,
} from '../../main/db/schema';

const ORDER_ID = '01900000-0000-7000-8000-0000000a0001';
const LINE_ID = '01900000-0000-7000-8000-0000000a0002';
const MENU_PANEER = '01900000-0000-7000-8000-0000000a1001';
const RECIPE_PANEER = '01900000-0000-7000-8000-0000000a2001';
const ING_RICE = '01900000-0000-7000-8000-0000000a3001';
const ING_PANEER = '01900000-0000-7000-8000-0000000a3002';

function menu(overrides: Partial<MenuItemRow>): MenuItemRow {
  return {
    id: MENU_PANEER,
    tenantId: DEFAULT_TENANT_ID,
    name: 'Paneer Biryani',
    category: 'Biryani',
    sellingPrice: 280,
    variantGroupId: null,
    displayOrder: 0,
    isActive: true,
    createdAt: 0,
    updatedAt: 0,
    createdBy: SYSTEM_USER_ID,
    updatedBy: SYSTEM_USER_ID,
    ...overrides,
  };
}

function recipeVersion(overrides: Partial<RecipeVersionRow> = {}): RecipeVersionRow {
  return {
    id: RECIPE_PANEER,
    tenantId: DEFAULT_TENANT_ID,
    parentId: MENU_PANEER,
    parentType: 'menu_item',
    versionNumber: 1,
    isCurrent: true,
    targetYield: 1,
    notes: null,
    createdAt: 0,
    createdBy: SYSTEM_USER_ID,
    ...overrides,
  };
}

function order(overrides: Partial<OrderRow>): OrderRow {
  return {
    id: ORDER_ID,
    tenantId: DEFAULT_TENANT_ID,
    externalOrderId: null,
    source: 'manual_entry',
    placedAt: 1_000,
    deliveredAt: null,
    cancelledAt: null,
    cancelledPrepared: null,
    status: 'pending',
    totalAmount: 280,
    notes: null,
    createdAt: 0,
    updatedAt: 0,
    createdBy: SYSTEM_USER_ID,
    updatedBy: SYSTEM_USER_ID,
    ...overrides,
  };
}

function line(overrides: Partial<OrderLineRow> = {}): OrderLineRow {
  return {
    id: LINE_ID,
    orderId: ORDER_ID,
    menuItemId: MENU_PANEER,
    quantity: 2,
    unitPrice: 280,
    recipeVersionId: RECIPE_PANEER,
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
  vi.spyOn(AvailabilityService, 'recomputeForIngredients').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('OrderService.processIncomingOrder', () => {
  it('snapshots the active recipe_version_id per line at placement time', () => {
    const db = makeFakeDb();
    vi.spyOn(menuItemRepository, 'findById').mockReturnValue(menu({}));
    vi.spyOn(recipeRepository, 'findActiveVersion').mockReturnValue(recipeVersion());
    vi.spyOn(orderRepository, 'findByExternalId').mockReturnValue(undefined);
    const insertOrder = vi
      .spyOn(orderRepository, 'insert')
      .mockImplementation((_db, row) => row as OrderRow);
    const insertLines = vi
      .spyOn(orderLineRepository, 'insertMany')
      .mockImplementation((_db, rows) => rows as OrderLineRow[]);

    OrderService.processIncomingOrder(db as never, DEFAULT_TENANT_ID, {
      externalOrderId: 'ext-1',
      source: 'mock_online',
      placedAt: 1234,
      totalAmount: 560,
      notes: null,
      lines: [{ menuItemId: MENU_PANEER, quantity: 2, unitPrice: 280 }],
    });

    expect(insertOrder).toHaveBeenCalledTimes(1);
    expect(insertOrder.mock.calls[0]![1].status).toBe('pending');
    expect(insertOrder.mock.calls[0]![1].source).toBe('mock_online');
    expect(insertLines.mock.calls[0]![1]).toHaveLength(1);
    expect(insertLines.mock.calls[0]![1][0]!.recipeVersionId).toBe(RECIPE_PANEER);
  });

  it('refuses orders for menu items with no active recipe', () => {
    const db = makeFakeDb();
    vi.spyOn(orderRepository, 'findByExternalId').mockReturnValue(undefined);
    vi.spyOn(menuItemRepository, 'findById').mockReturnValue(menu({}));
    vi.spyOn(recipeRepository, 'findActiveVersion').mockReturnValue(undefined);

    expect(() =>
      OrderService.processIncomingOrder(db as never, DEFAULT_TENANT_ID, {
        externalOrderId: 'ext-1',
        source: 'mock_online',
        placedAt: 0,
        totalAmount: 0,
        notes: null,
        lines: [{ menuItemId: MENU_PANEER, quantity: 1, unitPrice: 280 }],
      }),
    ).toThrow(ValidationError);
  });

  it('is idempotent on duplicate externalOrderId — returns existing order', () => {
    const db = makeFakeDb();
    vi.spyOn(orderRepository, 'findByExternalId').mockReturnValue(order({}));
    vi.spyOn(orderRepository, 'findById').mockReturnValue(order({}));
    vi.spyOn(orderLineRepository, 'listForOrder').mockReturnValue([line()]);
    const insertSpy = vi.spyOn(orderRepository, 'insert');

    const result = OrderService.processIncomingOrder(db as never, DEFAULT_TENANT_ID, {
      externalOrderId: 'ext-1',
      source: 'manual_entry',
      placedAt: 0,
      totalAmount: 0,
      notes: null,
      lines: [{ menuItemId: MENU_PANEER, quantity: 1, unitPrice: 0 }],
    });

    expect(insertSpy).not.toHaveBeenCalled();
    expect(result.id).toBe(ORDER_ID);
  });
});

describe('OrderService.markDelivered — BoM walk', () => {
  it('calls applyMovement with reason=sale per recipe row, scaled by line quantity, in one transaction', () => {
    const db = makeFakeDb();
    vi.spyOn(orderRepository, 'findById').mockReturnValue(
      order({ status: 'preparing' }),
    );
    vi.spyOn(orderLineRepository, 'listForOrder').mockReturnValue([line({ quantity: 2 })]);
    vi.spyOn(recipeRepository, 'ingredientsForVersion').mockReturnValue([
      {
        id: 'r-1',
        recipeVersionId: RECIPE_PANEER,
        childIngredientId: ING_RICE,
        quantity: 200,
        unit: 'g',
        notes: null,
        displayOrder: 0,
      },
      {
        id: 'r-2',
        recipeVersionId: RECIPE_PANEER,
        childIngredientId: ING_PANEER,
        quantity: 100,
        unit: 'g',
        notes: null,
        displayOrder: 1,
      },
    ] as RecipeIngredientRow[]);
    vi.spyOn(orderRepository, 'update').mockReturnValue(order({ status: 'delivered' }));
    // Mock get(): returns the full delivered detail
    vi.spyOn(orderRepository, 'findById')
      .mockReturnValueOnce(order({ status: 'preparing' }))
      .mockReturnValue(order({ status: 'delivered', deliveredAt: 9_999 }));
    const apply = vi.spyOn(InventoryService, 'applyMovement').mockReturnValue({
      movement: {} as never,
      newStockQuantity: 0,
    });

    OrderService.markDelivered(db as never, DEFAULT_TENANT_ID, ORDER_ID);

    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(apply).toHaveBeenCalledTimes(2);
    // Both calls use reason='sale' and direction=-1
    for (const call of apply.mock.calls) {
      expect(call[2].reason).toBe('sale');
      expect(call[2].direction).toBe(-1);
      expect(call[2].referenceType).toBe('order_line');
      expect(call[2].referenceId).toBe(LINE_ID);
      expect(call[4]?.skipAvailabilityRecompute).toBe(true);
    }
    // Quantities: 200×2 = 400 and 100×2 = 200
    const quantities = apply.mock.calls.map((c) => c[2].quantity).sort((a, b) => a - b);
    expect(quantities).toEqual([200, 400]);

    expect(AvailabilityService.recomputeForIngredients).toHaveBeenCalledTimes(1);
  });

  it('refuses to deliver a cancelled order', () => {
    const db = makeFakeDb();
    vi.spyOn(orderRepository, 'findById').mockReturnValue(order({ status: 'cancelled' }));

    expect(() =>
      OrderService.markDelivered(db as never, DEFAULT_TENANT_ID, ORDER_ID),
    ).toThrow(ConflictError);
  });

  it('returns the existing record when already delivered (no second deduction)', () => {
    const db = makeFakeDb();
    const delivered = order({ status: 'delivered', deliveredAt: 1 });
    vi.spyOn(orderRepository, 'findById').mockReturnValue(delivered);
    vi.spyOn(orderLineRepository, 'listForOrder').mockReturnValue([line()]);
    const apply = vi.spyOn(InventoryService, 'applyMovement');

    OrderService.markDelivered(db as never, DEFAULT_TENANT_ID, ORDER_ID);

    expect(apply).not.toHaveBeenCalled();
  });
});

describe('OrderService.cancelOrder', () => {
  function setupRecipeRows() {
    vi.spyOn(orderLineRepository, 'listForOrder').mockReturnValue([line({ quantity: 2 })]);
    vi.spyOn(recipeRepository, 'ingredientsForVersion').mockReturnValue([
      {
        id: 'r-1',
        recipeVersionId: RECIPE_PANEER,
        childIngredientId: ING_RICE,
        quantity: 200,
        unit: 'g',
        notes: null,
        displayOrder: 0,
      },
    ] as RecipeIngredientRow[]);
    vi.spyOn(orderRepository, 'update').mockReturnValue(order({ status: 'cancelled' }));
  }

  it('cancels a pending order with no movements', () => {
    const db = makeFakeDb();
    vi.spyOn(orderRepository, 'findById').mockReturnValue(order({ status: 'pending' }));
    setupRecipeRows();
    const apply = vi.spyOn(InventoryService, 'applyMovement');

    OrderService.cancelOrder(db as never, DEFAULT_TENANT_ID, { id: ORDER_ID });

    expect(apply).not.toHaveBeenCalled();
  });

  it('refuses to cancel a delivered order without alreadyPrepared', () => {
    const db = makeFakeDb();
    vi.spyOn(orderRepository, 'findById').mockReturnValue(order({ status: 'delivered' }));

    expect(() =>
      OrderService.cancelOrder(db as never, DEFAULT_TENANT_ID, { id: ORDER_ID }),
    ).toThrow(ValidationError);
  });

  it('writes sale_reversal movements (positive direction) when delivered + alreadyPrepared=false', () => {
    const db = makeFakeDb();
    vi.spyOn(orderRepository, 'findById').mockReturnValue(order({ status: 'delivered' }));
    setupRecipeRows();
    const apply = vi.spyOn(InventoryService, 'applyMovement').mockReturnValue({
      movement: {} as never,
      newStockQuantity: 0,
    });

    OrderService.cancelOrder(db as never, DEFAULT_TENANT_ID, {
      id: ORDER_ID,
      alreadyPrepared: false,
    });

    expect(apply).toHaveBeenCalledTimes(1);
    expect(apply.mock.calls[0]![2].reason).toBe('sale_reversal');
    expect(apply.mock.calls[0]![2].direction).toBe(1);
    expect(apply.mock.calls[0]![2].quantity).toBe(400);
  });

  it('writes wastage movements (negative direction) when delivered + alreadyPrepared=true', () => {
    const db = makeFakeDb();
    vi.spyOn(orderRepository, 'findById').mockReturnValue(order({ status: 'delivered' }));
    setupRecipeRows();
    const apply = vi.spyOn(InventoryService, 'applyMovement').mockReturnValue({
      movement: {} as never,
      newStockQuantity: 0,
    });

    OrderService.cancelOrder(db as never, DEFAULT_TENANT_ID, {
      id: ORDER_ID,
      alreadyPrepared: true,
    });

    expect(apply).toHaveBeenCalledTimes(1);
    expect(apply.mock.calls[0]![2].reason).toBe('wastage');
    expect(apply.mock.calls[0]![2].direction).toBe(-1);
    expect(apply.mock.calls[0]![2].quantity).toBe(400);
  });
});

describe('OrderService.createManualOrder', () => {
  it('routes manual_entry channel into processIncomingOrder directly', () => {
    const db = makeFakeDb();
    vi.spyOn(menuItemRepository, 'findById').mockReturnValue(menu({}));
    vi.spyOn(recipeRepository, 'findActiveVersion').mockReturnValue(recipeVersion());
    vi.spyOn(orderRepository, 'findByExternalId').mockReturnValue(undefined);
    vi.spyOn(orderRepository, 'insert').mockImplementation((_db, row) => row as OrderRow);
    vi.spyOn(orderLineRepository, 'insertMany').mockImplementation((_db, rows) => rows as OrderLineRow[]);

    const result = OrderService.createManualOrder(db as never, DEFAULT_TENANT_ID, {
      channel: 'manual_entry',
      externalRef: 'table-7',
      notes: null,
      lines: [{ menuItemId: MENU_PANEER, quantity: 1, unitPrice: 280 }],
    });

    expect('id' in result).toBe(true);
    if ('id' in result) {
      expect(result.lines).toHaveLength(1);
    }
  });
});
