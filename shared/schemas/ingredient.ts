import { z } from 'zod';
import { BASE_UNITS, INGREDIENT_TYPES } from '../constants/enums';
import { idSchema } from './id';

export const ingredientSchema = z.object({
  id: idSchema,
  tenantId: z.number().int(),
  name: z.string().min(1).max(120),
  category: z.string().min(1).max(60),
  type: z.enum(INGREDIENT_TYPES),
  baseUnit: z.enum(BASE_UNITS),
  stockQuantity: z.number(),
  reservedQuantity: z.number(),
  lowStockThreshold: z.number().min(0),
  currentAvgCostPerUnit: z.number().min(0),
  densityGPerMl: z.number().positive().nullable(),
  isActive: z.boolean(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
  createdBy: z.string(),
  updatedBy: z.string(),
});
export type Ingredient = z.infer<typeof ingredientSchema>;

export const createIngredientInputSchema = z.object({
  name: z.string().min(1).max(120),
  category: z.string().min(1).max(60),
  type: z.enum(INGREDIENT_TYPES),
  baseUnit: z.enum(BASE_UNITS),
  lowStockThreshold: z.number().min(0).default(0),
  densityGPerMl: z.number().positive().nullable().default(null),
});
export type CreateIngredientInput = z.infer<typeof createIngredientInputSchema>;

export const updateIngredientInputSchema = z.object({
  id: idSchema,
  name: z.string().min(1).max(120).optional(),
  category: z.string().min(1).max(60).optional(),
  type: z.enum(INGREDIENT_TYPES).optional(),
  lowStockThreshold: z.number().min(0).optional(),
  densityGPerMl: z.number().positive().nullable().optional(),
  isActive: z.boolean().optional(),
});
export type UpdateIngredientInput = z.infer<typeof updateIngredientInputSchema>;

export const listIngredientsInputSchema = z.object({
  search: z.string().trim().optional(),
  category: z.string().optional(),
  type: z.enum(INGREDIENT_TYPES).optional(),
  includeInactive: z.boolean().default(false),
});
export type ListIngredientsInput = z.infer<typeof listIngredientsInputSchema>;

export const getIngredientInputSchema = z.object({ id: idSchema });
export type GetIngredientInput = z.infer<typeof getIngredientInputSchema>;

export const deactivateIngredientInputSchema = getIngredientInputSchema;
export type DeactivateIngredientInput = z.infer<typeof deactivateIngredientInputSchema>;
