import { ipcMain } from 'electron';
import { z } from 'zod';
import { getDb } from '../../db/client';
import { DashboardService } from '../../services/DashboardService';
import { DEFAULT_TENANT_ID } from '@shared/constants/system';
import { IPC } from '@shared/schemas/ipc';
import { rangedQuerySchema } from '@shared/schemas/dashboard';
import { makeHandler } from './wrap';

export function registerDashboardHandlers(): void {
  ipcMain.handle(
    IPC.dashboard.stockValue,
    makeHandler(z.object({}).default({}), () =>
      DashboardService.stockValue(getDb().db, DEFAULT_TENANT_ID),
    ),
  );

  ipcMain.handle(
    IPC.dashboard.stockValueSeries,
    makeHandler(rangedQuerySchema, (input) =>
      DashboardService.stockValueSeries(getDb().db, DEFAULT_TENANT_ID, input.range),
    ),
  );

  ipcMain.handle(
    IPC.dashboard.spending,
    makeHandler(rangedQuerySchema, (input) =>
      DashboardService.spending(getDb().db, DEFAULT_TENANT_ID, input.range),
    ),
  );

  ipcMain.handle(
    IPC.dashboard.cogs,
    makeHandler(rangedQuerySchema, (input) =>
      DashboardService.cogs(getDb().db, DEFAULT_TENANT_ID, input.range),
    ),
  );

  ipcMain.handle(
    IPC.dashboard.wastage,
    makeHandler(rangedQuerySchema, (input) =>
      DashboardService.wastage(getDb().db, DEFAULT_TENANT_ID, input.range),
    ),
  );

  ipcMain.handle(
    IPC.dashboard.topDishes,
    makeHandler(rangedQuerySchema, (input) =>
      DashboardService.topDishes(getDb().db, DEFAULT_TENANT_ID, input.range),
    ),
  );

  ipcMain.handle(
    IPC.dashboard.lowStock,
    makeHandler(rangedQuerySchema, (input) =>
      DashboardService.lowStock(getDb().db, DEFAULT_TENANT_ID, input.range),
    ),
  );

  ipcMain.handle(
    IPC.dashboard.reorder,
    makeHandler(rangedQuerySchema, (input) =>
      DashboardService.reorder(getDb().db, DEFAULT_TENANT_ID, input.range),
    ),
  );

  ipcMain.handle(
    IPC.dashboard.foodCost,
    makeHandler(z.object({}).default({}), () =>
      DashboardService.foodCost(getDb().db, DEFAULT_TENANT_ID),
    ),
  );

  ipcMain.handle(
    IPC.dashboard.revenueByChannel,
    makeHandler(rangedQuerySchema, (input) =>
      DashboardService.revenueByChannel(getDb().db, DEFAULT_TENANT_ID, input.range),
    ),
  );

  ipcMain.handle(
    IPC.dashboard.orderVolumeByChannel,
    makeHandler(rangedQuerySchema, (input) =>
      DashboardService.orderVolumeByChannel(getDb().db, DEFAULT_TENANT_ID, input.range),
    ),
  );

  // Hyprride bike-centric tiles.
  ipcMain.handle(
    IPC.dashboard.costPerBike,
    makeHandler(rangedQuerySchema, (input) =>
      DashboardService.costPerBike(getDb().db, DEFAULT_TENANT_ID, input.range),
    ),
  );

  ipcMain.handle(
    IPC.dashboard.costPerBikeType,
    makeHandler(rangedQuerySchema, (input) =>
      DashboardService.costPerBikeType(getDb().db, DEFAULT_TENANT_ID, input.range),
    ),
  );

  ipcMain.handle(
    IPC.dashboard.topConsumedParts,
    makeHandler(rangedQuerySchema, (input) =>
      DashboardService.topConsumedParts(getDb().db, DEFAULT_TENANT_ID, input.range),
    ),
  );

  ipcMain.handle(
    IPC.dashboard.serviceVolumeByBikeType,
    makeHandler(rangedQuerySchema, (input) =>
      DashboardService.serviceVolumeByBikeType(
        getDb().db,
        DEFAULT_TENANT_ID,
        input.range,
      ),
    ),
  );

  ipcMain.handle(
    IPC.dashboard.theoreticalServiceCost,
    makeHandler(z.object({}).default({}), () =>
      DashboardService.theoreticalServiceCost(getDb().db, DEFAULT_TENANT_ID),
    ),
  );
}
