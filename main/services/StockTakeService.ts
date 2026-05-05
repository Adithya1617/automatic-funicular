import type { AppDb } from '../db/client';
import { newId } from '../lib/ids';
import { stockTakeLock } from '../lib/stockTakeLock';
import { ingredientRepository } from '../repositories/ingredientRepository';
import { stockTakeLineRepository } from '../repositories/stockTakeLineRepository';
import { stockTakeRepository } from '../repositories/stockTakeRepository';
import { AvailabilityService } from './AvailabilityService';
import { InventoryService } from './InventoryService';
import type {
  CommitStockTakeInput,
  DiscardStockTakeInput,
  ListStockTakesInput,
  SaveStockTakeCountInput,
  StartStockTakeInput,
  StockTake,
  StockTakeLine,
  StockTakeWithLines,
} from '@shared/schemas/stockTake';
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from '@shared/errors/DomainError';
import { SYSTEM_USER_ID } from '@shared/constants/system';

function withLines(
  take: ReturnType<typeof stockTakeRepository.findById>,
  lines: ReturnType<typeof stockTakeLineRepository.listForTake>,
): StockTakeWithLines {
  if (!take) throw new Error('withLines called with empty take');
  return {
    ...(take as unknown as StockTake),
    lines: lines as unknown as StockTakeLine[],
  };
}

export const StockTakeService = {
  list(db: AppDb, tenantId: number, filter: ListStockTakesInput): StockTake[] {
    return stockTakeRepository
      .list(db, tenantId, filter)
      .map((row) => row as unknown as StockTake);
  },

  get(db: AppDb, tenantId: number, id: string): StockTakeWithLines {
    const row = stockTakeRepository.findById(db, tenantId, id);
    if (!row) throw new NotFoundError('StockTake', id);
    const lines = stockTakeLineRepository.listForTake(db, id);
    return withLines(row, lines);
  },

  /** Returns the open take for this tenant, or null if none. */
  getInProgress(db: AppDb, tenantId: number): StockTakeWithLines | null {
    const row = stockTakeRepository.findInProgress(db, tenantId);
    if (!row) return null;
    const lines = stockTakeLineRepository.listForTake(db, row.id);
    return withLines(row, lines);
  },

  /**
   * Starts a stock take. Snapshots `stock_quantity` of every active ingredient
   * into `stock_take_lines.book_quantity` (locked decision §6.7 / SPEC §7.8).
   * Sets the cross-module `stockTakeLock` so the order poller skips ticks
   * until commit or discard.
   */
  start(
    db: AppDb,
    tenantId: number,
    input: StartStockTakeInput,
    actorId: string = SYSTEM_USER_ID,
  ): StockTakeWithLines {
    const open = stockTakeRepository.findInProgress(db, tenantId);
    if (open) {
      throw new ConflictError(
        `A stock take is already in progress (${open.id}); commit or discard it first`,
      );
    }
    const ingredients = ingredientRepository.list(db, tenantId, { includeInactive: false });
    if (ingredients.length === 0) {
      throw new ValidationError('No active ingredients to count');
    }

    const result = db.transaction((tx) => {
      const now = Date.now();
      const id = newId();
      const inserted = stockTakeRepository.insert(tx, {
        id,
        tenantId,
        startedAt: now,
        completedAt: null,
        status: 'in_progress',
        notes: input.notes,
        createdAt: now,
        updatedAt: now,
        createdBy: actorId,
        updatedBy: actorId,
      });
      const lineRows = stockTakeLineRepository.insertMany(
        tx,
        ingredients.map((ing) => ({
          id: newId(),
          stockTakeId: id,
          ingredientId: ing.id,
          bookQuantity: ing.stockQuantity,
          countedQuantity: null,
          difference: null,
        })),
      );
      return withLines(inserted, lineRows);
    });

    stockTakeLock.value = result.id;
    return result;
  },

  /**
   * Save-as-you-go count update for a single line. No-op if the line belongs
   * to a take that is no longer in_progress (e.g. user committed in another
   * window) — that surfaces as a NotFoundError-flavored ConflictError.
   */
  saveCount(
    db: AppDb,
    tenantId: number,
    input: SaveStockTakeCountInput,
  ): StockTakeLine {
    const line = stockTakeLineRepository.findById(db, input.lineId);
    if (!line) throw new NotFoundError('StockTakeLine', input.lineId);
    const take = stockTakeRepository.findById(db, tenantId, line.stockTakeId);
    if (!take) throw new NotFoundError('StockTake', line.stockTakeId);
    if (take.status !== 'in_progress') {
      throw new ConflictError('Cannot edit counts on a closed stock take');
    }
    const updated = stockTakeLineRepository.updateCounted(
      db,
      input.lineId,
      input.countedQuantity,
    );
    if (!updated) throw new NotFoundError('StockTakeLine', input.lineId);
    return updated as unknown as StockTakeLine;
  },

  /**
   * Commit. For each line where `counted ≠ book` (and counted is set), write a
   * single `adjustment` movement with the delta in the ingredient's base unit.
   * Discards lines without a counted value (operator left them unchecked).
   * Re-enables the order poller after a successful commit.
   */
  commit(
    db: AppDb,
    tenantId: number,
    input: CommitStockTakeInput,
    actorId: string = SYSTEM_USER_ID,
  ): StockTakeWithLines {
    const take = stockTakeRepository.findById(db, tenantId, input.id);
    if (!take) throw new NotFoundError('StockTake', input.id);
    if (take.status !== 'in_progress') {
      throw new ConflictError(`Cannot commit a stock take in status ${take.status}`);
    }
    const lines = stockTakeLineRepository.listForTake(db, input.id);

    const touchedIngredients = new Set<string>();

    db.transaction((tx) => {
      for (const line of lines) {
        if (line.countedQuantity === null || line.countedQuantity === undefined) {
          stockTakeLineRepository.setDifference(tx, line.id, null);
          continue;
        }
        const ingredient = ingredientRepository.findById(tx, tenantId, line.ingredientId);
        if (!ingredient) {
          // Ingredient deleted between start and commit — skip but record diff.
          stockTakeLineRepository.setDifference(tx, line.id, null);
          continue;
        }
        // Re-read book at commit-time so a movement that landed *during* the
        // count (shouldn't happen with the lock, but be safe) doesn't get
        // re-applied. Operator's count is authoritative.
        const currentStock = ingredient.stockQuantity;
        const delta = line.countedQuantity - currentStock;
        stockTakeLineRepository.setDifference(tx, line.id, delta);
        if (delta === 0) continue;
        touchedIngredients.add(ingredient.id);
        InventoryService.applyMovement(
          tx,
          tenantId,
          {
            ingredientId: ingredient.id,
            quantity: Math.abs(delta),
            unit: ingredient.baseUnit,
            reason: 'adjustment',
            referenceType: 'stock_take',
            referenceId: take.id,
            direction: delta > 0 ? 1 : -1,
            notes: `Stock take ${take.id}`,
          },
          actorId,
          { skipAvailabilityRecompute: true },
        );
      }

      const now = Date.now();
      stockTakeRepository.update(tx, tenantId, input.id, {
        status: 'committed',
        completedAt: now,
        notes: input.notes ?? take.notes,
        updatedAt: now,
        updatedBy: actorId,
      });
    });

    if (stockTakeLock.value === input.id) stockTakeLock.value = null;
    if (touchedIngredients.size > 0) {
      AvailabilityService.recomputeForIngredients(db, tenantId, [...touchedIngredients]);
    }
    return StockTakeService.get(db, tenantId, input.id);
  },

  /** Discard. Stock untouched; just close the take and free the lock. */
  discard(
    db: AppDb,
    tenantId: number,
    input: DiscardStockTakeInput,
    actorId: string = SYSTEM_USER_ID,
  ): StockTakeWithLines {
    const take = stockTakeRepository.findById(db, tenantId, input.id);
    if (!take) throw new NotFoundError('StockTake', input.id);
    if (take.status !== 'in_progress') {
      throw new ConflictError(`Cannot discard a stock take in status ${take.status}`);
    }
    const now = Date.now();
    stockTakeRepository.update(db, tenantId, input.id, {
      status: 'discarded',
      completedAt: now,
      updatedAt: now,
      updatedBy: actorId,
    });
    if (stockTakeLock.value === input.id) stockTakeLock.value = null;
    return StockTakeService.get(db, tenantId, input.id);
  },
};
