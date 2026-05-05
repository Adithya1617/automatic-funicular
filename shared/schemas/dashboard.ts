import { z } from 'zod';
import { idSchema } from './id';
import { ORDER_SOURCES } from '../constants/enums';

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

/* --------------------------------- COGS ---------------------------------- */
export const cogsByMenuItemSchema = z.object({
  menuItemId: idSchema,
  menuItemName: z.string(),
  qtySold: z.number(),
  cogs: z.number().nonnegative(),
  revenue: z.number().nonnegative(),
});
export type CogsByMenuItem = z.infer<typeof cogsByMenuItemSchema>;

export const cogsResponseSchema = z.object({
  totalCogs: z.number().nonnegative(),
  totalRevenue: z.number().nonnegative(),
  rows: z.array(cogsByMenuItemSchema),
});
export type CogsResponse = z.infer<typeof cogsResponseSchema>;

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

/* ------------------------------ Top dishes ------------------------------- */
export const topDishesResponseSchema = z.object({
  rows: z.array(cogsByMenuItemSchema),
});
export type TopDishesResponse = z.infer<typeof topDishesResponseSchema>;

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

/* ----------------------------- Food cost % ------------------------------- */
export const foodCostRowSchema = z.object({
  menuItemId: idSchema,
  menuItemName: z.string(),
  sellingPrice: z.number().nonnegative(),
  recipeCost: z.number().nonnegative(),
  foodCostPercent: z.number().nullable(),
});
export type FoodCostRow = z.infer<typeof foodCostRowSchema>;

export const foodCostResponseSchema = z.object({
  rows: z.array(foodCostRowSchema),
});
export type FoodCostResponse = z.infer<typeof foodCostResponseSchema>;

/* ---------------------------- Channel rollups ---------------------------- */
export const channelRevenueRowSchema = z.object({
  source: z.enum(ORDER_SOURCES),
  revenue: z.number().nonnegative(),
  orderCount: z.number().int().nonnegative(),
});
export type ChannelRevenueRow = z.infer<typeof channelRevenueRowSchema>;

export const channelRollupResponseSchema = z.object({
  rows: z.array(channelRevenueRowSchema),
});
export type ChannelRollupResponse = z.infer<typeof channelRollupResponseSchema>;
