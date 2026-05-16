import { ipcMain } from 'electron';
import { getDb } from '../../db/client';
import { ServiceTemplateService } from '../../services/ServiceTemplateService';
import { DEFAULT_TENANT_ID } from '@shared/constants/system';
import { IPC } from '@shared/schemas/ipc';
import {
  createServiceTemplateInputSchema,
  deactivateServiceTemplateInputSchema,
  getServiceTemplateInputSchema,
  listServiceTemplatesInputSchema,
  updateServiceTemplateInputSchema,
} from '@shared/schemas/serviceTemplate';
import { makeHandler } from './wrap';

export function registerServiceTemplateHandlers(): void {
  ipcMain.handle(
    IPC.serviceTemplate.list,
    makeHandler(listServiceTemplatesInputSchema, (input) =>
      ServiceTemplateService.list(getDb().db, DEFAULT_TENANT_ID, input),
    ),
  );

  ipcMain.handle(
    IPC.serviceTemplate.get,
    makeHandler(getServiceTemplateInputSchema, (input) =>
      ServiceTemplateService.get(getDb().db, DEFAULT_TENANT_ID, input.id),
    ),
  );

  ipcMain.handle(
    IPC.serviceTemplate.create,
    makeHandler(createServiceTemplateInputSchema, (input) =>
      ServiceTemplateService.create(getDb().db, DEFAULT_TENANT_ID, input),
    ),
  );

  ipcMain.handle(
    IPC.serviceTemplate.update,
    makeHandler(updateServiceTemplateInputSchema, (input) =>
      ServiceTemplateService.update(getDb().db, DEFAULT_TENANT_ID, input),
    ),
  );

  ipcMain.handle(
    IPC.serviceTemplate.deactivate,
    makeHandler(deactivateServiceTemplateInputSchema, (input) =>
      ServiceTemplateService.deactivate(getDb().db, DEFAULT_TENANT_ID, input.id),
    ),
  );
}
