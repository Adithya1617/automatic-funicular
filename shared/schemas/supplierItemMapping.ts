import { z } from 'zod';
import { idSchema } from './id';

export const supplierItemMappingSchema = z.object({
  id: idSchema,
  tenantId: z.number().int(),
  supplierId: idSchema,
  rawDescription: z.string(),
  ingredientId: idSchema,
  defaultQuantity: z.number().nonnegative(),
  defaultUnit: z.string(),
  lastUnitCost: z.number().nonnegative(),
  lastUsedAt: z.number().int(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});
export type SupplierItemMapping = z.infer<typeof supplierItemMappingSchema>;

export const suggestSupplierItemInputSchema = z.object({
  supplierId: idSchema,
  partial: z.string().default(''),
  limit: z.number().int().min(1).max(50).default(10),
});
export type SuggestSupplierItemInput = z.infer<typeof suggestSupplierItemInputSchema>;
