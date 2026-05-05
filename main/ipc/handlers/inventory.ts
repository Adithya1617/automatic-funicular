import { ipcMain } from 'electron';
import { getDb } from '../../db/client';
import { InventoryService } from '../../services/InventoryService';
import { DEFAULT_TENANT_ID } from '@shared/constants/system';
import { IPC } from '@shared/schemas/ipc';
import { manualAdjustmentInputSchema } from '@shared/schemas/inventory';
import { makeHandler } from './wrap';

export function registerInventoryHandlers(): void {
  ipcMain.handle(
    IPC.inventory.applyMovement,
    makeHandler(manualAdjustmentInputSchema, (input) =>
      InventoryService.applyManualAdjustment(getDb().db, DEFAULT_TENANT_ID, input),
    ),
  );
}
