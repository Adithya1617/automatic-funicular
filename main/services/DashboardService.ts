import type { AppDb } from '../db/client';
import { bikeRepository } from '../repositories/bikeRepository';
import { bikeTypeRepository } from '../repositories/bikeTypeRepository';
import { ingredientRepository } from '../repositories/ingredientRepository';
import { invoiceLineRepository } from '../repositories/invoiceLineRepository';
import { invoiceRepository } from '../repositories/invoiceRepository';
import { recipeRepository } from '../repositories/recipeRepository';
import { serviceEventLineRepository } from '../repositories/serviceEventLineRepository';
import { serviceEventRepository } from '../repositories/serviceEventRepository';
import { serviceTemplateRepository } from '../repositories/serviceTemplateRepository';
import { stockMovementRepository } from '../repositories/stockMovementRepository';
import type {
  CostPerBikeResponse,
  CostPerBikeRow,
  CostPerBikeTypeResponse,
  CostPerBikeTypeRow,
  DateRange,
  LowStockResponse,
  ReorderResponse,
  ServiceVolumeResponse,
  SpendingByCategory,
  SpendingByIngredient,
  SpendingResponse,
  StockValueResponse,
  StockValueSeriesResponse,
  TheoreticalServiceCostResponse,
  TheoreticalServiceCostRow,
  TopConsumedPartsResponse,
  TopConsumedPartsRow,
  WastageResponse,
} from '@shared/schemas/dashboard';
import type { StockMovementReason } from '@shared/constants/enums';
import { REORDER_LEAD_TIME_DAYS } from '@shared/constants/system';
import { toBase } from '@shared/utils/unitConverter';
import { formatBikeTypeLabel } from '@shared/utils/bikeType';

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

  /* --------------- Hyprride Tile A — Cost per bike ------------------------ */
  /**
   * Walks `service_consumed` movements in the range, joins back through
   * service_event_lines → service_events → bikes, and sums |changeQty| ×
   * costPerUnitAtTime per bike. `servicesCount` counts the distinct events
   * that actually consumed stock in the range; `lastServiceAt` is the most
   * recent completedAt for that bike (any event in the range).
   *
   * Cancelled-with-partsUsed=true writes a `wastage` movement (counted in
   * the wastage tile) AND keeps the original `service_consumed` in place,
   * so this tile correctly reflects what was installed on the bike.
   * Cancelled-with-partsUsed=false writes `service_reversal` which is
   * NOT included here — the bike never received the part, the original
   * consumption is offset, and the cost shouldn't show against the bike.
   */
  costPerBike(db: AppDb, tenantId: number, range: DateRange): CostPerBikeResponse {
    const movements = stockMovementRepository.listInRange(db, tenantId, range, [
      'service_consumed',
      'service_reversal',
    ]);

    // Resolve each movement's referenceId (line id) back to its event by
    // listing all event lines for events in range. This is bounded by the
    // number of completed/cancelled events in the range — far smaller than
    // walking every movement individually.
    const eventRows = serviceEventRepository.listInRange(db, tenantId, range);
    const eventLinesByEvent = serviceEventLineRepository.listForEvents(
      db,
      eventRows.map((e) => e.id),
    );
    const lineToEvent = new Map<string, string>();
    for (const l of eventLinesByEvent) {
      lineToEvent.set(l.id, l.serviceEventId);
    }
    const eventById = new Map(eventRows.map((e) => [e.id, e]));

    const bikeIds = uniq(eventRows.map((e) => e.bikeId));
    const bikes = bikeIds
      .map((id) => bikeRepository.findById(db, tenantId, id))
      .filter((b): b is NonNullable<typeof b> => Boolean(b));
    const bikeById = new Map(bikes.map((b) => [b.id, b]));
    const bikeTypes = bikeTypeRepository.list(db, tenantId, { includeInactive: true });
    const bikeTypeById = new Map(bikeTypes.map((t) => [t.id, t]));

    type Agg = {
      bikeId: string;
      partsCost: number;
      services: Set<string>;
      lastServiceAt: number | null;
    };
    const byBike = new Map<string, Agg>();
    function ensure(bikeId: string): Agg {
      const existing = byBike.get(bikeId);
      if (existing) return existing;
      const created: Agg = { bikeId, partsCost: 0, services: new Set(), lastServiceAt: null };
      byBike.set(bikeId, created);
      return created;
    }

    for (const m of movements) {
      const lineId = m.referenceId;
      if (!lineId) continue;
      const eventId = lineToEvent.get(lineId);
      if (!eventId) continue;
      const event = eventById.get(eventId);
      if (!event) continue;
      const agg = ensure(event.bikeId);
      const cost = (m.costPerUnitAtTime ?? 0) * Math.abs(m.changeQuantity);
      // service_consumed adds; service_reversal subtracts (it offsets the
      // original consumption so the bike's net cost reflects what stayed).
      if (m.reason === 'service_consumed') agg.partsCost += cost;
      else if (m.reason === 'service_reversal') agg.partsCost -= cost;
      agg.services.add(eventId);
      const completedAt = event.completedAt ?? event.startedAt;
      if (agg.lastServiceAt === null || completedAt > agg.lastServiceAt) {
        agg.lastServiceAt = completedAt;
      }
    }

    const rows: CostPerBikeRow[] = [];
    for (const agg of byBike.values()) {
      const bike = bikeById.get(agg.bikeId);
      if (!bike) continue;
      const bikeType = bikeTypeById.get(bike.bikeTypeId);
      rows.push({
        bikeId: bike.id,
        bikeNumber: bike.bikeNumber,
        bikeTypeId: bike.bikeTypeId,
        bikeTypeName: bikeType ? formatBikeTypeLabel(bikeType) : '(unknown)',
        partsCost: round2(Math.max(0, agg.partsCost)),
        servicesCount: agg.services.size,
        lastServiceAt: agg.lastServiceAt,
      });
    }
    rows.sort((a, b) => b.partsCost - a.partsCost);

    return {
      totalCost: round2(rows.reduce((acc, r) => acc + r.partsCost, 0)),
      rows,
    };
  },

  /* --------------- Hyprride Tile B — Cost per bike type ------------------- */
  /**
   * Rollup of costPerBike() by bike_type, plus the number of distinct active
   * bikes in each type bucket (so the operator can read "across the 14 110cc
   * bikes we spent ₹X on Y services" at a glance).
   */
  costPerBikeType(
    db: AppDb,
    tenantId: number,
    range: DateRange,
  ): CostPerBikeTypeResponse {
    const perBike = DashboardService.costPerBike(db, tenantId, range);
    const bikeTypes = bikeTypeRepository.list(db, tenantId, { includeInactive: true });
    const activeBikes = bikeRepository.list(db, tenantId, { includeInactive: false });
    const activeCountByType = new Map<string, number>();
    for (const b of activeBikes) {
      activeCountByType.set(
        b.bikeTypeId,
        (activeCountByType.get(b.bikeTypeId) ?? 0) + 1,
      );
    }

    const byType = new Map<string, CostPerBikeTypeRow>();
    for (const t of bikeTypes) {
      byType.set(t.id, {
        bikeTypeId: t.id,
        bikeTypeName: formatBikeTypeLabel(t),
        bikeCount: activeCountByType.get(t.id) ?? 0,
        partsCost: 0,
        servicesCount: 0,
      });
    }
    for (const row of perBike.rows) {
      const agg = byType.get(row.bikeTypeId);
      if (!agg) continue;
      agg.partsCost += row.partsCost;
      agg.servicesCount += row.servicesCount;
    }
    const rows = [...byType.values()]
      .map((r) => ({ ...r, partsCost: round2(r.partsCost) }))
      .sort((a, b) => b.partsCost - a.partsCost);
    return { rows };
  },

  /* --------------- Hyprride Tile C — Top consumed parts ------------------- */
  topConsumedParts(
    db: AppDb,
    tenantId: number,
    range: DateRange,
    limit = 10,
  ): TopConsumedPartsResponse {
    const movements = stockMovementRepository.listInRange(db, tenantId, range, [
      'service_consumed',
      'service_reversal',
    ]);
    const ingredients = ingredientRepository.list(db, tenantId, { includeInactive: true });
    const ingById = new Map(ingredients.map((i) => [i.id, i]));

    type Agg = { qty: number; cost: number };
    const byIng = new Map<string, Agg>();
    for (const m of movements) {
      const agg = byIng.get(m.ingredientId) ?? { qty: 0, cost: 0 };
      const absQty = Math.abs(m.changeQuantity);
      const cost = (m.costPerUnitAtTime ?? 0) * absQty;
      // service_consumed adds, service_reversal subtracts.
      const sign = m.reason === 'service_consumed' ? 1 : -1;
      agg.qty += sign * absQty;
      agg.cost += sign * cost;
      byIng.set(m.ingredientId, agg);
    }

    const rows: TopConsumedPartsRow[] = [];
    for (const [ingredientId, agg] of byIng) {
      if (agg.qty <= 0) continue;
      const ing = ingById.get(ingredientId);
      if (!ing) continue;
      rows.push({
        ingredientId,
        ingredientName: ing.name,
        baseUnit: ing.baseUnit,
        totalQuantity: round2(agg.qty),
        totalCost: round2(Math.max(0, agg.cost)),
      });
    }
    rows.sort((a, b) => b.totalCost - a.totalCost);
    return { rows: rows.slice(0, limit) };
  },

  /* --------------- Hyprride Tile D — Service volume by bike type ---------- */
  /**
   * Count of *completed* services in the range, grouped by bike type.
   * Cancelled events don't count — they didn't actually result in
   * material consumed (or the wastage case is captured separately).
   */
  serviceVolumeByBikeType(
    db: AppDb,
    tenantId: number,
    range: DateRange,
  ): ServiceVolumeResponse {
    const events = serviceEventRepository.listInRange(db, tenantId, range, {
      status: 'completed',
    });
    const bikes = bikeRepository.list(db, tenantId, { includeInactive: true });
    const bikeById = new Map(bikes.map((b) => [b.id, b]));
    const bikeTypes = bikeTypeRepository.list(db, tenantId, { includeInactive: true });

    const countByType = new Map<string, number>();
    for (const e of events) {
      const bike = bikeById.get(e.bikeId);
      if (!bike) continue;
      countByType.set(bike.bikeTypeId, (countByType.get(bike.bikeTypeId) ?? 0) + 1);
    }

    const rows = bikeTypes
      .map((t) => ({
        bikeTypeId: t.id,
        bikeTypeName: formatBikeTypeLabel(t),
        servicesCount: countByType.get(t.id) ?? 0,
      }))
      .sort((a, b) => b.servicesCount - a.servicesCount);

    return {
      totalServices: events.length,
      rows,
    };
  },

  /* --------------- Hyprride Tile E — Theoretical service cost ------------- */
  /**
   * For every active service template, walk the active recipe version and
   * sum (qty-in-base × ingredient.currentAvgCostPerUnit). Lets the operator
   * see "this bike's standard service should cost ~₹X in parts" before any
   * event runs.
   */
  theoreticalServiceCost(
    db: AppDb,
    tenantId: number,
  ): TheoreticalServiceCostResponse {
    const templates = serviceTemplateRepository.list(db, tenantId, { includeInactive: false });
    const ingredients = ingredientRepository.list(db, tenantId, { includeInactive: true });
    const ingredientById = new Map(ingredients.map((i) => [i.id, i]));
    const bikeTypes = bikeTypeRepository.list(db, tenantId, { includeInactive: true });
    const bikeTypeById = new Map(bikeTypes.map((t) => [t.id, t]));

    const rows: TheoreticalServiceCostRow[] = templates.map((tpl) => {
      const recipe = recipeRepository.findActiveVersion(db, {
        tenantId,
        parentId: tpl.id,
        parentType: 'service_template',
      });
      let totalCost = 0;
      let hasActiveRecipe = false;
      if (recipe) {
        hasActiveRecipe = true;
        const lines = recipeRepository.ingredientsForVersion(db, recipe.id);
        for (const line of lines) {
          const ing = ingredientById.get(line.childIngredientId);
          if (!ing) continue;
          const baseQty = safeToBase(line.quantity, line.unit, ing.baseUnit, ing.densityGPerMl);
          if (baseQty === null) continue;
          totalCost += baseQty * ing.currentAvgCostPerUnit;
        }
      }
      const bt = bikeTypeById.get(tpl.bikeTypeId);
      return {
        serviceTemplateId: tpl.id,
        serviceTemplateName: tpl.name,
        bikeTypeId: tpl.bikeTypeId,
        bikeTypeName: bt ? formatBikeTypeLabel(bt) : '(unknown)',
        totalCost: round2(totalCost),
        hasActiveRecipe,
      };
    });
    rows.sort((a, b) => {
      // Stable sort by bike type then template name.
      const t = a.bikeTypeName.localeCompare(b.bikeTypeName);
      if (t !== 0) return t;
      return a.serviceTemplateName.localeCompare(b.serviceTemplateName);
    });
    return { rows };
  },
};

/**
 * Per-day consumption rate from the deduction reasons that surface in the
 * range. Used by low-stock and reorder tiles. Includes `service_consumed`
 * (Hyprride) so parts bleeding through servicing surface alongside the
 * Laurans-era sale / wastage reasons.
 */
function consumptionPerDay(db: AppDb, tenantId: number, range: DateRange): Map<string, number> {
  const movements = stockMovementRepository.listInRange(db, tenantId, range, [
    'sale',
    'wastage',
    'staff_meal',
    'service_consumed',
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
