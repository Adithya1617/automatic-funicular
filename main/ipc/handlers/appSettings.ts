import { dialog, ipcMain, BrowserWindow } from 'electron';
import { z } from 'zod';
import { getDb } from '../../db/client';
import { AppSettingsService } from '../../services/AppSettingsService';
import { IPC } from '@shared/schemas/ipc';
import {
  chooseDirectoryInputSchema,
  setBackupFolderInputSchema,
  setBackupTimeInputSchema,
  setFirstRunInputSchema,
} from '@shared/schemas/appSettings';
import { makeHandler } from './wrap';

export function registerAppSettingsHandlers(): void {
  ipcMain.handle(
    IPC.appSettings.snapshot,
    makeHandler(z.object({}).default({}), () =>
      AppSettingsService.snapshot(getDb().db),
    ),
  );

  ipcMain.handle(
    IPC.appSettings.setBackupFolder,
    makeHandler(setBackupFolderInputSchema, (input) => {
      AppSettingsService.setBackupFolder(getDb().db, input.folderPath);
      return AppSettingsService.snapshot(getDb().db);
    }),
  );

  ipcMain.handle(
    IPC.appSettings.setBackupTime,
    makeHandler(setBackupTimeInputSchema, (input) => {
      AppSettingsService.setBackupTime(getDb().db, input.dailyAtMinutes);
      return AppSettingsService.snapshot(getDb().db);
    }),
  );

  ipcMain.handle(
    IPC.appSettings.setFirstRunCompleted,
    makeHandler(setFirstRunInputSchema, (input) => {
      AppSettingsService.setFirstRunCompleted(getDb().db, input.completed);
      return AppSettingsService.snapshot(getDb().db);
    }),
  );

  ipcMain.handle(
    IPC.appSettings.chooseDirectory,
    makeHandler(chooseDirectoryInputSchema, async (input) => {
      const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
      const opts: Electron.OpenDialogOptions = {
        title: input.title,
        properties: ['openDirectory', 'createDirectory'],
      };
      // Pass a parent when we have one (better modal behaviour); otherwise
      // open the dialog without a parent — Electron supports both signatures.
      const result = win
        ? await dialog.showOpenDialog(win, opts)
        : await dialog.showOpenDialog(opts);
      if (result.canceled || result.filePaths.length === 0) {
        return { folderPath: null };
      }
      return { folderPath: result.filePaths[0]! };
    }),
  );
}
