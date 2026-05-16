import { ipcMain } from 'electron';
import { getDb } from '../../db/client';
import { ServiceService } from '../../services/ServiceService';
import { DEFAULT_TENANT_ID } from '@shared/constants/system';
import { IPC } from '@shared/schemas/ipc';
import {
  cancelServiceEventInputSchema,
  completeServiceEventInputSchema,
  createAdHocServiceEventInputSchema,
  createServiceEventInputSchema,
  getServiceEventInputSchema,
  listServiceEventsInputSchema,
  updateServiceEventLinesInputSchema,
} from '@shared/schemas/serviceEvent';
import { makeHandler } from './wrap';

export function registerServiceEventHandlers(): void {
  ipcMain.handle(
    IPC.serviceEvent.list,
    makeHandler(listServiceEventsInputSchema, (input) =>
      ServiceService.list(getDb().db, DEFAULT_TENANT_ID, input),
    ),
  );

  ipcMain.handle(
    IPC.serviceEvent.get,
    makeHandler(getServiceEventInputSchema, (input) =>
      ServiceService.get(getDb().db, DEFAULT_TENANT_ID, input.id),
    ),
  );

  ipcMain.handle(
    IPC.serviceEvent.create,
    makeHandler(createServiceEventInputSchema, (input) =>
      ServiceService.create(getDb().db, DEFAULT_TENANT_ID, input),
    ),
  );

  ipcMain.handle(
    IPC.serviceEvent.createAdHoc,
    makeHandler(createAdHocServiceEventInputSchema, (input) =>
      ServiceService.createAdHoc(getDb().db, DEFAULT_TENANT_ID, input),
    ),
  );

  ipcMain.handle(
    IPC.serviceEvent.updateLines,
    makeHandler(updateServiceEventLinesInputSchema, (input) =>
      ServiceService.updateLines(getDb().db, DEFAULT_TENANT_ID, input),
    ),
  );

  ipcMain.handle(
    IPC.serviceEvent.complete,
    makeHandler(completeServiceEventInputSchema, (input) =>
      ServiceService.complete(getDb().db, DEFAULT_TENANT_ID, input.id),
    ),
  );

  ipcMain.handle(
    IPC.serviceEvent.cancel,
    makeHandler(cancelServiceEventInputSchema, (input) =>
      ServiceService.cancel(getDb().db, DEFAULT_TENANT_ID, input),
    ),
  );
}
