import { describe, expect, it } from 'vitest';
import { rankIngredientMatches } from '../../shared/invoiceTemplates/match';

type Ing = { id: string; name: string; isActive: boolean };

const ingredients: Ing[] = [
  { id: 'i-paneer', name: 'Paneer', isActive: true },
  { id: 'i-paneer-lite', name: 'Lite Paneer', isActive: true },
  { id: 'i-coriander', name: 'Coriander Leaves', isActive: true },
  { id: 'i-carrot', name: 'Carrots', isActive: true },
  { id: 'i-cream', name: 'Whipping Cream', isActive: true },
  { id: 'i-banana-deact', name: 'Banana Leaf', isActive: false },
  { id: 'i-pepper', name: 'Black Pepper Whole', isActive: true },
];

describe('rankIngredientMatches', () => {
  it('returns the exact-match (case-insensitive) on top', () => {
    const out = rankIngredientMatches('paneer', ingredients);
    expect(out[0]?.id).toBe('i-paneer');
  });

  it('ranks substring matches above unrelated ingredients', () => {
    const out = rankIngredientMatches('Lite Paneer', ingredients);
    expect(out.map((m) => m.id)).toEqual(
      expect.arrayContaining(['i-paneer-lite', 'i-paneer']),
    );
    expect(out[0]?.id).toBe('i-paneer-lite');
  });

  it('returns at most 3 matches', () => {
    const out = rankIngredientMatches('paneer', ingredients);
    expect(out.length).toBeLessThanOrEqual(3);
  });

  it('uses token overlap >= 50%', () => {
    const out = rankIngredientMatches('Coriander', ingredients);
    expect(out.some((m) => m.id === 'i-coriander')).toBe(true);
  });

  it('drops short tokens (length <= 2) before computing overlap', () => {
    // "Big" and "1 Kg" should not produce false matches against "Paneer"
    const out = rankIngredientMatches('Carrots Big 1 Kg', ingredients);
    expect(out[0]?.id).toBe('i-carrot');
    expect(out.some((m) => m.id === 'i-paneer')).toBe(false);
  });

  it('skips inactive ingredients', () => {
    const out = rankIngredientMatches('Banana Leaf', ingredients);
    expect(out.every((m) => m.id !== 'i-banana-deact')).toBe(true);
  });

  it('returns [] when nothing scores above the threshold', () => {
    const out = rankIngredientMatches('Quinoa', ingredients);
    expect(out).toEqual([]);
  });

  it('is case-insensitive on both sides', () => {
    const out = rankIngredientMatches('BLACK PEPPER WHOLE', ingredients);
    expect(out[0]?.id).toBe('i-pepper');
  });
});
