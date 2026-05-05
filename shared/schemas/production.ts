import { z } from 'zod';
import { idSchema } from './id';
import { stockMovementSchema } from './stockMovement';

export const productionBatchSchema = z.object({
  id: idSchema,
  tenantId: z.number().int(),
  preparedIngredientId: idSchema,
  recipeVersionId: idSchema,
  expectedYield: z.number(),
  actualYield: z.number(),
  producedAt: z.number().int(),
  notes: z.string().nullable(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
  createdBy: z.string(),
  updatedBy: z.string(),
});
export type ProductionBatch = z.infer<typeof productionBatchSchema>;

export const recordBatchInputSchema = z.object({
  preparedIngredientId: idSchema,
  /** If omitted, RecipeService picks up the active version. */
  recipeVersionId: idSchema.optional(),
  /** In the prepared ingredient's base unit. */
  actualYield: z.number().positive(),
  /** Optional override; defaults to recipe.target_yield when omitted. */
  expectedYield: z.number().positive().optional(),
  producedAt: z.number().int().optional(),
  notes: z.string().max(500).nullable().default(null),
});
export type RecordBatchInput = z.infer<typeof recordBatchInputSchema>;

export const recordBatchResultSchema = z.object({
  batch: productionBatchSchema,
  movements: z.array(stockMovementSchema),
});
export type RecordBatchResult = z.infer<typeof recordBatchResultSchema>;

export const listBatchesInputSchema = z.object({
  preparedIngredientId: idSchema.optional(),
  limit: z.number().int().min(1).max(200).default(50),
});
export type ListBatchesInput = z.infer<typeof listBatchesInputSchema>;
