import { ipcMain } from 'electron';
import { getDb } from '../../db/client';
import { DemoSeedService } from '../../services/DemoSeedService';
import { DEFAULT_TENANT_ID } from '@shared/constants/system';
import { IPC } from '@shared/schemas/ipc';
import {
  demoResetInputSchema,
  demoSeedBikesInputSchema,
  demoSeedInputSchema,
} from '@shared/schemas/demo';
import { makeHandler } from './wrap';

export function registerDemoHandlers(): void {
  ipcMain.handle(
    IPC.demo.seed,
    makeHandler(demoSeedInputSchema, () =>
      DemoSeedService.run(getDb().db, DEFAULT_TENANT_ID),
    ),
  );

  ipcMain.handle(
    IPC.demo.seedBikes,
    makeHandler(demoSeedBikesInputSchema, () =>
      DemoSeedService.seedBikes(getDb().db, DEFAULT_TENANT_ID),
    ),
  );

  ipcMain.handle(
    IPC.demo.reset,
    makeHandler(demoResetInputSchema, () =>
      DemoSeedService.reset(getDb().db, DEFAULT_TENANT_ID),
    ),
  );
}
