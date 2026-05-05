import { app } from 'electron';
import { getDb } from '../db/client';
import { AppSettingsService } from '../services/AppSettingsService';
import { BackupService } from '../services/BackupService';

const DAILY_RETAIN_DEFAULT = 30;
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
