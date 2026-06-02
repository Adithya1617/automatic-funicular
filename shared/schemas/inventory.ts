import { z } from 'zod';
import { MANUAL_ADJUSTMENT_REASONS, STOCK_MOVEMENT_REASONS, STOCK_MOVEMENT_REFERENCE_TYPES } from '../constants/enums';
import { idSchema } from './id';

/**
 * Input to InventoryService.applyMovement. The quantity is in `unit`
 * (the user-facing unit), the service converts to ingredient base unit.
 * `signedDirection` lets manual adjustments specify add vs deduct without
 * having to encode it in `quantity`.
 */
export const applyMovementInputSchema = z.object({
  ingredientId: idSchema,
  quantity: z.number().positive(),
  unit: z.string().min(1),
  reason: z.enum(STOCK_MOVEMENT_REASONS),
  referenceType: z.enum(STOCK_MOVEMENT_REFERENCE_TYPES),
  referenceId: z.string().optional(),
  notes: z.string().max(500).optional(),
  occurredAt: z.number().int().optional(),
  costPerUnitAtTime: z.number().nonnegative().optional(),
  /** +1 to increase stock, -1 to decrease. */
  direction: z.union([z.literal(1), z.literal(-1)]),
});
export type ApplyMovementInput = z.infer<typeof applyMovementInputSchema>;

/**
 * Convenience input for the manual-adjustment dialog. Reasons are
 * restricted to the user-driven subset (no `purchase`, no `sale`).
 */
export const manualAdjustmentInputSchema = z.object({
  ingredientId: idSchema,
  quantity: z.number().positive(),
  unit: z.string().min(1),
  reason: z.enum(MANUAL_ADJUSTMENT_REASONS),
  /** Plus or minus relative to current stock. Wastage/staff_meal are
   * always negative regardless of choice — service enforces. */
  direction: z.union([z.literal(1), z.literal(-1)]),
  notes: z.string().max(500).optional(),
});
export type ManualAdjustmentInput = z.infer<typeof manualAdjustmentInputSchema>;

/**
 * Convenience input for the "Buy Parts" page. Records a stock purchase for an
 * existing part: always increases stock (direction is forced +1 by the
 * service) and, when a `costPerUnit` is supplied, feeds the weighted-average
 * cost recompute. `costPerUnit` is in `unit` (e.g. ₹ per L); the service
 * normalizes it to ₹ per base unit.
 */
export const recordPurchaseInputSchema = z.object({
  ingredientId: idSchema,
  quantity: z.number().positive(),
  unit: z.string().min(1),
  costPerUnit: z.number().nonnegative().optional(),
  notes: z.string().max(500).optional(),
});
export type RecordPurchaseInput = z.infer<typeof recordPurchaseInputSchema>;
