import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { extractPdfText } from '../../shared/utils/pdfText';
import { HyperpureTemplate } from '../../shared/invoiceTemplates/hyperpure';

const SAMPLE = join(__dirname, '..', '__fixtures__', 'invoices', 'hyperpure-sample.pdf');

// Oracle table: every ingredient row in the sample, computed from D4 (Total / quantity)
// and D5 (always explode pack size). Charges (delivery, COD, TCS) are not lines.
const EXPECTED = [
  // [rawDescription substring, expected quantity in base unit, unit, unitCost rounded to 4 dp]
  ['Mushroom Slices, 800 gm', 800, 'g', +(73 / 800).toFixed(4)],
  ['Lite Paneer, 1 Kg', 1000, 'g', +(291 / 1000).toFixed(4)],
  ['Professional Fat Spread, 500 gm', 1000, 'g', +(184.8 / 1000).toFixed(4)],
  ['Versatie Gold Cream, 1 L', 3000, 'ml', +(548.1 / 3000).toFixed(4)],
  ['Banana Leaf, 5 Pcs', 5, 'each', +(41 / 5).toFixed(4)],
  ['Beans Haricot, 500 gm', 3000, 'g', +(360 / 3000).toFixed(4)],
  ['Broccoli (Mix Size), 500 gm', 500, 'g', +(80 / 500).toFixed(4)],
  ['Cabbage without Leaves, 1 Kg', 1000, 'g', +(14 / 1000).toFixed(4)],
  ['Carrots (Big), 1 Kg', 4000, 'g', +(208 / 4000).toFixed(4)],
  ['Coriander Leaves (Kothmir), 500 gm', 500, 'g', +(55 / 500).toFixed(4)],
  ['Frozen Sweet Corn, 1 Kg', 1000, 'g', +(78 / 1000).toFixed(4)],
  ['Garlic Peeled (Market Grade), 500 gm', 500, 'g', +(88 / 500).toFixed(4)],
  ['Green Capsicum (Big Size), 1 Kg', 1000, 'g', +(63 / 1000).toFixed(4)],
  ['Red Capsicum (Mix Size), 500 gm', 500, 'g', +(135 / 500).toFixed(4)],
  ['Yellow Capsicum (Mix Size), 500 gm', 500, 'g', +(136 / 500).toFixed(4)],
  ['Black Pepper Whole, 100 gm', 100, 'g', +(100.8 / 100).toFixed(4)],
  ['Aromatic Mix, 500 gm', 500, 'g', +(152.25 / 500).toFixed(4)],
] as const;

describe('Hyperpure line parsing', () => {
  it('extracts the expected 17 ingredient rows from the sample', async () => {
    const text = await extractPdfText(new Uint8Array(readFileSync(SAMPLE)));
    const result = HyperpureTemplate.parse(text);

    expect(result.lines).toHaveLength(EXPECTED.length);

    for (const [descSubstring, qty, unit, unitCost] of EXPECTED) {
      const line = result.lines.find((l) => l.rawDescription.includes(descSubstring));
      expect(
        line,
        `expected to find a parsed line for "${descSubstring}"`,
      ).toBeDefined();
      expect(line!.quantity).toBeCloseTo(qty, 4);
      expect(line!.unit).toBe(unit);
      expect(+line!.unitCost.toFixed(4)).toBeCloseTo(unitCost, 4);
    }
  });
});
