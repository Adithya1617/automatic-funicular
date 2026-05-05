import { ipcMain } from 'electron';
import { z } from 'zod';
import { getDb } from '../../db/client';
import { StockTakeService } from '../../services/StockTakeService';
import { DEFAULT_TENANT_ID } from '@shared/constants/system';
import { IPC } from '@shared/schemas/ipc';
import {
  commitStockTakeInputSchema,
  discardStockTakeInputSchema,
  getStockTakeInputSchema,
  listStockTakesInputSchema,
  saveStockTakeCountInputSchema,
  startStockTakeInputSchema,
} from '@shared/schemas/stockTake';
import { makeHandler } from './wrap';

export function registerStockTakeHandlers(): void {
  ipcMain.handle(
    IPC.stockTake.list,
    makeHandler(listStockTakesInputSchema, (input) =>
      StockTakeService.list(getDb().db, DEFAULT_TENANT_ID, input),
    ),
  );

  ipcMain.handle(
    IPC.stockTake.get,
    makeHandler(getStockTakeInputSchema, (input) =>
      StockTakeService.get(getDb().db, DEFAULT_TENANT_ID, input.id),
    ),
  );

  ipcMain.handle(
    IPC.stockTake.getInProgress,
    makeHandler(z.object({}).default({}), () =>
      StockTakeService.getInProgress(getDb().db, DEFAULT_TENANT_ID),
    ),
  );

  ipcMain.handle(
    IPC.stockTake.start,
    makeHandler(startStockTakeInputSchema, (input) =>
      StockTakeService.start(getDb().db, DEFAULT_TENANT_ID, input),
    ),
  );

  ipcMain.handle(
    IPC.stockTake.saveCount,
    makeHandler(saveStockTakeCountInputSchema, (input) =>
      StockTakeService.saveCount(getDb().db, DEFAULT_TENANT_ID, input),
    ),
  );

  ipcMain.handle(
    IPC.stockTake.commit,
    makeHandler(commitStockTakeInputSchema, (input) =>
      StockTakeService.commit(getDb().db, DEFAULT_TENANT_ID, input),
    ),
  );

  ipcMain.handle(
    IPC.stockTake.discard,
    makeHandler(discardStockTakeInputSchema, (input) =>
      StockTakeService.discard(getDb().db, DEFAULT_TENANT_ID, input),
    ),
  );
}
