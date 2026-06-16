import type { AppDb } from '../db/client';
import { appSettingsRepository } from '../repositories/appSettingsRepository';
import {
  APP_SETTINGS_KEYS,
  DEFAULT_BACKUP_DAILY_AT_MINUTES,
  type AppSettingsSnapshot,
} from '@shared/schemas/appSettings';
import { ValidationError } from '@shared/errors/DomainError';

async function readJson<T>(
  db: AppDb,
  key: (typeof APP_SETTINGS_KEYS)[number],
  fallback: T,
): Promise<T> {
  const raw = await appSettingsRepository.get(db, key);
  if (raw === undefined) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function writeJson(
  db: AppDb,
  key: (typeof APP_SETTINGS_KEYS)[number],
  value: unknown,
): Promise<void> {
  await appSettingsRepository.set(db, key, JSON.stringify(value ?? null), Date.now());
}

export const AppSettingsService = {
  async snapshot(db: AppDb): Promise<AppSettingsSnapshot> {
    return {
      backupFolderPath: await readJson<string | null>(db, 'backup.folderPath', null),
      backupDailyAtMinutes: await readJson<number>(
        db,
        'backup.dailyAtMinutes',
        DEFAULT_BACKUP_DAILY_AT_MINUTES,
      ),
      backupLastRunAt: await readJson<number | null>(db, 'backup.lastRunAt', null),
      firstRunCompleted: await readJson<boolean>(db, 'firstRunCompleted', false),
    };
  },

  async setBackupFolder(db: AppDb, folderPath: string | null): Promise<void> {
    await writeJson(db, 'backup.folderPath', folderPath);
  },

  async setBackupTime(db: AppDb, dailyAtMinutes: number): Promise<void> {
    if (
      !Number.isInteger(dailyAtMinutes) ||
      dailyAtMinutes < 0 ||
      dailyAtMinutes >= 24 * 60
    ) {
      throw new ValidationError(
        `dailyAtMinutes must be an integer in [0, ${24 * 60 - 1}] (got ${dailyAtMinutes})`,
      );
    }
    await writeJson(db, 'backup.dailyAtMinutes', dailyAtMinutes);
  },

  async setBackupLastRunAt(db: AppDb, ts: number): Promise<void> {
    await writeJson(db, 'backup.lastRunAt', ts);
  },

  async setFirstRunCompleted(db: AppDb, completed: boolean): Promise<void> {
    await writeJson(db, 'firstRunCompleted', completed);
  },
};
