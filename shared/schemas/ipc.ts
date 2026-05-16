/**
 * IPC error shape returned by every wrapped handler. Kept as a plain TS type
 * (no zod) so this module — which also hosts the `IPC` channel registry —
 * doesn't pull zod into the Electron preload. Sandboxed preloads can only
 * `require()` Electron's allowlist; importing zod here would silently break
 * `window.hyprride` exposure.
 */
export type IpcErrorCode =
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'VALIDATION'
  | 'INVARIANT_VIOLATION'
  | 'UNKNOWN';

export type IpcError = {
  code: IpcErrorCode;
  message: string;
  fields?: Record<string, string>;
};

export type IpcResult<T> = { ok: true; data: T } | { ok: false; error: IpcError };

export const IPC = {
  ingredient: {
    list: 'ingredient:list',
    get: 'ingredient:get',
    create: 'ingredient:create',
    update: 'ingredient:update',
    deactivate: 'ingredient:deactivate',
  },
  supplier: {
    list: 'supplier:list',
    get: 'supplier:get',
    create: 'supplier:create',
    update: 'supplier:update',
    deactivate: 'supplier:deactivate',
  },
  bike: {
    list: 'bike:list',
    get: 'bike:get',
    create: 'bike:create',
    update: 'bike:update',
    deactivate: 'bike:deactivate',
    listTypes: 'bike:listTypes',
  },
  serviceTemplate: {
    list: 'serviceTemplate:list',
    get: 'serviceTemplate:get',
    create: 'serviceTemplate:create',
    update: 'serviceTemplate:update',
    deactivate: 'serviceTemplate:deactivate',
  },
  serviceEvent: {
    list: 'serviceEvent:list',
    get: 'serviceEvent:get',
    create: 'serviceEvent:create',
    updateLines: 'serviceEvent:updateLines',
    complete: 'serviceEvent:complete',
    cancel: 'serviceEvent:cancel',
  },
  stockMovement: {
    list: 'stockMovement:list',
  },
  inventory: {
    applyMovement: 'inventory:applyMovement',
  },
  recipe: {
    getActive: 'recipe:getActive',
    listVersions: 'recipe:listVersions',
    saveVersion: 'recipe:saveVersion',
  },
  invoice: {
    list: 'invoice:list',
    get: 'invoice:get',
    createDraft: 'invoice:createDraft',
    update: 'invoice:update',
    replaceLines: 'invoice:replaceLines',
    commit: 'invoice:commit',
    attachPdf: 'invoice:attachPdf',
    parse: 'invoice:parse',
  },
  supplierItemMapping: {
    suggest: 'supplierItemMapping:suggest',
  },
  stockTake: {
    list: 'stockTake:list',
    get: 'stockTake:get',
    getInProgress: 'stockTake:getInProgress',
    start: 'stockTake:start',
    saveCount: 'stockTake:saveCount',
    commit: 'stockTake:commit',
    discard: 'stockTake:discard',
  },
  dashboard: {
    stockValue: 'dashboard:stockValue',
    stockValueSeries: 'dashboard:stockValueSeries',
    spending: 'dashboard:spending',
    wastage: 'dashboard:wastage',
    lowStock: 'dashboard:lowStock',
    reorder: 'dashboard:reorder',
    costPerBike: 'dashboard:costPerBike',
    costPerBikeType: 'dashboard:costPerBikeType',
    topConsumedParts: 'dashboard:topConsumedParts',
    serviceVolumeByBikeType: 'dashboard:serviceVolumeByBikeType',
    theoreticalServiceCost: 'dashboard:theoreticalServiceCost',
  },
  report: {
    exportCsv: 'report:exportCsv',
  },
  csvImport: {
    template: 'csvImport:template',
    run: 'csvImport:run',
  },
  appSettings: {
    snapshot: 'appSettings:snapshot',
    setBackupFolder: 'appSettings:setBackupFolder',
    setBackupTime: 'appSettings:setBackupTime',
    setFirstRunCompleted: 'appSettings:setFirstRunCompleted',
    chooseDirectory: 'appSettings:chooseDirectory',
  },
  backup: {
    list: 'backup:list',
    runNow: 'backup:runNow',
    restore: 'backup:restore',
  },
  reconciliation: {
    latest: 'reconciliation:latest',
    rerun: 'reconciliation:rerun',
  },
} as const;
