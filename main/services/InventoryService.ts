import type { AppDb } from '../db/client';
import { newId } from '../lib/ids';
import { ingredientRepository } from '../repositories/ingredientRepository';
import { stockMovementRepository } from '../repositories/stockMovementRepository';
import { AvailabilityService } from './AvailabilityService';
import type {
  ApplyMovementInput,
  ManualAdjustmentInput,
} from '@shared/schemas/inventory';
import type { StockMovement } from '@shared/schemas/stockMovement';
import { toBase } from '@shared/utils/unitConverter';
import {
  InvariantViolationError,
  NotFoundError,
  ValidationError,
} from '@shared/errors/DomainError';
import { SYSTEM_USER_ID } from '@shared/constants/system';

/**
 * Reasons whose direction is fixed regardless of caller intent. Wastage,
 * staff meal, prep loss, `sale`, and `service_consumed` always *decrease*
 * stock; `purchase`, `production_output`, `sale_reversal`, and
 * `service_reversal` always *increase* it. `adjustment` and
 * `production_input` accept either direction.
 */
const FORCED_DIRECTION: Partial<Record<ApplyMovementInput['reason'], 1 | -1>> = {
  purchase: 1,
  production_output: 1,
  sale_reversal: 1,
  service_reversal: 1,
  sale: -1,
  wastage: -1,
  staff_meal: -1,
  prep_loss: -1,
  service_consumed: -1,
};

/**
 * Reasons that, when not given an explicit cost, snapshot the ingredient's
 * `currentAvgCostPerUnit` onto the movement so dashboard COGS / wastage
 * reports can compute |qty| × cost without joining back to the ingredient
 * (which mutates over time).  `purchase` / `production_output` are excluded
 * because they always come with an explicit cost from the caller (invoice
 * line price, computed batch cost) and that cost feeds the weighted-avg
 * recompute below.
 */
const REASONS_DEFAULT_COST_FROM_AVG: ReadonlyArray<ApplyMovementInput['reason']> = [
  'sale',
  'sale_reversal',
  'wastage',
  'prep_loss',
  'staff_meal',
  'adjustment',
  'service_consumed',
  'service_reversal',
];

export type ApplyMovementResult = {
  movement: StockMovement;
  newStockQuantity: number;
};

export type ApplyMovementOptions = {
  /**
   * Suppress the post-commit availability recompute. Multi-movement flows
   * (e.g. ProductionService.recordBatch) set this to true on each
   * applyMovement call and recompute once at the end with the union of
   * touched ingredient ids.
   */
  skipAvailabilityRecompute?: boolean;
};

export const InventoryService = {
  /**
   * The single chokepoint that writes Ingredient.stock_quantity.
   * Writes a StockMovement row and updates stock_quantity in the same
   * transaction. Throws DomainError on invariant violations; the caller
   * sees the failure as a transaction rollback.
   */
  applyMovement(
    db: AppDb,
    tenantId: number,
    input: ApplyMovementInput,
    actorId: string = SYSTEM_USER_ID,
    options: ApplyMovementOptions = {},
  ): ApplyMovementResult {
    const ingredient = ingredientRepository.findById(db, tenantId, input.ingredientId);
    if (!ingredient) throw new NotFoundError('Ingredient', input.ingredientId);

    const direction = FORCED_DIRECTION[input.reason] ?? input.direction;
    const baseQty = toBase(input.quantity, input.unit, ingredient.baseUnit, {
      densityGPerMl: ingredient.densityGPerMl ?? undefined,
    });
    if (baseQty <= 0) {
      throw new ValidationError(
        `Movement quantity must be positive after conversion (got ${baseQty})`,
      );
    }
    const change = baseQty * direction;
    const newStock = ingredient.stockQuantity + change;
    if (newStock < 0) {
      throw new InvariantViolationError(
        `Movement would drive ${ingredient.name} negative (current ${ingredient.stockQuantity} ${ingredient.baseUnit}, change ${change})`,
      );
    }

    // Cost-per-base-unit snapshot. Caller passes cost in the movement's `unit`
    // (e.g. ₹/kg); we normalize to ₹/{base_unit} so dashboard math and the
    // weighted-avg recompute share a unit basis with stock. When the caller
    // omits the cost on a non-recomputing reason, fall back to the
    // ingredient's current weighted-avg cost so every movement carries a
    // cost snapshot (spec §5.5: "an immutable snapshot for accurate
    // historical COGS").
    let costPerBaseUnit: number | null = null;
    if (input.costPerUnitAtTime !== undefined && input.costPerUnitAtTime !== null) {
      const unitToBaseFactor = baseQty / input.quantity; // positive
      costPerBaseUnit = input.costPerUnitAtTime / unitToBaseFactor;
    } else if (REASONS_DEFAULT_COST_FROM_AVG.includes(input.reason)) {
      costPerBaseUnit = ingredient.currentAvgCostPerUnit;
    }

    // Weighted-avg recompute (locked decision §3.5 / §5.5) on positive-stock
    // movements that carry a cost — `purchase` is the canonical case;
    // `production_output` lifts prepared-ingredient avg cost via its computed
    // input cost (slice-3 deferral).
    let nextAvgCost = ingredient.currentAvgCostPerUnit;
    const shouldRecomputeAvg =
      costPerBaseUnit !== null &&
      change > 0 &&
      (input.reason === 'purchase' || input.reason === 'production_output');
    if (shouldRecomputeAvg && costPerBaseUnit !== null) {
      const oldStock = ingredient.stockQuantity;
      const oldAvg = ingredient.currentAvgCostPerUnit;
      const denom = oldStock + baseQty;
      nextAvgCost = denom > 0
        ? (oldStock * oldAvg + baseQty * costPerBaseUnit) / denom
        : costPerBaseUnit;
    }

    const now = Date.now();
    const occurredAt = input.occurredAt ?? now;

    const result = db.transaction((tx) => {
      const movementRow = stockMovementRepository.insert(tx, {
        id: newId(),
        tenantId,
        ingredientId: input.ingredientId,
        changeQuantity: change,
        costPerUnitAtTime: costPerBaseUnit,
        reason: input.reason,
        referenceType: input.referenceType,
        referenceId: input.referenceId ?? null,
        notes: input.notes ?? null,
        occurredAt,
        createdAt: now,
        createdBy: actorId,
      });

      if (shouldRecomputeAvg) {
        ingredientRepository.setStockAndCost(
          tx,
          tenantId,
          input.ingredientId,
          newStock,
          nextAvgCost,
          now,
          actorId,
        );
      } else {
        ingredientRepository.setStockQuantity(
          tx,
          tenantId,
          input.ingredientId,
          newStock,
          now,
          actorId,
        );
      }

      return {
        movement: movementRow as StockMovement,
        newStockQuantity: newStock,
      };
    });

    if (!options.skipAvailabilityRecompute) {
      AvailabilityService.recomputeForIngredients(db, tenantId, [input.ingredientId]);
    }

    return result;
  },

  applyManualAdjustment(
    db: AppDb,
    tenantId: number,
    input: ManualAdjustmentInput,
    actorId: string = SYSTEM_USER_ID,
  ): ApplyMovementResult {
    return InventoryService.applyMovement(
      db,
      tenantId,
      {
        ingredientId: input.ingredientId,
        quantity: input.quantity,
        unit: input.unit,
        reason: input.reason,
        referenceType: 'manual',
        direction: input.direction,
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
      },
      actorId,
    );
  },
};

export const __internalForBatching = {
  /** Internal: skip-availability-recompute applyMovement for use inside multi-movement transactions. */
  applyMovementSkipAvailability(
    db: AppDb,
    tenantId: number,
    input: ApplyMovementInput,
    actorId: string = SYSTEM_USER_ID,
  ): ApplyMovementResult {
    return InventoryService.applyMovement(db, tenantId, input, actorId, {
      skipAvailabilityRecompute: true,
    });
  },
};
