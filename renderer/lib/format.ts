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

const dateTimeLongFormatter = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

/** "28 Apr 2026, 14:22" — full timestamp for history detail views. */
export function formatDateTimeLong(when: number): string {
  return dateTimeLongFormatter.format(when);
}

const dateOnlyFormatter = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

/** "16 Jun 2026" — calendar date only, for service / repair / wash records. */
export function formatDate(when: number): string {
  return dateOnlyFormatter.format(when);
}

/** Today as a `yyyy-MM-dd` string for <input type="date"> defaults / max. */
export function todayDateInput(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Convert an <input type="date"> value (`yyyy-MM-dd`) into a Unix-ms timestamp
 * at local noon (noon avoids any timezone day-shift when it's formatted back).
 * Returns `null` only for an empty / malformed value. Use this when editing,
 * where the chosen date should always be applied verbatim.
 */
export function dateInputToMs(value: string): number | null {
  if (!value) return null;
  const [y, m, d] = value.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d, 12, 0, 0, 0).getTime();
}

/** Inverse of {@link dateInputToMs}: a `yyyy-MM-dd` string for prefilling. */
export function msToDateInput(ms: number): string {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Like {@link dateInputToMs} but returns `null` for an empty value or when the
 * date is today, so creation callers send `null` and let the service stamp the
 * exact current time instead of a noon-rounded one.
 */
export function eventDateToMs(value: string): number | null {
  if (!value || value === todayDateInput()) return null;
  return dateInputToMs(value);
}
