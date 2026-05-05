import type { AppDb } from '../db/client';
import { ingredientRepository } from '../repositories/ingredientRepository';
import { invoiceLineRepository } from '../repositories/invoiceLineRepository';
import { invoiceRepository } from '../repositories/invoiceRepository';
import { menuItemRepository } from '../repositories/menuItemRepository';
import { orderLineRepository } from '../repositories/orderLineRepository';
import { orderRepository } from '../repositories/orderRepository';
import { recipeRepository } from '../repositories/recipeRepository';
import { stockMovementRepository } from '../repositories/stockMovementRepository';
import type {
  ChannelRollupResponse,
  CogsByMenuItem,
  CogsResponse,
  DateRange,
  FoodCostResponse,
  LowStockResponse,
  ReorderResponse,
  SpendingByCategory,
  SpendingByIngredient,
  SpendingResponse,
  StockValueResponse,
  StockValueSeriesResponse,
  TopDishesResponse,
  WastageResponse,
} from '@shared/schemas/dashboard';
import type { OrderSource, StockMovementReason } from '@shared/constants/enums';
import { ORDER_SOURCES } from '@shared/constants/enums';
import { REORDER_LEAD_TIME_DAYS } from '@shared/constants/system';
import { toBase } from '@shared/utils/unitConverter';

const MS_PER_DAY = 24 * 60 * 60 * 1_000;

/** Days the range spans (always >= 1 to avoid divide-by-zero). */
function daysInRange(range: DateRange): number {
  return Math.max(1, (range.endMs - range.startMs) / MS_PER_DAY);
}

/** Bucket boundaries for the sparkline — daily ticks aligned to UTC midnight. */
function dailyBuckets(range: DateRange): number[] {
  const buckets: number[] = [];
  const startDay = Math.floor(range.startMs / MS_PER_DAY) * MS_PER_DAY;
  for (let t = startDay; t <= range.endMs; t += MS_PER_DAY) {
    if (t >= range.startMs) buckets.push(t);
  }
  // Always include the endpoint so the chart hits the latest value.
  if (buckets[buckets.length - 1] !== range.endMs) buckets.push(range.endMs);
  return buckets;
}

export const DashboardService = {
  /* --------------------------------- Tile 1 --------------------------------- */
  stockValue(db: AppDb, tenantId: number): StockValueResponse {
    const ingredients = ingredientRepository.list(db, tenantId, { includeInactive: false });
    const total = ingredients.reduce(
      (acc, i) => acc + i.stockQuantity * i.currentAvgCostPerUnit,
      0,
    );
    return { asOfMs: Date.now(), totalValue: round2(total) };
  },

  /* ------------------------- Tile 1 (sparkline series) ----------------------
   * Walk forward from `range.start`. We don't have historical avg-cost so we
   * value each ingredient at its *current* avg cost across all buckets — this
   * matches the "stock value over time" headline definition (qty × cost-now).
   * Future work could snapshot cost on every movement and integrate.
   * --------------------------------------------------------------------------*/
  stockValueSeries(
    db: AppDb,
    tenantId: number,
    range: DateRange,
  ): StockValueSeriesResponse {
    const ingredients = ingredientRepository.list(db, tenantId, { includeInactive: false });
    const stockNow = new Map<string, number>();
    const cost = new Map<string, number>();
    for (const i of ingredients) {
      stockNow.set(i.id, i.stockQuantity);
      cost.set(i.id, i.currentAvgCostPerUnit);
    }

    // Stock at start = current - sum(changeQty for movements occurred >= start).
    const movementsAtOrAfterStart = stockMovementRepository.listSince(db, tenantId, range.startMs);
    const stockAtT = new Map<string, number>(stockNow);
    for (const m of movementsAtOrAfterStart) {
      stockAtT.set(m.ingredientId, (stockAtT.get(m.ingredientId) ?? 0) - m.changeQuantity);
    }

    const buckets = dailyBuckets(range);
    const points: { bucketMs: number; value: number }[] = [];

    let movementIdx = 0;
    const movementsInRange = movementsAtOrAfterStart.filter((m) => m.occurredAt < range.endMs);

    for (const bucketMs of buckets) {
      // Apply every movement strictly before this bucket boundary.
      while (
        movementIdx < movementsInRange.length &&
        movementsInRange[movementIdx]!.occurredAt <= bucketMs
      ) {
        const m = movementsInRange[movementIdx]!;
        stockAtT.set(m.ingredientId, (stockAtT.get(m.ingredientId) ?? 0) + m.changeQuantity);
        movementIdx++;
      }
      let value = 0;
      for (const [id, qty] of stockAtT) {
        value += qty * (cost.get(id) ?? 0);
      }
      points.push({ bucketMs, value: round2(value) });
    }
    return { points };
  },

  /* --------------------------------- Tile 3 (Spending) --------------------- */
  spending(db: AppDb, tenantId: number, range: DateRange): SpendingResponse {
    const invoices = invoiceRepository.listCommittedInRange(db, tenantId, range);
    const lines = invoiceLineRepository.listForInvoices(db, invoices.map((i) => i.id));

    const ingredients = ingredientRepository.list(db, tenantId, { includeInactive: true });
    const ingredientById = new Map(ingredients.map((i) => [i.id, i]));

    let totalSpend = 0;
    const categoryTotals = new Map<string, number>();
    const ingredientTotals = new Map<string, number>();

    for (const line of lines) {
      totalSpend += line.totalCost;
      if (line.ingredientId) {
        const ing = ingredientById.get(line.ingredientId);
        const category = ing?.category ?? 'Unmapped';
        categoryTotals.set(category, (categoryTotals.get(category) ?? 0) + line.totalCost);
        ingredientTotals.set(
          line.ingredientId,
          (ingredientTotals.get(line.ingredientId) ?? 0) + line.totalCost,
        );
      } else {
        categoryTotals.set('Unmapped', (categoryTotals.get('Unmapped') ?? 0) + line.totalCost);
      }
    }

    const byCategory: SpendingByCategory[] = [...categoryTotals.entries()]
      .map(([category, amount]) => ({ category, amount: round2(amount) }))
      .sort((a, b) => b.amount - a.amount);

    const topIngredients: SpendingByIngredient[] = [...ingredientTotals.entries()]
      .map(([id, amount]) => ({
        ingredientId: id,
        ingredientName: ingredientById.get(id)?.name ?? '(unknown)',
        amount: round2(amount),
      }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 10);

    return {
      totalSpend: round2(totalSpend),
      invoiceCount: invoices.length,
      byCategory,
      topIngredients,
    };
  },

  /* --------------------------------- Tile 4 (COGS) ------------------------- */
  cogs(db: AppDb, tenantId: number, range: DateRange): CogsResponse {
    const movements = stockMovementRepository.listInRange(db, tenantId, range, ['sale']);
    const orderLineIds = uniq(
      movements
        .filter((m) => m.referenceType === 'order_line' && m.referenceId)
        .map((m) => m.referenceId as string),
    );
    const orderLines = orderLineRepository.listForOrders(db, orderLineIds);
    const orderLineById = new Map(orderLines.map((l) => [l.id, l]));
    const menuItems = menuItemRepository.list(db, tenantId, { includeInactive: true });
    const menuItemById = new Map(menuItems.map((m) => [m.id, m]));

    type Agg = { menuItemId: string; menuItemName: string; qtySold: number; cogs: number; revenue: number };
    const byMenuItem = new Map<string, Agg>();
    const seenLines = new Set<string>();

    function ensure(menuItemId: string): Agg {
      const existing = byMenuItem.get(menuItemId);
      if (existing) return existing;
      const item = menuItemById.get(menuItemId);
      const created: Agg = {
        menuItemId,
        menuItemName: item?.name ?? '(deleted)',
        qtySold: 0,
        cogs: 0,
        revenue: 0,
      };
      byMenuItem.set(menuItemId, created);
      return created;
    }

    for (const m of movements) {
      const lineId = m.referenceId;
      if (!lineId) continue;
      const line = orderLineById.get(lineId);
      if (!line) continue;
      const agg = ensure(line.menuItemId);
      // Sale change is negative; absolute it.
      const cost = m.costPerUnitAtTime ?? 0;
      agg.cogs += Math.abs(m.changeQuantity) * cost;

      if (!seenLines.has(line.id)) {
        agg.qtySold += line.quantity;
        agg.revenue += line.unitPrice * line.quantity;
        seenLines.add(line.id);
      }
    }

    const rows: CogsByMenuItem[] = [...byMenuItem.values()]
      .map((r) => ({ ...r, cogs: round2(r.cogs), revenue: round2(r.revenue) }))
      .sort((a, b) => b.cogs - a.cogs);

    return {
      totalCogs: round2(rows.reduce((acc, r) => acc + r.cogs, 0)),
      totalRevenue: round2(rows.reduce((acc, r) => acc + r.revenue, 0)),
      rows,
    };
  },

  /* --------------------------------- Tile 5 (Wastage) ---------------------- */
  wastage(db: AppDb, tenantId: number, range: DateRange): WastageResponse {
    const reasons: StockMovementReason[] = ['wastage', 'prep_loss', 'staff_meal'];
    const movements = stockMovementRepository.listInRange(db, tenantId, range, reasons);
    const byReason = new Map<string, number>();
    const byIngredient = new Map<string, number>();
    const ingredients = ingredientRepository.list(db, tenantId, { includeInactive: true });
    const ingById = new Map(ingredients.map((i) => [i.id, i]));

    let total = 0;
    for (const m of movements) {
      const cost = (m.costPerUnitAtTime ?? 0) * Math.abs(m.changeQuantity);
      total += cost;
      byReason.set(m.reason, (byReason.get(m.reason) ?? 0) + cost);
      byIngredient.set(m.ingredientId, (byIngredient.get(m.ingredientId) ?? 0) + cost);
    }

    return {
      totalLoss: round2(total),
      byReason: (['wastage', 'prep_loss', 'staff_meal'] as const).map((r) => ({
        reason: r,
        amount: round2(byReason.get(r) ?? 0),
      })),
      topIngredients: [...byIngredient.entries()]
        .map(([id, amount]) => ({
          ingredientId: id,
          ingredientName: ingById.get(id)?.name ?? '(unknown)',
          amount: round2(amount),
        }))
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 10),
    };
  },

  /* --------------------------------- Tile 6 (Top dishes) ------------------- */
  topDishes(db: AppDb, tenantId: number, range: DateRange, limit = 10): TopDishesResponse {
    const cogs = DashboardService.cogs(db, tenantId, range);
    return { rows: cogs.rows.slice(0, limit) };
  },

  /* --------------------------------- Tile 7 (Low stock) -------------------- */
  lowStock(db: AppDb, tenantId: number, range: DateRange): LowStockResponse {
    const ingredients = ingredientRepository.list(db, tenantId, { includeInactive: false });
    const consumption = consumptionPerDay(db, tenantId, range);
    const rows = ingredients
      .filter((i) => i.stockQuantity < i.lowStockThreshold || (consumption.get(i.id) ?? 0) > 0)
      .map((i) => {
        const perDay = consumption.get(i.id) ?? 0;
        const daysRemaining = perDay > 0 ? i.stockQuantity / perDay : null;
        return {
          ingredientId: i.id,
          ingredientName: i.name,
          baseUnit: i.baseUnit,
          stockQuantity: i.stockQuantity,
          lowStockThreshold: i.lowStockThreshold,
          consumptionPerDay: round2(perDay),
          daysRemaining: daysRemaining === null ? null : round2(daysRemaining),
        };
      })
      .filter((r) => r.stockQuantity < r.lowStockThreshold || (r.daysRemaining !== null && r.daysRemaining < 14))
      .sort((a, b) => {
        const ad = a.daysRemaining ?? Number.POSITIVE_INFINITY;
        const bd = b.daysRemaining ?? Number.POSITIVE_INFINITY;
        return ad - bd;
      });
    return { rows };
  },

  /* --------------------------------- Tile 8 (Reorder) --------------------- */
  reorder(
    db: AppDb,
    tenantId: number,
    range: DateRange,
    leadTimeDays: number = REORDER_LEAD_TIME_DAYS,
  ): ReorderResponse {
    const ingredients = ingredientRepository.list(db, tenantId, { includeInactive: false });
    const consumption = consumptionPerDay(db, tenantId, range);
    const rows = ingredients
      .map((i) => {
        const perDay = consumption.get(i.id) ?? 0;
        const daysRemaining = perDay > 0 ? i.stockQuantity / perDay : null;
        // Suggest enough stock to cover lead time + 7 days of safety buffer.
        const target = perDay * (leadTimeDays + 7);
        const suggested = Math.max(0, target - i.stockQuantity);
        return {
          ingredientId: i.id,
          ingredientName: i.name,
          baseUnit: i.baseUnit,
          stockQuantity: i.stockQuantity,
          consumptionPerDay: round2(perDay),
          leadTimeDays,
          suggestedOrderQuantity: round2(suggested),
          daysRemaining: daysRemaining === null ? null : round2(daysRemaining),
        };
      })
      .filter((r) => r.suggestedOrderQuantity > 0)
      .sort((a, b) => {
        const ad = a.daysRemaining ?? Number.POSITIVE_INFINITY;
        const bd = b.daysRemaining ?? Number.POSITIVE_INFINITY;
        return ad - bd;
      });
    return { rows };
  },

  /* --------------------------------- Tile 9 (Food cost %) ------------------ */
  foodCost(db: AppDb, tenantId: number): FoodCostResponse {
    const menuItems = menuItemRepository.list(db, tenantId, { includeInactive: false });
    const ingredients = ingredientRepository.list(db, tenantId, { includeInactive: true });
    const ingredientById = new Map(ingredients.map((i) => [i.id, i]));

    const rows = menuItems.map((mi) => {
      const recipe = recipeRepository.findActiveVersion(db, {
        tenantId,
        parentId: mi.id,
        parentType: 'menu_item',
      });
      let recipeCost = 0;
      if (recipe) {
        const lines = recipeRepository.ingredientsForVersion(db, recipe.id);
        for (const line of lines) {
          const ing = ingredientById.get(line.childIngredientId);
          if (!ing) continue;
          const baseQty = safeToBase(line.quantity, line.unit, ing.baseUnit, ing.densityGPerMl);
          if (baseQty === null) continue;
          recipeCost += baseQty * ing.currentAvgCostPerUnit;
        }
      }
      const fcp = mi.sellingPrice > 0 ? recipeCost / mi.sellingPrice : null;
      return {
        menuItemId: mi.id,
        menuItemName: mi.name,
        sellingPrice: mi.sellingPrice,
        recipeCost: round2(recipeCost),
        foodCostPercent: fcp === null ? null : round4(fcp),
      };
    });
    return { rows };
  },

  /* ------------------------- Tile 10 + 11 (Channel rollups) --------------- */
  revenueByChannel(db: AppDb, tenantId: number, range: DateRange): ChannelRollupResponse {
    const orders = orderRepository.listInRange(db, tenantId, range, 'delivered');
    const totals = new Map<OrderSource, { revenue: number; orderCount: number }>();
    for (const source of ORDER_SOURCES) totals.set(source, { revenue: 0, orderCount: 0 });
    for (const o of orders) {
      const cur = totals.get(o.source) ?? { revenue: 0, orderCount: 0 };
      cur.revenue += o.totalAmount;
      cur.orderCount += 1;
      totals.set(o.source, cur);
    }
    return {
      rows: ORDER_SOURCES.map((source) => ({
        source,
        revenue: round2(totals.get(source)!.revenue),
        orderCount: totals.get(source)!.orderCount,
      })),
    };
  },

  orderVolumeByChannel(db: AppDb, tenantId: number, range: DateRange): ChannelRollupResponse {
    // Same shape — but counts every placed order regardless of status so
    // operators see incoming volume even if a chunk gets cancelled.
    const orders = orderRepository.listInRange(db, tenantId, range);
    const totals = new Map<OrderSource, { revenue: number; orderCount: number }>();
    for (const source of ORDER_SOURCES) totals.set(source, { revenue: 0, orderCount: 0 });
    for (const o of orders) {
      const cur = totals.get(o.source) ?? { revenue: 0, orderCount: 0 };
      cur.revenue += o.totalAmount;
      cur.orderCount += 1;
      totals.set(o.source, cur);
    }
    return {
      rows: ORDER_SOURCES.map((source) => ({
        source,
        revenue: round2(totals.get(source)!.revenue),
        orderCount: totals.get(source)!.orderCount,
      })),
    };
  },
};

/**
 * Per-day consumption rate from `sale` movements in the range. Used by
 * low-stock and reorder tiles. Adds wastage / staff_meal so an ingredient
 * that's bleeding through wastage still surfaces.
 */
function consumptionPerDay(db: AppDb, tenantId: number, range: DateRange): Map<string, number> {
  const movements = stockMovementRepository.listInRange(db, tenantId, range, [
    'sale',
    'wastage',
    'staff_meal',
  ]);
  const days = daysInRange(range);
  const totals = new Map<string, number>();
  for (const m of movements) {
    totals.set(
      m.ingredientId,
      (totals.get(m.ingredientId) ?? 0) + Math.abs(m.changeQuantity),
    );
  }
  for (const [id, qty] of totals) totals.set(id, qty / days);
  return totals;
}

function safeToBase(
  quantity: number,
  unit: string,
  baseUnit: 'g' | 'ml' | 'each',
  densityGPerMl: number | null,
): number | null {
  try {
    return toBase(quantity, unit, baseUnit, {
      densityGPerMl: densityGPerMl ?? undefined,
    });
  } catch {
    return null;
  }
}

function uniq<T>(xs: T[]): T[] {
  return [...new Set(xs)];
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}
