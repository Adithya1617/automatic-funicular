import { ipcMain } from 'electron';
import { getDb } from '../../db/client';
import { ReportService } from '../../services/ReportService';
import { DEFAULT_TENANT_ID } from '@shared/constants/system';
import { IPC } from '@shared/schemas/ipc';
import { exportReportInputSchema } from '@shared/schemas/report';
import { makeHandler } from './wrap';

export function registerReportHandlers(): void {
  ipcMain.handle(
    IPC.report.exportCsv,
    makeHandler(exportReportInputSchema, (input) =>
      ReportService.export(getDb().db, DEFAULT_TENANT_ID, input),
    ),
  );
}
