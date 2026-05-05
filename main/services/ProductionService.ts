import type { AppDb } from '../db/client';
import { newId } from '../lib/ids';
import { ingredientRepository } from '../repositories/ingredientRepository';
import { productionBatchRepository } from '../repositories/productionBatchRepository';
import { recipeRepository } from '../repositories/recipeRepository';
import { InventoryService } from './InventoryService';
import { AvailabilityService } from './AvailabilityService';
import type {
  ListBatchesInput,
  ProductionBatch,
  RecordBatchInput,
  RecordBatchResult,
} from '@shared/schemas/production';
import type { StockMovement } from '@shared/schemas/stockMovement';
import { NotFoundError, ValidationError } from '@shared/errors/DomainError';
import { SYSTEM_USER_ID } from '@shared/constants/system';
import { toBase } from '@shared/utils/unitConverter';

export const ProductionService = {
  list(db: AppDb, tenantId: number, filter: ListBatchesInput): ProductionBatch[] {
    const f: Parameters<typeof productionBatchRepository.list>[2] = {};
    if (filter.preparedIngredientId) f.preparedIngredientId = filter.preparedIngredientId;
    if (filter.limit !== undefined) f.limit = filter.limit;
    return productionBatchRepository
      .list(db, tenantId, f)
      .map((row) => row as unknown as ProductionBatch);
  },

  /**
   * Records a production batch. In one transaction:
   *   - production_input movement per recipe row (deducts the constituent)
   *   - production_output on the prepared ingredient at expected_yield (+)
   *   - prep_loss on the prepared ingredient at (expected − actual) when
   *     actual_yield < expected_yield
   *   - the ProductionBatch row itself
   *
   * Net effect on prepared stock = +actual_yield. Movements all use
   * `InventoryService.applyMovement`, so the single-stock-writer invariant
   * holds and reconciliation continues to balance.
   */
  recordBatch(
    db: AppDb,
    tenantId: number,
    input: RecordBatchInput,
    actorId: string = SYSTEM_USER_ID,
  ): RecordBatchResult {
    const prepared = ingredientRepository.findById(db, tenantId, input.preparedIngredientId);
    if (!prepared) throw new NotFoundError('Ingredient', input.preparedIngredientId);
    if (prepared.type !== 'prepared') {
      throw new ValidationError(
        `Production batches require a prepared ingredient (${prepared.name} is ${prepared.type})`,
      );
    }

    const recipe = input.recipeVersionId
      ? recipeRepository.findVersionById(db, tenantId, input.recipeVersionId)
      : recipeRepository.findActiveVersion(db, {
          tenantId,
          parentId: prepared.id,
          parentType: 'ingredient',
        });
    if (!recipe) {
      throw new NotFoundError(
        'RecipeVersion',
        input.recipeVersionId ?? `active@${prepared.id}`,
      );
    }
    if (recipe.parentId !== prepared.id || recipe.parentType !== 'ingredient') {
      throw new ValidationError("recipe_version doesn't belong to this prepared ingredient");
    }

    const rows = recipeRepository.ingredientsForVersion(db, recipe.id);
    if (rows.length === 0) {
      throw new ValidationError('Recipe has no ingredients to consume');
    }

    const expectedYield = input.expectedYield ?? recipe.targetYield;
    const actualYield = input.actualYield;
    if (actualYield <= 0 || expectedYield <= 0) {
      throw new ValidationError('Yields must be positive');
    }
    const prepLoss = expectedYield - actualYield;

    const producedAt = input.producedAt ?? Date.now();
    const referenceId = newId();
    const movements: StockMovement[] = [];
    const touchedIngredients = new Set<string>([prepared.id]);

    // Pre-compute total input cost in the prepared ingredient's base unit so
    // the production_output movement can carry a meaningful
    // cost_per_unit_at_time. Each child's cost_per_base_unit comes from its
    // existing currentAvgCostPerUnit (set by prior `purchase` movements).
    let totalInputCostBase = 0;
    for (const row of rows) {
      const child = ingredientRepository.findById(db, tenantId, row.childIngredientId);
      if (!child) throw new NotFoundError('Ingredient', row.childIngredientId);
      const baseQty = toBase(row.quantity, row.unit, child.baseUnit, {
        densityGPerMl: child.densityGPerMl ?? undefined,
      });
      totalInputCostBase += baseQty * child.currentAvgCostPerUnit;
    }
    const outputCostPerBase = expectedYield > 0 ? totalInputCostBase / expectedYield : 0;

    const result = db.transaction((tx) => {
      // 1. production_input — one per recipe row, signed via applyMovement.
      //    Pass the child's avg cost in the row's unit so the movement records
      //    a non-zero cost_per_unit_at_time (used by COGS reports).
      for (const row of rows) {
        touchedIngredients.add(row.childIngredientId);
        const child = ingredientRepository.findById(tx, tenantId, row.childIngredientId);
        if (!child) throw new NotFoundError('Ingredient', row.childIngredientId);
        const baseQty = toBase(row.quantity, row.unit, child.baseUnit, {
          densityGPerMl: child.densityGPerMl ?? undefined,
        });
        const unitToBase = baseQty / row.quantity;
        const costPerRowUnit = child.currentAvgCostPerUnit * unitToBase;
        const result = InventoryService.applyMovement(
          tx,
          tenantId,
          {
            ingredientId: row.childIngredientId,
            quantity: row.quantity,
            unit: row.unit,
            reason: 'production_input',
            referenceType: 'production_batch',
            referenceId,
            direction: -1,
            costPerUnitAtTime: costPerRowUnit,
          },
          actorId,
          { skipAvailabilityRecompute: true },
        );
        movements.push(result.movement);
      }

      // 2. production_output — recipe ran, at expected_yield. Cost is the
      //    total input cost / expected_yield (in prepared base unit). The
      //    weighted-avg recompute inside applyMovement folds this into the
      //    prepared ingredient's currentAvgCostPerUnit.
      const outputResult = InventoryService.applyMovement(
        tx,
        tenantId,
        {
          ingredientId: prepared.id,
          quantity: expectedYield,
          unit: prepared.baseUnit,
          reason: 'production_output',
          referenceType: 'production_batch',
          referenceId,
          direction: 1,
          costPerUnitAtTime: outputCostPerBase,
        },
        actorId,
        { skipAvailabilityRecompute: true },
      );
      movements.push(outputResult.movement);

      // 3. prep_loss — the gap between expected and actual yield.
      if (prepLoss > 0) {
        const lossResult = InventoryService.applyMovement(
          tx,
          tenantId,
          {
            ingredientId: prepared.id,
            quantity: prepLoss,
            unit: prepared.baseUnit,
            reason: 'prep_loss',
            referenceType: 'production_batch',
            referenceId,
            direction: -1,
          },
          actorId,
          { skipAvailabilityRecompute: true },
        );
        movements.push(lossResult.movement);
      }

      const now = Date.now();
      const batch = productionBatchRepository.insert(tx, {
        id: referenceId,
        tenantId,
        preparedIngredientId: prepared.id,
        recipeVersionId: recipe.id,
        expectedYield,
        actualYield,
        producedAt,
        notes: input.notes,
        createdAt: now,
        updatedAt: now,
        createdBy: actorId,
        updatedBy: actorId,
      });

      return { batch: batch as unknown as ProductionBatch, movements };
    });

    AvailabilityService.recomputeForIngredients(db, tenantId, [...touchedIngredients]);
    return result;
  },
};
