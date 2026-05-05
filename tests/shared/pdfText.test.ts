import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { extractPdfText } from '../../shared/utils/pdfText';

const SAMPLE = join(__dirname, '..', '__fixtures__', 'invoices', 'hyperpure-sample.pdf');

describe('extractPdfText', () => {
  it('returns one entry per page with text items that include str + x + y', async () => {
    const buf = readFileSync(SAMPLE);
    const out = await extractPdfText(new Uint8Array(buf));

    expect(out.pages.length).toBeGreaterThanOrEqual(1);
    const page1 = out.pages[0]!;
    expect(page1.items.length).toBeGreaterThan(20);
    for (const item of page1.items) {
      expect(typeof item.str).toBe('string');
      expect(typeof item.x).toBe('number');
      expect(typeof item.y).toBe('number');
    }
  });

  it('extracts the Hyperpure marker text from page 1', async () => {
    const buf = readFileSync(SAMPLE);
    const out = await extractPdfText(new Uint8Array(buf));
    const joined = out.pages[0]!.items.map((i) => i.str).join(' ').toLowerCase();
    expect(joined).toContain('hyperpure');
    expect(joined).toContain('zhptg27-or-0025869827');
  });

  it('returns an empty pages array on a non-PDF buffer', async () => {
    const out = await extractPdfText(new Uint8Array([1, 2, 3, 4]));
    expect(out.pages).toEqual([]);
  });
});
