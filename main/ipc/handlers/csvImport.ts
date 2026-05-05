import { ipcMain } from 'electron';
import { getDb } from '../../db/client';
import { CsvImportService } from '../../services/CsvImportService';
import { CsvTemplateService } from '../../services/CsvTemplateService';
import { DEFAULT_TENANT_ID } from '@shared/constants/system';
import { IPC } from '@shared/schemas/ipc';
import {
  csvImportInputSchema,
  csvTemplateInputSchema,
} from '@shared/schemas/csvImport';
import { makeHandler } from './wrap';

export function registerCsvImportHandlers(): void {
  ipcMain.handle(
    IPC.csvImport.template,
    makeHandler(csvTemplateInputSchema, (input) => CsvTemplateService.template(input.kind)),
  );

  ipcMain.handle(
    IPC.csvImport.run,
    makeHandler(csvImportInputSchema, (input) =>
      CsvImportService.run(getDb().db, DEFAULT_TENANT_ID, input),
    ),
  );
}
