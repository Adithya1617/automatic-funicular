import { describe, expect, it } from 'vitest';
import { parseResultSchema } from '../../shared/schemas/invoiceParser';

describe('parseResultSchema', () => {
  it('accepts a successful parse', () => {
    const input = {
      ok: true,
      templateId: 'hyperpure',
      header: {
        supplierId: 'sup-1',
        invoiceNumber: 'ZHPTG27',
        invoiceDate: 1714291200000,
      },
      lines: [
        { rawDescription: 'Paneer, 1 Kg', ingredientId: 'ing-1', quantity: 1000, unit: 'g', unitCost: 0.291, categoryHint: 'Dairy' },
      ],
      issues: [{ kind: 'skipped_charge', label: 'Delivery Charge', total: 234.82 }],
    };
    expect(parseResultSchema.parse(input)).toEqual(input);
  });

  it('rejects a line missing categoryHint', () => {
    const input = {
      ok: true,
      templateId: 'hyperpure',
      header: { supplierId: null, invoiceNumber: 'X', invoiceDate: 0 },
      lines: [
        { rawDescription: 'X', ingredientId: null, quantity: 1, unit: 'g', unitCost: 1 },
      ],
      issues: [],
    };
    expect(() => parseResultSchema.parse(input)).toThrow();
  });

  it('accepts a duplicate failure with existingInvoiceId', () => {
    const input = { ok: false, reason: 'duplicate', existingInvoiceId: 'inv-2' };
    expect(parseResultSchema.parse(input)).toEqual(input);
  });

  it('rejects an unknown reason', () => {
    expect(() => parseResultSchema.parse({ ok: false, reason: 'nope' })).toThrow();
  });
});
