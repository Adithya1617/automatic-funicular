import type { BaseUnit } from '../constants/enums';
import {
  UNIT_DEFINITION_BY_KEY,
  type UnitDefinition,
} from '../constants/unitConversions';
import { ValidationError } from '../errors/DomainError';

export type ConvertOptions = {
  /** g per ml — only used when crossing the g↔ml boundary. */
  densityGPerMl?: number;
};

function lookup(unit: string): UnitDefinition {
  const key = unit.trim();
  const def = UNIT_DEFINITION_BY_KEY[key] ?? UNIT_DEFINITION_BY_KEY[key.toLowerCase()];
  if (!def) throw new ValidationError(`Unknown unit: "${unit}"`);
  return def;
}

/**
 * Convert a quantity from one unit to another. Same-base conversions are
 * pure ratios. Mass↔volume conversions need an ingredient-specific
 * `densityGPerMl` (g per ml). `each` cannot be converted to/from anything
 * else.
 */
export function convert(
  qty: number,
  from: string,
  to: string,
  options: ConvertOptions = {},
): number {
  if (!Number.isFinite(qty)) throw new ValidationError(`Quantity is not finite: ${qty}`);

  const fromDef = lookup(from);
  const toDef = lookup(to);

  if (fromDef.base === toDef.base) {
    return (qty * fromDef.toBase) / toDef.toBase;
  }

  if (fromDef.base === 'each' || toDef.base === 'each') {
    throw new ValidationError(
      `Cannot convert "${from}" to "${to}" — countable units are not interchangeable`,
    );
  }

  const density = options.densityGPerMl;
  if (density === undefined || density <= 0 || !Number.isFinite(density)) {
    throw new ValidationError(
      `Cannot convert "${from}" to "${to}" without densityGPerMl (g per ml)`,
    );
  }

  // Reduce to grams first, then cross to ml using density, then to target.
  const inGrams =
    fromDef.base === 'g' ? qty * fromDef.toBase : qty * fromDef.toBase * density;
  const inToBase = toDef.base === 'g' ? inGrams : inGrams / density;
  return inToBase / toDef.toBase;
}

/** Convert any compatible unit into the ingredient's base unit. */
export function toBase(
  qty: number,
  unit: string,
  base: BaseUnit,
  options: ConvertOptions = {},
): number {
  return convert(qty, unit, base, options);
}
