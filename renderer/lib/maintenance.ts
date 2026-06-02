import { MAINTENANCE_ALERT_DAYS } from '@shared/constants/system';

export type DueDisplay = {
  /** Short human label, e.g. "in 12d", "due today", "3d overdue", "never". */
  text: string;
  /** True when the bike needs attention now (overdue, due today, never done,
   *  or within MAINTENANCE_ALERT_DAYS). Drives the red highlight. */
  urgent: boolean;
};

/**
 * Turn a "days remaining until due" number into a display label + urgency flag.
 * `null` means the activity has never happened for this bike — treated as
 * urgent ("never").
 */
export function dueLabel(daysRemaining: number | null): DueDisplay {
  if (daysRemaining === null) return { text: 'never', urgent: true };
  if (daysRemaining < 0) {
    const d = Math.abs(daysRemaining);
    return { text: `${d}d overdue`, urgent: true };
  }
  if (daysRemaining === 0) return { text: 'due today', urgent: true };
  return {
    text: `in ${daysRemaining}d`,
    urgent: daysRemaining <= MAINTENANCE_ALERT_DAYS,
  };
}

/** Sort key so the most urgent (never → overdue → soonest) come first. */
export function dueSortKey(daysRemaining: number | null): number {
  return daysRemaining === null ? Number.NEGATIVE_INFINITY : daysRemaining;
}
