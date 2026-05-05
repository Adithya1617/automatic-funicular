import { z } from 'zod';

/** Default minutes-after-midnight for the daily backup (3:00 AM = 180). */
export const DEFAULT_BACKUP_DAILY_AT_MINUTES = 3 * 60;

export const APP_SETTINGS_KEYS = [
  'backup.folderPath',
  'backup.dailyAtMinutes',
  'backup.lastRunAt',
  'firstRunCompleted',
] as const;
export type AppSettingsKey = (typeof APP_SETTINGS_KEYS)[number];

export const appSettingsSnapshotSchema = z.object({
  backupFolderPath: z.string().nullable(),
  backupDailyAtMinutes: z.number().int().min(0).max(24 * 60 - 1),
  backupLastRunAt: z.number().int().nullable(),
  firstRunCompleted: z.boolean(),
});
export type AppSettingsSnapshot = z.infer<typeof appSettingsSnapshotSchema>;

export const setBackupFolderInputSchema = z.object({
  folderPath: z.string().min(1).nullable(),
});
export type SetBackupFolderInput = z.infer<typeof setBackupFolderInputSchema>;

export const setBackupTimeInputSchema = z.object({
  dailyAtMinutes: z.number().int().min(0).max(24 * 60 - 1),
});
export type SetBackupTimeInput = z.infer<typeof setBackupTimeInputSchema>;

export const setFirstRunInputSchema = z.object({
  completed: z.boolean(),
});
export type SetFirstRunInput = z.infer<typeof setFirstRunInputSchema>;

export const chooseDirectoryInputSchema = z.object({
  title: z.string().default('Choose folder'),
});
export type ChooseDirectoryInput = z.infer<typeof chooseDirectoryInputSchema>;

export const chooseDirectoryResponseSchema = z.object({
  folderPath: z.string().nullable(),
});
export type ChooseDirectoryResponse = z.infer<typeof chooseDirectoryResponseSchema>;
