/**
 * The renderer-facing API surface, as a pure (Electron-free) type.
 *
 * This used to live in preload/index.ts as `typeof api`. With the web
 * migration the renderer talks to the Hono API over fetch (renderer/lib/
 * webBridge.ts synthesizes `window.hyprride` from this shape), so the type was
 * relocated here — out of the deleted Electron preload — and depends only on
 * the shared Zod-derived types.
 */
import type { IpcResult } from './schemas/ipc';
import type {
  CreateIngredientInput,
  DeactivateIngredientInput,
  GetIngredientInput,
  Ingredient,
  ListIngredientsInput,
  UpdateIngredientInput,
} from './schemas/ingredient';
import type {
  CreateSupplierInput,
  DeactivateSupplierInput,
  GetSupplierInput,
  ListSuppliersInput,
  Supplier,
  UpdateSupplierInput,
} from './schemas/supplier';
import type {
  Bike,
  BikeType,
  CreateBikeInput,
  DeactivateBikeInput,
  GetBikeInput,
  ListBikeTypesInput,
  ListBikesInput,
  UpdateBikeInput,
} from './schemas/bike';
import type {
  CreateServiceTemplateInput,
  DeactivateServiceTemplateInput,
  GetServiceTemplateInput,
  ListServiceTemplatesInput,
  ServiceTemplate,
  UpdateServiceTemplateInput,
} from './schemas/serviceTemplate';
import type {
  CancelServiceEventInput,
  CompleteServiceEventInput,
  CreateAdHocServiceEventInput,
  CreateServiceEventInput,
  DeleteServiceEventInput,
  GetServiceEventInput,
  ListServiceEventsInput,
  ServiceEvent,
  ServiceEventWithCost,
  ServiceEventWithLines,
  SetServiceEventStatusInput,
  UpdateServiceEventInput,
  UpdateServiceEventLinesInput,
} from './schemas/serviceEvent';
import type { ListStockMovementsInput, StockMovement } from './schemas/stockMovement';
import type { ManualAdjustmentInput, RecordPurchaseInput } from './schemas/inventory';
import type {
  GetActiveRecipeInput,
  ListRecipeVersionsInput,
  RecipeVersion,
  RecipeWithIngredients,
  SaveRecipeVersionInput,
} from './schemas/recipe';
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
} from './schemas/invoice';
import type { ParseInvoiceInput, ParseResult } from './schemas/invoiceParser';
import type {
  SuggestSupplierItemInput,
  SupplierItemMapping,
} from './schemas/supplierItemMapping';
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
} from './schemas/stockTake';
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
} from './schemas/dashboard';
import type { ExportReportInput, ExportReportResponse } from './schemas/report';
import type {
  CsvImportInput,
  CsvImportResult,
  CsvTemplateInput,
  CsvTemplateResponse,
} from './schemas/csvImport';
import type {
  AppSettingsSnapshot,
  ChooseDirectoryInput,
  ChooseDirectoryResponse,
  SetBackupFolderInput,
  SetBackupTimeInput,
  SetFirstRunInput,
} from './schemas/appSettings';
import type {
  ListBackupsResponse,
  RestoreBackupInput,
  RunBackupInput,
  RunBackupResponse,
} from './schemas/backup';
import type {
  DemoResetInput,
  DemoResetResult,
  DemoSeedBikesInput,
  DemoSeedBikesResult,
  DemoSeedInput,
  DemoSeedResult,
} from './schemas/demo';

export type ReconciliationSnapshotApi = {
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

export type HyprrideBridge = {
  ingredient: {
    list: Invoke<ListIngredientsInput, Ingredient[]>;
    get: Invoke<GetIngredientInput, Ingredient>;
    create: Invoke<CreateIngredientInput, Ingredient>;
    update: Invoke<UpdateIngredientInput, Ingredient>;
    deactivate: Invoke<DeactivateIngredientInput, Ingredient>;
  };
  supplier: {
    list: Invoke<ListSuppliersInput, Supplier[]>;
    get: Invoke<GetSupplierInput, Supplier>;
    create: Invoke<CreateSupplierInput, Supplier>;
    update: Invoke<UpdateSupplierInput, Supplier>;
    deactivate: Invoke<DeactivateSupplierInput, Supplier>;
  };
  bike: {
    list: Invoke<ListBikesInput, Bike[]>;
    get: Invoke<GetBikeInput, Bike>;
    create: Invoke<CreateBikeInput, Bike>;
    update: Invoke<UpdateBikeInput, Bike>;
    deactivate: Invoke<DeactivateBikeInput, Bike>;
    listTypes: Invoke<ListBikeTypesInput, BikeType[]>;
  };
  serviceTemplate: {
    list: Invoke<ListServiceTemplatesInput, ServiceTemplate[]>;
    get: Invoke<GetServiceTemplateInput, ServiceTemplate>;
    create: Invoke<CreateServiceTemplateInput, ServiceTemplate>;
    update: Invoke<UpdateServiceTemplateInput, ServiceTemplate>;
    deactivate: Invoke<DeactivateServiceTemplateInput, ServiceTemplate>;
  };
  serviceEvent: {
    list: Invoke<ListServiceEventsInput, ServiceEvent[]>;
    listWithLines: Invoke<ListServiceEventsInput, ServiceEventWithCost[]>;
    get: Invoke<GetServiceEventInput, ServiceEventWithLines>;
    create: Invoke<CreateServiceEventInput, ServiceEventWithLines>;
    createAdHoc: Invoke<CreateAdHocServiceEventInput, ServiceEventWithLines>;
    updateLines: Invoke<UpdateServiceEventLinesInput, ServiceEventWithLines>;
    update: Invoke<UpdateServiceEventInput, ServiceEventWithLines>;
    complete: Invoke<CompleteServiceEventInput, ServiceEventWithLines>;
    setStatus: Invoke<SetServiceEventStatusInput, ServiceEventWithLines>;
    cancel: Invoke<CancelServiceEventInput, ServiceEventWithLines>;
    remove: Invoke<DeleteServiceEventInput, { id: string }>;
  };
  stockMovement: {
    list: Invoke<ListStockMovementsInput, StockMovement[]>;
  };
  inventory: {
    applyMovement: Invoke<ManualAdjustmentInput, { movement: StockMovement; newStockQuantity: number }>;
    recordPurchase: Invoke<RecordPurchaseInput, { movement: StockMovement; newStockQuantity: number }>;
  };
  recipe: {
    getActive: Invoke<GetActiveRecipeInput, RecipeWithIngredients | null>;
    listVersions: Invoke<ListRecipeVersionsInput, RecipeVersion[]>;
    saveVersion: Invoke<SaveRecipeVersionInput, RecipeWithIngredients>;
  };
  invoice: {
    list: Invoke<ListInvoicesInput, Invoice[]>;
    get: Invoke<GetInvoiceInput, InvoiceWithLines>;
    createDraft: Invoke<CreateInvoiceDraftInput, InvoiceWithLines>;
    update: Invoke<UpdateInvoiceInput, InvoiceWithLines>;
    replaceLines: Invoke<ReplaceInvoiceLinesInput, InvoiceWithLines>;
    commit: Invoke<CommitInvoiceInput, InvoiceWithLines>;
    attachPdf: Invoke<AttachPdfInput, Invoice>;
    parse: Invoke<ParseInvoiceInput, ParseResult>;
  };
  supplierItemMapping: {
    suggest: Invoke<SuggestSupplierItemInput, SupplierItemMapping[]>;
  };
  stockTake: {
    list: Invoke<ListStockTakesInput, StockTake[]>;
    get: Invoke<GetStockTakeInput, StockTakeWithLines>;
    getInProgress: Invoke<Record<string, never>, StockTakeWithLines | null>;
    start: Invoke<StartStockTakeInput, StockTakeWithLines>;
    saveCount: Invoke<SaveStockTakeCountInput, StockTakeLine>;
    commit: Invoke<CommitStockTakeInput, StockTakeWithLines>;
    discard: Invoke<DiscardStockTakeInput, StockTakeWithLines>;
  };
  dashboard: {
    stockValue: Invoke<Record<string, never>, StockValueResponse>;
    stockValueSeries: Invoke<RangedQuery, StockValueSeriesResponse>;
    spending: Invoke<RangedQuery, SpendingResponse>;
    wastage: Invoke<RangedQuery, WastageResponse>;
    lowStock: Invoke<RangedQuery, LowStockResponse>;
    reorder: Invoke<RangedQuery, ReorderResponse>;
    costPerBike: Invoke<RangedQuery, CostPerBikeResponse>;
    costPerBikeType: Invoke<RangedQuery, CostPerBikeTypeResponse>;
    topConsumedParts: Invoke<RangedQuery, TopConsumedPartsResponse>;
    serviceVolumeByBikeType: Invoke<RangedQuery, ServiceVolumeResponse>;
    serviceVolumeByBike: Invoke<RangedQuery, ServiceVolumeByBikeResponse>;
    maintenanceSchedule: Invoke<Record<string, never>, MaintenanceScheduleResponse>;
    theoreticalServiceCost: Invoke<Record<string, never>, TheoreticalServiceCostResponse>;
  };
  report: {
    exportCsv: Invoke<ExportReportInput, ExportReportResponse>;
  };
  csvImport: {
    template: Invoke<CsvTemplateInput, CsvTemplateResponse>;
    run: Invoke<CsvImportInput, CsvImportResult>;
  };
  appSettings: {
    snapshot: Invoke<Record<string, never>, AppSettingsSnapshot>;
    setBackupFolder: Invoke<SetBackupFolderInput, AppSettingsSnapshot>;
    setBackupTime: Invoke<SetBackupTimeInput, AppSettingsSnapshot>;
    setFirstRunCompleted: Invoke<SetFirstRunInput, AppSettingsSnapshot>;
    chooseDirectory: Invoke<ChooseDirectoryInput, ChooseDirectoryResponse>;
  };
  backup: {
    list: Invoke<Record<string, never>, ListBackupsResponse>;
    runNow: Invoke<RunBackupInput, RunBackupResponse>;
    restore: Invoke<RestoreBackupInput, { ok: true }>;
  };
  reconciliation: {
    latest: Invoke<Record<string, never>, ReconciliationSnapshotApi | null>;
    rerun: Invoke<Record<string, never>, ReconciliationSnapshotApi>;
  };
  demo: {
    seed: Invoke<DemoSeedInput, DemoSeedResult>;
    seedBikes: Invoke<DemoSeedBikesInput, DemoSeedBikesResult>;
    reset: Invoke<DemoResetInput, DemoResetResult>;
  };
};
