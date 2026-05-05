import { ipcMain } from 'electron';
import { getDb } from '../../db/client';
import { InvoiceService } from '../../services/InvoiceService';
import { DEFAULT_TENANT_ID } from '@shared/constants/system';
import { IPC } from '@shared/schemas/ipc';
import {
  attachPdfInputSchema,
  commitInvoiceInputSchema,
  createInvoiceDraftInputSchema,
  getInvoiceInputSchema,
  listInvoicesInputSchema,
  replaceInvoiceLinesInputSchema,
  updateInvoiceInputSchema,
} from '@shared/schemas/invoice';
import { makeHandler } from './wrap';

export function registerInvoiceHandlers(): void {
  ipcMain.handle(
    IPC.invoice.list,
    makeHandler(listInvoicesInputSchema, (input) =>
      InvoiceService.list(getDb().db, DEFAULT_TENANT_ID, input),
    ),
  );

  ipcMain.handle(
    IPC.invoice.get,
    makeHandler(getInvoiceInputSchema, (input) =>
      InvoiceService.get(getDb().db, DEFAULT_TENANT_ID, input.id),
    ),
  );

  ipcMain.handle(
    IPC.invoice.createDraft,
    makeHandler(createInvoiceDraftInputSchema, (input) =>
      InvoiceService.createDraft(getDb().db, DEFAULT_TENANT_ID, input),
    ),
  );

  ipcMain.handle(
    IPC.invoice.update,
    makeHandler(updateInvoiceInputSchema, (input) =>
      InvoiceService.update(getDb().db, DEFAULT_TENANT_ID, input),
    ),
  );

  ipcMain.handle(
    IPC.invoice.replaceLines,
    makeHandler(replaceInvoiceLinesInputSchema, (input) =>
      InvoiceService.replaceLines(getDb().db, DEFAULT_TENANT_ID, input),
    ),
  );

  ipcMain.handle(
    IPC.invoice.commit,
    makeHandler(commitInvoiceInputSchema, (input) =>
      InvoiceService.commit(getDb().db, DEFAULT_TENANT_ID, input),
    ),
  );

  ipcMain.handle(
    IPC.invoice.attachPdf,
    makeHandler(attachPdfInputSchema, (input) =>
      InvoiceService.attachPdf(getDb().db, DEFAULT_TENANT_ID, input),
    ),
  );
}
