import { z } from 'zod';
import { RECIPE_PARENT_TYPES } from '../constants/recipe';
import { idSchema } from './id';

export const recipeIngredientSchema = z.object({
  id: idSchema,
  recipeVersionId: idSchema,
  childIngredientId: idSchema,
  quantity: z.number().positive(),
  unit: z.string().min(1),
  notes: z.string().nullable(),
  displayOrder: z.number().int(),
});
export type RecipeIngredient = z.infer<typeof recipeIngredientSchema>;

export const recipeVersionSchema = z.object({
  id: idSchema,
  tenantId: z.number().int(),
  parentId: idSchema,
  parentType: z.enum(RECIPE_PARENT_TYPES),
  versionNumber: z.number().int().positive(),
  isCurrent: z.boolean(),
  targetYield: z.number().positive(),
  notes: z.string().nullable(),
  createdAt: z.number().int(),
  createdBy: z.string(),
});
export type RecipeVersion = z.infer<typeof recipeVersionSchema>;

export const recipeWithIngredientsSchema = recipeVersionSchema.extend({
  ingredients: z.array(recipeIngredientSchema),
});
export type RecipeWithIngredients = z.infer<typeof recipeWithIngredientsSchema>;

export const recipeRowInputSchema = z.object({
  childIngredientId: idSchema,
  quantity: z.number().positive(),
  unit: z.string().min(1),
  notes: z.string().nullable().default(null),
  displayOrder: z.number().int().default(0),
});
export type RecipeRowInput = z.infer<typeof recipeRowInputSchema>;

export const saveRecipeVersionInputSchema = z.object({
  parentId: idSchema,
  parentType: z.enum(RECIPE_PARENT_TYPES),
  targetYield: z.number().positive(),
  notes: z.string().max(500).nullable().default(null),
  rows: z.array(recipeRowInputSchema).min(1),
});
export type SaveRecipeVersionInput = z.infer<typeof saveRecipeVersionInputSchema>;

export const getActiveRecipeInputSchema = z.object({
  parentId: idSchema,
  parentType: z.enum(RECIPE_PARENT_TYPES),
});
export type GetActiveRecipeInput = z.infer<typeof getActiveRecipeInputSchema>;

export const listRecipeVersionsInputSchema = z.object({
  parentId: idSchema,
  parentType: z.enum(RECIPE_PARENT_TYPES),
});
export type ListRecipeVersionsInput = z.infer<typeof listRecipeVersionsInputSchema>;
