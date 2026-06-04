import { contextBridge, ipcRenderer } from 'electron';
import { IPC, type IpcResult } from '@shared/schemas/ipc';
import type {
  CreateIngredientInput,
  DeactivateIngredientInput,
  GetIngredientInput,
  Ingredient,
  ListIngredientsInput,
  UpdateIngredientInput,
} from '@shared/schemas/ingredient';
import type {
  CreateSupplierInput,
  DeactivateSupplierInput,
  GetSupplierInput,
  ListSuppliersInput,
  Supplier,
  UpdateSupplierInput,
} from '@shared/schemas/supplier';
import type {
  Bike,
  BikeType,
  CreateBikeInput,
  DeactivateBikeInput,
  GetBikeInput,
  ListBikeTypesInput,
  ListBikesInput,
  UpdateBikeInput,
} from '@shared/schemas/bike';
import type {
  CreateServiceTemplateInput,
  DeactivateServiceTemplateInput,
  GetServiceTemplateInput,
  ListServiceTemplatesInput,
  ServiceTemplate,
  UpdateServiceTemplateInput,
} from '@shared/schemas/serviceTemplate';
import type {
  CancelServiceEventInput,
  CompleteServiceEventInput,
  CreateAdHocServiceEventInput,
  CreateServiceEventInput,
  GetServiceEventInput,
  ListServiceEventsInput,
  ServiceEvent,
  ServiceEventWithCost,
  ServiceEventWithLines,
  SetServiceEventStatusInput,
  UpdateServiceEventLinesInput,
} from '@shared/schemas/serviceEvent';
import type {
  ListStockMovementsInput,
  StockMovement,
} from '@shared/schemas/stockMovement';
import type { ManualAdjustmentInput, RecordPurchaseInput } from '@shared/schemas/inventory';
import type {
  GetActiveRecipeInput,
  ListRecipeVersionsInput,
  RecipeVersion,
  RecipeWithIngredients,
  SaveRecipeVersionInput,
} from '@shared/schemas/recipe';
import type {
  AttachPdfInput,
  CommitInvoiceInput,
  CreateInvoiceDraftInput,
  GetInvoiceInput,
  Invoice,
  InvoiceWithLines,
  ListInvoicesInput,
  ReplaceInvoiceLinesInput,
  UpdateInvoiceInput,
} from '@shared/schemas/invoice';
import type {
  ParseInvoiceInput,
  ParseResult,
} from '@shared/schemas/invoiceParser';
import type {
  SuggestSupplierItemInput,
  SupplierItemMapping,
} from '@shared/schemas/supplierItemMapping';
import type {
  CommitStockTakeInput,
  DiscardStockTakeInput,
  GetStockTakeInput,
  ListStockTakesInput,
  SaveStockTakeCountInput,
  StartStockTakeInput,
  StockTake,
  StockTakeLine,
  StockTakeWithLines,
} from '@shared/schemas/stockTake';
import type {
  CostPerBikeResponse,
  CostPerBikeTypeResponse,
  LowStockResponse,
  MaintenanceScheduleResponse,
  RangedQuery,
  ReorderResponse,
  ServiceVolumeByBikeResponse,
  ServiceVolumeResponse,
  SpendingResponse,
  StockValueResponse,
  StockValueSeriesResponse,
  TheoreticalServiceCostResponse,
  TopConsumedPartsResponse,
  WastageResponse,
} from '@shared/schemas/dashboard';
import type {
  ExportReportInput,
  ExportReportResponse,
} from '@shared/schemas/report';
import type {
  CsvImportInput,
  CsvImportResult,
  CsvTemplateInput,
  CsvTemplateResponse,
} from '@shared/schemas/csvImport';
import type {
  AppSettingsSnapshot,
  ChooseDirectoryInput,
  ChooseDirectoryResponse,
  SetBackupFolderInput,
  SetBackupTimeInput,
  SetFirstRunInput,
} from '@shared/schemas/appSettings';
import type {
  ListBackupsResponse,
  RestoreBackupInput,
  RunBackupInput,
  RunBackupResponse,
} from '@shared/schemas/backup';
import type {
  DemoResetInput,
  DemoResetResult,
  DemoSeedBikesInput,
  DemoSeedBikesResult,
  DemoSeedInput,
  DemoSeedResult,
} from '@shared/schemas/demo';

type ReconciliationSnapshotApi = {
  ranAtMs: number;
  drifts: Array<{
    ingredientId: string;
    ingredientName: string;
    storedStock: number;
    movementSum: number;
    drift: number;
  }>;
};

type Invoke<TIn, TOut> = (input: TIn) => Promise<IpcResult<TOut>>;

const invoke =
  <TIn, TOut>(channel: string): Invoke<TIn, TOut> =>
  (input: TIn) =>
    ipcRenderer.invoke(channel, input) as Promise<IpcResult<TOut>>;

const api = {
  ingredient: {
    list: invoke<ListIngredientsInput, Ingredient[]>(IPC.ingredient.list),
    get: invoke<GetIngredientInput, Ingredient>(IPC.ingredient.get),
    create: invoke<CreateIngredientInput, Ingredient>(IPC.ingredient.create),
    update: invoke<UpdateIngredientInput, Ingredient>(IPC.ingredient.update),
    deactivate: invoke<DeactivateIngredientInput, Ingredient>(IPC.ingredient.deactivate),
  },
  supplier: {
    list: invoke<ListSuppliersInput, Supplier[]>(IPC.supplier.list),
    get: invoke<GetSupplierInput, Supplier>(IPC.supplier.get),
    create: invoke<CreateSupplierInput, Supplier>(IPC.supplier.create),
    update: invoke<UpdateSupplierInput, Supplier>(IPC.supplier.update),
    deactivate: invoke<DeactivateSupplierInput, Supplier>(IPC.supplier.deactivate),
  },
  bike: {
    list: invoke<ListBikesInput, Bike[]>(IPC.bike.list),
    get: invoke<GetBikeInput, Bike>(IPC.bike.get),
    create: invoke<CreateBikeInput, Bike>(IPC.bike.create),
    update: invoke<UpdateBikeInput, Bike>(IPC.bike.update),
    deactivate: invoke<DeactivateBikeInput, Bike>(IPC.bike.deactivate),
    listTypes: invoke<ListBikeTypesInput, BikeType[]>(IPC.bike.listTypes),
  },
  serviceTemplate: {
    list: invoke<ListServiceTemplatesInput, ServiceTemplate[]>(IPC.serviceTemplate.list),
    get: invoke<GetServiceTemplateInput, ServiceTemplate>(IPC.serviceTemplate.get),
    create: invoke<CreateServiceTemplateInput, ServiceTemplate>(IPC.serviceTemplate.create),
    update: invoke<UpdateServiceTemplateInput, ServiceTemplate>(IPC.serviceTemplate.update),
    deactivate: invoke<DeactivateServiceTemplateInput, ServiceTemplate>(
      IPC.serviceTemplate.deactivate,
    ),
  },
  serviceEvent: {
    list: invoke<ListServiceEventsInput, ServiceEvent[]>(IPC.serviceEvent.list),
    listWithLines: invoke<ListServiceEventsInput, ServiceEventWithCost[]>(
      IPC.serviceEvent.listWithLines,
    ),
    get: invoke<GetServiceEventInput, ServiceEventWithLines>(IPC.serviceEvent.get),
    create: invoke<CreateServiceEventInput, ServiceEventWithLines>(IPC.serviceEvent.create),
    createAdHoc: invoke<CreateAdHocServiceEventInput, ServiceEventWithLines>(
      IPC.serviceEvent.createAdHoc,
    ),
    updateLines: invoke<UpdateServiceEventLinesInput, ServiceEventWithLines>(
      IPC.serviceEvent.updateLines,
    ),
    complete: invoke<CompleteServiceEventInput, ServiceEventWithLines>(
      IPC.serviceEvent.complete,
    ),
    setStatus: invoke<SetServiceEventStatusInput, ServiceEventWithLines>(
      IPC.serviceEvent.setStatus,
    ),
    cancel: invoke<CancelServiceEventInput, ServiceEventWithLines>(IPC.serviceEvent.cancel),
  },
  stockMovement: {
    list: invoke<ListStockMovementsInput, StockMovement[]>(IPC.stockMovement.list),
  },
  inventory: {
    applyMovement: invoke<
      ManualAdjustmentInput,
      { movement: StockMovement; newStockQuantity: number }
    >(IPC.inventory.applyMovement),
    recordPurchase: invoke<
      RecordPurchaseInput,
      { movement: StockMovement; newStockQuantity: number }
    >(IPC.inventory.recordPurchase),
  },
  recipe: {
    getActive: invoke<GetActiveRecipeInput, RecipeWithIngredients | null>(IPC.recipe.getActive),
    listVersions: invoke<ListRecipeVersionsInput, RecipeVersion[]>(IPC.recipe.listVersions),
    saveVersion: invoke<SaveRecipeVersionInput, RecipeWithIngredients>(IPC.recipe.saveVersion),
  },
  invoice: {
    list: invoke<ListInvoicesInput, Invoice[]>(IPC.invoice.list),
    get: invoke<GetInvoiceInput, InvoiceWithLines>(IPC.invoice.get),
    createDraft: invoke<CreateInvoiceDraftInput, InvoiceWithLines>(IPC.invoice.createDraft),
    update: invoke<UpdateInvoiceInput, InvoiceWithLines>(IPC.invoice.update),
    replaceLines: invoke<ReplaceInvoiceLinesInput, InvoiceWithLines>(IPC.invoice.replaceLines),
    commit: invoke<CommitInvoiceInput, InvoiceWithLines>(IPC.invoice.commit),
    attachPdf: invoke<AttachPdfInput, Invoice>(IPC.invoice.attachPdf),
    parse: invoke<ParseInvoiceInput, ParseResult>(IPC.invoice.parse),
  },
  supplierItemMapping: {
    suggest: invoke<SuggestSupplierItemInput, SupplierItemMapping[]>(
      IPC.supplierItemMapping.suggest,
    ),
  },
  stockTake: {
    list: invoke<ListStockTakesInput, StockTake[]>(IPC.stockTake.list),
    get: invoke<GetStockTakeInput, StockTakeWithLines>(IPC.stockTake.get),
    getInProgress: invoke<Record<string, never>, StockTakeWithLines | null>(
      IPC.stockTake.getInProgress,
    ),
    start: invoke<StartStockTakeInput, StockTakeWithLines>(IPC.stockTake.start),
    saveCount: invoke<SaveStockTakeCountInput, StockTakeLine>(IPC.stockTake.saveCount),
    commit: invoke<CommitStockTakeInput, StockTakeWithLines>(IPC.stockTake.commit),
    discard: invoke<DiscardStockTakeInput, StockTakeWithLines>(IPC.stockTake.discard),
  },
  dashboard: {
    stockValue: invoke<Record<string, never>, StockValueResponse>(IPC.dashboard.stockValue),
    stockValueSeries: invoke<RangedQuery, StockValueSeriesResponse>(IPC.dashboard.stockValueSeries),
    spending: invoke<RangedQuery, SpendingResponse>(IPC.dashboard.spending),
    wastage: invoke<RangedQuery, WastageResponse>(IPC.dashboard.wastage),
    lowStock: invoke<RangedQuery, LowStockResponse>(IPC.dashboard.lowStock),
    reorder: invoke<RangedQuery, ReorderResponse>(IPC.dashboard.reorder),
    costPerBike: invoke<RangedQuery, CostPerBikeResponse>(IPC.dashboard.costPerBike),
    costPerBikeType: invoke<RangedQuery, CostPerBikeTypeResponse>(
      IPC.dashboard.costPerBikeType,
    ),
    topConsumedParts: invoke<RangedQuery, TopConsumedPartsResponse>(
      IPC.dashboard.topConsumedParts,
    ),
    serviceVolumeByBikeType: invoke<RangedQuery, ServiceVolumeResponse>(
      IPC.dashboard.serviceVolumeByBikeType,
    ),
    serviceVolumeByBike: invoke<RangedQuery, ServiceVolumeByBikeResponse>(
      IPC.dashboard.serviceVolumeByBike,
    ),
    maintenanceSchedule: invoke<Record<string, never>, MaintenanceScheduleResponse>(
      IPC.dashboard.maintenanceSchedule,
    ),
    theoreticalServiceCost: invoke<Record<string, never>, TheoreticalServiceCostResponse>(
      IPC.dashboard.theoreticalServiceCost,
    ),
  },
  report: {
    exportCsv: invoke<ExportReportInput, ExportReportResponse>(IPC.report.exportCsv),
  },
  csvImport: {
    template: invoke<CsvTemplateInput, CsvTemplateResponse>(IPC.csvImport.template),
    run: invoke<CsvImportInput, CsvImportResult>(IPC.csvImport.run),
  },
  appSettings: {
    snapshot: invoke<Record<string, never>, AppSettingsSnapshot>(IPC.appSettings.snapshot),
    setBackupFolder: invoke<SetBackupFolderInput, AppSettingsSnapshot>(
      IPC.appSettings.setBackupFolder,
    ),
    setBackupTime: invoke<SetBackupTimeInput, AppSettingsSnapshot>(IPC.appSettings.setBackupTime),
    setFirstRunCompleted: invoke<SetFirstRunInput, AppSettingsSnapshot>(
      IPC.appSettings.setFirstRunCompleted,
    ),
    chooseDirectory: invoke<ChooseDirectoryInput, ChooseDirectoryResponse>(
      IPC.appSettings.chooseDirectory,
    ),
  },
  backup: {
    list: invoke<Record<string, never>, ListBackupsResponse>(IPC.backup.list),
    runNow: invoke<RunBackupInput, RunBackupResponse>(IPC.backup.runNow),
    restore: invoke<RestoreBackupInput, { ok: true }>(IPC.backup.restore),
  },
  reconciliation: {
    latest: invoke<Record<string, never>, ReconciliationSnapshotApi | null>(
      IPC.reconciliation.latest,
    ),
    rerun: invoke<Record<string, never>, ReconciliationSnapshotApi>(IPC.reconciliation.rerun),
  },
  demo: {
    seed: invoke<DemoSeedInput, DemoSeedResult>(IPC.demo.seed),
    seedBikes: invoke<DemoSeedBikesInput, DemoSeedBikesResult>(IPC.demo.seedBikes),
    reset: invoke<DemoResetInput, DemoResetResult>(IPC.demo.reset),
  },
} as const;

export type HyprrideBridge = typeof api;

contextBridge.exposeInMainWorld('hyprride', api);
