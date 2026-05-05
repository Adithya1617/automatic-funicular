import { ipcMain } from 'electron';
import { getDb } from '../../db/client';
import { AvailabilityService } from '../../services/AvailabilityService';
import { DEFAULT_TENANT_ID } from '@shared/constants/system';
import { IPC } from '@shared/schemas/ipc';
import { listAvailabilityInputSchema } from '@shared/schemas/availability';
import { makeHandler } from './wrap';

export function registerAvailabilityHandlers(): void {
  ipcMain.handle(
    IPC.availability.list,
    makeHandler(listAvailabilityInputSchema, (input) =>
      AvailabilityService.list(getDb().db, DEFAULT_TENANT_ID, input.menuItemIds),
    ),
  );
}
