import type { AppDb } from '../db/client';
import { newId } from '../lib/ids';
import { menuItemRepository } from '../repositories/menuItemRepository';
import { orderLineRepository } from '../repositories/orderLineRepository';
import { orderRepository } from '../repositories/orderRepository';
import { recipeRepository } from '../repositories/recipeRepository';
import { orderingAdapterRegistry } from '../adapters/ordering/registry';
import { AvailabilityService } from './AvailabilityService';
import { InventoryService } from './InventoryService';
import type {
  CancelOrderInput,
  ListOrdersInput,
  Order,
  OrderLine,
  OrderWithLines,
} from '@shared/schemas/order';
import type {
  ExternalOrder,
  SubmitManualOrderInput,
} from '@shared/schemas/ordering';
import type { OrderSource } from '@shared/constants/enums';
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from '@shared/errors/DomainError';
import { SYSTEM_USER_ID } from '@shared/constants/system';

const REVERSIBLE_REASONS = ['sale_reversal', 'wastage'] as const;

function toOrder(row: ReturnType<typeof orderRepository.findById>): Order {
  if (!row) throw new Error('toOrder called with empty row');
  return row as unknown as Order;
}

export const OrderService = {
  list(db: AppDb, tenantId: number, filter: ListOrdersInput): Order[] {
    return orderRepository
      .list(db, tenantId, filter)
      .map((r) => r as unknown as Order);
  },

  get(db: AppDb, tenantId: number, id: string): OrderWithLines {
    const row = orderRepository.findById(db, tenantId, id);
    if (!row) throw new NotFoundError('Order', id);
    const lines = orderLineRepository.listForOrder(db, id);
    return {
      ...(row as unknown as Order),
      lines: lines as unknown as OrderLine[],
    };
  },

  /**
   * Called by the poller for adapter-sourced orders, and by `createManualOrder`
   * for `manual_entry`. Inserts the Order in `pending` state with a captured
   * recipe_version_id per line (Path A snapshot, locked decision §3.3).
   */
  processIncomingOrder(
    db: AppDb,
    tenantId: number,
    input: ExternalOrder,
    actorId: string = SYSTEM_USER_ID,
  ): OrderWithLines {
    const dup = input.externalOrderId
      ? orderRepository.findByExternalId(db, tenantId, input.source, input.externalOrderId)
      : undefined;
    if (dup) {
      // Idempotent — return the existing order rather than double-inserting.
      return OrderService.get(db, tenantId, dup.id);
    }

    // Resolve menu items and capture each line's active recipe version up-front.
    const lineDrafts = input.lines.map((line) => {
      const menuItem = menuItemRepository.findById(db, tenantId, line.menuItemId);
      if (!menuItem) throw new NotFoundError('MenuItem', line.menuItemId);
      const recipe = recipeRepository.findActiveVersion(db, {
        tenantId,
        parentId: menuItem.id,
        parentType: 'menu_item',
      });
      if (!recipe) {
        throw new ValidationError(
          `Menu item "${menuItem.name}" has no active recipe — cannot accept order`,
        );
      }
      return { line, menuItem, recipe };
    });

    const computedTotal = lineDrafts.reduce(
      (acc, { line }) => acc + line.unitPrice * line.quantity,
      0,
    );

    return db.transaction((tx) => {
      const now = Date.now();
      const order = orderRepository.insert(tx, {
        id: newId(),
        tenantId,
        externalOrderId: input.externalOrderId,
        source: input.source,
        placedAt: input.placedAt,
        deliveredAt: null,
        cancelledAt: null,
        cancelledPrepared: null,
        status: 'pending',
        totalAmount: input.totalAmount > 0 ? input.totalAmount : computedTotal,
        notes: input.notes,
        createdAt: now,
        updatedAt: now,
        createdBy: actorId,
        updatedBy: actorId,
      });

      const lines = orderLineRepository.insertMany(
        tx,
        lineDrafts.map(({ line, recipe }) => ({
          id: newId(),
          orderId: order.id,
          menuItemId: line.menuItemId,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          recipeVersionId: recipe.id,
        })),
      );

      return {
        ...(order as unknown as Order),
        lines: lines as unknown as OrderLine[],
      };
    });
  },

  /**
   * Manual entry / fire-test-order. For `manual_entry` channel, writes
   * directly. For mock channels, pushes onto the adapter queue so the next
   * poller tick picks it up via the same code path real orders use.
   */
  createManualOrder(
    db: AppDb,
    tenantId: number,
    input: SubmitManualOrderInput,
    actorId: string = SYSTEM_USER_ID,
  ): OrderWithLines | { queuedOn: OrderSource } {
    const totalAmount = input.lines.reduce((acc, l) => acc + l.unitPrice * l.quantity, 0);
    const externalOrderId =
      input.externalRef && input.externalRef.trim().length > 0
        ? input.externalRef.trim()
        : `mock-${newId()}`;
    const externalOrder: ExternalOrder = {
      externalOrderId,
      source: input.channel,
      placedAt: Date.now(),
      totalAmount,
      notes: input.notes,
      lines: input.lines,
    };

    if (input.channel === 'manual_entry') {
      return OrderService.processIncomingOrder(db, tenantId, externalOrder, actorId);
    }
    const adapter = orderingAdapterRegistry.require(input.channel);
    if (!adapter.injectOrder) {
      throw new ValidationError(
        `Adapter for ${input.channel} does not accept injected orders`,
      );
    }
    adapter.injectOrder(externalOrder);
    return { queuedOn: input.channel };
  },

  markPreparing(
    db: AppDb,
    tenantId: number,
    id: string,
    actorId: string = SYSTEM_USER_ID,
  ): Order {
    const existing = orderRepository.findById(db, tenantId, id);
    if (!existing) throw new NotFoundError('Order', id);
    if (existing.status === 'preparing') return toOrder(existing);
    if (existing.status !== 'pending') {
      throw new ConflictError(`Cannot move order from ${existing.status} to preparing`);
    }
    const now = Date.now();
    const updated = orderRepository.update(db, tenantId, id, {
      status: 'preparing',
      updatedAt: now,
      updatedBy: actorId,
    });
    if (!updated) throw new NotFoundError('Order', id);
    return toOrder(updated);
  },

  /**
   * Stock deduction trigger (locked decision §3.6). Walks each line's
   * captured recipe_version, deducts at child base unit through
   * `applyMovement`. Prepared children deduct from prepared stock — no
   * BoM explosion (locked decision §3.9 / §5.9). Single transaction;
   * AvailabilityService recomputes once at the end.
   */
  markDelivered(
    db: AppDb,
    tenantId: number,
    id: string,
    actorId: string = SYSTEM_USER_ID,
  ): OrderWithLines {
    const existing = orderRepository.findById(db, tenantId, id);
    if (!existing) throw new NotFoundError('Order', id);
    if (existing.status === 'delivered') return OrderService.get(db, tenantId, id);
    if (existing.status === 'cancelled') {
      throw new ConflictError('Cannot deliver a cancelled order');
    }

    const lines = orderLineRepository.listForOrder(db, id);
    if (lines.length === 0) {
      throw new ValidationError('Order has no lines to deliver');
    }

    const touchedIngredients = new Set<string>();
    db.transaction((tx) => {
      for (const line of lines) {
        const recipeRows = recipeRepository.ingredientsForVersion(tx, line.recipeVersionId);
        for (const row of recipeRows) {
          touchedIngredients.add(row.childIngredientId);
          InventoryService.applyMovement(
            tx,
            tenantId,
            {
              ingredientId: row.childIngredientId,
              quantity: row.quantity * line.quantity,
              unit: row.unit,
              reason: 'sale',
              referenceType: 'order_line',
              referenceId: line.id,
              direction: -1,
            },
            actorId,
            { skipAvailabilityRecompute: true },
          );
        }
      }
      orderRepository.update(tx, tenantId, id, {
        status: 'delivered',
        deliveredAt: Date.now(),
        updatedAt: Date.now(),
        updatedBy: actorId,
      });
    });

    AvailabilityService.recomputeForIngredients(db, tenantId, [...touchedIngredients]);
    return OrderService.get(db, tenantId, id);
  },

  /**
   * Cancellation. Behaviour by current state (locked decision §3.2):
   *   pending|preparing → mark cancelled, no movements, `alreadyPrepared` ignored.
   *   delivered        → require `alreadyPrepared`:
   *                      false → sale_reversal movements (stock restored)
   *                      true  → wastage movements (stock NOT restored, double-deducts)
   *   cancelled        → idempotent; returns the existing record.
   */
  cancelOrder(
    db: AppDb,
    tenantId: number,
    input: CancelOrderInput,
    actorId: string = SYSTEM_USER_ID,
  ): OrderWithLines {
    const existing = orderRepository.findById(db, tenantId, input.id);
    if (!existing) throw new NotFoundError('Order', input.id);
    if (existing.status === 'cancelled') return OrderService.get(db, tenantId, input.id);

    if (existing.status === 'delivered' && input.alreadyPrepared === undefined) {
      throw new ValidationError('Cancelling a delivered order requires alreadyPrepared');
    }

    const lines = orderLineRepository.listForOrder(db, input.id);

    const touchedIngredients = new Set<string>();
    const reason: (typeof REVERSIBLE_REASONS)[number] | null =
      existing.status === 'delivered'
        ? input.alreadyPrepared
          ? 'wastage'
          : 'sale_reversal'
        : null;

    db.transaction((tx) => {
      if (reason && lines.length > 0) {
        for (const line of lines) {
          const recipeRows = recipeRepository.ingredientsForVersion(tx, line.recipeVersionId);
          for (const row of recipeRows) {
            touchedIngredients.add(row.childIngredientId);
            // Sale_reversal restores stock (direction +1). Wastage continues
            // to deduct (direction -1) — original sale stays in place, this
            // wastage records the loss for cost reporting per §5.2.
            const direction = reason === 'sale_reversal' ? 1 : -1;
            InventoryService.applyMovement(
              tx,
              tenantId,
              {
                ingredientId: row.childIngredientId,
                quantity: row.quantity * line.quantity,
                unit: row.unit,
                reason,
                referenceType: 'order_line',
                referenceId: line.id,
                direction,
              },
              actorId,
              { skipAvailabilityRecompute: true },
            );
          }
        }
      }

      const now = Date.now();
      orderRepository.update(tx, tenantId, input.id, {
        status: 'cancelled',
        cancelledAt: now,
        cancelledPrepared:
          existing.status === 'delivered' ? input.alreadyPrepared ?? null : null,
        updatedAt: now,
        updatedBy: actorId,
      });
    });

    if (touchedIngredients.size > 0) {
      AvailabilityService.recomputeForIngredients(db, tenantId, [...touchedIngredients]);
    }
    return OrderService.get(db, tenantId, input.id);
  },
};
