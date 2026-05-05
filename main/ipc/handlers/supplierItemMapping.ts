import { ipcMain } from 'electron';
import { getDb } from '../../db/client';
import { SupplierItemMappingService } from '../../services/SupplierItemMappingService';
import { DEFAULT_TENANT_ID } from '@shared/constants/system';
import { IPC } from '@shared/schemas/ipc';
import { suggestSupplierItemInputSchema } from '@shared/schemas/supplierItemMapping';
import { makeHandler } from './wrap';

export function registerSupplierItemMappingHandlers(): void {
  ipcMain.handle(
    IPC.supplierItemMapping.suggest,
    makeHandler(suggestSupplierItemInputSchema, (input) =>
      SupplierItemMappingService.suggest(
        getDb().db,
        DEFAULT_TENANT_ID,
        input.supplierId,
        input.partial,
        input.limit,
      ),
    ),
  );
}
