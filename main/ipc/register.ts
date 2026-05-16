import { registerAppSettingsHandlers } from './handlers/appSettings';
import { registerBackupHandlers } from './handlers/backup';
import { registerBikeHandlers } from './handlers/bike';
import { registerCsvImportHandlers } from './handlers/csvImport';
import { registerDashboardHandlers } from './handlers/dashboard';
import { registerIngredientHandlers } from './handlers/ingredient';
import { registerInventoryHandlers } from './handlers/inventory';
import { registerInvoiceHandlers } from './handlers/invoice';
import { registerReconciliationHandlers } from './handlers/reconciliation';
import { registerRecipeHandlers } from './handlers/recipe';
import { registerReportHandlers } from './handlers/report';
import { registerServiceEventHandlers } from './handlers/serviceEvent';
import { registerServiceTemplateHandlers } from './handlers/serviceTemplate';
import { registerStockMovementHandlers } from './handlers/stockMovement';
import { registerStockTakeHandlers } from './handlers/stockTake';
import { registerSupplierHandlers } from './handlers/supplier';
import { registerSupplierItemMappingHandlers } from './handlers/supplierItemMapping';

export function registerIpcHandlers(): void {
  registerIngredientHandlers();
  registerSupplierHandlers();
  registerBikeHandlers();
  registerServiceTemplateHandlers();
  registerServiceEventHandlers();
  registerStockMovementHandlers();
  registerInventoryHandlers();
  registerRecipeHandlers();
  registerInvoiceHandlers();
  registerSupplierItemMappingHandlers();
  registerStockTakeHandlers();
  registerDashboardHandlers();
  registerReportHandlers();
  registerCsvImportHandlers();
  registerAppSettingsHandlers();
  registerBackupHandlers();
  registerReconciliationHandlers();
}
