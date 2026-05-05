import { describe, expect, it } from 'vitest';
import { convert, toBase } from '@shared/utils/unitConverter';
import { ValidationError } from '@shared/errors/DomainError';

describe('unitConverter', () => {
  describe('same-base conversions', () => {
    it('converts kg to g', () => {
      expect(convert(1.5, 'kg', 'g')).toBeCloseTo(1500, 6);
    });

    it('converts g to kg', () => {
      expect(convert(2400, 'g', 'kg')).toBeCloseTo(2.4, 6);
    });

    it('converts L to ml (case-insensitive)', () => {
      expect(convert(2, 'L', 'ml')).toBeCloseTo(2000, 6);
      expect(convert(2, 'l', 'ml')).toBeCloseTo(2000, 6);
    });

    it('passes each through unchanged', () => {
      expect(convert(7, 'each', 'each')).toBe(7);
    });
  });

  describe('cross-base conversions', () => {
    it('crosses g↔ml using density', () => {
      // Honey ~ 1.42 g/ml; 1.42 g should be 1 ml
      expect(convert(1.42, 'g', 'ml', { densityGPerMl: 1.42 })).toBeCloseTo(1, 6);
      // Inverse: 1 ml of honey = 1.42 g
      expect(convert(1, 'ml', 'g', { densityGPerMl: 1.42 })).toBeCloseTo(1.42, 6);
    });

    it('chains kg → ml using density', () => {
      // Water ~ 1.0 g/ml so 0.5 kg = 500 ml
      expect(convert(0.5, 'kg', 'ml', { densityGPerMl: 1.0 })).toBeCloseTo(500, 6);
    });

    it('rejects mass↔volume without density', () => {
      expect(() => convert(1, 'g', 'ml')).toThrow(ValidationError);
    });

    it('rejects each → mass even with density', () => {
      expect(() => convert(1, 'each', 'g', { densityGPerMl: 1 })).toThrow(ValidationError);
    });
  });

  describe('input validation', () => {
    it('rejects unknown units', () => {
      expect(() => convert(1, 'cup', 'g')).toThrow(ValidationError);
    });

    it('rejects non-finite quantities', () => {
      expect(() => convert(Number.NaN, 'g', 'g')).toThrow(ValidationError);
    });

    it('rejects zero or negative density when crossing bases', () => {
      expect(() => convert(1, 'g', 'ml', { densityGPerMl: 0 })).toThrow(ValidationError);
      expect(() => convert(1, 'g', 'ml', { densityGPerMl: -1 })).toThrow(ValidationError);
    });
  });

  describe('toBase', () => {
    it('reduces to ingredient base unit', () => {
      expect(toBase(2, 'kg', 'g')).toBeCloseTo(2000, 6);
      expect(toBase(0.5, 'L', 'ml')).toBeCloseTo(500, 6);
    });
  });
});
