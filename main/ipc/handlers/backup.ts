import { app, ipcMain } from 'electron';
import { z } from 'zod';
import { getDb } from '../../db/client';
import { AppSettingsService } from '../../services/AppSettingsService';
import { BackupService } from '../../services/BackupService';
import { IPC } from '@shared/schemas/ipc';
import {
  restoreBackupInputSchema,
  runBackupInputSchema,
} from '@shared/schemas/backup';
import { ValidationError } from '@shared/errors/DomainError';
import { makeHandler } from './wrap';

const DAILY_RETAIN = 30;

export function registerBackupHandlers(): void {
  ipcMain.handle(
    IPC.backup.list,
    makeHandler(z.object({}).default({}), async () => {
      const settings = AppSettingsService.snapshot(getDb().db);
      return BackupService.listBackups(settings.backupFolderPath);
    }),
  );

  ipcMain.handle(
    IPC.backup.runNow,
    makeHandler(runBackupInputSchema, async (input) => {
      const settings = AppSettingsService.snapshot(getDb().db);
      const root = input.rootPath ?? settings.backupFolderPath;
      if (!root) {
        throw new ValidationError(
          'No backup folder configured — set one in Settings before running a backup',
        );
      }
      const result = await BackupService.runBackup({
        userDataDir: app.getPath('userData'),
        backupRoot: root,
        now: new Date(),
        retainDailyCount: DAILY_RETAIN,
      });
      AppSettingsService.setBackupLastRunAt(getDb().db, result.entry.takenAtMs);
      return result;
    }),
  );

  ipcMain.handle(
    IPC.backup.restore,
    makeHandler(restoreBackupInputSchema, async (input) => {
      // Restore is a destructive operation: caller (renderer) confirms intent.
      // We close the DB, copy the backup over, then schedule a relaunch so the
      // next boot opens the restored DB cleanly.
      getDb().close();
      try {
        await BackupService.restoreFromFolder({
          userDataDir: app.getPath('userData'),
          sourceFolder: input.folderPath,
        });
      } finally {
        // Re-open immediately so subsequent IPC calls (during the brief
        // relaunch window) don't hit a closed handle.
        // Note: we re-import openDb lazily to avoid a top-level cycle.
        const { openDb } = await import('../../db/client');
        const { join } = await import('node:path');
        const userData = app.getPath('userData');
        const migrationsFolder = app.isPackaged
          ? join(process.resourcesPath, 'db/migrations')
          : join(app.getAppPath(), 'main/db/migrations');
        openDb({
          filePath: join(userData, 'laurans.sqlite'),
          migrationsFolder,
        });
      }
      app.relaunch();
      app.exit(0);
      return { ok: true };
    }),
  );
}
