/**
 * Cross-module mutable singleton — `value` is the in-progress stock-take
 * id (or null when no take is running). Slice 7 (StockTakeService) writes
 * here on start/commit/discard. The order poller reads it each tick and
 * skips work while a take is in progress (locked decision §6 / SPEC §7.8).
 */
export const stockTakeLock: { value: string | null } = { value: null };
