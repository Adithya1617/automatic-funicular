import type { BaseUnit } from '@shared/constants/enums';

const stockFormatters: Record<BaseUnit, Intl.NumberFormat> = {
  g: new Intl.NumberFormat('en-IN', { maximumFractionDigits: 3 }),
  ml: new Intl.NumberFormat('en-IN', { maximumFractionDigits: 3 }),
  each: new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }),
};

const relativeTimeFormatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

const dateTimeFormatter = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

/** Display ingredient quantities with the unit. Uses sensible base-unit
 *  promotion: g>=1000 → kg, ml>=1000 → L. */
export function formatStock(quantity: number, baseUnit: BaseUnit): string {
  if (baseUnit === 'each') {
    return `${stockFormatters.each.format(quantity)} each`;
  }
  if (baseUnit === 'g' && Math.abs(quantity) >= 1_000) {
    return `${stockFormatters.g.format(quantity / 1_000)} kg`;
  }
  if (baseUnit === 'ml' && Math.abs(quantity) >= 1_000) {
    return `${stockFormatters.ml.format(quantity / 1_000)} L`;
  }
  return `${stockFormatters[baseUnit].format(quantity)} ${baseUnit}`;
}

/** Compact relative time: "2h ago", "yesterday", "3d ago", "now". */
export function formatRelativeTime(when: number, now: number = Date.now()): string {
  const diffMs = when - now;
  const diffMin = Math.round(diffMs / 60_000);
  if (Math.abs(diffMin) < 1) return 'just now';
  if (Math.abs(diffMin) < 60) return relativeTimeFormatter.format(diffMin, 'minute');
  const diffHour = Math.round(diffMs / 3_600_000);
  if (Math.abs(diffHour) < 24) return relativeTimeFormatter.format(diffHour, 'hour');
  const diffDay = Math.round(diffMs / 86_400_000);
  if (Math.abs(diffDay) < 7) return relativeTimeFormatter.format(diffDay, 'day');
  return dateTimeFormatter.format(when);
}

/** "28 Apr 14:22" used in ledger rows. */
export function formatDateTime(when: number): string {
  return dateTimeFormatter.format(when);
}
