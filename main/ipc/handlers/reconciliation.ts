import { ipcMain } from 'electron';
import { z } from 'zod';
import { getDb } from '../../db/client';
import { DEFAULT_TENANT_ID } from '@shared/constants/system';
import { IPC } from '@shared/schemas/ipc';
import {
  latestReconciliationSnapshot,
  runReconciliation,
} from '../../jobs/reconciliation';
import { makeHandler } from './wrap';

export function registerReconciliationHandlers(): void {
  ipcMain.handle(
    IPC.reconciliation.latest,
    makeHandler(z.object({}).default({}), () =>
      latestReconciliationSnapshot(),
    ),
  );

  ipcMain.handle(
    IPC.reconciliation.rerun,
    makeHandler(z.object({}).default({}), () => {
      const drifts = runReconciliation(getDb().db, DEFAULT_TENANT_ID);
      return { ranAtMs: Date.now(), drifts };
    }),
  );
}
