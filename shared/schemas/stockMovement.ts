import { z } from 'zod';
import {
  STOCK_MOVEMENT_REASONS,
  STOCK_MOVEMENT_REFERENCE_TYPES,
} from '../constants/enums';
import { idSchema } from './id';

export const stockMovementSchema = z.object({
  id: idSchema,
  tenantId: z.number().int(),
  ingredientId: idSchema,
  changeQuantity: z.number(),
  costPerUnitAtTime: z.number().nullable(),
  reason: z.enum(STOCK_MOVEMENT_REASONS),
  referenceType: z.enum(STOCK_MOVEMENT_REFERENCE_TYPES),
  referenceId: z.string().nullable(),
  notes: z.string().nullable(),
  occurredAt: z.number().int(),
  createdAt: z.number().int(),
  createdBy: z.string(),
});
export type StockMovement = z.infer<typeof stockMovementSchema>;

export const listStockMovementsInputSchema = z.object({
  ingredientId: idSchema.optional(),
  reason: z.enum(STOCK_MOVEMENT_REASONS).optional(),
  limit: z.number().int().min(1).max(500).default(50),
  before: z.number().int().optional(), // occurredAt cursor
});
export type ListStockMovementsInput = z.infer<typeof listStockMovementsInputSchema>;
