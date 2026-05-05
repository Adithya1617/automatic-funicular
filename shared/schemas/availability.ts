import { z } from 'zod';
import { idSchema } from './id';

export const menuItemAvailabilitySchema = z.object({
  id: idSchema,
  tenantId: z.number().int(),
  menuItemId: idSchema,
  maxServingsAvailable: z.number(),
  bottleneckIngredientId: idSchema.nullable(),
  lastComputedAt: z.number().int(),
});
export type MenuItemAvailability = z.infer<typeof menuItemAvailabilitySchema>;

export const listAvailabilityInputSchema = z.object({
  /** When omitted, returns availability for every active menu item. */
  menuItemIds: z.array(idSchema).optional(),
});
export type ListAvailabilityInput = z.infer<typeof listAvailabilityInputSchema>;
