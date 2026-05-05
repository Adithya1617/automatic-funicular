import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { extractPdfText } from '../../shared/utils/pdfText';
import { detectTemplate } from '../../shared/invoiceTemplates';

const SAMPLE = join(__dirname, '..', '__fixtures__', 'invoices', 'hyperpure-sample.pdf');

describe('detectTemplate', () => {
  it('returns the hyperpure template for the sample PDF', async () => {
    const text = await extractPdfText(new Uint8Array(readFileSync(SAMPLE)));
    const tpl = detectTemplate(text);
    expect(tpl?.id).toBe('hyperpure');
  });

  it('returns null for an empty PDF text', () => {
    expect(detectTemplate({ pages: [] })).toBeNull();
  });

  it('returns null for non-Hyperpure text', () => {
    const fake = {
      pages: [{ items: [{ str: 'Some Random Invoice', x: 0, y: 0, width: 0 }] }],
    };
    expect(detectTemplate(fake)).toBeNull();
  });
});
