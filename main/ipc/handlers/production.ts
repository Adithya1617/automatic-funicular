import { ipcMain } from 'electron';
import { getDb } from '../../db/client';
import { ProductionService } from '../../services/ProductionService';
import { DEFAULT_TENANT_ID } from '@shared/constants/system';
import { IPC } from '@shared/schemas/ipc';
import {
  listBatchesInputSchema,
  recordBatchInputSchema,
} from '@shared/schemas/production';
import { makeHandler } from './wrap';

export function registerProductionHandlers(): void {
  ipcMain.handle(
    IPC.production.list,
    makeHandler(listBatchesInputSchema, (input) =>
      ProductionService.list(getDb().db, DEFAULT_TENANT_ID, input),
    ),
  );

  ipcMain.handle(
    IPC.production.recordBatch,
    makeHandler(recordBatchInputSchema, (input) =>
      ProductionService.recordBatch(getDb().db, DEFAULT_TENANT_ID, input),
    ),
  );
}
