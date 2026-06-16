import {
  bigint,
  boolean,
  doublePrecision,
  index,
  integer,
  pgTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

/**
 * Postgres schema — a faithful port of main/db/schema.ts (SQLite).
 *
 * Conventions (unchanged from SQLite)
 * -----------------------------------
 * - Every entity has UUID v7 text PKs (`id`).
 * - Every entity has `tenant_id` (integer) — v1 uses DEFAULT_TENANT_ID = 1.
 * - Audit columns: `created_at`, `updated_at` as Unix milliseconds; `created_by`,
 *   `updated_by` are SYSTEM_USER_ID until auth lands.
 *
 * Three deliberate type changes vs the SQLite schema (the rest is 1:1):
 * - Unix-ms timestamps: SQLite `integer` -> `bigint({ mode: 'number' })`
 *   (PG `integer` is 32-bit and overflows ~1.7e12 ms).
 * - Floating columns (cost/quantity/stock): SQLite `real` -> `doublePrecision`
 *   (SQLite REAL is a 64-bit double; PG `real` is 32-bit).
 * - Booleans: SQLite `integer({ mode: 'boolean' })` -> native `boolean`.
 *
 * This file supersedes main/db/schema.ts; the SQLite version is deleted in W1.
 */

/** Unix-ms timestamp column helper. */
const ts = (name: string) => bigint(name, { mode: 'number' });

const audit = {
  createdAt: ts('created_at').notNull(),
  updatedAt: ts('updated_at').notNull(),
  createdBy: text('created_by').notNull(),
  updatedBy: text('updated_by').notNull(),
};

export const tenants = pgTable('tenants', {
  id: integer('id').primaryKey(),
  name: text('name').notNull(),
  createdAt: ts('created_at').notNull(),
});

export const appSettings = pgTable('app_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: ts('updated_at').notNull(),
});

export const ingredients = pgTable(
  'ingredients',
  {
    id: text('id').primaryKey(),
    tenantId: integer('tenant_id').notNull(),
    name: text('name').notNull(),
    category: text('category').notNull(),
    type: text('type', { enum: ['raw', 'prepared'] }).notNull(),
    baseUnit: text('base_unit', { enum: ['g', 'ml', 'each'] }).notNull(),
    stockQuantity: doublePrecision('stock_quantity').notNull().default(0),
    reservedQuantity: doublePrecision('reserved_quantity').notNull().default(0),
    lowStockThreshold: doublePrecision('low_stock_threshold').notNull().default(0),
    currentAvgCostPerUnit: doublePrecision('current_avg_cost_per_unit').notNull().default(0),
    densityGPerMl: doublePrecision('density_g_per_ml'),
    isActive: boolean('is_active').notNull().default(true),
    ...audit,
  },
  (t) => ({
    tenantNameIdx: index('idx_ingredients_tenant_name').on(t.tenantId, t.name),
    tenantActiveIdx: index('idx_ingredients_tenant_active').on(t.tenantId, t.isActive),
  }),
);

export const suppliers = pgTable(
  'suppliers',
  {
    id: text('id').primaryKey(),
    tenantId: integer('tenant_id').notNull(),
    name: text('name').notNull(),
    contactInfo: text('contact_info'),
    gstin: text('gstin'),
    notes: text('notes'),
    isActive: boolean('is_active').notNull().default(true),
    ...audit,
  },
  (t) => ({
    tenantNameIdx: index('idx_suppliers_tenant_name').on(t.tenantId, t.name),
    tenantGstinIdx: index('idx_suppliers_tenant_gstin').on(t.tenantId, t.gstin),
  }),
);

export const stockMovements = pgTable(
  'stock_movements',
  {
    id: text('id').primaryKey(),
    tenantId: integer('tenant_id').notNull(),
    ingredientId: text('ingredient_id')
      .notNull()
      .references(() => ingredients.id),
    changeQuantity: doublePrecision('change_quantity').notNull(),
    costPerUnitAtTime: doublePrecision('cost_per_unit_at_time'),
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
        'service_consumed',
        'service_reversal',
      ],
    }).notNull(),
    referenceType: text('reference_type', {
      enum: [
        'invoice_line',
        'order_line',
        'production_batch',
        'stock_take',
        'manual',
        'service_event_line',
      ],
    }).notNull(),
    referenceId: text('reference_id'),
    notes: text('notes'),
    occurredAt: ts('occurred_at').notNull(),
    createdAt: ts('created_at').notNull(),
    createdBy: text('created_by').notNull(),
  },
  (t) => ({
    ingredientOccurredAtIdx: index('idx_movements_ingredient_occurred_at').on(
      t.ingredientId,
      t.occurredAt,
    ),
    reasonOccurredAtIdx: index('idx_movements_reason_occurred_at').on(t.reason, t.occurredAt),
    referenceIdx: index('idx_movements_reference').on(t.referenceType, t.referenceId),
  }),
);

export const recipeVersions = pgTable(
  'recipe_versions',
  {
    id: text('id').primaryKey(),
    tenantId: integer('tenant_id').notNull(),
    parentId: text('parent_id').notNull(),
    parentType: text('parent_type', {
      enum: ['menu_item', 'ingredient', 'service_template'],
    }).notNull(),
    versionNumber: integer('version_number').notNull(),
    isCurrent: boolean('is_current').notNull().default(false),
    targetYield: doublePrecision('target_yield').notNull().default(1),
    notes: text('notes'),
    createdAt: ts('created_at').notNull(),
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

export const recipeIngredients = pgTable(
  'recipe_ingredients',
  {
    id: text('id').primaryKey(),
    recipeVersionId: text('recipe_version_id')
      .notNull()
      .references(() => recipeVersions.id),
    childIngredientId: text('child_ingredient_id')
      .notNull()
      .references(() => ingredients.id),
    quantity: doublePrecision('quantity').notNull(),
    unit: text('unit').notNull(),
    notes: text('notes'),
    displayOrder: integer('display_order').notNull().default(0),
  },
  (t) => ({
    versionIdx: index('idx_recipe_ingredients_version').on(t.recipeVersionId),
  }),
);

export const menuItems = pgTable(
  'menu_items',
  {
    id: text('id').primaryKey(),
    tenantId: integer('tenant_id').notNull(),
    name: text('name').notNull(),
    category: text('category').notNull(),
    sellingPrice: doublePrecision('selling_price').notNull().default(0),
    variantGroupId: text('variant_group_id'),
    displayOrder: integer('display_order').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    ...audit,
  },
  (t) => ({
    tenantNameIdx: index('idx_menu_items_tenant_name').on(t.tenantId, t.name),
    tenantCategoryIdx: index('idx_menu_items_tenant_category').on(t.tenantId, t.category),
    tenantVariantIdx: index('idx_menu_items_tenant_variant').on(t.tenantId, t.variantGroupId),
  }),
);

export const menuItemAvailability = pgTable(
  'menu_item_availability',
  {
    id: text('id').primaryKey(),
    tenantId: integer('tenant_id').notNull(),
    menuItemId: text('menu_item_id')
      .notNull()
      .references(() => menuItems.id),
    maxServingsAvailable: doublePrecision('max_servings_available').notNull().default(0),
    bottleneckIngredientId: text('bottleneck_ingredient_id'),
    lastComputedAt: ts('last_computed_at').notNull(),
  },
  (t) => ({
    tenantMenuItemIdx: index('idx_availability_tenant_menu_item').on(t.tenantId, t.menuItemId),
  }),
);

export const productionBatches = pgTable(
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
    expectedYield: doublePrecision('expected_yield').notNull(),
    actualYield: doublePrecision('actual_yield').notNull(),
    producedAt: ts('produced_at').notNull(),
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

export const orders = pgTable(
  'orders',
  {
    id: text('id').primaryKey(),
    tenantId: integer('tenant_id').notNull(),
    externalOrderId: text('external_order_id'),
    source: text('source', {
      enum: ['swiggy', 'zomato', 'offline_pos', 'manual_entry', 'mock_online', 'mock_offline'],
    }).notNull(),
    placedAt: ts('placed_at').notNull(),
    deliveredAt: ts('delivered_at'),
    cancelledAt: ts('cancelled_at'),
    cancelledPrepared: boolean('cancelled_prepared'),
    status: text('status', {
      enum: ['pending', 'preparing', 'delivered', 'cancelled'],
    })
      .notNull()
      .default('pending'),
    totalAmount: doublePrecision('total_amount').notNull().default(0),
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

export const orderLines = pgTable(
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
    unitPrice: doublePrecision('unit_price').notNull().default(0),
    recipeVersionId: text('recipe_version_id')
      .notNull()
      .references(() => recipeVersions.id),
  },
  (t) => ({
    orderIdx: index('idx_order_lines_order').on(t.orderId),
  }),
);

export const orderingChannels = pgTable(
  'ordering_channels',
  {
    id: text('id').primaryKey(),
    tenantId: integer('tenant_id').notNull(),
    key: text('key').notNull(),
    displayName: text('display_name').notNull(),
    enabled: boolean('enabled').notNull().default(true),
    pollingIntervalSeconds: integer('polling_interval_seconds').notNull().default(30),
    isMock: boolean('is_mock').notNull().default(false),
    createdAt: ts('created_at').notNull(),
    updatedAt: ts('updated_at').notNull(),
  },
  (t) => ({
    tenantKeyIdx: index('idx_ordering_channels_tenant_key').on(t.tenantId, t.key),
  }),
);

export const invoices = pgTable(
  'invoices',
  {
    id: text('id').primaryKey(),
    tenantId: integer('tenant_id').notNull(),
    supplierId: text('supplier_id')
      .notNull()
      .references(() => suppliers.id),
    invoiceNumber: text('invoice_number').notNull(),
    invoiceDate: ts('invoice_date').notNull(),
    totalAmount: doublePrecision('total_amount').notNull().default(0),
    filePath: text('file_path'),
    status: text('status', { enum: ['draft', 'committed'] })
      .notNull()
      .default('draft'),
    notes: text('notes'),
    committedAt: ts('committed_at'),
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

export const invoiceLines = pgTable(
  'invoice_lines',
  {
    id: text('id').primaryKey(),
    invoiceId: text('invoice_id')
      .notNull()
      .references(() => invoices.id),
    rawDescription: text('raw_description').notNull(),
    ingredientId: text('ingredient_id').references(() => ingredients.id),
    quantity: doublePrecision('quantity').notNull(),
    unit: text('unit').notNull(),
    unitCost: doublePrecision('unit_cost').notNull(),
    totalCost: doublePrecision('total_cost').notNull(),
    displayOrder: integer('display_order').notNull().default(0),
  },
  (t) => ({
    invoiceIdx: index('idx_invoice_lines_invoice').on(t.invoiceId),
  }),
);

export const supplierItemMappings = pgTable(
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
    defaultQuantity: doublePrecision('default_quantity').notNull(),
    defaultUnit: text('default_unit').notNull(),
    lastUnitCost: doublePrecision('last_unit_cost').notNull(),
    lastUsedAt: ts('last_used_at').notNull(),
    createdAt: ts('created_at').notNull(),
    updatedAt: ts('updated_at').notNull(),
  },
  (t) => ({
    tenantSupplierDescIdx: index('idx_mappings_tenant_supplier_desc').on(
      t.tenantId,
      t.supplierId,
      t.rawDescription,
    ),
  }),
);

export const stockTakes = pgTable(
  'stock_takes',
  {
    id: text('id').primaryKey(),
    tenantId: integer('tenant_id').notNull(),
    startedAt: ts('started_at').notNull(),
    completedAt: ts('completed_at'),
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

export const stockTakeLines = pgTable(
  'stock_take_lines',
  {
    id: text('id').primaryKey(),
    stockTakeId: text('stock_take_id')
      .notNull()
      .references(() => stockTakes.id),
    ingredientId: text('ingredient_id')
      .notNull()
      .references(() => ingredients.id),
    bookQuantity: doublePrecision('book_quantity').notNull(),
    countedQuantity: doublePrecision('counted_quantity'),
    difference: doublePrecision('difference'),
  },
  (t) => ({
    takeIdx: index('idx_stock_take_lines_take').on(t.stockTakeId),
  }),
);

// -- Hyprride: bike types + bikes ------------------------------------------
export const bikeTypes = pgTable(
  'bike_types',
  {
    id: text('id').primaryKey(),
    tenantId: integer('tenant_id').notNull(),
    name: text('name').notNull(),
    engineCc: integer('engine_cc').notNull(),
    displayOrder: integer('display_order').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    ...audit,
  },
  (t) => ({
    tenantNameIdx: index('idx_bike_types_tenant_name').on(t.tenantId, t.name),
  }),
);

export const bikes = pgTable(
  'bikes',
  {
    id: text('id').primaryKey(),
    tenantId: integer('tenant_id').notNull(),
    bikeNumber: text('bike_number').notNull(),
    bikeTypeId: text('bike_type_id')
      .notNull()
      .references(() => bikeTypes.id),
    licensePlate: text('license_plate'),
    odometerKm: doublePrecision('odometer_km'),
    notes: text('notes'),
    isActive: boolean('is_active').notNull().default(true),
    ...audit,
  },
  (t) => ({
    tenantNumberIdx: index('idx_bikes_tenant_number').on(t.tenantId, t.bikeNumber),
    tenantTypeIdx: index('idx_bikes_tenant_type').on(t.tenantId, t.bikeTypeId),
    tenantActiveIdx: index('idx_bikes_tenant_active').on(t.tenantId, t.isActive),
  }),
);

// Service templates — versioned via recipe_versions (parent_type='service_template').
export const serviceTemplates = pgTable(
  'service_templates',
  {
    id: text('id').primaryKey(),
    tenantId: integer('tenant_id').notNull(),
    name: text('name').notNull(),
    bikeTypeId: text('bike_type_id')
      .notNull()
      .references(() => bikeTypes.id),
    displayOrder: integer('display_order').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    ...audit,
  },
  (t) => ({
    tenantBikeTypeIdx: index('idx_service_templates_tenant_bike_type').on(
      t.tenantId,
      t.bikeTypeId,
    ),
    tenantNameIdx: index('idx_service_templates_tenant_name').on(t.tenantId, t.name),
    tenantActiveIdx: index('idx_service_templates_tenant_active').on(t.tenantId, t.isActive),
  }),
);

// Service events — one row per servicing. kind discriminates service/repair/wash.
// Stock deduction fires on status='completed' via InventoryService.applyMovement.
export const serviceEvents = pgTable(
  'service_events',
  {
    id: text('id').primaryKey(),
    tenantId: integer('tenant_id').notNull(),
    bikeId: text('bike_id')
      .notNull()
      .references(() => bikes.id),
    kind: text('kind', { enum: ['service', 'repair', 'wash'] })
      .notNull()
      .default('service'),
    serviceTemplateId: text('service_template_id').references(() => serviceTemplates.id),
    serviceTemplateVersionId: text('service_template_version_id').references(
      () => recipeVersions.id,
    ),
    status: text('status', {
      enum: ['requested', 'in_progress', 'completed', 'cancelled'],
    })
      .notNull()
      .default('in_progress'),
    startedAt: ts('started_at').notNull(),
    completedAt: ts('completed_at'),
    cancelledAt: ts('cancelled_at'),
    /** Set when cancelling a completed event: true -> wastage, false -> reversal. */
    cancelledPartsUsed: boolean('cancelled_parts_used'),
    odometerKm: doublePrecision('odometer_km'),
    notes: text('notes'),
    ...audit,
  },
  (t) => ({
    tenantStatusIdx: index('idx_service_events_tenant_status_started').on(
      t.tenantId,
      t.status,
      t.startedAt,
    ),
    tenantKindIdx: index('idx_service_events_tenant_kind_started').on(
      t.tenantId,
      t.kind,
      t.startedAt,
    ),
    tenantBikeIdx: index('idx_service_events_tenant_bike_started').on(
      t.tenantId,
      t.bikeId,
      t.startedAt,
    ),
    tenantTemplateIdx: index('idx_service_events_tenant_template_started').on(
      t.tenantId,
      t.serviceTemplateId,
      t.startedAt,
    ),
  }),
);

export const serviceEventLines = pgTable(
  'service_event_lines',
  {
    id: text('id').primaryKey(),
    serviceEventId: text('service_event_id')
      .notNull()
      .references(() => serviceEvents.id),
    ingredientId: text('ingredient_id')
      .notNull()
      .references(() => ingredients.id),
    quantity: doublePrecision('quantity').notNull(),
    unit: text('unit').notNull(),
    notes: text('notes'),
    displayOrder: integer('display_order').notNull().default(0),
  },
  (t) => ({
    eventIdx: index('idx_service_event_lines_event').on(t.serviceEventId),
  }),
);

// -- Inferred row/insert types (same names as the SQLite schema) ------------
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
export type InvoiceRow = typeof invoices.$inferSelect;
export type InvoiceInsert = typeof invoices.$inferInsert;
export type InvoiceLineRow = typeof invoiceLines.$inferSelect;
export type InvoiceLineInsert = typeof invoiceLines.$inferInsert;
export type SupplierItemMappingRow = typeof supplierItemMappings.$inferSelect;
export type SupplierItemMappingInsert = typeof supplierItemMappings.$inferInsert;
export type StockTakeRow = typeof stockTakes.$inferSelect;
export type StockTakeInsert = typeof stockTakes.$inferInsert;
export type StockTakeLineRow = typeof stockTakeLines.$inferSelect;
export type StockTakeLineInsert = typeof stockTakeLines.$inferInsert;
export type BikeTypeRow = typeof bikeTypes.$inferSelect;
export type BikeTypeInsert = typeof bikeTypes.$inferInsert;
export type BikeRow = typeof bikes.$inferSelect;
export type BikeInsert = typeof bikes.$inferInsert;
export type ServiceTemplateRow = typeof serviceTemplates.$inferSelect;
export type ServiceTemplateInsert = typeof serviceTemplates.$inferInsert;
export type ServiceEventRow = typeof serviceEvents.$inferSelect;
export type ServiceEventInsert = typeof serviceEvents.$inferInsert;
export type ServiceEventLineRow = typeof serviceEventLines.$inferSelect;
export type ServiceEventLineInsert = typeof serviceEventLines.$inferInsert;

// -- Auth: users + sessions (W4) -------------------------------------------
// Owner/staff accounts and server-side sessions. The httpOnly cookie carries
// the opaque session token, which is `sessions.id`. A user's `created_by` /
// `updated_by` reference the acting user id once auth lands; the seeded owner
// is created by SYSTEM_USER_ID.
export const users = pgTable(
  'users',
  {
    id: text('id').primaryKey(),
    tenantId: integer('tenant_id').notNull(),
    email: text('email').notNull(),
    passwordHash: text('password_hash').notNull(),
    name: text('name').notNull(),
    role: text('role', { enum: ['owner', 'staff'] })
      .notNull()
      .default('staff'),
    isActive: boolean('is_active').notNull().default(true),
    ...audit,
  },
  (t) => ({
    tenantEmailIdx: uniqueIndex('idx_users_tenant_email').on(t.tenantId, t.email),
  }),
);

export const sessions = pgTable(
  'sessions',
  {
    // Opaque random token; also the value stored in the httpOnly cookie.
    id: text('id').primaryKey(),
    tenantId: integer('tenant_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    createdAt: ts('created_at').notNull(),
    expiresAt: ts('expires_at').notNull(),
  },
  (t) => ({
    userIdx: index('idx_sessions_user').on(t.userId),
    expiresIdx: index('idx_sessions_expires').on(t.expiresAt),
  }),
);

export type UserRow = typeof users.$inferSelect;
export type UserInsert = typeof users.$inferInsert;
export type SessionRow = typeof sessions.$inferSelect;
export type SessionInsert = typeof sessions.$inferInsert;
