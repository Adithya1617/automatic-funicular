import { z } from 'zod';
import { idSchema } from './id';

export const menuItemSchema = z.object({
  id: idSchema,
  tenantId: z.number().int(),
  name: z.string().min(1).max(120),
  category: z.string().min(1).max(60),
  sellingPrice: z.number().nonnegative(),
  variantGroupId: idSchema.nullable(),
  displayOrder: z.number().int(),
  isActive: z.boolean(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
  createdBy: z.string(),
  updatedBy: z.string(),
});
export type MenuItem = z.infer<typeof menuItemSchema>;

export const createMenuItemInputSchema = z.object({
  name: z.string().min(1).max(120),
  category: z.string().min(1).max(60),
  sellingPrice: z.number().nonnegative(),
  /** null = standalone; provide an existing groupId or 'new' to mint one. */
  variantGroupId: idSchema.nullable().default(null),
  displayOrder: z.number().int().default(0),
});
export type CreateMenuItemInput = z.infer<typeof createMenuItemInputSchema>;

export const updateMenuItemInputSchema = z.object({
  id: idSchema,
  name: z.string().min(1).max(120).optional(),
  category: z.string().min(1).max(60).optional(),
  sellingPrice: z.number().nonnegative().optional(),
  variantGroupId: idSchema.nullable().optional(),
  displayOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});
export type UpdateMenuItemInput = z.infer<typeof updateMenuItemInputSchema>;

export const listMenuItemsInputSchema = z.object({
  search: z.string().trim().optional(),
  category: z.string().optional(),
  includeInactive: z.boolean().default(false),
});
export type ListMenuItemsInput = z.infer<typeof listMenuItemsInputSchema>;

export const getMenuItemInputSchema = z.object({ id: idSchema });
export type GetMenuItemInput = z.infer<typeof getMenuItemInputSchema>;

export const deactivateMenuItemInputSchema = getMenuItemInputSchema;
export type DeactivateMenuItemInput = z.infer<typeof deactivateMenuItemInputSchema>;

/**
 * Server mints a new variant_group_id when sourceId has no group, or reuses
 * the source's group otherwise. Returns the new MenuItem with the recipe of
 * the source duplicated for editing.
 */
export const createVariantInputSchema = z.object({
  sourceId: idSchema,
  name: z.string().min(1).max(120),
  sellingPrice: z.number().nonnegative(),
});
export type CreateVariantInput = z.infer<typeof createVariantInputSchema>;
