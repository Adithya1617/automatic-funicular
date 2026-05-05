import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { extractPdfText } from '../../shared/utils/pdfText';
import { HyperpureTemplate } from '../../shared/invoiceTemplates/hyperpure';

const SAMPLE = join(__dirname, '..', '__fixtures__', 'invoices', 'hyperpure-sample.pdf');

describe('Hyperpure header parsing', () => {
  it('extracts invoice number, date, and supplier GSTIN', async () => {
    const text = await extractPdfText(new Uint8Array(readFileSync(SAMPLE)));
    const result = HyperpureTemplate.parse(text);
    expect(result.header.invoiceNumber).toBe('ZHPTG27-OR-0025869827');
    expect(result.header.supplierGstin).toBe('36AAACZ8867B1Z1');
    // 28 Apr 2026 at noon local time
    const d = new Date(result.header.invoiceDate);
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(3); // April = 3
    expect(d.getDate()).toBe(28);
  });
});
