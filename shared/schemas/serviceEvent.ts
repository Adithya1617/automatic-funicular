import { z } from 'zod';
import { idSchema } from './id';

export const SERVICE_EVENT_STATUSES = [
  'requested',
  'in_progress',
  'completed',
  'cancelled',
] as const;
export type ServiceEventStatus = (typeof SERVICE_EVENT_STATUSES)[number];

/** UI labels for each status (in_progress reads as "Under service"). */
export const SERVICE_EVENT_STATUS_LABELS: Record<ServiceEventStatus, string> = {
  requested: 'Requested',
  in_progress: 'Under service',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

/**
 * Statuses an operator can set directly (the workflow). `cancelled` is reached
 * only through the cancel flow, so it's excluded here. Stock is deducted only
 * when an event reaches `completed`.
 */
export const SETTABLE_SERVICE_EVENT_STATUSES = [
  'requested',
  'in_progress',
  'completed',
] as const;
export type SettableServiceEventStatus =
  (typeof SETTABLE_SERVICE_EVENT_STATUSES)[number];

/**
 * The three maintenance activities sharing the service_events table:
 *   service — scheduled oil change (Engine oil only), due every 45 days.
 *   repair  — ad-hoc fix consuming any parts.
 *   wash    — cleaning, no parts / no stock, due every 15 days.
 */
export const SERVICE_EVENT_KINDS = ['service', 'repair', 'wash'] as const;
export type ServiceEventKind = (typeof SERVICE_EVENT_KINDS)[number];

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
  kind: z.enum(SERVICE_EVENT_KINDS),
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

/**
 * Event + lines annotated with the actual parts cost, derived from the
 * immutable `cost_per_unit_at_time` snapshot on each consumption movement
 * (service_consumed minus any service_reversal, clamped at 0). Used by the
 * section list pages and per-bike history. Wash events have no lines → cost 0.
 */
export const serviceEventLineWithCostSchema = serviceEventLineSchema.extend({
  cost: z.number().nonnegative(),
});
export type ServiceEventLineWithCost = z.infer<typeof serviceEventLineWithCostSchema>;

export const serviceEventWithCostSchema = serviceEventSchema.extend({
  lines: z.array(serviceEventLineWithCostSchema),
  partsCost: z.number().nonnegative(),
});
export type ServiceEventWithCost = z.infer<typeof serviceEventWithCostSchema>;

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
  // Defaulted to 'service' in ServiceService.createAdHoc when omitted so legacy
  // callers keep working. 'wash' events carry zero lines; 'service'/'repair'
  // require at least one (enforced in the service, not the schema).
  kind: z.enum(SERVICE_EVENT_KINDS).optional(),
  // Target status the event is created at. 'completed' deducts stock now;
  // 'requested' / 'in_progress' record the (planned) parts without touching
  // stock until the event is later marked completed.
  status: z.enum(SETTABLE_SERVICE_EVENT_STATUSES).optional(),
  // When the maintenance actually happened (Unix ms). Lets the operator
  // backdate a past service / repair / wash record. Drives startedAt (and
  // completedAt when created completed), so it feeds list order, the
  // maintenance countdown, and the dashboard date ranges. Null → the service
  // stamps the current time.
  occurredAt: z.number().int().positive().nullable().default(null),
  lines: z
    .array(
      z.object({
        ingredientId: idSchema,
        quantity: z.number().positive(),
        unit: z.string().min(1),
        notes: z.string().max(500).nullable().default(null),
      }),
    )
    .default([]),
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

export const setServiceEventStatusInputSchema = z.object({
  id: idSchema,
  status: z.enum(SETTABLE_SERVICE_EVENT_STATUSES),
});
export type SetServiceEventStatusInput = z.infer<
  typeof setServiceEventStatusInputSchema
>;

export const cancelServiceEventInputSchema = z.object({
  id: idSchema,
  /** Required when the event is `completed`; ignored otherwise. */
  partsUsed: z.boolean().optional(),
});
export type CancelServiceEventInput = z.infer<typeof cancelServiceEventInputSchema>;

/**
 * Full edit of an existing event (service / repair / wash) at any non-terminal
 * status — including a `completed` one, so staff can fix a mistake. Stock is
 * reconciled in `ServiceService.update`: if the event was completed its old
 * consumption is reversed and the new line set re-consumed, so inventory always
 * matches the saved parts. `wash` carries zero lines. Omitted scalar fields are
 * left unchanged; `occurredAt` (Unix ms) backdates the event when supplied.
 */
export const updateServiceEventInputSchema = z.object({
  id: idSchema,
  bikeId: idSchema.optional(),
  status: z.enum(SETTABLE_SERVICE_EVENT_STATUSES).optional(),
  lines: z.array(serviceEventLineInputSchema).default([]),
  odometerKm: z.number().nonnegative().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  occurredAt: z.number().int().positive().nullable().optional(),
});
export type UpdateServiceEventInput = z.infer<typeof updateServiceEventInputSchema>;

/**
 * Delete an event. `ServiceService.remove` restores stock first when the event
 * was `completed` (a `service_reversal` per line adds the parts back to
 * inventory) and then removes the event + its lines. The append-only stock
 * ledger keeps both the original consumption and the reversal, so reconciliation
 * still balances.
 */
export const deleteServiceEventInputSchema = z.object({ id: idSchema });
export type DeleteServiceEventInput = z.infer<typeof deleteServiceEventInputSchema>;

export const listServiceEventsInputSchema = z.object({
  status: z.enum(SERVICE_EVENT_STATUSES).optional(),
  kind: z.enum(SERVICE_EVENT_KINDS).optional(),
  bikeId: idSchema.optional(),
  serviceTemplateId: idSchema.optional(),
  limit: z.number().int().min(1).max(500).default(200),
});
export type ListServiceEventsInput = z.infer<typeof listServiceEventsInputSchema>;

export const getServiceEventInputSchema = z.object({ id: idSchema });
export type GetServiceEventInput = z.infer<typeof getServiceEventInputSchema>;
