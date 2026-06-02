import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ServiceService } from '../../main/services/ServiceService';
import { InventoryService } from '../../main/services/InventoryService';
import { bikeRepository } from '../../main/repositories/bikeRepository';
import { ingredientRepository } from '../../main/repositories/ingredientRepository';
import { recipeRepository } from '../../main/repositories/recipeRepository';
import { serviceEventLineRepository } from '../../main/repositories/serviceEventLineRepository';
import { serviceEventRepository } from '../../main/repositories/serviceEventRepository';
import { serviceTemplateRepository } from '../../main/repositories/serviceTemplateRepository';
import { stockMovementRepository } from '../../main/repositories/stockMovementRepository';
import { DEFAULT_TENANT_ID, SYSTEM_USER_ID } from '@shared/constants/system';
import {
  ConflictError,
  InvariantViolationError,
  NotFoundError,
  ValidationError,
} from '@shared/errors/DomainError';
import type {
  BikeRow,
  IngredientRow,
  RecipeIngredientRow,
  RecipeVersionRow,
  ServiceEventLineRow,
  ServiceEventRow,
  ServiceTemplateRow,
  StockMovementRow,
} from '../../main/db/schema';

const TYPE_110 = '01900000-0000-7000-8000-0000000000a1';
const TYPE_125 = '01900000-0000-7000-8000-0000000000a2';
const BIKE_ID = '01900000-0000-7000-8000-0000000000b1';
const TPL_ID = '01900000-0000-7000-8000-0000000000c1';
const TPL_OTHER = '01900000-0000-7000-8000-0000000000c2';
const RECIPE_V1 = '01900000-0000-7000-8000-0000000000d1';
const RECIPE_V2 = '01900000-0000-7000-8000-0000000000d2';
const PART_OIL = '01900000-0000-7000-8000-0000000000e1';
const PART_BRAKE_PAD = '01900000-0000-7000-8000-0000000000e2';
const EVT_ID = '01900000-0000-7000-8000-0000000000f1';
const LINE_OIL = '01900000-0000-7000-8000-0000000000f2';
const LINE_BRAKE = '01900000-0000-7000-8000-0000000000f3';

function bike(overrides: Partial<BikeRow> = {}): BikeRow {
  return {
    id: BIKE_ID,
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

function tpl(overrides: Partial<ServiceTemplateRow> = {}): ServiceTemplateRow {
  return {
    id: TPL_ID,
    tenantId: DEFAULT_TENANT_ID,
    name: 'Standard service',
    bikeTypeId: TYPE_110,
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
    id: RECIPE_V1,
    tenantId: DEFAULT_TENANT_ID,
    parentId: TPL_ID,
    parentType: 'service_template',
    versionNumber: 1,
    isCurrent: true,
    targetYield: 1,
    notes: null,
    createdAt: 0,
    createdBy: SYSTEM_USER_ID,
    ...overrides,
  };
}

function ingredient(overrides: Partial<IngredientRow>): IngredientRow {
  return {
    id: PART_OIL,
    tenantId: DEFAULT_TENANT_ID,
    name: 'Castrol 10W30',
    category: 'Oil',
    type: 'raw',
    baseUnit: 'ml',
    stockQuantity: 5000,
    reservedQuantity: 0,
    lowStockThreshold: 0,
    currentAvgCostPerUnit: 0.42,
    densityGPerMl: null,
    isActive: true,
    createdAt: 0,
    updatedAt: 0,
    createdBy: SYSTEM_USER_ID,
    updatedBy: SYSTEM_USER_ID,
    ...overrides,
  };
}

function recipeRow(overrides: Partial<RecipeIngredientRow>): RecipeIngredientRow {
  return {
    id: 'r-1',
    recipeVersionId: RECIPE_V1,
    childIngredientId: PART_OIL,
    quantity: 800,
    unit: 'ml',
    notes: null,
    displayOrder: 0,
    ...overrides,
  };
}

function evt(overrides: Partial<ServiceEventRow> = {}): ServiceEventRow {
  return {
    id: EVT_ID,
    tenantId: DEFAULT_TENANT_ID,
    bikeId: BIKE_ID,
    kind: 'service',
    serviceTemplateId: TPL_ID,
    serviceTemplateVersionId: RECIPE_V1,
    status: 'in_progress',
    startedAt: 1_000,
    completedAt: null,
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
    id: LINE_OIL,
    serviceEventId: EVT_ID,
    ingredientId: PART_OIL,
    quantity: 800,
    unit: 'ml',
    notes: null,
    displayOrder: 0,
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
  // applyMovement triggers an availability recompute by default; we don't
  // care about it here. Mock at the InventoryService boundary so we observe
  // the call shape directly.
  vi.spyOn(InventoryService, 'applyMovement').mockImplementation(
    () => ({ movement: {} as never, newStockQuantity: 0 }),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

// --- create ---------------------------------------------------------------

describe('ServiceService.create — start a service event', () => {
  it('throws NotFoundError when the bike does not exist', () => {
    vi.spyOn(bikeRepository, 'findById').mockReturnValue(undefined);

    expect(() =>
      ServiceService.create(makeFakeDb() as never, DEFAULT_TENANT_ID, {
        bikeId: BIKE_ID,
        serviceTemplateId: TPL_ID,
        odometerKm: null,
        notes: null,
      }),
    ).toThrow(NotFoundError);
  });

  it('throws NotFoundError when the service template does not exist', () => {
    vi.spyOn(bikeRepository, 'findById').mockReturnValue(bike());
    vi.spyOn(serviceTemplateRepository, 'findById').mockReturnValue(undefined);

    expect(() =>
      ServiceService.create(makeFakeDb() as never, DEFAULT_TENANT_ID, {
        bikeId: BIKE_ID,
        serviceTemplateId: TPL_ID,
        odometerKm: null,
        notes: null,
      }),
    ).toThrow(NotFoundError);
  });

  it('throws ValidationError when the template is for a different bike type', () => {
    vi.spyOn(bikeRepository, 'findById').mockReturnValue(bike({ bikeTypeId: TYPE_110 }));
    vi.spyOn(serviceTemplateRepository, 'findById').mockReturnValue(
      tpl({ bikeTypeId: TYPE_125 }),
    );

    expect(() =>
      ServiceService.create(makeFakeDb() as never, DEFAULT_TENANT_ID, {
        bikeId: BIKE_ID,
        serviceTemplateId: TPL_ID,
        odometerKm: null,
        notes: null,
      }),
    ).toThrow(ValidationError);
  });

  it('throws ValidationError when the template has no active recipe version', () => {
    vi.spyOn(bikeRepository, 'findById').mockReturnValue(bike());
    vi.spyOn(serviceTemplateRepository, 'findById').mockReturnValue(tpl());
    vi.spyOn(recipeRepository, 'findActiveVersion').mockReturnValue(undefined);

    expect(() =>
      ServiceService.create(makeFakeDb() as never, DEFAULT_TENANT_ID, {
        bikeId: BIKE_ID,
        serviceTemplateId: TPL_ID,
        odometerKm: null,
        notes: null,
      }),
    ).toThrow(ValidationError);
  });

  it('throws ValidationError when the active version exists but has zero rows', () => {
    vi.spyOn(bikeRepository, 'findById').mockReturnValue(bike());
    vi.spyOn(serviceTemplateRepository, 'findById').mockReturnValue(tpl());
    vi.spyOn(recipeRepository, 'findActiveVersion').mockReturnValue(recipeVersion());
    vi.spyOn(recipeRepository, 'ingredientsForVersion').mockReturnValue([]);

    expect(() =>
      ServiceService.create(makeFakeDb() as never, DEFAULT_TENANT_ID, {
        bikeId: BIKE_ID,
        serviceTemplateId: TPL_ID,
        odometerKm: null,
        notes: null,
      }),
    ).toThrow(ValidationError);
  });

  it('inserts the event with status=in_progress, captures the active version id, and copies recipe rows into lines', () => {
    const db = makeFakeDb();
    vi.spyOn(bikeRepository, 'findById').mockReturnValue(bike());
    vi.spyOn(serviceTemplateRepository, 'findById').mockReturnValue(tpl());
    vi.spyOn(recipeRepository, 'findActiveVersion').mockReturnValue(recipeVersion());
    vi.spyOn(recipeRepository, 'ingredientsForVersion').mockReturnValue([
      recipeRow({ childIngredientId: PART_OIL, quantity: 800, unit: 'ml' }),
      recipeRow({
        id: 'r-2',
        childIngredientId: PART_BRAKE_PAD,
        quantity: 2,
        unit: 'each',
        displayOrder: 1,
      }),
    ]);
    const insertEvent = vi
      .spyOn(serviceEventRepository, 'insert')
      .mockImplementation((_db, row) => row as ServiceEventRow);
    const insertLines = vi
      .spyOn(serviceEventLineRepository, 'insertMany')
      .mockImplementation((_db, rows) => rows as ServiceEventLineRow[]);

    const result = ServiceService.create(db as never, DEFAULT_TENANT_ID, {
      bikeId: BIKE_ID,
      serviceTemplateId: TPL_ID,
      odometerKm: 1500,
      notes: 'first oil change',
    });

    expect(insertEvent).toHaveBeenCalledOnce();
    const inserted = insertEvent.mock.calls[0]![1] as ServiceEventRow;
    expect(inserted.status).toBe('in_progress');
    expect(inserted.serviceTemplateVersionId).toBe(RECIPE_V1);
    expect(inserted.odometerKm).toBe(1500);

    expect(insertLines).toHaveBeenCalledOnce();
    const lineRows = insertLines.mock.calls[0]![1] as ServiceEventLineRow[];
    expect(lineRows).toHaveLength(2);
    expect(lineRows[0]!.ingredientId).toBe(PART_OIL);
    expect(lineRows[0]!.quantity).toBe(800);
    expect(lineRows[1]!.ingredientId).toBe(PART_BRAKE_PAD);
    expect(lineRows[1]!.unit).toBe('each');
    expect(result.lines).toHaveLength(2);
  });
});

// --- createAdHoc ----------------------------------------------------------

describe('ServiceService.createAdHoc — quick "Start servicing" flow', () => {
  it('throws NotFoundError when the bike does not exist', () => {
    vi.spyOn(bikeRepository, 'findById').mockReturnValue(undefined);
    expect(() =>
      ServiceService.createAdHoc(makeFakeDb() as never, DEFAULT_TENANT_ID, {
        bikeId: BIKE_ID,
        lines: [{ ingredientId: PART_OIL, quantity: 800, unit: 'ml', notes: null }],
        odometerKm: null,
        notes: null,
      }),
    ).toThrow(NotFoundError);
  });

  it('throws NotFoundError when a referenced part does not exist', () => {
    vi.spyOn(bikeRepository, 'findById').mockReturnValue(bike());
    vi.spyOn(ingredientRepository, 'findById').mockReturnValue(undefined);
    expect(() =>
      ServiceService.createAdHoc(makeFakeDb() as never, DEFAULT_TENANT_ID, {
        bikeId: BIKE_ID,
        lines: [{ ingredientId: PART_OIL, quantity: 800, unit: 'ml', notes: null }],
        odometerKm: null,
        notes: null,
      }),
    ).toThrow(NotFoundError);
  });

  it("throws ValidationError when a line's unit cannot convert to the part's base unit", () => {
    vi.spyOn(bikeRepository, 'findById').mockReturnValue(bike());
    vi.spyOn(ingredientRepository, 'findById').mockReturnValue(
      ingredient({ id: PART_BRAKE_PAD, name: 'Brake pad', baseUnit: 'each' }),
    );
    expect(() =>
      ServiceService.createAdHoc(makeFakeDb() as never, DEFAULT_TENANT_ID, {
        bikeId: BIKE_ID,
        // brake pads are 'each' — ml doesn't convert.
        lines: [
          { ingredientId: PART_BRAKE_PAD, quantity: 100, unit: 'ml', notes: null },
        ],
        odometerKm: null,
        notes: null,
      }),
    ).toThrow(ValidationError);
  });

  it('inserts an event with status=completed and null template fields, plus one line per input', () => {
    const db = makeFakeDb();
    vi.spyOn(bikeRepository, 'findById').mockReturnValue(bike());
    vi.spyOn(ingredientRepository, 'findById').mockImplementation((_db, _t, id) => {
      if (id === PART_OIL) return ingredient({ id: PART_OIL, baseUnit: 'ml' });
      if (id === PART_BRAKE_PAD)
        return ingredient({ id: PART_BRAKE_PAD, baseUnit: 'each' });
      return undefined;
    });
    const insertEvent = vi
      .spyOn(serviceEventRepository, 'insert')
      .mockImplementation((_db, row) => row as ServiceEventRow);
    const insertLines = vi
      .spyOn(serviceEventLineRepository, 'insertMany')
      .mockImplementation((_db, rows) => rows as ServiceEventLineRow[]);

    const result = ServiceService.createAdHoc(db as never, DEFAULT_TENANT_ID, {
      bikeId: BIKE_ID,
      lines: [
        { ingredientId: PART_OIL, quantity: 800, unit: 'ml', notes: null },
        { ingredientId: PART_BRAKE_PAD, quantity: 2, unit: 'each', notes: null },
      ],
      odometerKm: 1500,
      notes: null,
    });

    const inserted = insertEvent.mock.calls[0]![1] as ServiceEventRow;
    expect(inserted.status).toBe('completed');
    expect(inserted.serviceTemplateId).toBeNull();
    expect(inserted.serviceTemplateVersionId).toBeNull();
    expect(inserted.completedAt).not.toBeNull();
    expect(inserted.odometerKm).toBe(1500);

    const lines = insertLines.mock.calls[0]![1] as ServiceEventLineRow[];
    expect(lines).toHaveLength(2);
    expect(lines[0]!.ingredientId).toBe(PART_OIL);
    expect(lines[1]!.ingredientId).toBe(PART_BRAKE_PAD);
    expect(result.lines).toHaveLength(2);
  });

  it('calls applyMovement per line with direction=-1 and reason=service_consumed', () => {
    const db = makeFakeDb();
    vi.spyOn(bikeRepository, 'findById').mockReturnValue(bike());
    vi.spyOn(ingredientRepository, 'findById').mockReturnValue(
      ingredient({ id: PART_OIL, baseUnit: 'ml' }),
    );
    vi.spyOn(serviceEventRepository, 'insert').mockImplementation(
      (_db, row) => row as ServiceEventRow,
    );
    vi.spyOn(serviceEventLineRepository, 'insertMany').mockImplementation(
      (_db, rows) => rows as ServiceEventLineRow[],
    );

    ServiceService.createAdHoc(db as never, DEFAULT_TENANT_ID, {
      bikeId: BIKE_ID,
      lines: [{ ingredientId: PART_OIL, quantity: 800, unit: 'ml', notes: null }],
      odometerKm: null,
      notes: null,
    });

    expect(InventoryService.applyMovement).toHaveBeenCalledTimes(1);
    const callInput = (InventoryService.applyMovement as never as { mock: { calls: unknown[][] } })
      .mock.calls[0]![2] as {
      direction: number;
      reason: string;
      referenceType: string;
      ingredientId: string;
      quantity: number;
    };
    expect(callInput.direction).toBe(-1);
    expect(callInput.reason).toBe('service_consumed');
    expect(callInput.referenceType).toBe('service_event_line');
    expect(callInput.ingredientId).toBe(PART_OIL);
    expect(callInput.quantity).toBe(800);
  });

  it('wash event: inserts kind=wash with zero lines and no stock movements', () => {
    const db = makeFakeDb();
    vi.spyOn(bikeRepository, 'findById').mockReturnValue(bike());
    const insertEvent = vi
      .spyOn(serviceEventRepository, 'insert')
      .mockImplementation((_db, row) => row as ServiceEventRow);
    const insertLines = vi.spyOn(serviceEventLineRepository, 'insertMany');

    const result = ServiceService.createAdHoc(db as never, DEFAULT_TENANT_ID, {
      bikeId: BIKE_ID,
      kind: 'wash',
      lines: [],
      odometerKm: null,
      notes: 'rinsed and dried',
    });

    const inserted = insertEvent.mock.calls[0]![1] as ServiceEventRow;
    expect(inserted.kind).toBe('wash');
    expect(inserted.status).toBe('completed');
    expect(insertLines).not.toHaveBeenCalled();
    expect(InventoryService.applyMovement).not.toHaveBeenCalled();
    expect(result.lines).toHaveLength(0);
  });

  it('throws ValidationError when a wash event is given parts', () => {
    vi.spyOn(bikeRepository, 'findById').mockReturnValue(bike());
    expect(() =>
      ServiceService.createAdHoc(makeFakeDb() as never, DEFAULT_TENANT_ID, {
        bikeId: BIKE_ID,
        kind: 'wash',
        lines: [{ ingredientId: PART_OIL, quantity: 800, unit: 'ml', notes: null }],
        odometerKm: null,
        notes: null,
      }),
    ).toThrow(ValidationError);
  });

  it('throws ValidationError when a service/repair event has no parts', () => {
    vi.spyOn(bikeRepository, 'findById').mockReturnValue(bike());
    expect(() =>
      ServiceService.createAdHoc(makeFakeDb() as never, DEFAULT_TENANT_ID, {
        bikeId: BIKE_ID,
        kind: 'repair',
        lines: [],
        odometerKm: null,
        notes: null,
      }),
    ).toThrow(ValidationError);
  });

  it('defaults kind to "service" when omitted and stamps it on the event', () => {
    const db = makeFakeDb();
    vi.spyOn(bikeRepository, 'findById').mockReturnValue(bike());
    vi.spyOn(ingredientRepository, 'findById').mockReturnValue(
      ingredient({ id: PART_OIL, baseUnit: 'ml' }),
    );
    const insertEvent = vi
      .spyOn(serviceEventRepository, 'insert')
      .mockImplementation((_db, row) => row as ServiceEventRow);
    vi.spyOn(serviceEventLineRepository, 'insertMany').mockImplementation(
      (_db, rows) => rows as ServiceEventLineRow[],
    );

    ServiceService.createAdHoc(db as never, DEFAULT_TENANT_ID, {
      bikeId: BIKE_ID,
      lines: [{ ingredientId: PART_OIL, quantity: 800, unit: 'ml', notes: null }],
      odometerKm: null,
      notes: null,
    });

    const inserted = insertEvent.mock.calls[0]![1] as ServiceEventRow;
    expect(inserted.kind).toBe('service');
  });

  it('status=requested records lines but deducts no stock (completedAt null)', () => {
    const db = makeFakeDb();
    vi.spyOn(bikeRepository, 'findById').mockReturnValue(bike());
    vi.spyOn(ingredientRepository, 'findById').mockReturnValue(
      ingredient({ id: PART_OIL, baseUnit: 'ml' }),
    );
    const insertEvent = vi
      .spyOn(serviceEventRepository, 'insert')
      .mockImplementation((_db, row) => row as ServiceEventRow);
    vi.spyOn(serviceEventLineRepository, 'insertMany').mockImplementation(
      (_db, rows) => rows as ServiceEventLineRow[],
    );

    const result = ServiceService.createAdHoc(db as never, DEFAULT_TENANT_ID, {
      bikeId: BIKE_ID,
      kind: 'repair',
      status: 'requested',
      lines: [{ ingredientId: PART_OIL, quantity: 800, unit: 'ml', notes: null }],
      odometerKm: null,
      notes: null,
    });

    const inserted = insertEvent.mock.calls[0]![1] as ServiceEventRow;
    expect(inserted.status).toBe('requested');
    expect(inserted.completedAt).toBeNull();
    expect(InventoryService.applyMovement).not.toHaveBeenCalled();
    expect(result.lines).toHaveLength(1);
  });

  it('rolls back the whole create when applyMovement throws on a later line (atomic)', () => {
    const db = makeFakeDb();
    vi.spyOn(bikeRepository, 'findById').mockReturnValue(bike());
    vi.spyOn(ingredientRepository, 'findById').mockImplementation((_db, _t, id) => {
      if (id === PART_OIL) return ingredient({ id: PART_OIL, baseUnit: 'ml' });
      if (id === PART_BRAKE_PAD)
        return ingredient({ id: PART_BRAKE_PAD, baseUnit: 'each' });
      return undefined;
    });
    vi.spyOn(serviceEventRepository, 'insert').mockImplementation(
      (_db, row) => row as ServiceEventRow,
    );
    vi.spyOn(serviceEventLineRepository, 'insertMany').mockImplementation(
      (_db, rows) => rows as ServiceEventLineRow[],
    );
    // First call passes, second blows up — caller should see the throw and
    // (in real db) the surrounding tx rolls back.
    let call = 0;
    (InventoryService.applyMovement as never as { mockImplementation: (fn: () => unknown) => unknown }).mockImplementation(
      () => {
        call += 1;
        if (call === 2) throw new InvariantViolationError('insufficient stock');
        return { movement: {} as never, newStockQuantity: 0 };
      },
    );

    expect(() =>
      ServiceService.createAdHoc(db as never, DEFAULT_TENANT_ID, {
        bikeId: BIKE_ID,
        lines: [
          { ingredientId: PART_OIL, quantity: 800, unit: 'ml', notes: null },
          { ingredientId: PART_BRAKE_PAD, quantity: 2, unit: 'each', notes: null },
        ],
        odometerKm: null,
        notes: null,
      }),
    ).toThrow(InvariantViolationError);
  });
});

// --- updateLines ----------------------------------------------------------

describe('ServiceService.updateLines — editable while in_progress', () => {
  it('throws ConflictError when the event is already completed', () => {
    vi.spyOn(serviceEventRepository, 'findById').mockReturnValue(
      evt({ status: 'completed' }),
    );

    expect(() =>
      ServiceService.updateLines(makeFakeDb() as never, DEFAULT_TENANT_ID, {
        id: EVT_ID,
        lines: [
          { ingredientId: PART_OIL, quantity: 1000, unit: 'ml', notes: null, displayOrder: 0 },
        ],
      }),
    ).toThrow(ConflictError);
  });

  it('throws ConflictError when the event is cancelled', () => {
    vi.spyOn(serviceEventRepository, 'findById').mockReturnValue(
      evt({ status: 'cancelled' }),
    );

    expect(() =>
      ServiceService.updateLines(makeFakeDb() as never, DEFAULT_TENANT_ID, {
        id: EVT_ID,
        lines: [
          { ingredientId: PART_OIL, quantity: 1000, unit: 'ml', notes: null, displayOrder: 0 },
        ],
      }),
    ).toThrow(ConflictError);
  });

  it('throws NotFoundError when a line ingredient does not exist', () => {
    vi.spyOn(serviceEventRepository, 'findById').mockReturnValue(evt());
    vi.spyOn(ingredientRepository, 'findById').mockReturnValue(undefined);

    expect(() =>
      ServiceService.updateLines(makeFakeDb() as never, DEFAULT_TENANT_ID, {
        id: EVT_ID,
        lines: [
          { ingredientId: PART_OIL, quantity: 100, unit: 'ml', notes: null, displayOrder: 0 },
        ],
      }),
    ).toThrow(NotFoundError);
  });

  it('replaces the line set and bumps updatedAt while keeping status=in_progress', () => {
    const db = makeFakeDb();
    vi.spyOn(serviceEventRepository, 'findById')
      .mockReturnValueOnce(evt())
      .mockReturnValueOnce(evt());
    vi.spyOn(ingredientRepository, 'findById').mockImplementation((_db, _tid, id) => {
      if (id === PART_OIL) return ingredient({});
      return undefined;
    });
    const replaceSpy = vi
      .spyOn(serviceEventLineRepository, 'replaceLines')
      .mockImplementation((_db, _eid, rows) => rows as ServiceEventLineRow[]);
    vi.spyOn(serviceEventLineRepository, 'listForEvent').mockReturnValue([
      evtLine({ quantity: 1200 }),
    ]);
    const updateSpy = vi
      .spyOn(serviceEventRepository, 'update')
      .mockReturnValue(evt());

    const result = ServiceService.updateLines(db as never, DEFAULT_TENANT_ID, {
      id: EVT_ID,
      lines: [
        { ingredientId: PART_OIL, quantity: 1200, unit: 'ml', notes: null, displayOrder: 0 },
      ],
    });

    expect(replaceSpy).toHaveBeenCalledOnce();
    expect(updateSpy).toHaveBeenCalledOnce();
    expect(result.lines[0]!.quantity).toBe(1200);
  });
});

// --- complete -------------------------------------------------------------

describe('ServiceService.complete — stock deduction', () => {
  it('throws NotFoundError when event does not exist', () => {
    vi.spyOn(serviceEventRepository, 'findById').mockReturnValue(undefined);
    expect(() =>
      ServiceService.complete(makeFakeDb() as never, DEFAULT_TENANT_ID, EVT_ID),
    ).toThrow(NotFoundError);
  });

  it('returns the existing event unchanged when status is already completed (idempotent)', () => {
    vi.spyOn(serviceEventRepository, 'findById').mockReturnValue(
      evt({ status: 'completed' }),
    );
    vi.spyOn(serviceEventLineRepository, 'listForEvent').mockReturnValue([evtLine()]);

    const updateSpy = vi.spyOn(serviceEventRepository, 'update');
    const result = ServiceService.complete(
      makeFakeDb() as never,
      DEFAULT_TENANT_ID,
      EVT_ID,
    );

    expect(InventoryService.applyMovement).not.toHaveBeenCalled();
    expect(updateSpy).not.toHaveBeenCalled();
    expect(result.status).toBe('completed');
  });

  it('throws ConflictError when event is cancelled', () => {
    vi.spyOn(serviceEventRepository, 'findById').mockReturnValue(
      evt({ status: 'cancelled' }),
    );
    expect(() =>
      ServiceService.complete(makeFakeDb() as never, DEFAULT_TENANT_ID, EVT_ID),
    ).toThrow(ConflictError);
  });

  it('throws ValidationError when the event has no lines', () => {
    vi.spyOn(serviceEventRepository, 'findById').mockReturnValue(evt());
    vi.spyOn(serviceEventLineRepository, 'listForEvent').mockReturnValue([]);

    expect(() =>
      ServiceService.complete(makeFakeDb() as never, DEFAULT_TENANT_ID, EVT_ID),
    ).toThrow(ValidationError);
  });

  it('writes one service_consumed movement per line and flips status to completed', () => {
    const db = makeFakeDb();
    vi.spyOn(serviceEventRepository, 'findById')
      .mockReturnValueOnce(evt())
      .mockReturnValueOnce(evt({ status: 'completed', completedAt: 9_999 }));
    vi.spyOn(serviceEventLineRepository, 'listForEvent').mockReturnValue([
      evtLine({ id: LINE_OIL, ingredientId: PART_OIL, quantity: 800, unit: 'ml' }),
      evtLine({
        id: LINE_BRAKE,
        ingredientId: PART_BRAKE_PAD,
        quantity: 2,
        unit: 'each',
      }),
    ]);
    const updateSpy = vi.spyOn(serviceEventRepository, 'update').mockReturnValue(evt());

    ServiceService.complete(db as never, DEFAULT_TENANT_ID, EVT_ID);

    expect(InventoryService.applyMovement).toHaveBeenCalledTimes(2);
    const firstCall = (InventoryService.applyMovement as ReturnType<typeof vi.fn>).mock
      .calls[0]![2] as { reason: string; referenceType: string; referenceId: string; direction: number };
    expect(firstCall.reason).toBe('service_consumed');
    expect(firstCall.referenceType).toBe('service_event_line');
    expect(firstCall.referenceId).toBe(LINE_OIL);
    expect(firstCall.direction).toBe(-1);

    expect(updateSpy).toHaveBeenCalledOnce();
    expect(updateSpy.mock.calls[0]![3]).toMatchObject({ status: 'completed' });
  });

  it('rolls back the entire completion when applyMovement throws (e.g. insufficient stock)', () => {
    const db = makeFakeDb();
    vi.spyOn(serviceEventRepository, 'findById').mockReturnValue(evt());
    vi.spyOn(serviceEventLineRepository, 'listForEvent').mockReturnValue([
      evtLine(),
      evtLine({ id: LINE_BRAKE, ingredientId: PART_BRAKE_PAD, quantity: 2, unit: 'each' }),
    ]);
    vi.mocked(InventoryService.applyMovement)
      .mockImplementationOnce(() => ({ movement: {} as never, newStockQuantity: 0 }))
      .mockImplementationOnce(() => {
        throw new InvariantViolationError('would drive Brake pads negative');
      });
    const updateSpy = vi.spyOn(serviceEventRepository, 'update');

    expect(() =>
      ServiceService.complete(db as never, DEFAULT_TENANT_ID, EVT_ID),
    ).toThrow(InvariantViolationError);

    // The second applyMovement throws — since the fake db.transaction simply
    // re-throws, the status update was never reached.
    expect(updateSpy).not.toHaveBeenCalled();
  });
});

// --- cancel ---------------------------------------------------------------

describe('ServiceService.cancel — branch by current status', () => {
  it('throws NotFoundError when event does not exist', () => {
    vi.spyOn(serviceEventRepository, 'findById').mockReturnValue(undefined);
    expect(() =>
      ServiceService.cancel(makeFakeDb() as never, DEFAULT_TENANT_ID, {
        id: EVT_ID,
      }),
    ).toThrow(NotFoundError);
  });

  it('is idempotent on an already-cancelled event', () => {
    vi.spyOn(serviceEventRepository, 'findById').mockReturnValue(
      evt({ status: 'cancelled' }),
    );
    vi.spyOn(serviceEventLineRepository, 'listForEvent').mockReturnValue([evtLine()]);

    const updateSpy = vi.spyOn(serviceEventRepository, 'update');
    const result = ServiceService.cancel(makeFakeDb() as never, DEFAULT_TENANT_ID, {
      id: EVT_ID,
    });

    expect(InventoryService.applyMovement).not.toHaveBeenCalled();
    expect(updateSpy).not.toHaveBeenCalled();
    expect(result.status).toBe('cancelled');
  });

  it('cancels an in_progress event with no movements and partsUsed ignored', () => {
    const db = makeFakeDb();
    vi.spyOn(serviceEventRepository, 'findById')
      .mockReturnValueOnce(evt({ status: 'in_progress' }))
      .mockReturnValueOnce(evt({ status: 'cancelled', cancelledAt: 9_999 }));
    vi.spyOn(serviceEventLineRepository, 'listForEvent').mockReturnValue([evtLine()]);
    const updateSpy = vi.spyOn(serviceEventRepository, 'update').mockReturnValue(evt());

    ServiceService.cancel(db as never, DEFAULT_TENANT_ID, {
      id: EVT_ID,
      // partsUsed should be ignored on an in_progress event
      partsUsed: true,
    });

    expect(InventoryService.applyMovement).not.toHaveBeenCalled();
    expect(updateSpy).toHaveBeenCalledOnce();
    // cancelledPartsUsed must be null when the event was never completed.
    expect(updateSpy.mock.calls[0]![3]).toMatchObject({
      status: 'cancelled',
      cancelledPartsUsed: null,
    });
  });

  it('refuses to cancel a completed event without partsUsed', () => {
    vi.spyOn(serviceEventRepository, 'findById').mockReturnValue(
      evt({ status: 'completed' }),
    );
    vi.spyOn(serviceEventLineRepository, 'listForEvent').mockReturnValue([evtLine()]);

    expect(() =>
      ServiceService.cancel(makeFakeDb() as never, DEFAULT_TENANT_ID, {
        id: EVT_ID,
      }),
    ).toThrow(ValidationError);
  });

  it('cancelling a completed event with partsUsed=true writes wastage movements (stock not restored)', () => {
    const db = makeFakeDb();
    vi.spyOn(serviceEventRepository, 'findById')
      .mockReturnValueOnce(evt({ status: 'completed' }))
      .mockReturnValueOnce(evt({ status: 'cancelled', cancelledPartsUsed: true }));
    vi.spyOn(serviceEventLineRepository, 'listForEvent').mockReturnValue([
      evtLine({ id: LINE_OIL, ingredientId: PART_OIL, quantity: 800, unit: 'ml' }),
    ]);
    const updateSpy = vi.spyOn(serviceEventRepository, 'update').mockReturnValue(evt());

    ServiceService.cancel(db as never, DEFAULT_TENANT_ID, {
      id: EVT_ID,
      partsUsed: true,
    });

    expect(InventoryService.applyMovement).toHaveBeenCalledTimes(1);
    const call = vi.mocked(InventoryService.applyMovement).mock.calls[0]![2] as {
      reason: string;
      direction: number;
      referenceType: string;
    };
    expect(call.reason).toBe('wastage');
    expect(call.direction).toBe(-1);
    expect(call.referenceType).toBe('service_event_line');

    expect(updateSpy.mock.calls[0]![3]).toMatchObject({
      status: 'cancelled',
      cancelledPartsUsed: true,
    });
  });

  it('cancelling a completed event with partsUsed=false writes service_reversal movements (stock restored)', () => {
    const db = makeFakeDb();
    vi.spyOn(serviceEventRepository, 'findById')
      .mockReturnValueOnce(evt({ status: 'completed' }))
      .mockReturnValueOnce(evt({ status: 'cancelled', cancelledPartsUsed: false }));
    vi.spyOn(serviceEventLineRepository, 'listForEvent').mockReturnValue([
      evtLine({ id: LINE_OIL, ingredientId: PART_OIL, quantity: 800, unit: 'ml' }),
      evtLine({
        id: LINE_BRAKE,
        ingredientId: PART_BRAKE_PAD,
        quantity: 2,
        unit: 'each',
      }),
    ]);
    const updateSpy = vi.spyOn(serviceEventRepository, 'update').mockReturnValue(evt());

    ServiceService.cancel(db as never, DEFAULT_TENANT_ID, {
      id: EVT_ID,
      partsUsed: false,
    });

    expect(InventoryService.applyMovement).toHaveBeenCalledTimes(2);
    for (const call of vi.mocked(InventoryService.applyMovement).mock.calls) {
      expect((call[2] as { reason: string }).reason).toBe('service_reversal');
      expect((call[2] as { direction: number }).direction).toBe(1);
    }

    expect(updateSpy.mock.calls[0]![3]).toMatchObject({
      status: 'cancelled',
      cancelledPartsUsed: false,
    });
  });
});

// --- Path A snapshot ------------------------------------------------------

describe('ServiceService Path A — captured version survives template edits', () => {
  it('complete walks the lines that were copied at create time, not the current active version', () => {
    const db = makeFakeDb();

    // Simulate a template whose active version has rotated since the event
    // was started: the event captured RECIPE_V1, but recipeRepository now
    // reports RECIPE_V2 as active. complete() must not consult the recipe
    // repo — it walks `service_event_lines` directly.
    const recipeSpy = vi.spyOn(recipeRepository, 'findActiveVersion').mockReturnValue(
      recipeVersion({ id: RECIPE_V2, versionNumber: 2 }),
    );
    vi.spyOn(serviceEventRepository, 'findById')
      .mockReturnValueOnce(evt({ serviceTemplateVersionId: RECIPE_V1 }))
      .mockReturnValueOnce(
        evt({ status: 'completed', serviceTemplateVersionId: RECIPE_V1 }),
      );
    vi.spyOn(serviceEventLineRepository, 'listForEvent').mockReturnValue([
      evtLine({ quantity: 800, unit: 'ml' }),
    ]);
    vi.spyOn(serviceEventRepository, 'update').mockReturnValue(evt());

    ServiceService.complete(db as never, DEFAULT_TENANT_ID, EVT_ID);

    // Even though the recipe repo would report a new active version,
    // complete() never asked.
    expect(recipeSpy).not.toHaveBeenCalled();
    expect(InventoryService.applyMovement).toHaveBeenCalledTimes(1);
    const call = vi.mocked(InventoryService.applyMovement).mock.calls[0]![2] as {
      quantity: number;
      unit: string;
    };
    expect(call.quantity).toBe(800);
    expect(call.unit).toBe('ml');
  });
});

// --- setStatus (workflow) -------------------------------------------------

describe('ServiceService.setStatus — requested → under service → completed', () => {
  it('requested → in_progress updates status with no movements and completedAt null', () => {
    const db = makeFakeDb();
    vi.spyOn(serviceEventRepository, 'findById')
      .mockReturnValueOnce(evt({ status: 'requested' }))
      .mockReturnValueOnce(evt({ status: 'in_progress' }));
    vi.spyOn(serviceEventLineRepository, 'listForEvent').mockReturnValue([evtLine()]);
    const updateSpy = vi.spyOn(serviceEventRepository, 'update').mockReturnValue(evt());

    ServiceService.setStatus(db as never, DEFAULT_TENANT_ID, {
      id: EVT_ID,
      status: 'in_progress',
    });

    expect(InventoryService.applyMovement).not.toHaveBeenCalled();
    expect(updateSpy.mock.calls[0]![3]).toMatchObject({
      status: 'in_progress',
      completedAt: null,
    });
  });

  it('in_progress → completed deducts one movement per line and stamps completedAt', () => {
    const db = makeFakeDb();
    vi.spyOn(serviceEventRepository, 'findById')
      .mockReturnValueOnce(evt({ status: 'in_progress' }))
      .mockReturnValueOnce(evt({ status: 'completed' }));
    vi.spyOn(serviceEventLineRepository, 'listForEvent').mockReturnValue([
      evtLine({ id: LINE_OIL, ingredientId: PART_OIL, quantity: 800, unit: 'ml' }),
      evtLine({ id: LINE_BRAKE, ingredientId: PART_BRAKE_PAD, quantity: 2, unit: 'each' }),
    ]);
    const updateSpy = vi.spyOn(serviceEventRepository, 'update').mockReturnValue(evt());

    ServiceService.setStatus(db as never, DEFAULT_TENANT_ID, {
      id: EVT_ID,
      status: 'completed',
    });

    expect(InventoryService.applyMovement).toHaveBeenCalledTimes(2);
    expect(updateSpy.mock.calls[0]![3]).toMatchObject({ status: 'completed' });
  });

  it('wash → completed flips status with no movements (no parts required)', () => {
    const db = makeFakeDb();
    vi.spyOn(serviceEventRepository, 'findById')
      .mockReturnValueOnce(evt({ status: 'requested', kind: 'wash' }))
      .mockReturnValueOnce(evt({ status: 'completed', kind: 'wash' }));
    vi.spyOn(serviceEventLineRepository, 'listForEvent').mockReturnValue([]);
    const updateSpy = vi.spyOn(serviceEventRepository, 'update').mockReturnValue(evt());

    ServiceService.setStatus(db as never, DEFAULT_TENANT_ID, {
      id: EVT_ID,
      status: 'completed',
    });

    expect(InventoryService.applyMovement).not.toHaveBeenCalled();
    expect(updateSpy.mock.calls[0]![3]).toMatchObject({ status: 'completed' });
  });

  it('refuses to complete a service/repair that has no parts', () => {
    vi.spyOn(serviceEventRepository, 'findById').mockReturnValue(
      evt({ status: 'in_progress', kind: 'repair' }),
    );
    vi.spyOn(serviceEventLineRepository, 'listForEvent').mockReturnValue([]);

    expect(() =>
      ServiceService.setStatus(makeFakeDb() as never, DEFAULT_TENANT_ID, {
        id: EVT_ID,
        status: 'completed',
      }),
    ).toThrow(ValidationError);
  });

  it('refuses to move a completed event back to requested', () => {
    vi.spyOn(serviceEventRepository, 'findById').mockReturnValue(
      evt({ status: 'completed' }),
    );

    expect(() =>
      ServiceService.setStatus(makeFakeDb() as never, DEFAULT_TENANT_ID, {
        id: EVT_ID,
        status: 'requested',
      }),
    ).toThrow(ConflictError);
  });

  it('refuses to change the status of a cancelled event', () => {
    vi.spyOn(serviceEventRepository, 'findById').mockReturnValue(
      evt({ status: 'cancelled' }),
    );

    expect(() =>
      ServiceService.setStatus(makeFakeDb() as never, DEFAULT_TENANT_ID, {
        id: EVT_ID,
        status: 'in_progress',
      }),
    ).toThrow(ConflictError);
  });

  it('is idempotent when the target status equals the current status', () => {
    vi.spyOn(serviceEventRepository, 'findById').mockReturnValue(
      evt({ status: 'requested' }),
    );
    vi.spyOn(serviceEventLineRepository, 'listForEvent').mockReturnValue([evtLine()]);
    const updateSpy = vi.spyOn(serviceEventRepository, 'update');

    ServiceService.setStatus(makeFakeDb() as never, DEFAULT_TENANT_ID, {
      id: EVT_ID,
      status: 'requested',
    });

    expect(updateSpy).not.toHaveBeenCalled();
    expect(InventoryService.applyMovement).not.toHaveBeenCalled();
  });
});

// --- listWithLines (cost) -------------------------------------------------

describe('ServiceService.listWithLines — per-event parts cost from snapshots', () => {
  function mvt(overrides: Partial<StockMovementRow>): StockMovementRow {
    return {
      id: 'm',
      tenantId: DEFAULT_TENANT_ID,
      ingredientId: PART_OIL,
      changeQuantity: -800,
      costPerUnitAtTime: 0.42,
      reason: 'service_consumed',
      referenceType: 'service_event_line',
      referenceId: LINE_OIL,
      notes: null,
      occurredAt: 0,
      createdAt: 0,
      createdBy: SYSTEM_USER_ID,
      ...overrides,
    };
  }

  it('sums snapshot cost per line + event, and a reversal zeroes its line', () => {
    const db = makeFakeDb();
    vi.spyOn(serviceEventRepository, 'list').mockReturnValue([
      evt({ id: EVT_ID, kind: 'repair', status: 'completed' }),
    ]);
    vi.spyOn(serviceEventLineRepository, 'listForEvents').mockReturnValue([
      evtLine({ id: LINE_OIL, serviceEventId: EVT_ID, ingredientId: PART_OIL, quantity: 800, unit: 'ml', displayOrder: 0 }),
      evtLine({ id: LINE_BRAKE, serviceEventId: EVT_ID, ingredientId: PART_BRAKE_PAD, quantity: 2, unit: 'each', displayOrder: 1 }),
    ]);
    vi.spyOn(stockMovementRepository, 'listByReferenceIds').mockReturnValue([
      mvt({ id: 'm1', referenceId: LINE_OIL, changeQuantity: -800, costPerUnitAtTime: 0.42 }), // 336
      mvt({ id: 'm2', referenceId: LINE_BRAKE, changeQuantity: -2, costPerUnitAtTime: 350 }), // 700
      // reversal on the brake line offsets it fully → that line costs 0.
      mvt({ id: 'm3', referenceId: LINE_BRAKE, changeQuantity: 2, costPerUnitAtTime: 350, reason: 'service_reversal' }),
    ]);

    const result = ServiceService.listWithLines(db as never, DEFAULT_TENANT_ID, {
      kind: 'repair',
      limit: 200,
    });
    const event = result[0]!;
    const costByLine = Object.fromEntries(event.lines.map((l) => [l.id, l.cost]));
    expect(costByLine[LINE_OIL]).toBeCloseTo(336, 2);
    expect(costByLine[LINE_BRAKE]).toBe(0);
    expect(event.partsCost).toBeCloseTo(336, 2);
  });

  it('reports zero cost for a wash event (no lines, no movements)', () => {
    const db = makeFakeDb();
    vi.spyOn(serviceEventRepository, 'list').mockReturnValue([
      evt({ id: EVT_ID, kind: 'wash', status: 'completed' }),
    ]);
    vi.spyOn(serviceEventLineRepository, 'listForEvents').mockReturnValue([]);
    const refSpy = vi
      .spyOn(stockMovementRepository, 'listByReferenceIds')
      .mockReturnValue([]);

    const result = ServiceService.listWithLines(db as never, DEFAULT_TENANT_ID, {
      kind: 'wash',
      limit: 200,
    });
    expect(result[0]!.partsCost).toBe(0);
    expect(result[0]!.lines).toHaveLength(0);
    // Still safe to call with an empty id list.
    expect(refSpy).toHaveBeenCalledWith(expect.anything(), DEFAULT_TENANT_ID, 'service_event_line', []);
  });
});

// --- list / get -----------------------------------------------------------

describe('ServiceService.list + get — pass-throughs', () => {
  it('list delegates to the repository with the filter', () => {
    const listSpy = vi.spyOn(serviceEventRepository, 'list').mockReturnValue([evt()]);
    const result = ServiceService.list(makeFakeDb() as never, DEFAULT_TENANT_ID, {
      bikeId: BIKE_ID,
      limit: 50,
    });

    expect(listSpy).toHaveBeenCalledWith(expect.anything(), DEFAULT_TENANT_ID, {
      bikeId: BIKE_ID,
      limit: 50,
    });
    expect(result).toHaveLength(1);
  });

  it('get throws NotFoundError when missing', () => {
    vi.spyOn(serviceEventRepository, 'findById').mockReturnValue(undefined);
    expect(() =>
      ServiceService.get(makeFakeDb() as never, DEFAULT_TENANT_ID, EVT_ID),
    ).toThrow(NotFoundError);
  });

  it('get returns event with lines', () => {
    vi.spyOn(serviceEventRepository, 'findById').mockReturnValue(evt());
    vi.spyOn(serviceEventLineRepository, 'listForEvent').mockReturnValue([
      evtLine(),
      evtLine({ id: LINE_BRAKE, ingredientId: PART_BRAKE_PAD, quantity: 2, unit: 'each' }),
    ]);

    const result = ServiceService.get(makeFakeDb() as never, DEFAULT_TENANT_ID, EVT_ID);
    expect(result.id).toBe(EVT_ID);
    expect(result.lines).toHaveLength(2);
  });
});

// Touch the unused symbol so tsc's noUnusedLocals stays quiet — the imports
// are part of the test fixture surface and we want them visible to readers.
void TPL_OTHER;
