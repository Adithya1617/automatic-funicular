export const INGREDIENT_TYPES = ['raw', 'prepared'] as const;
export type IngredientType = (typeof INGREDIENT_TYPES)[number];

// Hyprride: presets shown in the "New part" / "Edit part" dialogs. Free-text
// remains in the underlying ingredients.category column, but the editor
// offers these to keep dashboards groupable. Tuned to the actual Hyprride
// part inventory — oils (engine / gear), brakes (pad / shoe), filters,
// cables (accelerator / clutch), and accessories (mobile holder etc.).
export const PART_CATEGORIES = [
  'Oil',
  'Brake',
  'Filter',
  'Cable',
  'Accessory',
  'Misc',
] as const;
export type PartCategory = (typeof PART_CATEGORIES)[number];

export const BASE_UNITS = ['g', 'ml', 'each'] as const;
export type BaseUnit = (typeof BASE_UNITS)[number];

export const STOCK_MOVEMENT_REASONS = [
  'purchase',
  'sale',
  'sale_reversal',
  'wastage',
  'prep_loss',
  'production_input',
  'production_output',
  'adjustment',
  'staff_meal',
  // Hyprride: parts consumed during a completed service event, and the
  // restore-stock counterpart written when a completed event is cancelled
  // without the parts having been used.
  'service_consumed',
  'service_reversal',
] as const;
export type StockMovementReason = (typeof STOCK_MOVEMENT_REASONS)[number];

export const STOCK_MOVEMENT_REFERENCE_TYPES = [
  'invoice_line',
  'order_line',
  'production_batch',
  'stock_take',
  'manual',
  // Hyprride: links a stock_movement back to the service_event_line that
  // caused it (consumption, wastage on cancel-after-completion, or reversal).
  'service_event_line',
] as const;
export type StockMovementReferenceType = (typeof STOCK_MOVEMENT_REFERENCE_TYPES)[number];

export const ORDER_SOURCES = [
  'swiggy',
  'zomato',
  'offline_pos',
  'manual_entry',
  'mock_online',
  'mock_offline',
] as const;
export type OrderSource = (typeof ORDER_SOURCES)[number];

export const MANUAL_ADJUSTMENT_REASONS = [
  'adjustment',
  'wastage',
  'prep_loss',
  'staff_meal',
] as const satisfies readonly StockMovementReason[];
export type ManualAdjustmentReason = (typeof MANUAL_ADJUSTMENT_REASONS)[number];
