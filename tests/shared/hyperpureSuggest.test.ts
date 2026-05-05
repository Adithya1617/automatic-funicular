import { describe, expect, it } from 'vitest';
import { HyperpureTemplate } from '../../shared/invoiceTemplates/hyperpure';
import type { ParsedLine } from '../../shared/invoiceTemplates/types';

function line(
  rawDescription: string,
  unit: '' | 'g' | 'ml' | 'each',
  categoryHint = '',
): ParsedLine {
  return { rawDescription, quantity: 0, unit, unitCost: 0, categoryHint };
}

describe('HyperpureTemplate.suggestIngredient', () => {
  const cases: Array<[string, '' | 'g' | 'ml' | 'each', string, { name: string; baseUnit: 'g' | 'ml' | 'each'; category: string }]> = [
    // brand prefix stripped, pack tail stripped
    ['Gopika - Lite Paneer, 1 Kg', 'g', 'Dairy', { name: 'Lite Paneer', baseUnit: 'g', category: 'Dairy' }],
    ['Golden Crown - Mushroom Slices, 800 gm', 'g', 'Canned & Imported Items', { name: 'Mushroom Slices', baseUnit: 'g', category: 'Canned & Imported Items' }],
    ['Eastmade - Black Pepper Whole, 100 gm', 'g', 'Masala, Salt & Sugar', { name: 'Black Pepper Whole', baseUnit: 'g', category: 'Masala, Salt & Sugar' }],
    ["Rich's - Versatie Gold Cream, 1 L", 'ml', 'Dairy', { name: 'Versatie Gold Cream', baseUnit: 'ml', category: 'Dairy' }],
    // no brand prefix, trailing parens dropped (descriptive qualifier)
    ['Coriander Leaves (Kothmir), 500 gm', 'g', 'Fruits & Vegetables', { name: 'Coriander Leaves', baseUnit: 'g', category: 'Fruits & Vegetables' }],
    ['Carrots (Big), 1 Kg', 'g', 'Fruits & Vegetables', { name: 'Carrots', baseUnit: 'g', category: 'Fruits & Vegetables' }],
    ['Green Capsicum (Big Size), 1 Kg', 'g', 'Fruits & Vegetables', { name: 'Green Capsicum', baseUnit: 'g', category: 'Fruits & Vegetables' }],
    // each / pcs path
    ['Banana Leaf, 5 Pcs', 'each', 'Fruits & Vegetables', { name: 'Banana Leaf', baseUnit: 'each', category: 'Fruits & Vegetables' }],
    // brand with trailing parens
    ['Nutralite - Professional Fat Spread, 500 gm', 'g', 'Dairy', { name: 'Professional Fat Spread', baseUnit: 'g', category: 'Dairy' }],
    // empty category propagates
    ['Beans Haricot, 500 gm', 'g', '', { name: 'Beans Haricot', baseUnit: 'g', category: '' }],
    // no comma → uses entire description
    ['Some Plain Item', 'g', 'Misc', { name: 'Some Plain Item', baseUnit: 'g', category: 'Misc' }],
    // double-space / weird whitespace collapses
    ['  Foo  -  Bar  Item ,  100 gm', 'g', '', { name: 'Bar Item', baseUnit: 'g', category: '' }],
  ];

  it.each(cases)('cleans %j (%s)', (raw, unit, cat, expected) => {
    const out = HyperpureTemplate.suggestIngredient(line(raw, unit, cat));
    expect(out).toEqual(expected);
  });

  it('falls back to baseUnit "each" if the parsed line has unit=""', () => {
    const out = HyperpureTemplate.suggestIngredient(line('Mystery Item, x foo', '', ''));
    expect(out.baseUnit).toBe('each');
  });

  it('drops a trailing parens block only when its content is < 30 chars', () => {
    // long parenthetical kept
    const long = HyperpureTemplate.suggestIngredient(
      line('Some Item (this is a very long descriptive parenthetical block here), 1 Kg', 'g', ''),
    );
    expect(long.name).toBe(
      'Some Item (this Is A Very Long Descriptive Parenthetical Block Here)',
    );
    // short parenthetical dropped
    const short = HyperpureTemplate.suggestIngredient(line('Some Item (Big), 1 Kg', 'g', ''));
    expect(short.name).toBe('Some Item');
  });
});
