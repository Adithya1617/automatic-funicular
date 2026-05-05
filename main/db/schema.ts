import { index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * Conventions
 * -----------
 * - Every entity has UUID v7 text PKs (`id`).
 * - Every entity has `tenant_id` (integer) — v1 uses DEFAULT_TENANT_ID = 1.
 * - Audit columns: `created_at`, `updated_at` as Unix milliseconds (integer);
 *   `created_by`, `updated_by` are SYSTEM_USER_ID until auth lands.
 * - Stick to PostgreSQL-compatible SQL — no `INSERT OR REPLACE`, no autoincrement.
 */

const audit = {
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  createdBy: text('created_by').notNull(),
  updatedBy: text('updated_by').notNull(),
};

export const tenants = sqliteTable('tenants', {
  id: integer('id').primaryKey(),
  name: text('name').notNull(),
  createdAt: integer('created_at').notNull(),
});

export const appSettings = sqliteTable('app_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const ingredients = sqliteTable(
  'ingredients',
  {
    id: text('id').primaryKey(),
    tenantId: integer('tenant_id').notNull(),
    name: text('name').notNull(),
    category: text('category').notNull(),
    type: text('type', { enum: ['raw', 'prepared'] }).notNull(),
    baseUnit: text('base_unit', { enum: ['g', 'ml', 'each'] }).notNull(),
    stockQuantity: real('stock_quantity').notNull().default(0),
    reservedQuantity: real('reserved_quantity').notNull().default(0),
    lowStockThreshold: real('low_stock_threshold').notNull().default(0),
    currentAvgCostPerUnit: real('current_avg_cost_per_unit').notNull().default(0),
    densityGPerMl: real('density_g_per_ml'),
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
    ...audit,
  },
  (t) => ({
    tenantNameIdx: index('idx_ingredients_tenant_name').on(t.tenantId, t.name),
    tenantActiveIdx: index('idx_ingredients_tenant_active').on(t.tenantId, t.isActive),
  }),
);

export const suppliers = sqliteTable(
  'suppliers',
  {
    id: text('id').primaryKey(),
    tenantId: integer('tenant_id').notNull(),
    name: text('name').notNull(),
    contactInfo: text('contact_info'),
    notes: text('notes'),
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
    ...audit,
  },
  (t) => ({
    tenantNameIdx: index('idx_suppliers_tenant_name').on(t.tenantId, t.name),
  }),
);

export const stockMovements = sqliteTable(
  'stock_movements',
  {
    id: text('id').primaryKey(),
    tenantId: integer('tenant_id').notNull(),
    ingredientId: text('ingredient_id')
      .notNull()
      .references(() => ingredients.id),
    changeQuantity: real('change_quantity').notNull(),
    costPerUnitAtTime: real('cost_per_unit_at_time'),
    reason: text('reason', {
      enum: [
        'purchase',
        'sale',
        'sale_reversal',
        'wastage',
        'prep_loss',
        'production_input',
        'production_output',
        'adjustment',
        'staff_meal',
      ],
    }).notNull(),
    referenceType: text('reference_type', {
      enum: ['invoice_line', 'order_line', 'production_batch', 'stock_take', 'manual'],
    }).notNull(),
    referenceId: text('reference_id'),
    notes: text('notes'),
    occurredAt: integer('occurred_at').notNull(),
    createdAt: integer('created_at').notNull(),
    createdBy: text('created_by').notNull(),
  },
  (t) => ({
    ingredientOccurredAtIdx: index('idx_movements_ingredient_occurred_at').on(
      t.ingredientId,
      t.occurredAt,
    ),
    reasonOccurredAtIdx: index('idx_movements_reason_occurred_at').on(
      t.reason,
      t.occurredAt,
    ),
    referenceIdx: index('idx_movements_reference').on(t.referenceType, t.referenceId),
  }),
);

export const recipeVersions = sqliteTable(
  'recipe_versions',
  {
    id: text('id').primaryKey(),
    tenantId: integer('tenant_id').notNull(),
    parentId: text('parent_id').notNull(),
    parentType: text('parent_type', { enum: ['menu_item', 'ingredient'] }).notNull(),
    versionNumber: integer('version_number').notNull(),
    isCurrent: integer('is_current', { mode: 'boolean' }).notNull().default(false),
    targetYield: real('target_yield').notNull().default(1),
    notes: text('notes'),
    createdAt: integer('created_at').notNull(),
    createdBy: text('created_by').notNull(),
  },
  (t) => ({
    parentCurrentIdx: index('idx_recipe_versions_parent_current').on(
      t.tenantId,
      t.parentId,
      t.parentType,
      t.isCurrent,
    ),
  }),
);

export const recipeIngredients = sqliteTable(
  'recipe_ingredients',
  {
    id: text('id').primaryKey(),
    recipeVersionId: text('recipe_version_id')
      .notNull()
      .references(() => recipeVersions.id),
    childIngredientId: text('child_ingredient_id')
      .notNull()
      .references(() => ingredients.id),
    quantity: real('quantity').notNull(),
    unit: text('unit').notNull(),
    notes: text('notes'),
    displayOrder: integer('display_order').notNull().default(0),
  },
  (t) => ({
    versionIdx: index('idx_recipe_ingredients_version').on(t.recipeVersionId),
  }),
);

export const menuItems = sqliteTable(
  'menu_items',
  {
    id: text('id').primaryKey(),
    tenantId: integer('tenant_id').notNull(),
    name: text('name').notNull(),
    category: text('category').notNull(),
    sellingPrice: real('selling_price').notNull().default(0),
    variantGroupId: text('variant_group_id'),
    displayOrder: integer('display_order').notNull().default(0),
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
    ...audit,
  },
  (t) => ({
    tenantNameIdx: index('idx_menu_items_tenant_name').on(t.tenantId, t.name),
    tenantCategoryIdx: index('idx_menu_items_tenant_category').on(t.tenantId, t.category),
    tenantVariantIdx: index('idx_menu_items_tenant_variant').on(t.tenantId, t.variantGroupId),
  }),
);

export const menuItemAvailability = sqliteTable(
  'menu_item_availability',
  {
    id: text('id').primaryKey(),
    tenantId: integer('tenant_id').notNull(),
    menuItemId: text('menu_item_id')
      .notNull()
      .references(() => menuItems.id),
    maxServingsAvailable: real('max_servings_available').notNull().default(0),
    bottleneckIngredientId: text('bottleneck_ingredient_id'),
    lastComputedAt: integer('last_computed_at').notNull(),
  },
  (t) => ({
    tenantMenuItemIdx: index('idx_availability_tenant_menu_item').on(
      t.tenantId,
      t.menuItemId,
    ),
  }),
);

export const productionBatches = sqliteTable(
  'production_batches',
  {
    id: text('id').primaryKey(),
    tenantId: integer('tenant_id').notNull(),
    preparedIngredientId: text('prepared_ingredient_id')
      .notNull()
      .references(() => ingredients.id),
    recipeVersionId: text('recipe_version_id')
      .notNull()
      .references(() => recipeVersions.id),
    expectedYield: real('expected_yield').notNull(),
    actualYield: real('actual_yield').notNull(),
    producedAt: integer('produced_at').notNull(),
    notes: text('notes'),
    ...audit,
  },
  (t) => ({
    ingredientProducedAtIdx: index('idx_batches_ingredient_produced_at').on(
      t.tenantId,
      t.preparedIngredientId,
      t.producedAt,
    ),
  }),
);

export type IngredientRow = typeof ingredients.$inferSelect;
export type IngredientInsert = typeof ingredients.$inferInsert;
export type SupplierRow = typeof suppliers.$inferSelect;
export type SupplierInsert = typeof suppliers.$inferInsert;
export type StockMovementRow = typeof stockMovements.$inferSelect;
export type StockMovementInsert = typeof stockMovements.$inferInsert;
export type RecipeVersionRow = typeof recipeVersions.$inferSelect;
export type RecipeVersionInsert = typeof recipeVersions.$inferInsert;
export type RecipeIngredientRow = typeof recipeIngredients.$inferSelect;
export type RecipeIngredientInsert = typeof recipeIngredients.$inferInsert;
export const orders = sqliteTable(
  'orders',
  {
    id: text('id').primaryKey(),
    tenantId: integer('tenant_id').notNull(),
    externalOrderId: text('external_order_id'),
    source: text('source', {
      enum: [
        'swiggy',
        'zomato',
        'offline_pos',
        'manual_entry',
        'mock_online',
        'mock_offline',
      ],
    }).notNull(),
    placedAt: integer('placed_at').notNull(),
    deliveredAt: integer('delivered_at'),
    cancelledAt: integer('cancelled_at'),
    cancelledPrepared: integer('cancelled_prepared', { mode: 'boolean' }),
    status: text('status', {
      enum: ['pending', 'preparing', 'delivered', 'cancelled'],
    })
      .notNull()
      .default('pending'),
    totalAmount: real('total_amount').notNull().default(0),
    notes: text('notes'),
    ...audit,
  },
  (t) => ({
    tenantStatusIdx: index('idx_orders_tenant_status_placed_at').on(
      t.tenantId,
      t.status,
      t.placedAt,
    ),
    tenantSourceIdx: index('idx_orders_tenant_source_placed_at').on(
      t.tenantId,
      t.source,
      t.placedAt,
    ),
  }),
);

export const orderLines = sqliteTable(
  'order_lines',
  {
    id: text('id').primaryKey(),
    orderId: text('order_id')
      .notNull()
      .references(() => orders.id),
    menuItemId: text('menu_item_id')
      .notNull()
      .references(() => menuItems.id),
    quantity: integer('quantity').notNull(),
    unitPrice: real('unit_price').notNull().default(0),
    recipeVersionId: text('recipe_version_id')
      .notNull()
      .references(() => recipeVersions.id),
  },
  (t) => ({
    orderIdx: index('idx_order_lines_order').on(t.orderId),
  }),
);

export const orderingChannels = sqliteTable(
  'ordering_channels',
  {
    id: text('id').primaryKey(),
    tenantId: integer('tenant_id').notNull(),
    key: text('key').notNull(),
    displayName: text('display_name').notNull(),
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
    pollingIntervalSeconds: integer('polling_interval_seconds').notNull().default(30),
    isMock: integer('is_mock', { mode: 'boolean' }).notNull().default(false),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => ({
    tenantKeyIdx: index('idx_ordering_channels_tenant_key').on(t.tenantId, t.key),
  }),
);

export type ProductionBatchRow = typeof productionBatches.$inferSelect;
export type ProductionBatchInsert = typeof productionBatches.$inferInsert;
export type MenuItemRow = typeof menuItems.$inferSelect;
export type MenuItemInsert = typeof menuItems.$inferInsert;
export type MenuItemAvailabilityRow = typeof menuItemAvailability.$inferSelect;
export type MenuItemAvailabilityInsert = typeof menuItemAvailability.$inferInsert;
export type OrderRow = typeof orders.$inferSelect;
export type OrderInsert = typeof orders.$inferInsert;
export type OrderLineRow = typeof orderLines.$inferSelect;
export type OrderLineInsert = typeof orderLines.$inferInsert;
export type OrderingChannelRow = typeof orderingChannels.$inferSelect;
export type OrderingChannelInsert = typeof orderingChannels.$inferInsert;

export const invoices = sqliteTable(
  'invoices',
  {
    id: text('id').primaryKey(),
    tenantId: integer('tenant_id').notNull(),
    supplierId: text('supplier_id')
      .notNull()
      .references(() => suppliers.id),
    invoiceNumber: text('invoice_number').notNull(),
    invoiceDate: integer('invoice_date').notNull(),
    totalAmount: real('total_amount').notNull().default(0),
    filePath: text('file_path'),
    status: text('status', { enum: ['draft', 'committed'] })
      .notNull()
      .default('draft'),
    notes: text('notes'),
    committedAt: integer('committed_at'),
    ...audit,
  },
  (t) => ({
    tenantSupplierIdx: index('idx_invoices_tenant_supplier').on(t.tenantId, t.supplierId),
    tenantStatusIdx: index('idx_invoices_tenant_status_date').on(
      t.tenantId,
      t.status,
      t.invoiceDate,
    ),
  }),
);

export const invoiceLines = sqliteTable(
  'invoice_lines',
  {
    id: text('id').primaryKey(),
    invoiceId: text('invoice_id')
      .notNull()
      .references(() => invoices.id),
    rawDescription: text('raw_description').notNull(),
    ingredientId: text('ingredient_id').references(() => ingredients.id),
    quantity: real('quantity').notNull(),
    unit: text('unit').notNull(),
    unitCost: real('unit_cost').notNull(),
    totalCost: real('total_cost').notNull(),
    displayOrder: integer('display_order').notNull().default(0),
  },
  (t) => ({
    invoiceIdx: index('idx_invoice_lines_invoice').on(t.invoiceId),
  }),
);

export const supplierItemMappings = sqliteTable(
  'supplier_item_mappings',
  {
    id: text('id').primaryKey(),
    tenantId: integer('tenant_id').notNull(),
    supplierId: text('supplier_id')
      .notNull()
      .references(() => suppliers.id),
    rawDescription: text('raw_description').notNull(),
    ingredientId: text('ingredient_id')
      .notNull()
      .references(() => ingredients.id),
    defaultQuantity: real('default_quantity').notNull(),
    defaultUnit: text('default_unit').notNull(),
    lastUnitCost: real('last_unit_cost').notNull(),
    lastUsedAt: integer('last_used_at').notNull(),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => ({
    tenantSupplierDescIdx: index('idx_mappings_tenant_supplier_desc').on(
      t.tenantId,
      t.supplierId,
      t.rawDescription,
    ),
  }),
);

export type InvoiceRow = typeof invoices.$inferSelect;
export type InvoiceInsert = typeof invoices.$inferInsert;
export type InvoiceLineRow = typeof invoiceLines.$inferSelect;
export type InvoiceLineInsert = typeof invoiceLines.$inferInsert;
export type SupplierItemMappingRow = typeof supplierItemMappings.$inferSelect;
export type SupplierItemMappingInsert = typeof supplierItemMappings.$inferInsert;

export const stockTakes = sqliteTable(
  'stock_takes',
  {
    id: text('id').primaryKey(),
    tenantId: integer('tenant_id').notNull(),
    startedAt: integer('started_at').notNull(),
    completedAt: integer('completed_at'),
    status: text('status', { enum: ['in_progress', 'committed', 'discarded'] })
      .notNull()
      .default('in_progress'),
    notes: text('notes'),
    ...audit,
  },
  (t) => ({
    tenantStatusIdx: index('idx_stock_takes_tenant_status').on(t.tenantId, t.status),
    tenantStartedIdx: index('idx_stock_takes_tenant_started').on(t.tenantId, t.startedAt),
  }),
);

export const stockTakeLines = sqliteTable(
  'stock_take_lines',
  {
    id: text('id').primaryKey(),
    stockTakeId: text('stock_take_id')
      .notNull()
      .references(() => stockTakes.id),
    ingredientId: text('ingredient_id')
      .notNull()
      .references(() => ingredients.id),
    bookQuantity: real('book_quantity').notNull(),
    countedQuantity: real('counted_quantity'),
    difference: real('difference'),
  },
  (t) => ({
    takeIdx: index('idx_stock_take_lines_take').on(t.stockTakeId),
  }),
);

export type StockTakeRow = typeof stockTakes.$inferSelect;
export type StockTakeInsert = typeof stockTakes.$inferInsert;
export type StockTakeLineRow = typeof stockTakeLines.$inferSelect;
export type StockTakeLineInsert = typeof stockTakeLines.$inferInsert;
