import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DashboardService } from '../../main/services/DashboardService';
import { bikeRepository } from '../../main/repositories/bikeRepository';
import { bikeTypeRepository } from '../../main/repositories/bikeTypeRepository';
import { ingredientRepository } from '../../main/repositories/ingredientRepository';
import { invoiceLineRepository } from '../../main/repositories/invoiceLineRepository';
import { invoiceRepository } from '../../main/repositories/invoiceRepository';
import { menuItemRepository } from '../../main/repositories/menuItemRepository';
import { orderLineRepository } from '../../main/repositories/orderLineRepository';
import { orderRepository } from '../../main/repositories/orderRepository';
import { recipeRepository } from '../../main/repositories/recipeRepository';
import { serviceEventLineRepository } from '../../main/repositories/serviceEventLineRepository';
import { serviceEventRepository } from '../../main/repositories/serviceEventRepository';
import { serviceTemplateRepository } from '../../main/repositories/serviceTemplateRepository';
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
  // Hyprride repos default to empty so existing tile tests don't have to
  // know about them.
  vi.spyOn(bikeRepository, 'list').mockReturnValue([]);
  vi.spyOn(bikeRepository, 'findById').mockReturnValue(undefined);
  vi.spyOn(bikeTypeRepository, 'list').mockReturnValue([]);
  vi.spyOn(serviceEventRepository, 'listInRange').mockReturnValue([]);
  vi.spyOn(serviceEventLineRepository, 'listForEvents').mockReturnValue([]);
  vi.spyOn(serviceTemplateRepository, 'list').mockReturnValue([]);
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

// ============================================================
// Hyprride bike-centric tiles
// ============================================================

import type {
  BikeRow,
  BikeTypeRow,
  ServiceEventLineRow,
  ServiceEventRow,
  ServiceTemplateRow,
} from '../../main/db/schema';

const TYPE_110 = '01900000-0000-7000-8000-0000000d0a01';
const TYPE_125 = '01900000-0000-7000-8000-0000000d0a02';
const BIKE_1 = '01900000-0000-7000-8000-0000000d0b01';
const BIKE_2 = '01900000-0000-7000-8000-0000000d0b02';
const TPL_STD = '01900000-0000-7000-8000-0000000d0c01';
const EVT_1 = '01900000-0000-7000-8000-0000000d0d01';
const EVT_2 = '01900000-0000-7000-8000-0000000d0d02';
const LINE_1 = '01900000-0000-7000-8000-0000000d0e01';
const LINE_2 = '01900000-0000-7000-8000-0000000d0e02';
const LINE_3 = '01900000-0000-7000-8000-0000000d0e03';
const PART_OIL = '01900000-0000-7000-8000-0000000d0f01';
const PART_BRAKE = '01900000-0000-7000-8000-0000000d0f02';

function bikeType(overrides: Partial<BikeTypeRow> = {}): BikeTypeRow {
  return {
    id: TYPE_110,
    tenantId: DEFAULT_TENANT_ID,
    name: 'Activa',
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

function bike(overrides: Partial<BikeRow> = {}): BikeRow {
  return {
    id: BIKE_1,
    tenantId: DEFAULT_TENANT_ID,
    bikeNumber: 'HYP-001',
    bikeTypeId: TYPE_110,
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

function evt(overrides: Partial<ServiceEventRow> = {}): ServiceEventRow {
  return {
    id: EVT_1,
    tenantId: DEFAULT_TENANT_ID,
    bikeId: BIKE_1,
    serviceTemplateId: TPL_STD,
    serviceTemplateVersionId: 'rv-1',
    status: 'completed',
    startedAt: TODAY - 3 * MS_PER_DAY,
    completedAt: TODAY - 3 * MS_PER_DAY,
    cancelledAt: null,
    cancelledPartsUsed: null,
    odometerKm: null,
    notes: null,
    createdAt: 0,
    updatedAt: 0,
    createdBy: SYSTEM_USER_ID,
    updatedBy: SYSTEM_USER_ID,
    ...overrides,
  };
}

function evtLine(overrides: Partial<ServiceEventLineRow> = {}): ServiceEventLineRow {
  return {
    id: LINE_1,
    serviceEventId: EVT_1,
    ingredientId: PART_OIL,
    quantity: 800,
    unit: 'ml',
    notes: null,
    displayOrder: 0,
    ...overrides,
  };
}

function mvt(overrides: Partial<StockMovementRow>): StockMovementRow {
  return {
    id: 'm-1',
    tenantId: DEFAULT_TENANT_ID,
    ingredientId: PART_OIL,
    changeQuantity: -800,
    costPerUnitAtTime: 0.42,
    reason: 'service_consumed',
    referenceType: 'service_event_line',
    referenceId: LINE_1,
    notes: null,
    occurredAt: TODAY - 3 * MS_PER_DAY,
    createdAt: 0,
    createdBy: SYSTEM_USER_ID,
    ...overrides,
  };
}

describe('DashboardService.costPerBike', () => {
  it('returns empty when there are no events in range', () => {
    const db = makeFakeDb();
    vi.spyOn(stockMovementRepository, 'listInRange').mockReturnValue([]);
    vi.spyOn(serviceEventRepository, 'listInRange').mockReturnValue([]);
    const result = DashboardService.costPerBike(db as never, DEFAULT_TENANT_ID, RANGE);
    expect(result.totalCost).toBe(0);
    expect(result.rows).toEqual([]);
  });

  it('sums service_consumed cost per bike across multiple events', () => {
    const db = makeFakeDb();
    vi.spyOn(serviceEventRepository, 'listInRange').mockReturnValue([
      evt({ id: EVT_1, bikeId: BIKE_1 }),
      evt({ id: EVT_2, bikeId: BIKE_2, completedAt: TODAY - MS_PER_DAY }),
    ]);
    vi.spyOn(serviceEventLineRepository, 'listForEvents').mockReturnValue([
      evtLine({ id: LINE_1, serviceEventId: EVT_1 }),
      evtLine({ id: LINE_2, serviceEventId: EVT_2, ingredientId: PART_BRAKE, quantity: 2, unit: 'each' }),
    ]);
    vi.spyOn(stockMovementRepository, 'listInRange').mockReturnValue([
      mvt({ id: 'm-1', referenceId: LINE_1, changeQuantity: -800, costPerUnitAtTime: 0.42 }),
      mvt({
        id: 'm-2',
        referenceId: LINE_2,
        ingredientId: PART_BRAKE,
        changeQuantity: -2,
        costPerUnitAtTime: 350,
      }),
    ]);
    vi.spyOn(bikeRepository, 'findById').mockImplementation((_db, _tid, id) => {
      if (id === BIKE_1) return bike({ id: BIKE_1, bikeNumber: 'HYP-001', bikeTypeId: TYPE_110 });
      if (id === BIKE_2) return bike({ id: BIKE_2, bikeNumber: 'HYP-002', bikeTypeId: TYPE_125 });
      return undefined;
    });
    vi.spyOn(bikeTypeRepository, 'list').mockReturnValue([
      bikeType({ id: TYPE_110, name: 'Activa' }),
      bikeType({ id: TYPE_125, name: 'Ntorq', engineCc: 125 }),
    ]);

    const result = DashboardService.costPerBike(db as never, DEFAULT_TENANT_ID, RANGE);

    // BIKE_1 cost = 800 × 0.42 = 336; BIKE_2 cost = 2 × 350 = 700
    expect(result.totalCost).toBeCloseTo(336 + 700, 2);
    const byBike = Object.fromEntries(result.rows.map((r) => [r.bikeNumber, r]));
    expect(byBike['HYP-001']!.partsCost).toBeCloseTo(336, 2);
    expect(byBike['HYP-001']!.servicesCount).toBe(1);
    expect(byBike['HYP-002']!.partsCost).toBeCloseTo(700, 2);
    expect(byBike['HYP-002']!.bikeTypeName).toBe('125cc Ntorq');
  });

  it('service_reversal offsets the consumption (clamped at 0) so reversed services do not show cost', () => {
    const db = makeFakeDb();
    vi.spyOn(serviceEventRepository, 'listInRange').mockReturnValue([evt()]);
    vi.spyOn(serviceEventLineRepository, 'listForEvents').mockReturnValue([evtLine()]);
    vi.spyOn(stockMovementRepository, 'listInRange').mockReturnValue([
      mvt({ id: 'm-1', changeQuantity: -800, costPerUnitAtTime: 0.42, reason: 'service_consumed' }),
      mvt({ id: 'm-2', changeQuantity: 800, costPerUnitAtTime: 0.42, reason: 'service_reversal' }),
    ]);
    vi.spyOn(bikeRepository, 'findById').mockReturnValue(bike());
    vi.spyOn(bikeTypeRepository, 'list').mockReturnValue([bikeType()]);

    const result = DashboardService.costPerBike(db as never, DEFAULT_TENANT_ID, RANGE);
    expect(result.totalCost).toBe(0);
    expect(result.rows[0]!.partsCost).toBe(0);
    // The event still counts in the services count — the operator can see
    // the visit happened even though stock came back.
    expect(result.rows[0]!.servicesCount).toBe(1);
  });

  it('lastServiceAt captures the most recent completedAt for the bike', () => {
    const db = makeFakeDb();
    const t1 = TODAY - 5 * MS_PER_DAY;
    const t2 = TODAY - 1 * MS_PER_DAY;
    vi.spyOn(serviceEventRepository, 'listInRange').mockReturnValue([
      evt({ id: EVT_1, bikeId: BIKE_1, completedAt: t1 }),
      evt({ id: EVT_2, bikeId: BIKE_1, completedAt: t2 }),
    ]);
    vi.spyOn(serviceEventLineRepository, 'listForEvents').mockReturnValue([
      evtLine({ id: LINE_1, serviceEventId: EVT_1 }),
      evtLine({ id: LINE_2, serviceEventId: EVT_2 }),
    ]);
    vi.spyOn(stockMovementRepository, 'listInRange').mockReturnValue([
      mvt({ id: 'm-1', referenceId: LINE_1, occurredAt: t1 }),
      mvt({ id: 'm-2', referenceId: LINE_2, occurredAt: t2 }),
    ]);
    vi.spyOn(bikeRepository, 'findById').mockReturnValue(bike());
    vi.spyOn(bikeTypeRepository, 'list').mockReturnValue([bikeType()]);

    const result = DashboardService.costPerBike(db as never, DEFAULT_TENANT_ID, RANGE);
    expect(result.rows[0]!.lastServiceAt).toBe(t2);
    expect(result.rows[0]!.servicesCount).toBe(2);
  });
});

describe('DashboardService.costPerBikeType', () => {
  it('rolls up per-bike costs by bike_type and counts active bikes', () => {
    const db = makeFakeDb();
    vi.spyOn(serviceEventRepository, 'listInRange').mockReturnValue([
      evt({ id: EVT_1, bikeId: BIKE_1 }),
      evt({ id: EVT_2, bikeId: BIKE_2 }),
    ]);
    vi.spyOn(serviceEventLineRepository, 'listForEvents').mockReturnValue([
      evtLine({ id: LINE_1, serviceEventId: EVT_1 }),
      evtLine({ id: LINE_2, serviceEventId: EVT_2 }),
    ]);
    vi.spyOn(stockMovementRepository, 'listInRange').mockReturnValue([
      mvt({ id: 'm-1', referenceId: LINE_1, changeQuantity: -800, costPerUnitAtTime: 0.42 }),
      mvt({ id: 'm-2', referenceId: LINE_2, changeQuantity: -800, costPerUnitAtTime: 0.42 }),
    ]);
    vi.spyOn(bikeRepository, 'findById').mockImplementation((_db, _tid, id) => {
      if (id === BIKE_1) return bike({ id: BIKE_1, bikeTypeId: TYPE_110 });
      if (id === BIKE_2) return bike({ id: BIKE_2, bikeTypeId: TYPE_110 });
      return undefined;
    });
    // 3 active bikes in 110, 1 in 125.
    vi.spyOn(bikeRepository, 'list').mockReturnValue([
      bike({ id: 'b-a', bikeTypeId: TYPE_110 }),
      bike({ id: 'b-b', bikeTypeId: TYPE_110 }),
      bike({ id: 'b-c', bikeTypeId: TYPE_110 }),
      bike({ id: 'b-d', bikeTypeId: TYPE_125 }),
    ]);
    vi.spyOn(bikeTypeRepository, 'list').mockReturnValue([
      bikeType({ id: TYPE_110, name: 'Activa' }),
      bikeType({ id: TYPE_125, name: 'Ntorq', engineCc: 125 }),
    ]);

    const result = DashboardService.costPerBikeType(db as never, DEFAULT_TENANT_ID, RANGE);
    const byType = Object.fromEntries(result.rows.map((r) => [r.bikeTypeName, r]));
    expect(byType['110cc Activa']!.partsCost).toBeCloseTo(336 + 336, 2);
    expect(byType['110cc Activa']!.bikeCount).toBe(3);
    expect(byType['110cc Activa']!.servicesCount).toBe(2);
    expect(byType['125cc Ntorq']!.partsCost).toBe(0);
    expect(byType['125cc Ntorq']!.bikeCount).toBe(1);
  });
});

describe('DashboardService.topConsumedParts', () => {
  it('aggregates service_consumed by ingredient and sorts by cost', () => {
    const db = makeFakeDb();
    vi.spyOn(stockMovementRepository, 'listInRange').mockReturnValue([
      mvt({ id: 'm-1', ingredientId: PART_OIL, changeQuantity: -800, costPerUnitAtTime: 0.42 }),
      mvt({ id: 'm-2', ingredientId: PART_OIL, changeQuantity: -800, costPerUnitAtTime: 0.42 }),
      mvt({
        id: 'm-3',
        ingredientId: PART_BRAKE,
        changeQuantity: -4,
        costPerUnitAtTime: 350,
      }),
    ]);
    vi.spyOn(ingredientRepository, 'list').mockReturnValue([
      ing({ id: PART_OIL, name: 'Castrol 10W30', baseUnit: 'ml' }),
      ing({ id: PART_BRAKE, name: 'Brake pads', baseUnit: 'each' }),
    ]);

    const result = DashboardService.topConsumedParts(db as never, DEFAULT_TENANT_ID, RANGE);
    expect(result.rows[0]!.ingredientName).toBe('Brake pads'); // 4 × 350 = 1400
    expect(result.rows[0]!.totalCost).toBeCloseTo(1400, 2);
    expect(result.rows[1]!.ingredientName).toBe('Castrol 10W30'); // 1600 × 0.42 = 672
    expect(result.rows[1]!.totalCost).toBeCloseTo(672, 2);
    expect(result.rows[1]!.totalQuantity).toBe(1600);
  });

  it('drops ingredients whose service_reversal net to zero or negative', () => {
    const db = makeFakeDb();
    vi.spyOn(stockMovementRepository, 'listInRange').mockReturnValue([
      mvt({ id: 'm-1', ingredientId: PART_OIL, changeQuantity: -800, costPerUnitAtTime: 0.42, reason: 'service_consumed' }),
      mvt({ id: 'm-2', ingredientId: PART_OIL, changeQuantity: 800, costPerUnitAtTime: 0.42, reason: 'service_reversal' }),
    ]);
    vi.spyOn(ingredientRepository, 'list').mockReturnValue([ing({ id: PART_OIL })]);

    const result = DashboardService.topConsumedParts(db as never, DEFAULT_TENANT_ID, RANGE);
    expect(result.rows).toEqual([]);
  });
});

describe('DashboardService.serviceVolumeByBikeType', () => {
  it('counts only completed events grouped by bike type', () => {
    const db = makeFakeDb();
    // listInRange already filters by status='completed' (passed in by the
    // service), so this mock just returns completed rows.
    vi.spyOn(serviceEventRepository, 'listInRange').mockReturnValue([
      evt({ id: EVT_1, bikeId: BIKE_1, status: 'completed' }),
      evt({ id: EVT_2, bikeId: BIKE_2, status: 'completed' }),
      evt({ id: 'e-3', bikeId: BIKE_1, status: 'completed' }),
    ]);
    vi.spyOn(bikeRepository, 'list').mockReturnValue([
      bike({ id: BIKE_1, bikeTypeId: TYPE_110 }),
      bike({ id: BIKE_2, bikeTypeId: TYPE_125 }),
    ]);
    vi.spyOn(bikeTypeRepository, 'list').mockReturnValue([
      bikeType({ id: TYPE_110, name: 'Activa' }),
      bikeType({ id: TYPE_125, name: 'Ntorq', engineCc: 125 }),
    ]);

    const result = DashboardService.serviceVolumeByBikeType(db as never, DEFAULT_TENANT_ID, RANGE);
    expect(result.totalServices).toBe(3);
    const byType = Object.fromEntries(result.rows.map((r) => [r.bikeTypeName, r.servicesCount]));
    expect(byType['110cc Activa']).toBe(2);
    expect(byType['125cc Ntorq']).toBe(1);
  });

  it('passes status=completed to the repository (only completed events count)', () => {
    const db = makeFakeDb();
    const listSpy = vi
      .spyOn(serviceEventRepository, 'listInRange')
      .mockReturnValue([]);

    DashboardService.serviceVolumeByBikeType(db as never, DEFAULT_TENANT_ID, RANGE);

    expect(listSpy).toHaveBeenCalledWith(expect.anything(), DEFAULT_TENANT_ID, RANGE, {
      status: 'completed',
    });
  });
});

describe('DashboardService.theoreticalServiceCost', () => {
  it('reports hasActiveRecipe=false (and cost=0) for templates without an active recipe', () => {
    const db = makeFakeDb();
    vi.spyOn(serviceTemplateRepository, 'list').mockReturnValue([
      {
        id: TPL_STD,
        tenantId: DEFAULT_TENANT_ID,
        name: 'Standard service',
        bikeTypeId: TYPE_110,
        displayOrder: 0,
        isActive: true,
        createdAt: 0,
        updatedAt: 0,
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      } as ServiceTemplateRow,
    ]);
    vi.spyOn(recipeRepository, 'findActiveVersion').mockReturnValue(undefined);
    vi.spyOn(ingredientRepository, 'list').mockReturnValue([]);
    vi.spyOn(bikeTypeRepository, 'list').mockReturnValue([bikeType()]);

    const result = DashboardService.theoreticalServiceCost(db as never, DEFAULT_TENANT_ID);
    expect(result.rows[0]!.hasActiveRecipe).toBe(false);
    expect(result.rows[0]!.totalCost).toBe(0);
  });

  it('sums baseQty × currentAvgCostPerUnit across recipe rows', () => {
    const db = makeFakeDb();
    vi.spyOn(serviceTemplateRepository, 'list').mockReturnValue([
      {
        id: TPL_STD,
        tenantId: DEFAULT_TENANT_ID,
        name: 'Standard service',
        bikeTypeId: TYPE_110,
        displayOrder: 0,
        isActive: true,
        createdAt: 0,
        updatedAt: 0,
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      } as ServiceTemplateRow,
    ]);
    vi.spyOn(recipeRepository, 'findActiveVersion').mockReturnValue({
      id: 'rv-1',
      tenantId: DEFAULT_TENANT_ID,
      parentId: TPL_STD,
      parentType: 'service_template',
      versionNumber: 1,
      isCurrent: true,
      targetYield: 1,
      notes: null,
      createdAt: 0,
      createdBy: SYSTEM_USER_ID,
    } as RecipeVersionRow);
    vi.spyOn(recipeRepository, 'ingredientsForVersion').mockReturnValue([
      {
        id: 'r-1',
        recipeVersionId: 'rv-1',
        childIngredientId: PART_OIL,
        quantity: 800,
        unit: 'ml',
        notes: null,
        displayOrder: 0,
      } as RecipeIngredientRow,
      {
        id: 'r-2',
        recipeVersionId: 'rv-1',
        childIngredientId: PART_BRAKE,
        quantity: 2,
        unit: 'each',
        notes: null,
        displayOrder: 1,
      } as RecipeIngredientRow,
    ]);
    vi.spyOn(ingredientRepository, 'list').mockReturnValue([
      ing({ id: PART_OIL, baseUnit: 'ml', currentAvgCostPerUnit: 0.42 }),
      ing({ id: PART_BRAKE, baseUnit: 'each', currentAvgCostPerUnit: 350 }),
    ]);
    vi.spyOn(bikeTypeRepository, 'list').mockReturnValue([bikeType()]);

    const result = DashboardService.theoreticalServiceCost(db as never, DEFAULT_TENANT_ID);
    expect(result.rows[0]!.hasActiveRecipe).toBe(true);
    // 800 × 0.42 + 2 × 350 = 336 + 700 = 1036
    expect(result.rows[0]!.totalCost).toBeCloseTo(1036, 2);
  });

  it('skips recipe rows whose ingredient cannot be resolved', () => {
    const db = makeFakeDb();
    vi.spyOn(serviceTemplateRepository, 'list').mockReturnValue([
      {
        id: TPL_STD,
        tenantId: DEFAULT_TENANT_ID,
        name: 'Standard service',
        bikeTypeId: TYPE_110,
        displayOrder: 0,
        isActive: true,
        createdAt: 0,
        updatedAt: 0,
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      } as ServiceTemplateRow,
    ]);
    vi.spyOn(recipeRepository, 'findActiveVersion').mockReturnValue({
      id: 'rv-1',
      tenantId: DEFAULT_TENANT_ID,
      parentId: TPL_STD,
      parentType: 'service_template',
      versionNumber: 1,
      isCurrent: true,
      targetYield: 1,
      notes: null,
      createdAt: 0,
      createdBy: SYSTEM_USER_ID,
    } as RecipeVersionRow);
    vi.spyOn(recipeRepository, 'ingredientsForVersion').mockReturnValue([
      {
        id: 'r-1',
        recipeVersionId: 'rv-1',
        childIngredientId: 'missing-ingredient',
        quantity: 800,
        unit: 'ml',
        notes: null,
        displayOrder: 0,
      } as RecipeIngredientRow,
    ]);
    vi.spyOn(ingredientRepository, 'list').mockReturnValue([]);
    vi.spyOn(bikeTypeRepository, 'list').mockReturnValue([bikeType()]);

    const result = DashboardService.theoreticalServiceCost(db as never, DEFAULT_TENANT_ID);
    expect(result.rows[0]!.hasActiveRecipe).toBe(true);
    expect(result.rows[0]!.totalCost).toBe(0);
  });
});
