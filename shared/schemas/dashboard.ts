import { z } from 'zod';
import { idSchema } from './id';

export const dateRangeSchema = z
  .object({
    startMs: z.number().int(),
    endMs: z.number().int(),
  })
  .refine((r) => r.endMs >= r.startMs, { message: 'endMs must be >= startMs' });
export type DateRange = z.infer<typeof dateRangeSchema>;

export const rangedQuerySchema = z.object({
  range: dateRangeSchema,
});
export type RangedQuery = z.infer<typeof rangedQuerySchema>;

/* ------------------------------ Stock value ------------------------------ */
export const stockValueResponseSchema = z.object({
  asOfMs: z.number().int(),
  totalValue: z.number().nonnegative(),
});
export type StockValueResponse = z.infer<typeof stockValueResponseSchema>;

export const stockValueSeriesPointSchema = z.object({
  bucketMs: z.number().int(),
  value: z.number(),
});
export type StockValueSeriesPoint = z.infer<typeof stockValueSeriesPointSchema>;

export const stockValueSeriesResponseSchema = z.object({
  points: z.array(stockValueSeriesPointSchema),
});
export type StockValueSeriesResponse = z.infer<typeof stockValueSeriesResponseSchema>;

/* -------------------------------- Spending ------------------------------- */
export const spendingByCategorySchema = z.object({
  category: z.string(),
  amount: z.number().nonnegative(),
});
export type SpendingByCategory = z.infer<typeof spendingByCategorySchema>;

export const spendingByIngredientSchema = z.object({
  ingredientId: idSchema,
  ingredientName: z.string(),
  amount: z.number().nonnegative(),
});
export type SpendingByIngredient = z.infer<typeof spendingByIngredientSchema>;

export const spendingResponseSchema = z.object({
  totalSpend: z.number().nonnegative(),
  invoiceCount: z.number().int().nonnegative(),
  byCategory: z.array(spendingByCategorySchema),
  topIngredients: z.array(spendingByIngredientSchema),
});
export type SpendingResponse = z.infer<typeof spendingResponseSchema>;

/* -------------------------------- Wastage -------------------------------- */
export const wastageByReasonSchema = z.object({
  reason: z.enum(['wastage', 'prep_loss', 'staff_meal']),
  amount: z.number().nonnegative(),
});
export type WastageByReason = z.infer<typeof wastageByReasonSchema>;

export const wastageResponseSchema = z.object({
  totalLoss: z.number().nonnegative(),
  byReason: z.array(wastageByReasonSchema),
  topIngredients: z.array(spendingByIngredientSchema),
});
export type WastageResponse = z.infer<typeof wastageResponseSchema>;

/* ------------------------------ Low stock -------------------------------- */
export const lowStockRowSchema = z.object({
  ingredientId: idSchema,
  ingredientName: z.string(),
  baseUnit: z.enum(['g', 'ml', 'each']),
  stockQuantity: z.number(),
  lowStockThreshold: z.number(),
  consumptionPerDay: z.number().nonnegative(),
  daysRemaining: z.number().nullable(),
});
export type LowStockRow = z.infer<typeof lowStockRowSchema>;

export const lowStockResponseSchema = z.object({
  rows: z.array(lowStockRowSchema),
});
export type LowStockResponse = z.infer<typeof lowStockResponseSchema>;

/* --------------------------- Reorder suggestions ------------------------- */
export const reorderRowSchema = z.object({
  ingredientId: idSchema,
  ingredientName: z.string(),
  baseUnit: z.enum(['g', 'ml', 'each']),
  stockQuantity: z.number(),
  consumptionPerDay: z.number().nonnegative(),
  leadTimeDays: z.number().nonnegative(),
  suggestedOrderQuantity: z.number().nonnegative(),
  daysRemaining: z.number().nullable(),
});
export type ReorderRow = z.infer<typeof reorderRowSchema>;

export const reorderResponseSchema = z.object({
  rows: z.array(reorderRowSchema),
});
export type ReorderResponse = z.infer<typeof reorderResponseSchema>;

/* ---------------- Hyprride: bike-centric tiles --------------------------- */

// Cost per bike — rollup of completed service events in the range, joined
// to service_consumed movements so cost reflects the actual qty × cost
// snapshot captured at completion time.
export const costPerBikeRowSchema = z.object({
  bikeId: idSchema,
  bikeNumber: z.string(),
  bikeTypeId: idSchema,
  bikeTypeName: z.string(),
  partsCost: z.number().nonnegative(),
  servicesCount: z.number().int().nonnegative(),
  lastServiceAt: z.number().int().nullable(),
});
export type CostPerBikeRow = z.infer<typeof costPerBikeRowSchema>;

export const costPerBikeResponseSchema = z.object({
  totalCost: z.number().nonnegative(),
  rows: z.array(costPerBikeRowSchema),
});
export type CostPerBikeResponse = z.infer<typeof costPerBikeResponseSchema>;

// Rollup of cost-per-bike by bike type.
export const costPerBikeTypeRowSchema = z.object({
  bikeTypeId: idSchema,
  bikeTypeName: z.string(),
  bikeCount: z.number().int().nonnegative(),
  partsCost: z.number().nonnegative(),
  servicesCount: z.number().int().nonnegative(),
});
export type CostPerBikeTypeRow = z.infer<typeof costPerBikeTypeRowSchema>;

export const costPerBikeTypeResponseSchema = z.object({
  rows: z.array(costPerBikeTypeRowSchema),
});
export type CostPerBikeTypeResponse = z.infer<typeof costPerBikeTypeResponseSchema>;

// Top consumed parts — sums service_consumed (and counter-acts service_reversal)
// in the range, in base units, valued at the cost snapshot on each movement.
export const topConsumedPartsRowSchema = z.object({
  ingredientId: idSchema,
  ingredientName: z.string(),
  baseUnit: z.enum(['g', 'ml', 'each']),
  totalQuantity: z.number().nonnegative(),
  totalCost: z.number().nonnegative(),
});
export type TopConsumedPartsRow = z.infer<typeof topConsumedPartsRowSchema>;

export const topConsumedPartsResponseSchema = z.object({
  rows: z.array(topConsumedPartsRowSchema),
});
export type TopConsumedPartsResponse = z.infer<typeof topConsumedPartsResponseSchema>;

// Service volume — count of completed services in the range, grouped by
// bike type. Drives the "how often are we servicing each fleet segment" tile.
export const serviceVolumeRowSchema = z.object({
  bikeTypeId: idSchema,
  bikeTypeName: z.string(),
  servicesCount: z.number().int().nonnegative(),
});
export type ServiceVolumeRow = z.infer<typeof serviceVolumeRowSchema>;

export const serviceVolumeResponseSchema = z.object({
  totalServices: z.number().int().nonnegative(),
  rows: z.array(serviceVolumeRowSchema),
});
export type ServiceVolumeResponse = z.infer<typeof serviceVolumeResponseSchema>;

// Theoretical service cost per template — sum of (qty × current avg cost)
// over the active recipe version. Independent of the date range.
export const theoreticalServiceCostRowSchema = z.object({
  serviceTemplateId: idSchema,
  serviceTemplateName: z.string(),
  bikeTypeId: idSchema,
  bikeTypeName: z.string(),
  totalCost: z.number().nonnegative(),
  /** Whether the template has an active recipe version. */
  hasActiveRecipe: z.boolean(),
});
export type TheoreticalServiceCostRow = z.infer<typeof theoreticalServiceCostRowSchema>;

export const theoreticalServiceCostResponseSchema = z.object({
  rows: z.array(theoreticalServiceCostRowSchema),
});
export type TheoreticalServiceCostResponse = z.infer<typeof theoreticalServiceCostResponseSchema>;
