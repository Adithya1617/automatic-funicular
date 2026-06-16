/**
 * The web API route registry — the REST mirror of the Electron IPC surface
 * (shared/schemas/ipc.ts). Each entry reuses `makeHandler(schema, fn)` verbatim,
 * so input validation and the `{ ok, data }` / `{ ok, error }` envelope are
 * byte-identical to the IPC layer. The Hono app (api/app.ts) mounts every entry
 * as `POST /api/<key>` behind the auth middleware.
 *
 * Mutations pass `actor()` — the authenticated user id (from the request
 * context the auth middleware established) — so created_by/updated_by reflect
 * the real user instead of SYSTEM_USER_ID.
 *
 * Deferred (Electron/binary/SQLite-specific — added in later slices):
 *   - invoice/attachPdf, invoice/parse  → binary PDF upload (needs multipart)
 *   - appSettings/chooseDirectory        → native folder dialog (N/A on web)
 *   - backup/list, backup/runNow, backup/restore → SQLite-file FS backups (W6)
 */
import { z } from 'zod';
import { makeHandler } from './makeHandler';
import { getDb } from '../db/client';
import { DEFAULT_TENANT_ID } from '@shared/constants/system';
import { ValidationError } from '@shared/errors/DomainError';
import type { IpcResult } from '@shared/schemas/ipc';
import { currentActorId, currentUser } from './requestContext';

// Services
import { IngredientService } from '../../main/services/IngredientService';
import { SupplierService } from '../../main/services/SupplierService';
import { BikeService } from '../../main/services/BikeService';
import { ServiceTemplateService } from '../../main/services/ServiceTemplateService';
import { ServiceService } from '../../main/services/ServiceService';
import { InventoryService } from '../../main/services/InventoryService';
import { RecipeService } from '../../main/services/RecipeService';
import { InvoiceService } from '../../main/services/InvoiceService';
import { SupplierItemMappingService } from '../../main/services/SupplierItemMappingService';
import { StockTakeService } from '../../main/services/StockTakeService';
import { DashboardService } from '../../main/services/DashboardService';
import { ReportService } from '../../main/services/ReportService';
import { CsvImportService } from '../../main/services/CsvImportService';
import { CsvTemplateService } from '../../main/services/CsvTemplateService';
import { AppSettingsService } from '../../main/services/AppSettingsService';
import { DemoSeedService } from '../../main/services/DemoSeedService';
import { AuthService } from '../../main/services/AuthService';
import { stockMovementRepository } from '../../main/repositories/stockMovementRepository';
import {
  latestReconciliationSnapshot,
  runReconciliation,
} from '../../main/jobs/reconciliation';

// Schemas
import {
  createIngredientInputSchema,
  deactivateIngredientInputSchema,
  getIngredientInputSchema,
  listIngredientsInputSchema,
  updateIngredientInputSchema,
} from '@shared/schemas/ingredient';
import {
  createSupplierInputSchema,
  deactivateSupplierInputSchema,
  getSupplierInputSchema,
  listSuppliersInputSchema,
  updateSupplierInputSchema,
} from '@shared/schemas/supplier';
import {
  createBikeInputSchema,
  deactivateBikeInputSchema,
  getBikeInputSchema,
  listBikeTypesInputSchema,
  listBikesInputSchema,
  updateBikeInputSchema,
} from '@shared/schemas/bike';
import {
  createServiceTemplateInputSchema,
  deactivateServiceTemplateInputSchema,
  getServiceTemplateInputSchema,
  listServiceTemplatesInputSchema,
  updateServiceTemplateInputSchema,
} from '@shared/schemas/serviceTemplate';
import {
  cancelServiceEventInputSchema,
  completeServiceEventInputSchema,
  createAdHocServiceEventInputSchema,
  createServiceEventInputSchema,
  getServiceEventInputSchema,
  listServiceEventsInputSchema,
  setServiceEventStatusInputSchema,
  updateServiceEventLinesInputSchema,
} from '@shared/schemas/serviceEvent';
import { listStockMovementsInputSchema } from '@shared/schemas/stockMovement';
import type { StockMovement } from '@shared/schemas/stockMovement';
import {
  manualAdjustmentInputSchema,
  recordPurchaseInputSchema,
} from '@shared/schemas/inventory';
import {
  getActiveRecipeInputSchema,
  listRecipeVersionsInputSchema,
  saveRecipeVersionInputSchema,
} from '@shared/schemas/recipe';
import {
  commitInvoiceInputSchema,
  createInvoiceDraftInputSchema,
  getInvoiceInputSchema,
  listInvoicesInputSchema,
  replaceInvoiceLinesInputSchema,
  updateInvoiceInputSchema,
} from '@shared/schemas/invoice';
import { suggestSupplierItemInputSchema } from '@shared/schemas/supplierItemMapping';
import {
  commitStockTakeInputSchema,
  discardStockTakeInputSchema,
  getStockTakeInputSchema,
  listStockTakesInputSchema,
  saveStockTakeCountInputSchema,
  startStockTakeInputSchema,
} from '@shared/schemas/stockTake';
import { rangedQuerySchema } from '@shared/schemas/dashboard';
import { exportReportInputSchema } from '@shared/schemas/report';
import { csvImportInputSchema, csvTemplateInputSchema } from '@shared/schemas/csvImport';
import {
  setBackupFolderInputSchema,
  setBackupTimeInputSchema,
  setFirstRunInputSchema,
} from '@shared/schemas/appSettings';
import {
  demoResetInputSchema,
  demoSeedBikesInputSchema,
  demoSeedInputSchema,
} from '@shared/schemas/demo';
import {
  changePasswordInputSchema,
  createUserInputSchema,
  deactivateUserInputSchema,
} from '@shared/schemas/auth';

export type RouteHandler = (event: unknown, raw: unknown) => Promise<IpcResult<unknown>>;

const empty = () => z.object({}).default({});

/** db handle + per-request actor for the current request. */
const db = () => getDb().db;
const actor = () => currentActorId();
const TID = DEFAULT_TENANT_ID;

export const routes: Record<string, RouteHandler> = {
  // ---- Ingredients (Parts) ----
  'ingredient/list': makeHandler(listIngredientsInputSchema, (i) => IngredientService.list(db(), TID, i)),
  'ingredient/get': makeHandler(getIngredientInputSchema, (i) => IngredientService.get(db(), TID, i.id)),
  'ingredient/create': makeHandler(createIngredientInputSchema, (i) => IngredientService.create(db(), TID, i, actor())),
  'ingredient/update': makeHandler(updateIngredientInputSchema, (i) => IngredientService.update(db(), TID, i, actor())),
  'ingredient/deactivate': makeHandler(deactivateIngredientInputSchema, (i) => IngredientService.deactivate(db(), TID, i.id, actor())),

  // ---- Suppliers ----
  'supplier/list': makeHandler(listSuppliersInputSchema, (i) => SupplierService.list(db(), TID, i)),
  'supplier/get': makeHandler(getSupplierInputSchema, (i) => SupplierService.get(db(), TID, i.id)),
  'supplier/create': makeHandler(createSupplierInputSchema, (i) => SupplierService.create(db(), TID, i, actor())),
  'supplier/update': makeHandler(updateSupplierInputSchema, (i) => SupplierService.update(db(), TID, i, actor())),
  'supplier/deactivate': makeHandler(deactivateSupplierInputSchema, (i) => SupplierService.deactivate(db(), TID, i.id, actor())),

  // ---- Bikes ----
  'bike/list': makeHandler(listBikesInputSchema, (i) => BikeService.list(db(), TID, i)),
  'bike/get': makeHandler(getBikeInputSchema, (i) => BikeService.get(db(), TID, i.id)),
  'bike/create': makeHandler(createBikeInputSchema, (i) => BikeService.create(db(), TID, i, actor())),
  'bike/update': makeHandler(updateBikeInputSchema, (i) => BikeService.update(db(), TID, i, actor())),
  'bike/deactivate': makeHandler(deactivateBikeInputSchema, (i) => BikeService.deactivate(db(), TID, i.id, actor())),
  'bike/listTypes': makeHandler(listBikeTypesInputSchema, (i) => BikeService.listTypes(db(), TID, i)),

  // ---- Service templates ----
  'serviceTemplate/list': makeHandler(listServiceTemplatesInputSchema, (i) => ServiceTemplateService.list(db(), TID, i)),
  'serviceTemplate/get': makeHandler(getServiceTemplateInputSchema, (i) => ServiceTemplateService.get(db(), TID, i.id)),
  'serviceTemplate/create': makeHandler(createServiceTemplateInputSchema, (i) => ServiceTemplateService.create(db(), TID, i, actor())),
  'serviceTemplate/update': makeHandler(updateServiceTemplateInputSchema, (i) => ServiceTemplateService.update(db(), TID, i, actor())),
  'serviceTemplate/deactivate': makeHandler(deactivateServiceTemplateInputSchema, (i) => ServiceTemplateService.deactivate(db(), TID, i.id, actor())),

  // ---- Service events (service / repair / wash) ----
  'serviceEvent/list': makeHandler(listServiceEventsInputSchema, (i) => ServiceService.list(db(), TID, i)),
  'serviceEvent/listWithLines': makeHandler(listServiceEventsInputSchema, (i) => ServiceService.listWithLines(db(), TID, i)),
  'serviceEvent/get': makeHandler(getServiceEventInputSchema, (i) => ServiceService.get(db(), TID, i.id)),
  'serviceEvent/create': makeHandler(createServiceEventInputSchema, (i) => ServiceService.create(db(), TID, i, actor())),
  'serviceEvent/createAdHoc': makeHandler(createAdHocServiceEventInputSchema, (i) => ServiceService.createAdHoc(db(), TID, i, actor())),
  'serviceEvent/updateLines': makeHandler(updateServiceEventLinesInputSchema, (i) => ServiceService.updateLines(db(), TID, i, actor())),
  'serviceEvent/complete': makeHandler(completeServiceEventInputSchema, (i) => ServiceService.complete(db(), TID, i.id, actor())),
  'serviceEvent/setStatus': makeHandler(setServiceEventStatusInputSchema, (i) => ServiceService.setStatus(db(), TID, i, actor())),
  'serviceEvent/cancel': makeHandler(cancelServiceEventInputSchema, (i) => ServiceService.cancel(db(), TID, i, actor())),

  // ---- Stock movements ----
  'stockMovement/list': makeHandler(listStockMovementsInputSchema, async (i) => {
    const rows = await stockMovementRepository.list(db(), TID, i);
    return rows as unknown as StockMovement[];
  }),

  // ---- Inventory (Buy Parts / manual adjustment) ----
  'inventory/applyMovement': makeHandler(manualAdjustmentInputSchema, (i) => InventoryService.applyManualAdjustment(db(), TID, i, actor())),
  'inventory/recordPurchase': makeHandler(recordPurchaseInputSchema, (i) => InventoryService.recordPurchase(db(), TID, i, actor())),

  // ---- Recipes (service template versions) ----
  'recipe/getActive': makeHandler(getActiveRecipeInputSchema, (i) => RecipeService.getActive(db(), TID, i.parentId, i.parentType)),
  'recipe/listVersions': makeHandler(listRecipeVersionsInputSchema, (i) => RecipeService.listVersions(db(), TID, i.parentId, i.parentType)),
  'recipe/saveVersion': makeHandler(saveRecipeVersionInputSchema, (i) => RecipeService.saveVersion(db(), TID, i, actor())),

  // ---- Invoices (JSON routes; attachPdf/parse deferred — binary) ----
  'invoice/list': makeHandler(listInvoicesInputSchema, (i) => InvoiceService.list(db(), TID, i)),
  'invoice/get': makeHandler(getInvoiceInputSchema, (i) => InvoiceService.get(db(), TID, i.id)),
  'invoice/createDraft': makeHandler(createInvoiceDraftInputSchema, (i) => InvoiceService.createDraft(db(), TID, i, actor())),
  'invoice/update': makeHandler(updateInvoiceInputSchema, (i) => InvoiceService.update(db(), TID, i, actor())),
  'invoice/replaceLines': makeHandler(replaceInvoiceLinesInputSchema, (i) => InvoiceService.replaceLines(db(), TID, i, actor())),
  'invoice/commit': makeHandler(commitInvoiceInputSchema, (i) => InvoiceService.commit(db(), TID, i, actor())),

  // ---- Supplier item mappings ----
  'supplierItemMapping/suggest': makeHandler(suggestSupplierItemInputSchema, (i) =>
    SupplierItemMappingService.suggest(db(), TID, i.supplierId, i.partial, i.limit),
  ),

  // ---- Stock takes ----
  'stockTake/list': makeHandler(listStockTakesInputSchema, (i) => StockTakeService.list(db(), TID, i)),
  'stockTake/get': makeHandler(getStockTakeInputSchema, (i) => StockTakeService.get(db(), TID, i.id)),
  'stockTake/getInProgress': makeHandler(empty(), () => StockTakeService.getInProgress(db(), TID)),
  'stockTake/start': makeHandler(startStockTakeInputSchema, (i) => StockTakeService.start(db(), TID, i, actor())),
  'stockTake/saveCount': makeHandler(saveStockTakeCountInputSchema, (i) => StockTakeService.saveCount(db(), TID, i)),
  'stockTake/commit': makeHandler(commitStockTakeInputSchema, (i) => StockTakeService.commit(db(), TID, i, actor())),
  'stockTake/discard': makeHandler(discardStockTakeInputSchema, (i) => StockTakeService.discard(db(), TID, i, actor())),

  // ---- Dashboard ----
  'dashboard/stockValue': makeHandler(empty(), () => DashboardService.stockValue(db(), TID)),
  'dashboard/stockValueSeries': makeHandler(rangedQuerySchema, (i) => DashboardService.stockValueSeries(db(), TID, i.range)),
  'dashboard/spending': makeHandler(rangedQuerySchema, (i) => DashboardService.spending(db(), TID, i.range)),
  'dashboard/wastage': makeHandler(rangedQuerySchema, (i) => DashboardService.wastage(db(), TID, i.range)),
  'dashboard/lowStock': makeHandler(rangedQuerySchema, (i) => DashboardService.lowStock(db(), TID, i.range)),
  'dashboard/reorder': makeHandler(rangedQuerySchema, (i) => DashboardService.reorder(db(), TID, i.range)),
  'dashboard/costPerBike': makeHandler(rangedQuerySchema, (i) => DashboardService.costPerBike(db(), TID, i.range)),
  'dashboard/costPerBikeType': makeHandler(rangedQuerySchema, (i) => DashboardService.costPerBikeType(db(), TID, i.range)),
  'dashboard/topConsumedParts': makeHandler(rangedQuerySchema, (i) => DashboardService.topConsumedParts(db(), TID, i.range)),
  'dashboard/serviceVolumeByBikeType': makeHandler(rangedQuerySchema, (i) => DashboardService.serviceVolumeByBikeType(db(), TID, i.range)),
  'dashboard/serviceVolumeByBike': makeHandler(rangedQuerySchema, (i) => DashboardService.serviceVolumeByBike(db(), TID, i.range)),
  'dashboard/maintenanceSchedule': makeHandler(empty(), () => DashboardService.maintenanceSchedule(db(), TID)),
  'dashboard/theoreticalServiceCost': makeHandler(empty(), () => DashboardService.theoreticalServiceCost(db(), TID)),

  // ---- Reports ----
  'report/exportCsv': makeHandler(exportReportInputSchema, (i) => ReportService.export(db(), TID, i)),

  // ---- CSV import ----
  'csvImport/template': makeHandler(csvTemplateInputSchema, (i) => CsvTemplateService.template(i.kind)),
  'csvImport/run': makeHandler(csvImportInputSchema, (i) => CsvImportService.run(db(), TID, i, actor())),

  // ---- App settings (chooseDirectory deferred — Electron dialog) ----
  'appSettings/snapshot': makeHandler(empty(), () => AppSettingsService.snapshot(db())),
  'appSettings/setBackupFolder': makeHandler(setBackupFolderInputSchema, async (i) => {
    await AppSettingsService.setBackupFolder(db(), i.folderPath);
    return AppSettingsService.snapshot(db());
  }),
  'appSettings/setBackupTime': makeHandler(setBackupTimeInputSchema, async (i) => {
    await AppSettingsService.setBackupTime(db(), i.dailyAtMinutes);
    return AppSettingsService.snapshot(db());
  }),
  'appSettings/setFirstRunCompleted': makeHandler(setFirstRunInputSchema, async (i) => {
    await AppSettingsService.setFirstRunCompleted(db(), i.completed);
    return AppSettingsService.snapshot(db());
  }),

  // ---- Reconciliation ----
  'reconciliation/latest': makeHandler(empty(), () => latestReconciliationSnapshot()),
  'reconciliation/rerun': makeHandler(empty(), async () => {
    const drifts = await runReconciliation(db(), TID);
    return { ranAtMs: Date.now(), drifts };
  }),

  // ---- Demo seeding (owner-only via ownerGuard) ----
  'demo/seed': makeHandler(demoSeedInputSchema, () => DemoSeedService.run(db(), TID, actor())),
  'demo/seedBikes': makeHandler(demoSeedBikesInputSchema, () => DemoSeedService.seedBikes(db(), TID, actor())),
  'demo/reset': makeHandler(demoResetInputSchema, () => DemoSeedService.reset(db(), TID)),

  // ---- Users (owner-only via ownerGuard) + self password change ----
  'user/list': makeHandler(empty(), () => AuthService.listUsers(db(), TID)),
  'user/create': makeHandler(createUserInputSchema, (i) => AuthService.createUser(db(), TID, i, actor())),
  'user/deactivate': makeHandler(deactivateUserInputSchema, (i) => AuthService.deactivateUser(db(), TID, i.id, actor())),
  'auth/changePassword': makeHandler(changePasswordInputSchema, async (i) => {
    const u = currentUser();
    if (!u) throw new ValidationError('Not signed in');
    await AuthService.changePassword(db(), TID, u.id, i.currentPassword, i.newPassword);
    return { ok: true };
  }),
};
