import { ipcMain } from 'electron';
import { getDb } from '../../db/client';
import { OrderService } from '../../services/OrderService';
import { DEFAULT_TENANT_ID } from '@shared/constants/system';
import { IPC } from '@shared/schemas/ipc';
import {
  cancelOrderInputSchema,
  getOrderInputSchema,
  listOrdersInputSchema,
  markOrderInputSchema,
} from '@shared/schemas/order';
import { submitManualOrderInputSchema } from '@shared/schemas/ordering';
import { makeHandler } from './wrap';

export function registerOrderHandlers(): void {
  ipcMain.handle(
    IPC.order.list,
    makeHandler(listOrdersInputSchema, (input) =>
      OrderService.list(getDb().db, DEFAULT_TENANT_ID, input),
    ),
  );

  ipcMain.handle(
    IPC.order.get,
    makeHandler(getOrderInputSchema, (input) =>
      OrderService.get(getDb().db, DEFAULT_TENANT_ID, input.id),
    ),
  );

  ipcMain.handle(
    IPC.order.submitManual,
    makeHandler(submitManualOrderInputSchema, (input) =>
      OrderService.createManualOrder(getDb().db, DEFAULT_TENANT_ID, input),
    ),
  );

  ipcMain.handle(
    IPC.order.markPreparing,
    makeHandler(markOrderInputSchema, (input) =>
      OrderService.markPreparing(getDb().db, DEFAULT_TENANT_ID, input.id),
    ),
  );

  ipcMain.handle(
    IPC.order.markDelivered,
    makeHandler(markOrderInputSchema, (input) =>
      OrderService.markDelivered(getDb().db, DEFAULT_TENANT_ID, input.id),
    ),
  );

  ipcMain.handle(
    IPC.order.cancel,
    makeHandler(cancelOrderInputSchema, (input) =>
      OrderService.cancelOrder(getDb().db, DEFAULT_TENANT_ID, input),
    ),
  );
}
