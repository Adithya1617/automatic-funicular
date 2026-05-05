import type { DateRange } from '@shared/schemas/dashboard';

export const PRESETS = [
  'today',
  'this_week',
  'this_month',
  'last_30_days',
  'this_year',
  'custom',
] as const;
export type PresetKey = (typeof PRESETS)[number];

export const PRESET_LABELS: Record<PresetKey, string> = {
  today: 'Today',
  this_week: 'This week',
  this_month: 'This month',
  last_30_days: 'Last 30 days',
  this_year: 'This year',
  custom: 'Custom',
};

const MS_PER_DAY = 24 * 60 * 60 * 1_000;

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

export function rangeFromPreset(preset: PresetKey, now: Date = new Date()): DateRange {
  const today = startOfDay(now);
  const end = endOfDay(now).getTime();
  switch (preset) {
    case 'today':
      return { startMs: today.getTime(), endMs: end };
    case 'this_week': {
      const day = today.getDay() === 0 ? 6 : today.getDay() - 1; // Monday-anchored
      const start = new Date(today.getTime() - day * MS_PER_DAY);
      return { startMs: start.getTime(), endMs: end };
    }
    case 'this_month': {
      const start = new Date(today.getFullYear(), today.getMonth(), 1);
      return { startMs: start.getTime(), endMs: end };
    }
    case 'last_30_days': {
      const start = new Date(today.getTime() - 29 * MS_PER_DAY);
      return { startMs: start.getTime(), endMs: end };
    }
    case 'this_year': {
      const start = new Date(today.getFullYear(), 0, 1);
      return { startMs: start.getTime(), endMs: end };
    }
    case 'custom':
      // Custom: caller manages the range; default to last 7 days.
      return {
        startMs: new Date(today.getTime() - 6 * MS_PER_DAY).getTime(),
        endMs: end,
      };
  }
}

/** Year-over-year compare range. */
export function compareRangeYoY(range: DateRange): DateRange {
  const start = new Date(range.startMs);
  const end = new Date(range.endMs);
  start.setFullYear(start.getFullYear() - 1);
  end.setFullYear(end.getFullYear() - 1);
  return { startMs: start.getTime(), endMs: end.getTime() };
}

export function dateToInputValue(unixMs: number): string {
  const d = new Date(unixMs);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function inputValueToUnixMs(value: string, endOfDayFlag = false): number {
  const [y, m, d] = value.split('-').map((s) => Number.parseInt(s, 10));
  if (!y || !m || !d) return Date.now();
  return endOfDayFlag
    ? new Date(y, m - 1, d, 23, 59, 59, 999).getTime()
    : new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
}
