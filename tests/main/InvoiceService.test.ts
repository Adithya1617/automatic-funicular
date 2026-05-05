import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InvoiceService } from '../../main/services/InvoiceService';
import { InventoryService } from '../../main/services/InventoryService';
import { AvailabilityService } from '../../main/services/AvailabilityService';
import { SupplierItemMappingService } from '../../main/services/SupplierItemMappingService';
import { ingredientRepository } from '../../main/repositories/ingredientRepository';
import { invoiceLineRepository } from '../../main/repositories/invoiceLineRepository';
import { invoiceRepository } from '../../main/repositories/invoiceRepository';
import { DEFAULT_TENANT_ID, SYSTEM_USER_ID } from '@shared/constants/system';
import {
  ConflictError,
  ValidationError,
} from '@shared/errors/DomainError';
import type {
  IngredientRow,
  InvoiceLineRow,
  InvoiceRow,
} from '../../main/db/schema';

const INVOICE_ID = '01900000-0000-7000-8000-0000000b0001';
const SUPPLIER_ID = '01900000-0000-7000-8000-0000000b0002';
const ING_RICE = '01900000-0000-7000-8000-0000000b0003';
const ING_PANEER = '01900000-0000-7000-8000-0000000b0004';
const LINE_RICE = '01900000-0000-7000-8000-0000000b0005';
const LINE_PANEER = '01900000-0000-7000-8000-0000000b0006';

function ing(overrides: Partial<IngredientRow>): IngredientRow {
  return {
    id: 'x',
    tenantId: DEFAULT_TENANT_ID,
    name: 'Ingredient',
    category: 'Test',
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

function invoice(overrides: Partial<InvoiceRow>): InvoiceRow {
  return {
    id: INVOICE_ID,
    tenantId: DEFAULT_TENANT_ID,
    supplierId: SUPPLIER_ID,
    invoiceNumber: 'INV-1',
    invoiceDate: 1_000,
    totalAmount: 0,
    filePath: null,
    status: 'draft',
    notes: null,
    committedAt: null,
    createdAt: 0,
    updatedAt: 0,
    createdBy: SYSTEM_USER_ID,
    updatedBy: SYSTEM_USER_ID,
    ...overrides,
  };
}

function line(overrides: Partial<InvoiceLineRow>): InvoiceLineRow {
  return {
    id: LINE_RICE,
    invoiceId: INVOICE_ID,
    rawDescription: 'Rice 25 kg',
    ingredientId: ING_RICE,
    quantity: 25,
    unit: 'kg',
    unitCost: 60,
    totalCost: 1500,
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
  vi.spyOn(AvailabilityService, 'recomputeForIngredients').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('InvoiceService.commit', () => {
  it('writes one purchase movement per line and upserts a mapping per line', () => {
    const db = makeFakeDb();
    vi.spyOn(invoiceRepository, 'findById').mockReturnValue(invoice({}));
    vi.spyOn(invoiceLineRepository, 'listForInvoice').mockReturnValue([
      line({ id: LINE_RICE, ingredientId: ING_RICE }),
      line({
        id: LINE_PANEER,
        rawDescription: 'Paneer 5 kg',
        ingredientId: ING_PANEER,
        quantity: 5,
        unit: 'kg',
        unitCost: 280,
        totalCost: 1400,
      }),
    ]);
    vi.spyOn(ingredientRepository, 'findById').mockImplementation((_db, _tid, id) => {
      if (id === ING_RICE) return ing({ id: ING_RICE, baseUnit: 'g' });
      if (id === ING_PANEER) return ing({ id: ING_PANEER, baseUnit: 'g' });
      return undefined;
    });
    const apply = vi.spyOn(InventoryService, 'applyMovement').mockReturnValue({
      movement: {} as never,
      newStockQuantity: 0,
    });
    const upsert = vi.spyOn(SupplierItemMappingService, 'upsert').mockImplementation(
      (_db, _tid, input) => ({ ...input } as never),
    );
    vi.spyOn(invoiceRepository, 'update').mockReturnValue(
      invoice({ status: 'committed' }),
    );

    InvoiceService.commit(db as never, DEFAULT_TENANT_ID, { id: INVOICE_ID });

    expect(apply).toHaveBeenCalledTimes(2);
    for (const call of apply.mock.calls) {
      expect(call[2].reason).toBe('purchase');
      expect(call[2].direction).toBe(1);
      expect(call[2].referenceType).toBe('invoice_line');
      expect(call[4]?.skipAvailabilityRecompute).toBe(true);
    }
    expect(upsert).toHaveBeenCalledTimes(2);
    expect(upsert.mock.calls[0]![2].rawDescription).toBe('Rice 25 kg');
    expect(upsert.mock.calls[0]![2].lastUnitCost).toBe(60);
    expect(AvailabilityService.recomputeForIngredients).toHaveBeenCalledTimes(1);
  });

  it('refuses commit when any line is unmapped', () => {
    const db = makeFakeDb();
    vi.spyOn(invoiceRepository, 'findById').mockReturnValue(invoice({}));
    vi.spyOn(invoiceLineRepository, 'listForInvoice').mockReturnValue([
      line({ ingredientId: null }),
    ]);

    expect(() =>
      InvoiceService.commit(db as never, DEFAULT_TENANT_ID, { id: INVOICE_ID }),
    ).toThrow(ValidationError);
  });

  it('refuses commit when an ingredient unit is incompatible', () => {
    const db = makeFakeDb();
    vi.spyOn(invoiceRepository, 'findById').mockReturnValue(invoice({}));
    vi.spyOn(invoiceLineRepository, 'listForInvoice').mockReturnValue([
      // Rice base unit is 'g' but the line is in 'ml' — incompatible without density.
      line({ unit: 'ml' }),
    ]);
    vi.spyOn(ingredientRepository, 'findById').mockReturnValue(
      ing({ id: ING_RICE, baseUnit: 'g', densityGPerMl: null }),
    );

    expect(() =>
      InvoiceService.commit(db as never, DEFAULT_TENANT_ID, { id: INVOICE_ID }),
    ).toThrow(ValidationError);
  });

  it('refuses to re-commit a committed invoice (idempotent)', () => {
    const db = makeFakeDb();
    vi.spyOn(invoiceRepository, 'findById').mockReturnValue(
      invoice({ status: 'committed' }),
    );
    vi.spyOn(invoiceLineRepository, 'listForInvoice').mockReturnValue([line({})]);
    const apply = vi.spyOn(InventoryService, 'applyMovement');

    // get() resolves
    InvoiceService.commit(db as never, DEFAULT_TENANT_ID, { id: INVOICE_ID });
    expect(apply).not.toHaveBeenCalled();
  });

  it('refuses to commit an invoice with no lines', () => {
    const db = makeFakeDb();
    vi.spyOn(invoiceRepository, 'findById').mockReturnValue(invoice({}));
    vi.spyOn(invoiceLineRepository, 'listForInvoice').mockReturnValue([]);

    expect(() =>
      InvoiceService.commit(db as never, DEFAULT_TENANT_ID, { id: INVOICE_ID }),
    ).toThrow(ValidationError);
  });
});

describe('InvoiceService.update / replaceLines', () => {
  it('refuses to edit a committed invoice', () => {
    const db = makeFakeDb();
    vi.spyOn(invoiceRepository, 'findById').mockReturnValue(
      invoice({ status: 'committed' }),
    );

    expect(() =>
      InvoiceService.update(db as never, DEFAULT_TENANT_ID, {
        id: INVOICE_ID,
        invoiceNumber: 'changed',
      }),
    ).toThrow(ConflictError);

    expect(() =>
      InvoiceService.replaceLines(db as never, DEFAULT_TENANT_ID, {
        id: INVOICE_ID,
        lines: [],
      }),
    ).toThrow(ConflictError);
  });
});
