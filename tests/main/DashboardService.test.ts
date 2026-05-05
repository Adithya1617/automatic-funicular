import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DashboardService } from '../../main/services/DashboardService';
import { ingredientRepository } from '../../main/repositories/ingredientRepository';
import { invoiceLineRepository } from '../../main/repositories/invoiceLineRepository';
import { invoiceRepository } from '../../main/repositories/invoiceRepository';
import { menuItemRepository } from '../../main/repositories/menuItemRepository';
import { orderLineRepository } from '../../main/repositories/orderLineRepository';
import { orderRepository } from '../../main/repositories/orderRepository';
import { recipeRepository } from '../../main/repositories/recipeRepository';
import { stockMovementRepository } from '../../main/repositories/stockMovementRepository';
import { DEFAULT_TENANT_ID, SYSTEM_USER_ID } from '@shared/constants/system';
import type {
  IngredientRow,
  InvoiceLineRow,
  InvoiceRow,
  MenuItemRow,
  OrderLineRow,
  OrderRow,
  RecipeIngredientRow,
  RecipeVersionRow,
  StockMovementRow,
} from '../../main/db/schema';

const TODAY = new Date('2026-04-15T12:00:00Z').getTime();
const MS_PER_DAY = 24 * 60 * 60 * 1_000;
const RANGE = { startMs: TODAY - 7 * MS_PER_DAY, endMs: TODAY };

const ING_A = '01900000-0000-7000-8000-0000000d00a1';
const ING_B = '01900000-0000-7000-8000-0000000d00a2';
const MI_BIRYANI = '01900000-0000-7000-8000-0000000d0001';
const MI_DAL = '01900000-0000-7000-8000-0000000d0002';
const ORDER_A = '01900000-0000-7000-8000-0000000d0011';
const ORDER_LINE_A = '01900000-0000-7000-8000-0000000d0021';
const ORDER_LINE_B = '01900000-0000-7000-8000-0000000d0022';
const SUPPLIER_A = '01900000-0000-7000-8000-0000000d0031';
const INVOICE_A = '01900000-0000-7000-8000-0000000d0041';

function ing(overrides: Partial<IngredientRow>): IngredientRow {
  return {
    id: ING_A,
    tenantId: DEFAULT_TENANT_ID,
    name: 'Rice',
    category: 'Grains',
    type: 'raw',
    baseUnit: 'g',
    stockQuantity: 1_000,
    reservedQuantity: 0,
    lowStockThreshold: 0,
    currentAvgCostPerUnit: 0.05,
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
  return { transaction: vi.fn() };
}

beforeEach(() => {
  vi.spyOn(menuItemRepository, 'list').mockReturnValue([]);
  vi.spyOn(orderRepository, 'listInRange').mockReturnValue([]);
  vi.spyOn(orderLineRepository, 'listForOrders').mockReturnValue([]);
  vi.spyOn(invoiceRepository, 'listCommittedInRange').mockReturnValue([]);
  vi.spyOn(invoiceLineRepository, 'listForInvoices').mockReturnValue([]);
  vi.spyOn(recipeRepository, 'findActiveVersion').mockReturnValue(undefined);
  vi.spyOn(recipeRepository, 'ingredientsForVersion').mockReturnValue([]);
  vi.spyOn(stockMovementRepository, 'listInRange').mockReturnValue([]);
  vi.spyOn(stockMovementRepository, 'listSince').mockReturnValue([]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('DashboardService.stockValue', () => {
  it('sums stock × avg cost for active ingredients only', () => {
    const db = makeFakeDb();
    vi.spyOn(ingredientRepository, 'list').mockReturnValue([
      ing({ id: ING_A, stockQuantity: 1_000, currentAvgCostPerUnit: 0.05 }), // 50
      ing({ id: ING_B, stockQuantity: 500, currentAvgCostPerUnit: 0.10 }), // 50
    ]);
    const result = DashboardService.stockValue(db as never, DEFAULT_TENANT_ID);
    expect(result.totalValue).toBeCloseTo(100, 6);
  });
});

describe('DashboardService.cogs', () => {
  it('aggregates |qty| × cost_at_time over sale movements grouped by menu item, dedupes revenue per order line', () => {
    const db = makeFakeDb();
    const menuItemA: MenuItemRow = {
      id: MI_BIRYANI,
      tenantId: DEFAULT_TENANT_ID,
      name: 'Biryani',
      category: 'Mains',
      sellingPrice: 220,
      variantGroupId: null,
      displayOrder: 0,
      isActive: true,
      createdAt: 0,
      updatedAt: 0,
      createdBy: SYSTEM_USER_ID,
      updatedBy: SYSTEM_USER_ID,
    };
    const orderLineA: OrderLineRow = {
      id: ORDER_LINE_A,
      orderId: ORDER_A,
      menuItemId: MI_BIRYANI,
      quantity: 2,
      unitPrice: 220,
      recipeVersionId: 'rv-1',
    };
    // Two sale movements (rice + chicken) for the same order line — revenue
    // should only be counted once.
    const sale1: StockMovementRow = {
      id: 'm1',
      tenantId: DEFAULT_TENANT_ID,
      ingredientId: ING_A,
      changeQuantity: -200,
      costPerUnitAtTime: 0.05,
      reason: 'sale',
      referenceType: 'order_line',
      referenceId: ORDER_LINE_A,
      notes: null,
      occurredAt: TODAY - MS_PER_DAY,
      createdAt: 0,
      createdBy: SYSTEM_USER_ID,
    };
    const sale2: StockMovementRow = { ...sale1, id: 'm2', ingredientId: ING_B, changeQuantity: -100, costPerUnitAtTime: 0.20 };
    vi.spyOn(stockMovementRepository, 'listInRange').mockImplementation((_db, _tid, _r, reasons) => {
      if (reasons?.includes('sale')) return [sale1, sale2];
      return [];
    });
    vi.spyOn(orderLineRepository, 'listForOrders').mockReturnValue([orderLineA]);
    vi.spyOn(menuItemRepository, 'list').mockReturnValue([menuItemA]);
    vi.spyOn(ingredientRepository, 'list').mockReturnValue([ing({ id: ING_A }), ing({ id: ING_B })]);

    const result = DashboardService.cogs(db as never, DEFAULT_TENANT_ID, RANGE);
    expect(result.rows).toHaveLength(1);
    const row = result.rows[0]!;
    // 200×0.05 + 100×0.20 = 10 + 20 = 30
    expect(row.cogs).toBeCloseTo(30, 6);
    expect(row.qtySold).toBe(2);
    expect(row.revenue).toBeCloseTo(440, 6);
    expect(result.totalCogs).toBeCloseTo(30, 6);
    expect(result.totalRevenue).toBeCloseTo(440, 6);
  });

  it('skips movements without a referenced order line', () => {
    const db = makeFakeDb();
    const orphan: StockMovementRow = {
      id: 'm-x',
      tenantId: DEFAULT_TENANT_ID,
      ingredientId: ING_A,
      changeQuantity: -100,
      costPerUnitAtTime: 0.05,
      reason: 'sale',
      referenceType: 'manual',
      referenceId: null,
      notes: null,
      occurredAt: TODAY,
      createdAt: 0,
      createdBy: SYSTEM_USER_ID,
    };
    vi.spyOn(stockMovementRepository, 'listInRange').mockReturnValue([orphan]);
    vi.spyOn(ingredientRepository, 'list').mockReturnValue([ing({})]);

    const result = DashboardService.cogs(db as never, DEFAULT_TENANT_ID, RANGE);
    expect(result.rows).toHaveLength(0);
    expect(result.totalCogs).toBe(0);
  });
});

describe('DashboardService.spending', () => {
  it('totals committed invoices, breaks down by category and top ingredients', () => {
    const db = makeFakeDb();
    const inv: InvoiceRow = {
      id: INVOICE_A,
      tenantId: DEFAULT_TENANT_ID,
      supplierId: SUPPLIER_A,
      invoiceNumber: 'INV-1',
      invoiceDate: TODAY - 2 * MS_PER_DAY,
      totalAmount: 1500,
      filePath: null,
      status: 'committed',
      notes: null,
      committedAt: TODAY - 2 * MS_PER_DAY,
      createdAt: 0,
      updatedAt: 0,
      createdBy: SYSTEM_USER_ID,
      updatedBy: SYSTEM_USER_ID,
    };
    const lines: InvoiceLineRow[] = [
      { id: 'l1', invoiceId: INVOICE_A, rawDescription: 'Rice', ingredientId: ING_A, quantity: 25, unit: 'kg', unitCost: 60, totalCost: 1500, displayOrder: 0 },
    ];
    vi.spyOn(invoiceRepository, 'listCommittedInRange').mockReturnValue([inv]);
    vi.spyOn(invoiceLineRepository, 'listForInvoices').mockReturnValue(lines);
    vi.spyOn(ingredientRepository, 'list').mockReturnValue([
      ing({ id: ING_A, name: 'Rice', category: 'Grains' }),
    ]);

    const result = DashboardService.spending(db as never, DEFAULT_TENANT_ID, RANGE);
    expect(result.totalSpend).toBeCloseTo(1500, 6);
    expect(result.invoiceCount).toBe(1);
    expect(result.byCategory[0]).toEqual({ category: 'Grains', amount: 1500 });
    expect(result.topIngredients[0]).toEqual({
      ingredientId: ING_A,
      ingredientName: 'Rice',
      amount: 1500,
    });
  });

  it('buckets unmapped lines into Unmapped category', () => {
    const db = makeFakeDb();
    vi.spyOn(invoiceRepository, 'listCommittedInRange').mockReturnValue([
      {
        id: INVOICE_A,
        tenantId: DEFAULT_TENANT_ID,
        supplierId: SUPPLIER_A,
        invoiceNumber: 'INV',
        invoiceDate: TODAY,
        totalAmount: 100,
        filePath: null,
        status: 'committed',
        notes: null,
        committedAt: TODAY,
        createdAt: 0,
        updatedAt: 0,
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      } as InvoiceRow,
    ]);
    vi.spyOn(invoiceLineRepository, 'listForInvoices').mockReturnValue([
      { id: 'l1', invoiceId: INVOICE_A, rawDescription: 'Mystery', ingredientId: null, quantity: 1, unit: 'each', unitCost: 100, totalCost: 100, displayOrder: 0 },
    ]);
    vi.spyOn(ingredientRepository, 'list').mockReturnValue([]);

    const result = DashboardService.spending(db as never, DEFAULT_TENANT_ID, RANGE);
    expect(result.byCategory).toContainEqual({ category: 'Unmapped', amount: 100 });
  });
});

describe('DashboardService.wastage', () => {
  it('separates wastage / prep_loss / staff_meal totals', () => {
    const db = makeFakeDb();
    const mv = (overrides: Partial<StockMovementRow>): StockMovementRow => ({
      id: overrides.id ?? 'mw',
      tenantId: DEFAULT_TENANT_ID,
      ingredientId: ING_A,
      changeQuantity: -100,
      costPerUnitAtTime: 0.05,
      reason: 'wastage',
      referenceType: 'manual',
      referenceId: null,
      notes: null,
      occurredAt: TODAY,
      createdAt: 0,
      createdBy: SYSTEM_USER_ID,
      ...overrides,
    });
    vi.spyOn(stockMovementRepository, 'listInRange').mockReturnValue([
      mv({ id: 'a', reason: 'wastage', changeQuantity: -100, costPerUnitAtTime: 0.05 }), // 5
      mv({ id: 'b', reason: 'prep_loss', changeQuantity: -200, costPerUnitAtTime: 0.05 }), // 10
      mv({ id: 'c', reason: 'staff_meal', changeQuantity: -50, costPerUnitAtTime: 0.05 }), // 2.5
    ]);
    vi.spyOn(ingredientRepository, 'list').mockReturnValue([ing({})]);

    const result = DashboardService.wastage(db as never, DEFAULT_TENANT_ID, RANGE);
    expect(result.totalLoss).toBeCloseTo(17.5, 6);
    const byReason = Object.fromEntries(result.byReason.map((r) => [r.reason, r.amount]));
    expect(byReason.wastage).toBeCloseTo(5, 6);
    expect(byReason.prep_loss).toBeCloseTo(10, 6);
    expect(byReason.staff_meal).toBeCloseTo(2.5, 6);
  });
});

describe('DashboardService.lowStock', () => {
  it('flags ingredients below threshold and ingredients with consumption-driven < 14 days remaining', () => {
    const db = makeFakeDb();
    vi.spyOn(ingredientRepository, 'list').mockReturnValue([
      ing({ id: ING_A, name: 'Rice', stockQuantity: 50, lowStockThreshold: 100 }), // below threshold
      ing({ id: ING_B, name: 'Salt', stockQuantity: 1_000, lowStockThreshold: 0 }), // not flagged
    ]);
    vi.spyOn(stockMovementRepository, 'listInRange').mockReturnValue([
      // 1400g over 7 days => 200/day; 50g stock → 0.25 days
      {
        id: 'sm', tenantId: DEFAULT_TENANT_ID, ingredientId: ING_A, changeQuantity: -1400,
        costPerUnitAtTime: 0.05, reason: 'sale', referenceType: 'order_line', referenceId: null,
        notes: null, occurredAt: TODAY, createdAt: 0, createdBy: SYSTEM_USER_ID,
      } as StockMovementRow,
    ]);

    const result = DashboardService.lowStock(db as never, DEFAULT_TENANT_ID, RANGE);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]!.ingredientId).toBe(ING_A);
    expect(result.rows[0]!.consumptionPerDay).toBeCloseTo(200, 6);
    expect(result.rows[0]!.daysRemaining).toBeCloseTo(0.25, 2);
  });
});

describe('DashboardService.reorder', () => {
  it('suggests an order qty equal to (lead+7) days of consumption minus current stock', () => {
    const db = makeFakeDb();
    vi.spyOn(ingredientRepository, 'list').mockReturnValue([
      ing({ id: ING_A, name: 'Rice', stockQuantity: 100 }),
    ]);
    // 700g over 7 days => 100/day. lead=7 + buffer=7 → target = 1400. Stock = 100 → suggest 1300.
    vi.spyOn(stockMovementRepository, 'listInRange').mockReturnValue([
      {
        id: 'sm', tenantId: DEFAULT_TENANT_ID, ingredientId: ING_A, changeQuantity: -700,
        costPerUnitAtTime: 0.05, reason: 'sale', referenceType: 'order_line', referenceId: null,
        notes: null, occurredAt: TODAY, createdAt: 0, createdBy: SYSTEM_USER_ID,
      } as StockMovementRow,
    ]);

    const result = DashboardService.reorder(db as never, DEFAULT_TENANT_ID, RANGE, 7);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]!.suggestedOrderQuantity).toBeCloseTo(1300, 6);
    expect(result.rows[0]!.consumptionPerDay).toBeCloseTo(100, 6);
  });

  it('omits ingredients with zero consumption and adequate stock', () => {
    const db = makeFakeDb();
    vi.spyOn(ingredientRepository, 'list').mockReturnValue([
      ing({ id: ING_A, name: 'Salt', stockQuantity: 5_000, lowStockThreshold: 0 }),
    ]);
    const result = DashboardService.reorder(db as never, DEFAULT_TENANT_ID, RANGE);
    expect(result.rows).toHaveLength(0);
  });
});

describe('DashboardService.foodCost', () => {
  it('computes (recipe cost) / (selling price) per active menu item', () => {
    const db = makeFakeDb();
    const mi: MenuItemRow = {
      id: MI_DAL,
      tenantId: DEFAULT_TENANT_ID,
      name: 'Dal',
      category: 'Mains',
      sellingPrice: 100,
      variantGroupId: null,
      displayOrder: 0,
      isActive: true,
      createdAt: 0,
      updatedAt: 0,
      createdBy: SYSTEM_USER_ID,
      updatedBy: SYSTEM_USER_ID,
    };
    vi.spyOn(menuItemRepository, 'list').mockReturnValue([mi]);
    vi.spyOn(ingredientRepository, 'list').mockReturnValue([
      ing({ id: ING_A, name: 'Lentils', currentAvgCostPerUnit: 0.10, baseUnit: 'g' }),
    ]);
    const recipe: RecipeVersionRow = {
      id: 'rv-dal', tenantId: DEFAULT_TENANT_ID, parentId: MI_DAL, parentType: 'menu_item',
      versionNumber: 1, isCurrent: true, targetYield: 1, notes: null,
      createdAt: 0, createdBy: SYSTEM_USER_ID,
    };
    const recipeIngredients: RecipeIngredientRow[] = [
      { id: 'ri-1', recipeVersionId: 'rv-dal', childIngredientId: ING_A, quantity: 200, unit: 'g', notes: null, displayOrder: 0 },
    ];
    vi.spyOn(recipeRepository, 'findActiveVersion').mockReturnValue(recipe);
    vi.spyOn(recipeRepository, 'ingredientsForVersion').mockReturnValue(recipeIngredients);

    const result = DashboardService.foodCost(db as never, DEFAULT_TENANT_ID);
    expect(result.rows).toHaveLength(1);
    // 200g × 0.10/g = 20 cost; 20/100 = 0.2.
    expect(result.rows[0]!.recipeCost).toBeCloseTo(20, 6);
    expect(result.rows[0]!.foodCostPercent).toBeCloseTo(0.2, 6);
  });

  it('returns null food-cost-percent when selling price is 0', () => {
    const db = makeFakeDb();
    vi.spyOn(menuItemRepository, 'list').mockReturnValue([
      {
        id: MI_DAL, tenantId: DEFAULT_TENANT_ID, name: 'Free dish', category: 'Mains',
        sellingPrice: 0, variantGroupId: null, displayOrder: 0, isActive: true,
        createdAt: 0, updatedAt: 0, createdBy: SYSTEM_USER_ID, updatedBy: SYSTEM_USER_ID,
      } as MenuItemRow,
    ]);
    vi.spyOn(ingredientRepository, 'list').mockReturnValue([]);
    const result = DashboardService.foodCost(db as never, DEFAULT_TENANT_ID);
    expect(result.rows[0]!.foodCostPercent).toBeNull();
  });
});

describe('DashboardService.revenueByChannel', () => {
  it('rolls up delivered orders by source', () => {
    const db = makeFakeDb();
    const order = (id: string, source: OrderRow['source'], total: number): OrderRow => ({
      id, tenantId: DEFAULT_TENANT_ID, externalOrderId: null, source,
      placedAt: TODAY, deliveredAt: TODAY, cancelledAt: null, cancelledPrepared: null,
      status: 'delivered', totalAmount: total, notes: null,
      createdAt: 0, updatedAt: 0, createdBy: SYSTEM_USER_ID, updatedBy: SYSTEM_USER_ID,
    });
    vi.spyOn(orderRepository, 'listInRange').mockReturnValue([
      order('o1', 'mock_online', 500),
      order('o2', 'mock_online', 300),
      order('o3', 'manual_entry', 200),
    ]);

    const result = DashboardService.revenueByChannel(db as never, DEFAULT_TENANT_ID, RANGE);
    const byKey = Object.fromEntries(result.rows.map((r) => [r.source, r]));
    expect(byKey.mock_online!.revenue).toBeCloseTo(800, 6);
    expect(byKey.mock_online!.orderCount).toBe(2);
    expect(byKey.manual_entry!.revenue).toBeCloseTo(200, 6);
  });
});
