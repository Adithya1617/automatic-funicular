import { z } from 'zod';
import { ORDER_SOURCES } from '../constants/enums';
import { idSchema } from './id';

export const externalOrderLineSchema = z.object({
  menuItemId: idSchema,
  quantity: z.number().int().positive(),
  unitPrice: z.number().nonnegative(),
});
export type ExternalOrderLine = z.infer<typeof externalOrderLineSchema>;

export const externalOrderSchema = z.object({
  externalOrderId: z.string().min(1),
  source: z.enum(ORDER_SOURCES),
  placedAt: z.number().int(),
  totalAmount: z.number().nonnegative(),
  notes: z.string().nullable().default(null),
  lines: z.array(externalOrderLineSchema).min(1),
});
export type ExternalOrder = z.infer<typeof externalOrderSchema>;

const MANUAL_CHANNELS = ['manual_entry', 'mock_online', 'mock_offline'] as const;
export type ManualSubmitChannel = (typeof MANUAL_CHANNELS)[number];

export const submitManualOrderInputSchema = z.object({
  channel: z.enum(MANUAL_CHANNELS),
  externalRef: z.string().max(120).nullable().default(null),
  notes: z.string().max(500).nullable().default(null),
  lines: z.array(externalOrderLineSchema).min(1),
});
export type SubmitManualOrderInput = z.infer<typeof submitManualOrderInputSchema>;

export const orderingChannelSchema = z.object({
  id: idSchema,
  tenantId: z.number().int(),
  key: z.string().min(1),
  displayName: z.string().min(1),
  enabled: z.boolean(),
  pollingIntervalSeconds: z.number().int().positive(),
  isMock: z.boolean(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});
export type OrderingChannel = z.infer<typeof orderingChannelSchema>;

export const listOrderingChannelsInputSchema = z.object({
  enabledOnly: z.boolean().default(false),
});
export type ListOrderingChannelsInput = z.infer<typeof listOrderingChannelsInputSchema>;
