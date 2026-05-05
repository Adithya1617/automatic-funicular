import type { BaseUnit } from './enums';

/**
 * Each known unit declares which base unit it reduces to and the
 * multiplier used to reach the base. Density-based conversions
 * (e.g. cups, spoons that depend on the ingredient) live elsewhere.
 */
export type UnitDefinition = {
  unit: string;
  base: BaseUnit;
  toBase: number;
};

export const UNIT_DEFINITIONS: readonly UnitDefinition[] = [
  { unit: 'g', base: 'g', toBase: 1 },
  { unit: 'kg', base: 'g', toBase: 1_000 },
  { unit: 'mg', base: 'g', toBase: 0.001 },
  { unit: 'ml', base: 'ml', toBase: 1 },
  { unit: 'l', base: 'ml', toBase: 1_000 },
  { unit: 'L', base: 'ml', toBase: 1_000 },
  { unit: 'each', base: 'each', toBase: 1 },
] as const;

export const UNIT_DEFINITION_BY_KEY: Readonly<Record<string, UnitDefinition>> =
  Object.freeze(
    UNIT_DEFINITIONS.reduce<Record<string, UnitDefinition>>((acc, def) => {
      acc[def.unit] = def;
      acc[def.unit.toLowerCase()] = def;
      return acc;
    }, {}),
  );

export function unitsCompatibleWithBase(base: BaseUnit): readonly string[] {
  return UNIT_DEFINITIONS.filter((def) => def.base === base).map((def) => def.unit);
}
