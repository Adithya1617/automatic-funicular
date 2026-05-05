import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { InvoiceParserService } from '../../main/services/InvoiceParserService';
import { supplierRepository } from '../../main/repositories/supplierRepository';
import { supplierItemMappingRepository } from '../../main/repositories/supplierItemMappingRepository';
import { invoiceRepository } from '../../main/repositories/invoiceRepository';
import { DEFAULT_TENANT_ID } from '@shared/constants/system';

const SAMPLE = join(__dirname, '..', '__fixtures__', 'invoices', 'hyperpure-sample.pdf');
const fakeDb = {} as never;

afterEach(() => vi.restoreAllMocks());

describe('InvoiceParserService.parse', () => {
  it('returns ok with header + 17 lines when supplier exists and no duplicate', async () => {
    vi.spyOn(supplierRepository, 'findByGstin').mockReturnValue({
      id: 'sup-hyperpure',
      tenantId: DEFAULT_TENANT_ID,
      name: 'Zomato Hyperpure',
      gstin: '36AAACZ8867B1Z1',
      isActive: true,
    } as never);
    vi.spyOn(invoiceRepository, 'findByNumber').mockReturnValue(undefined as never);
    vi.spyOn(supplierItemMappingRepository, 'findByDescription').mockReturnValue(undefined as never);

    const buf = new Uint8Array(readFileSync(SAMPLE));
    const out = await InvoiceParserService.parse(fakeDb, DEFAULT_TENANT_ID, { bytes: buf });

    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.templateId).toBe('hyperpure');
    expect(out.header.supplierId).toBe('sup-hyperpure');
    expect(out.header.invoiceNumber).toBe('ZHPTG27-OR-0025869827');
    expect(out.lines).toHaveLength(17);
  });

  it('returns unknown_supplier_format for a non-Hyperpure buffer', async () => {
    const out = await InvoiceParserService.parse(fakeDb, DEFAULT_TENANT_ID, {
      bytes: new Uint8Array([1, 2, 3, 4]),
    });
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.reason).toBe('unknown_supplier_format');
  });

  it('returns duplicate when an invoice with the same (supplier, number) exists', async () => {
    vi.spyOn(supplierRepository, 'findByGstin').mockReturnValue({
      id: 'sup-hyperpure',
      tenantId: DEFAULT_TENANT_ID,
      name: 'Zomato Hyperpure',
      gstin: '36AAACZ8867B1Z1',
      isActive: true,
    } as never);
    vi.spyOn(invoiceRepository, 'findByNumber').mockReturnValue({
      id: 'inv-existing',
    } as never);

    const buf = new Uint8Array(readFileSync(SAMPLE));
    const out = await InvoiceParserService.parse(fakeDb, DEFAULT_TENANT_ID, { bytes: buf });

    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.reason).toBe('duplicate');
    expect(out.existingInvoiceId).toBe('inv-existing');
  });

  it('attaches ingredient_id from supplier_item_mappings when a mapping exists', async () => {
    vi.spyOn(supplierRepository, 'findByGstin').mockReturnValue({
      id: 'sup-hyperpure',
      tenantId: DEFAULT_TENANT_ID,
      gstin: '36AAACZ8867B1Z1',
      isActive: true,
    } as never);
    vi.spyOn(invoiceRepository, 'findByNumber').mockReturnValue(undefined as never);
    vi.spyOn(supplierItemMappingRepository, 'findByDescription').mockImplementation(
      ((_db: unknown, _t: number, _sid: string, desc: string) =>
        desc.includes('Lite Paneer') ? { ingredientId: 'ing-paneer' } : undefined) as never,
    );

    const buf = new Uint8Array(readFileSync(SAMPLE));
    const out = await InvoiceParserService.parse(fakeDb, DEFAULT_TENANT_ID, { bytes: buf });

    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const paneer = out.lines.find((l) => l.rawDescription.includes('Lite Paneer'));
    expect(paneer?.ingredientId).toBe('ing-paneer');
    const other = out.lines.find((l) => !l.rawDescription.includes('Lite Paneer'));
    expect(other?.ingredientId).toBeNull();
  });
});
