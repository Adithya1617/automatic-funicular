import { ipcMain } from 'electron';
import { getDb } from '../../db/client';
import { SupplierService } from '../../services/SupplierService';
import { DEFAULT_TENANT_ID } from '@shared/constants/system';
import { IPC } from '@shared/schemas/ipc';
import {
  createSupplierInputSchema,
  deactivateSupplierInputSchema,
  getSupplierInputSchema,
  listSuppliersInputSchema,
  updateSupplierInputSchema,
} from '@shared/schemas/supplier';
import { makeHandler } from './wrap';

export function registerSupplierHandlers(): void {
  ipcMain.handle(
    IPC.supplier.list,
    makeHandler(listSuppliersInputSchema, (input) =>
      SupplierService.list(getDb().db, DEFAULT_TENANT_ID, input),
    ),
  );

  ipcMain.handle(
    IPC.supplier.get,
    makeHandler(getSupplierInputSchema, (input) =>
      SupplierService.get(getDb().db, DEFAULT_TENANT_ID, input.id),
    ),
  );

  ipcMain.handle(
    IPC.supplier.create,
    makeHandler(createSupplierInputSchema, (input) =>
      SupplierService.create(getDb().db, DEFAULT_TENANT_ID, input),
    ),
  );

  ipcMain.handle(
    IPC.supplier.update,
    makeHandler(updateSupplierInputSchema, (input) =>
      SupplierService.update(getDb().db, DEFAULT_TENANT_ID, input),
    ),
  );

  ipcMain.handle(
    IPC.supplier.deactivate,
    makeHandler(deactivateSupplierInputSchema, (input) =>
      SupplierService.deactivate(getDb().db, DEFAULT_TENANT_ID, input.id),
    ),
  );
}
