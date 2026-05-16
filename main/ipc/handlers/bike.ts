import { ipcMain } from 'electron';
import { getDb } from '../../db/client';
import { BikeService } from '../../services/BikeService';
import { DEFAULT_TENANT_ID } from '@shared/constants/system';
import { IPC } from '@shared/schemas/ipc';
import {
  createBikeInputSchema,
  deactivateBikeInputSchema,
  getBikeInputSchema,
  listBikeTypesInputSchema,
  listBikesInputSchema,
  updateBikeInputSchema,
} from '@shared/schemas/bike';
import { makeHandler } from './wrap';

export function registerBikeHandlers(): void {
  ipcMain.handle(
    IPC.bike.list,
    makeHandler(listBikesInputSchema, (input) =>
      BikeService.list(getDb().db, DEFAULT_TENANT_ID, input),
    ),
  );

  ipcMain.handle(
    IPC.bike.get,
    makeHandler(getBikeInputSchema, (input) =>
      BikeService.get(getDb().db, DEFAULT_TENANT_ID, input.id),
    ),
  );

  ipcMain.handle(
    IPC.bike.create,
    makeHandler(createBikeInputSchema, (input) =>
      BikeService.create(getDb().db, DEFAULT_TENANT_ID, input),
    ),
  );

  ipcMain.handle(
    IPC.bike.update,
    makeHandler(updateBikeInputSchema, (input) =>
      BikeService.update(getDb().db, DEFAULT_TENANT_ID, input),
    ),
  );

  ipcMain.handle(
    IPC.bike.deactivate,
    makeHandler(deactivateBikeInputSchema, (input) =>
      BikeService.deactivate(getDb().db, DEFAULT_TENANT_ID, input.id),
    ),
  );

  ipcMain.handle(
    IPC.bike.listTypes,
    makeHandler(listBikeTypesInputSchema, (input) =>
      BikeService.listTypes(getDb().db, DEFAULT_TENANT_ID, input),
    ),
  );
}
