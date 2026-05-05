import { z } from 'zod';
import { idSchema } from './id';

export const STOCK_TAKE_STATUSES = ['in_progress', 'committed', 'discarded'] as const;
export type StockTakeStatus = (typeof STOCK_TAKE_STATUSES)[number];

export const stockTakeSchema = z.object({
  id: idSchema,
  tenantId: z.number().int(),
  startedAt: z.number().int(),
  completedAt: z.number().int().nullable(),
  status: z.enum(STOCK_TAKE_STATUSES),
  notes: z.string().nullable(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
  createdBy: z.string(),
  updatedBy: z.string(),
});
export type StockTake = z.infer<typeof stockTakeSchema>;

export const stockTakeLineSchema = z.object({
  id: idSchema,
  stockTakeId: idSchema,
  ingredientId: idSchema,
  bookQuantity: z.number(),
  countedQuantity: z.number().nullable(),
  difference: z.number().nullable(),
});
export type StockTakeLine = z.infer<typeof stockTakeLineSchema>;

export const stockTakeWithLinesSchema = stockTakeSchema.extend({
  lines: z.array(stockTakeLineSchema),
});
export type StockTakeWithLines = z.infer<typeof stockTakeWithLinesSchema>;

export const startStockTakeInputSchema = z.object({
  notes: z.string().max(500).nullable().default(null),
});
export type StartStockTakeInput = z.infer<typeof startStockTakeInputSchema>;

export const saveStockTakeCountInputSchema = z.object({
  lineId: idSchema,
  countedQuantity: z.number().nonnegative().nullable(),
});
export type SaveStockTakeCountInput = z.infer<typeof saveStockTakeCountInputSchema>;

export const commitStockTakeInputSchema = z.object({
  id: idSchema,
  notes: z.string().max(500).nullable().default(null),
});
export type CommitStockTakeInput = z.infer<typeof commitStockTakeInputSchema>;

export const discardStockTakeInputSchema = z.object({
  id: idSchema,
});
export type DiscardStockTakeInput = z.infer<typeof discardStockTakeInputSchema>;

export const getStockTakeInputSchema = z.object({
  id: idSchema,
});
export type GetStockTakeInput = z.infer<typeof getStockTakeInputSchema>;

export const listStockTakesInputSchema = z.object({
  status: z.enum(STOCK_TAKE_STATUSES).optional(),
  limit: z.number().int().min(1).max(500).default(100),
});
export type ListStockTakesInput = z.infer<typeof listStockTakesInputSchema>;
