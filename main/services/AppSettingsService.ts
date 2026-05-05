import type { AppDb } from '../db/client';
import { appSettingsRepository } from '../repositories/appSettingsRepository';
import {
  APP_SETTINGS_KEYS,
  DEFAULT_BACKUP_DAILY_AT_MINUTES,
  type AppSettingsSnapshot,
} from '@shared/schemas/appSettings';
import { ValidationError } from '@shared/errors/DomainError';

function readJson<T>(db: AppDb, key: (typeof APP_SETTINGS_KEYS)[number], fallback: T): T {
  const raw = appSettingsRepository.get(db, key);
  if (raw === undefined) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(db: AppDb, key: (typeof APP_SETTINGS_KEYS)[number], value: unknown): void {
  appSettingsRepository.set(db, key, JSON.stringify(value ?? null), Date.now());
}

export const AppSettingsService = {
  snapshot(db: AppDb): AppSettingsSnapshot {
    return {
      backupFolderPath: readJson<string | null>(db, 'backup.folderPath', null),
      backupDailyAtMinutes: readJson<number>(
        db,
        'backup.dailyAtMinutes',
        DEFAULT_BACKUP_DAILY_AT_MINUTES,
      ),
      backupLastRunAt: readJson<number | null>(db, 'backup.lastRunAt', null),
      firstRunCompleted: readJson<boolean>(db, 'firstRunCompleted', false),
    };
  },

  setBackupFolder(db: AppDb, folderPath: string | null): void {
    writeJson(db, 'backup.folderPath', folderPath);
  },

  setBackupTime(db: AppDb, dailyAtMinutes: number): void {
    if (
      !Number.isInteger(dailyAtMinutes) ||
      dailyAtMinutes < 0 ||
      dailyAtMinutes >= 24 * 60
    ) {
      throw new ValidationError(
        `dailyAtMinutes must be an integer in [0, ${24 * 60 - 1}] (got ${dailyAtMinutes})`,
      );
    }
    writeJson(db, 'backup.dailyAtMinutes', dailyAtMinutes);
  },

  setBackupLastRunAt(db: AppDb, ts: number): void {
    writeJson(db, 'backup.lastRunAt', ts);
  },

  setFirstRunCompleted(db: AppDb, completed: boolean): void {
    writeJson(db, 'firstRunCompleted', completed);
  },
};
