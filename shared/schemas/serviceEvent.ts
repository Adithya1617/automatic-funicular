import { z } from 'zod';
import { idSchema } from './id';

export const SERVICE_EVENT_STATUSES = ['in_progress', 'completed', 'cancelled'] as const;
export type ServiceEventStatus = (typeof SERVICE_EVENT_STATUSES)[number];

export const serviceEventLineSchema = z.object({
  id: idSchema,
  serviceEventId: idSchema,
  ingredientId: idSchema,
  quantity: z.number().positive(),
  unit: z.string().min(1),
  notes: z.string().nullable(),
  displayOrder: z.number().int(),
});
export type ServiceEventLine = z.infer<typeof serviceEventLineSchema>;

export const serviceEventSchema = z.object({
  id: idSchema,
  tenantId: z.number().int(),
  bikeId: idSchema,
  // Null on ad-hoc events (operator-driven quick service); set on
  // template-driven events with the captured version id.
  serviceTemplateId: idSchema.nullable(),
  serviceTemplateVersionId: idSchema.nullable(),
  status: z.enum(SERVICE_EVENT_STATUSES),
  startedAt: z.number().int(),
  completedAt: z.number().int().nullable(),
  cancelledAt: z.number().int().nullable(),
  cancelledPartsUsed: z.boolean().nullable(),
  odometerKm: z.number().nullable(),
  notes: z.string().nullable(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
  createdBy: z.string(),
  updatedBy: z.string(),
});
export type ServiceEvent = z.infer<typeof serviceEventSchema>;

export const serviceEventWithLinesSchema = serviceEventSchema.extend({
  lines: z.array(serviceEventLineSchema),
});
export type ServiceEventWithLines = z.infer<typeof serviceEventWithLinesSchema>;

export const createServiceEventInputSchema = z.object({
  bikeId: idSchema,
  serviceTemplateId: idSchema,
  odometerKm: z.number().nonnegative().nullable().default(null),
  notes: z.string().max(2000).nullable().default(null),
});
export type CreateServiceEventInput = z.infer<typeof createServiceEventInputSchema>;

/**
 * Ad-hoc service event input — bike + a free-form list of parts the operator
 * actually used. Used by the "Start servicing" quick flow that skips the
 * template step. The event is created with status='completed' and stock is
 * deducted in the same transaction.
 */
export const createAdHocServiceEventInputSchema = z.object({
  bikeId: idSchema,
  lines: z
    .array(
      z.object({
        ingredientId: idSchema,
        quantity: z.number().positive(),
        unit: z.string().min(1),
        notes: z.string().max(500).nullable().default(null),
      }),
    )
    .min(1),
  odometerKm: z.number().nonnegative().nullable().default(null),
  notes: z.string().max(2000).nullable().default(null),
});
export type CreateAdHocServiceEventInput = z.infer<
  typeof createAdHocServiceEventInputSchema
>;

export const serviceEventLineInputSchema = z.object({
  ingredientId: idSchema,
  quantity: z.number().positive(),
  unit: z.string().min(1),
  notes: z.string().max(500).nullable().default(null),
  displayOrder: z.number().int().default(0),
});
export type ServiceEventLineInput = z.infer<typeof serviceEventLineInputSchema>;

export const updateServiceEventLinesInputSchema = z.object({
  id: idSchema,
  lines: z.array(serviceEventLineInputSchema).min(1),
});
export type UpdateServiceEventLinesInput = z.infer<typeof updateServiceEventLinesInputSchema>;

export const completeServiceEventInputSchema = z.object({ id: idSchema });
export type CompleteServiceEventInput = z.infer<typeof completeServiceEventInputSchema>;

export const cancelServiceEventInputSchema = z.object({
  id: idSchema,
  /** Required when the event is `completed`; ignored otherwise. */
  partsUsed: z.boolean().optional(),
});
export type CancelServiceEventInput = z.infer<typeof cancelServiceEventInputSchema>;

export const listServiceEventsInputSchema = z.object({
  status: z.enum(SERVICE_EVENT_STATUSES).optional(),
  bikeId: idSchema.optional(),
  serviceTemplateId: idSchema.optional(),
  limit: z.number().int().min(1).max(500).default(200),
});
export type ListServiceEventsInput = z.infer<typeof listServiceEventsInputSchema>;

export const getServiceEventInputSchema = z.object({ id: idSchema });
export type GetServiceEventInput = z.infer<typeof getServiceEventInputSchema>;
