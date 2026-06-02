import { and, asc, desc, eq, gte, inArray, lt, sql, type SQL } from 'drizzle-orm';
import type { AppDb } from '../db/client';
import {
  stockMovements,
  type StockMovementRow,
  type StockMovementInsert,
} from '../db/schema';
import type {
  StockMovementReason,
  StockMovementReferenceType,
} from '@shared/constants/enums';

export type ListMovementsFilter = {
  ingredientId?: string;
  reason?: StockMovementReason;
  limit?: number;
  /** occurredAt cursor — return rows older than this. */
  before?: number;
};

export type DateRange = { startMs: number; endMs: number };

export const stockMovementRepository = {
  list(
    db: AppDb,
    tenantId: number,
    filter: ListMovementsFilter = {},
  ): StockMovementRow[] {
    const conditions: SQL[] = [eq(stockMovements.tenantId, tenantId)];
    if (filter.ingredientId)
      conditions.push(eq(stockMovements.ingredientId, filter.ingredientId));
    if (filter.reason) conditions.push(eq(stockMovements.reason, filter.reason));
    if (filter.before !== undefined)
      conditions.push(lt(stockMovements.occurredAt, filter.before));
    return db
      .select()
      .from(stockMovements)
      .where(and(...conditions))
      .orderBy(desc(stockMovements.occurredAt))
      .limit(Math.max(1, Math.min(500, filter.limit ?? 50)))
      .all();
  },

  insert(db: AppDb, row: StockMovementInsert): StockMovementRow {
    return db.insert(stockMovements).values(row).returning().get();
  },

  /** Sum signed change_quantity per ingredient — used by reconciliation. */
  sumByIngredient(db: AppDb, tenantId: number): Array<{ ingredientId: string; total: number }> {
    const rows = db
      .select({
        ingredientId: stockMovements.ingredientId,
        total: sql<number>`SUM(${stockMovements.changeQuantity})`,
      })
      .from(stockMovements)
      .where(eq(stockMovements.tenantId, tenantId))
      .groupBy(stockMovements.ingredientId)
      .all();
    return rows.map((r) => ({ ingredientId: r.ingredientId, total: r.total ?? 0 }));
  },

  /**
   * Movements occurring inside the half-open range [start, end). Used by
   * DashboardService for COGS, wastage, spending. Optional reason filter
   * narrows to one or more reasons in a single query.
   */
  listInRange(
    db: AppDb,
    tenantId: number,
    range: DateRange,
    reasons?: StockMovementReason[],
  ): StockMovementRow[] {
    const conditions: SQL[] = [
      eq(stockMovements.tenantId, tenantId),
      gte(stockMovements.occurredAt, range.startMs),
      lt(stockMovements.occurredAt, range.endMs),
    ];
    if (reasons && reasons.length > 0) {
      conditions.push(inArray(stockMovements.reason, reasons));
    }
    return db
      .select()
      .from(stockMovements)
      .where(and(...conditions))
      .orderBy(asc(stockMovements.occurredAt))
      .all();
  },

  /**
   * Movements pointing at any of the given reference rows (e.g. service event
   * lines). Used to value a service / repair from its immutable cost snapshots.
   * Hits the (reference_type, reference_id) index.
   */
  listByReferenceIds(
    db: AppDb,
    tenantId: number,
    referenceType: StockMovementReferenceType,
    referenceIds: string[],
  ): StockMovementRow[] {
    if (referenceIds.length === 0) return [];
    return db
      .select()
      .from(stockMovements)
      .where(
        and(
          eq(stockMovements.tenantId, tenantId),
          eq(stockMovements.referenceType, referenceType),
          inArray(stockMovements.referenceId, referenceIds),
        ),
      )
      .all();
  },

  /**
   * Movements occurring at or after `sinceMs`, ordered ascending. Used by
   * the stock-value sparkline to walk forward from a snapshot point.
   */
  listSince(
    db: AppDb,
    tenantId: number,
    sinceMs: number,
  ): StockMovementRow[] {
    return db
      .select()
      .from(stockMovements)
      .where(
        and(
          eq(stockMovements.tenantId, tenantId),
          gte(stockMovements.occurredAt, sinceMs),
        ),
      )
      .orderBy(asc(stockMovements.occurredAt))
      .all();
  },

};
