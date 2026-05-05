import { ipcMain } from 'electron';
import { getDb } from '../../db/client';
import { stockMovementRepository } from '../../repositories/stockMovementRepository';
import { DEFAULT_TENANT_ID } from '@shared/constants/system';
import { IPC } from '@shared/schemas/ipc';
import { listStockMovementsInputSchema } from '@shared/schemas/stockMovement';
import type { StockMovement } from '@shared/schemas/stockMovement';
import { makeHandler } from './wrap';

export function registerStockMovementHandlers(): void {
  ipcMain.handle(
    IPC.stockMovement.list,
    makeHandler(listStockMovementsInputSchema, (input) => {
      const rows = stockMovementRepository.list(getDb().db, DEFAULT_TENANT_ID, input);
      return rows as unknown as StockMovement[];
    }),
  );
}
