import { app } from 'electron';
import { getDb } from '../db/client';
import { AppSettingsService } from '../services/AppSettingsService';
import { BackupService } from '../services/BackupService';

const DAILY_RETAIN_DEFAULT = 30;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
let timer: ReturnType<typeof setTimeout> | null = null;

/**
 * Compute the next daily fire time (in epoch ms) given the configured
 * minutes-after-midnight and the current wall clock. If today's slot has
 * already passed, schedule for tomorrow; otherwise today.
 */
export function nextFireMs(now: Date, dailyAtMinutes: number): number {
  const next = new Date(now);
  next.setHours(0, 0, 0, 0);
  next.setMinutes(dailyAtMinutes);
  if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
  return next.getTime();
}

export function startBackupScheduler(): void {
  // Idempotent: cancel any in-flight timer before arming a new one. Mirrors
  // orderPoller.startOrderPoller — re-entry from HMR / Electron `activate` /
  // settings-change-driven restart must not stack parallel chains.
  stopBackupScheduler();
  scheduleNext();
}

export function stopBackupScheduler(): void {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
}

function scheduleNext(): void {
  const settings = AppSettingsService.snapshot(getDb().db);
  if (!settings.backupFolderPath) {
    // No folder configured — re-check in an hour (operator may set it).
    timer = setTimeout(scheduleNext, 60 * 60 * 1000);
    return;
  }
  // Catch up on a missed slot: if the last successful run was more than
  // 24h ago (or there's no recorded run yet), fire immediately rather
  // than waiting for the next wall-clock slot. Spec §7.12 wants daily
  // backups; if Windows was off across the slot we should still get one
  // on next boot.
  const sinceLastRun =
    settings.backupLastRunAt === null
      ? Number.POSITIVE_INFINITY
      : Date.now() - settings.backupLastRunAt;
  if (sinceLastRun > ONE_DAY_MS) {
    timer = setTimeout(() => {
      void runScheduledBackup();
    }, 0);
    return;
  }
  const fireAt = nextFireMs(new Date(), settings.backupDailyAtMinutes);
  const delay = Math.max(0, fireAt - Date.now());
  timer = setTimeout(() => {
    void runScheduledBackup();
  }, delay);
}

async function runScheduledBackup(): Promise<void> {
  try {
    const settings = AppSettingsService.snapshot(getDb().db);
    if (!settings.backupFolderPath) return;
    // Force-flush WAL into the main DB file so the snapshot is hot-consistent.
    // Without this, recent committed transactions sitting in hyprride.sqlite-wal
    // would be silently absent from the backup.
    getDb().raw.pragma('wal_checkpoint(TRUNCATE)');
    await BackupService.runBackup({
      userDataDir: app.getPath('userData'),
      backupRoot: settings.backupFolderPath,
      now: new Date(),
      retainDailyCount: DAILY_RETAIN_DEFAULT,
    });
    AppSettingsService.setBackupLastRunAt(getDb().db, Date.now());
  } catch (err) {
    console.error('[backupScheduler] daily backup failed:', err);
  } finally {
    scheduleNext();
  }
}
