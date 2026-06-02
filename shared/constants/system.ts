export const DEFAULT_TENANT_ID = 1 as const;

export const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000001' as const;

/**
 * Default supplier lead time used by the dashboard reorder-suggestions tile.
 * Per-supplier lead time is a future polish item (SPECIFICATION.md §7.9).
 */
export const REORDER_LEAD_TIME_DAYS = 7 as const;

/**
 * Maintenance cadence (Hyprride). A bike needs a scheduled service every
 * SERVICE_INTERVAL_DAYS and a wash every WASH_INTERVAL_DAYS; the dashboard
 * alert panels flag any bike with <= MAINTENANCE_ALERT_DAYS remaining (or
 * overdue, or never done). Countdowns derive from event history — no extra
 * columns on `bikes`.
 */
export const SERVICE_INTERVAL_DAYS = 45 as const;
export const WASH_INTERVAL_DAYS = 15 as const;
export const MAINTENANCE_ALERT_DAYS = 3 as const;

/**
 * Pre-filled engine-oil quantity (ml) in the Service dialog. The operator can
 * adjust it before completing; stock deducts the entered amount.
 */
export const DEFAULT_SERVICE_OIL_ML = 800 as const;
