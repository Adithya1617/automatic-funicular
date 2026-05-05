import { describe, expect, it } from 'vitest';
import { extractPackSize } from '../../shared/invoiceTemplates/packSize';

describe('extractPackSize', () => {
  const cases: Array<[string, { size: number; unit: 'g' | 'ml' | 'each' } | null]> = [
    // grams
    ['Golden Crown - Mushroom Slices, 800 gm', { size: 800, unit: 'g' }],
    ['Beans Haricot, 500 gm', { size: 500, unit: 'g' }],
    ['Coriander Leaves (Kothmir), 500 gm', { size: 500, unit: 'g' }],
    ['Eastmade - Black Pepper Whole, 100 gm (Trial 1 Unit @Rs96.00/unit pre tax)', { size: 100, unit: 'g' }],
    // kg → grams
    ['Gopika - Lite Paneer, 1 Kg', { size: 1000, unit: 'g' }],
    ['Cabbage without Leaves, 1 Kg', { size: 1000, unit: 'g' }],
    ['Carrots (Big), 1 Kg', { size: 1000, unit: 'g' }],
    ['Frozen Sweet Corn, 1 Kg', { size: 1000, unit: 'g' }],
    ['Green Capsicum (Big Size), 1 Kg', { size: 1000, unit: 'g' }],
    // L → ml
    ['Rich\'s - Versatie Gold Cream, 1 L', { size: 1000, unit: 'ml' }],
    // ml as-is
    ['Some Sauce, 250 ml', { size: 250, unit: 'ml' }],
    // pcs / pack → each
    ['Banana Leaf, 5 Pcs', { size: 5, unit: 'each' }],
    ['Some Item, 12 Pack', { size: 12, unit: 'each' }],
    // decimal pack size
    ['Heavy Cream, 1.5 L', { size: 1500, unit: 'ml' }],
    // case-insensitive
    ['paneer, 1 KG', { size: 1000, unit: 'g' }],
    // no comma → no match
    ['Just A Plain Name', null],
    // comma without trailing pack info → no match
    ['Brand, Premium Quality', null],
    // trailing parens after pack info still match the pack
    ['Springburst - Aromatic Mix, 500 gm (variant)', { size: 500, unit: 'g' }],
    // takes the FIRST match if multiple
    ['Sauce, 500 ml jar of, 1 L stock', { size: 500, unit: 'ml' }],
  ];

  it.each(cases)('extracts pack size from %j', (input, expected) => {
    expect(extractPackSize(input)).toEqual(expected);
  });
});
