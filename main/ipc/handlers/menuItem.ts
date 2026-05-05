import { ipcMain } from 'electron';
import { getDb } from '../../db/client';
import { MenuService } from '../../services/MenuService';
import { DEFAULT_TENANT_ID } from '@shared/constants/system';
import { IPC } from '@shared/schemas/ipc';
import {
  createMenuItemInputSchema,
  createVariantInputSchema,
  deactivateMenuItemInputSchema,
  getMenuItemInputSchema,
  listMenuItemsInputSchema,
  updateMenuItemInputSchema,
} from '@shared/schemas/menuItem';
import { makeHandler } from './wrap';

export function registerMenuItemHandlers(): void {
  ipcMain.handle(
    IPC.menuItem.list,
    makeHandler(listMenuItemsInputSchema, (input) =>
      MenuService.list(getDb().db, DEFAULT_TENANT_ID, input),
    ),
  );

  ipcMain.handle(
    IPC.menuItem.get,
    makeHandler(getMenuItemInputSchema, (input) =>
      MenuService.get(getDb().db, DEFAULT_TENANT_ID, input.id),
    ),
  );

  ipcMain.handle(
    IPC.menuItem.create,
    makeHandler(createMenuItemInputSchema, (input) =>
      MenuService.create(getDb().db, DEFAULT_TENANT_ID, input),
    ),
  );

  ipcMain.handle(
    IPC.menuItem.update,
    makeHandler(updateMenuItemInputSchema, (input) =>
      MenuService.update(getDb().db, DEFAULT_TENANT_ID, input),
    ),
  );

  ipcMain.handle(
    IPC.menuItem.deactivate,
    makeHandler(deactivateMenuItemInputSchema, (input) =>
      MenuService.deactivate(getDb().db, DEFAULT_TENANT_ID, input.id),
    ),
  );

  ipcMain.handle(
    IPC.menuItem.createVariant,
    makeHandler(createVariantInputSchema, (input) =>
      MenuService.createVariant(getDb().db, DEFAULT_TENANT_ID, input),
    ),
  );
}
