import { z } from 'zod';
import { ORDER_SOURCES } from '../constants/enums';
import { idSchema } from './id';

export const ORDER_STATUSES = ['pending', 'preparing', 'delivered', 'cancelled'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const orderLineSchema = z.object({
  id: idSchema,
  orderId: idSchema,
  menuItemId: idSchema,
  quantity: z.number().int().positive(),
  unitPrice: z.number().nonnegative(),
  recipeVersionId: idSchema,
});
export type OrderLine = z.infer<typeof orderLineSchema>;

export const orderSchema = z.object({
  id: idSchema,
  tenantId: z.number().int(),
  externalOrderId: z.string().nullable(),
  source: z.enum(ORDER_SOURCES),
  placedAt: z.number().int(),
  deliveredAt: z.number().int().nullable(),
  cancelledAt: z.number().int().nullable(),
  cancelledPrepared: z.boolean().nullable(),
  status: z.enum(ORDER_STATUSES),
  totalAmount: z.number().nonnegative(),
  notes: z.string().nullable(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
  createdBy: z.string(),
  updatedBy: z.string(),
});
export type Order = z.infer<typeof orderSchema>;

export const orderWithLinesSchema = orderSchema.extend({
  lines: z.array(orderLineSchema),
});
export type OrderWithLines = z.infer<typeof orderWithLinesSchema>;

export const listOrdersInputSchema = z.object({
  status: z.enum(ORDER_STATUSES).optional(),
  source: z.enum(ORDER_SOURCES).optional(),
  /** Soft cap; defaults to 200 most recent. */
  limit: z.number().int().min(1).max(500).default(200),
});
export type ListOrdersInput = z.infer<typeof listOrdersInputSchema>;

export const getOrderInputSchema = z.object({ id: idSchema });
export type GetOrderInput = z.infer<typeof getOrderInputSchema>;

export const markOrderInputSchema = z.object({ id: idSchema });
export type MarkOrderInput = z.infer<typeof markOrderInputSchema>;

export const cancelOrderInputSchema = z.object({
  id: idSchema,
  /** Required when the order is `delivered`; ignored otherwise. */
  alreadyPrepared: z.boolean().optional(),
});
export type CancelOrderInput = z.infer<typeof cancelOrderInputSchema>;
