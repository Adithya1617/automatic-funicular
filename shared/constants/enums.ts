export const INGREDIENT_TYPES = ['raw', 'prepared'] as const;
export type IngredientType = (typeof INGREDIENT_TYPES)[number];

// Hyprride: presets shown in the "New part" / "Edit part" dialogs. Free-text
// remains in the underlying ingredients.category column, but the editor
// offers these to keep dashboards groupable.
export const PART_CATEGORIES = [
  'Oil',
  'Brake',
  'Filter',
  'Tyre',
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
] as const;
export type StockMovementReason = (typeof STOCK_MOVEMENT_REASONS)[number];

export const STOCK_MOVEMENT_REFERENCE_TYPES = [
  'invoice_line',
  'order_line',
  'production_batch',
  'stock_take',
  'manual',
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
