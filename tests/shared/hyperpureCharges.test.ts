import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { extractPdfText } from '../../shared/utils/pdfText';
import { HyperpureTemplate } from '../../shared/invoiceTemplates/hyperpure';

const SAMPLE = join(__dirname, '..', '__fixtures__', 'invoices', 'hyperpure-sample.pdf');

describe('Hyperpure skipped charges', () => {
  it('emits skipped_charge issues for Delivery and Pay On Delivery', async () => {
    const text = await extractPdfText(new Uint8Array(readFileSync(SAMPLE)));
    const result = HyperpureTemplate.parse(text);

    const charges = result.issues.filter((i) => i.kind === 'skipped_charge');
    const labels = charges.map((c) => (c as { label: string }).label.toLowerCase());

    expect(labels.some((l) => l.includes('delivery charge'))).toBe(true);
    expect(labels.some((l) => l.includes('pay on delivery'))).toBe(true);
  });
});
