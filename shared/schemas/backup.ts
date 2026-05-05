import { z } from 'zod';

export const backupEntrySchema = z.object({
  folderName: z.string(),
  /** Absolute path to the backup folder. */
  folderPath: z.string(),
  takenAtMs: z.number().int(),
  sizeBytes: z.number().int().nonnegative(),
});
export type BackupEntry = z.infer<typeof backupEntrySchema>;

export const listBackupsResponseSchema = z.object({
  rootPath: z.string().nullable(),
  entries: z.array(backupEntrySchema),
});
export type ListBackupsResponse = z.infer<typeof listBackupsResponseSchema>;

export const runBackupInputSchema = z
  .object({
    /** Override the configured root for this run only. */
    rootPath: z.string().min(1).optional(),
  })
  .default({});
export type RunBackupInput = z.infer<typeof runBackupInputSchema>;

export const runBackupResponseSchema = z.object({
  entry: backupEntrySchema,
  prunedFolders: z.array(z.string()),
});
export type RunBackupResponse = z.infer<typeof runBackupResponseSchema>;

export const restoreBackupInputSchema = z.object({
  folderPath: z.string().min(1),
});
export type RestoreBackupInput = z.infer<typeof restoreBackupInputSchema>;
