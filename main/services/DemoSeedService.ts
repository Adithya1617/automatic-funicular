import { eq, inArray } from 'drizzle-orm';
import type { AppDb } from '../db/client';
import { newId } from '../lib/ids';
import { bikeRepository } from '../repositories/bikeRepository';
import { bikeTypeRepository } from '../repositories/bikeTypeRepository';
import { ingredientRepository } from '../repositories/ingredientRepository';
import { serviceEventLineRepository } from '../repositories/serviceEventLineRepository';
import { serviceEventRepository } from '../repositories/serviceEventRepository';
import { stockMovementRepository } from '../repositories/stockMovementRepository';
import { supplierRepository } from '../repositories/supplierRepository';
import { InventoryService } from './InventoryService';
import { SYSTEM_USER_ID } from '@shared/constants/system';
import {
  bikes,
  ingredients,
  invoiceLines,
  invoices,
  recipeIngredients,
  recipeVersions,
  serviceEventLines,
  serviceEvents,
  serviceTemplates,
  stockMovements,
  stockTakeLines,
  stockTakes,
  suppliers,
  type BikeTypeRow,
  type IngredientRow,
} from '../db/schema';

const DAY_MS = 24 * 60 * 60 * 1000;

const SUPPLIER_SEEDS: Array<{
  name: string;
  contactInfo: string | null;
  notes: string | null;
}> = [
  {
    name: 'Bosch Spares',
    contactInfo: 'orders@bosch-spares.example · +91 90000 10001',
    notes: 'Brake parts + filters. Calls Mon–Sat.',
  },
  {
    name: 'Castrol Distributor',
    contactInfo: 'castrol-hyd@example.com · +91 90000 10002',
    notes: 'Engine + gear oil in 1L cans.',
  },
  {
    name: 'Local Garage Supply',
    contactInfo: '+91 90000 10003',
    notes: 'Cables, holders, miscellaneous.',
  },
];

type BikeSeed = {
  bikeNumber: string;
  bikeTypeName: string;
  engineCc: number;
  licensePlate: string;
  odometerKm: number;
};

// 34 bikes — plates from the real fleet, numbered 1..34 for friendly UI labels.
const BIKE_SEEDS: BikeSeed[] = [
  ...['TS08UL8345', 'TG08X0007', 'TG08T0480', 'TG08X0004', 'TG08T0483', 'TG08X0013', 'TS08UL8347']
    .map<BikeSeed>((plate, i) => ({
      bikeNumber: String(i + 1),
      bikeTypeName: 'Activa',
      engineCc: 110,
      licensePlate: plate,
      odometerKm: 4_500 + i * 700,
    })),
  ...['TG08T0481', 'TG08X0002', 'TG08V0534', 'TG08X0001', 'TG08AB4479', 'TG08X0017', 'TG08V0535', 'TS19G0100', 'TG08T0482', 'TG08T7938', 'TG08X0018', 'TG08X0019']
    .map<BikeSeed>((plate, i) => ({
      bikeNumber: String(i + 8),
      bikeTypeName: 'Ntorq',
      engineCc: 125,
      licensePlate: plate,
      odometerKm: 3_000 + i * 850,
    })),
  ...['TG08X0006', 'TG08X0005', 'TS08T5686', 'TG08X0003', 'TG08X0009', 'TG08X0010', 'TG08X0015']
    .map<BikeSeed>((plate, i) => ({
      bikeNumber: String(i + 20),
      bikeTypeName: 'Jupiter',
      engineCc: 125,
      licensePlate: plate,
      odometerKm: 5_500 + i * 600,
    })),
  { bikeNumber: '27', bikeTypeName: 'Raider', engineCc: 125, licensePlate: 'TS08UL8346', odometerKm: 2_400 },
  { bikeNumber: '28', bikeTypeName: 'Yamaha RayZR', engineCc: 125, licensePlate: 'TS08UL6560', odometerKm: 6_100 },
  { bikeNumber: '29', bikeTypeName: 'Hero Destiny', engineCc: 125, licensePlate: 'TS08UL4741', odometerKm: 8_300 },
  ...['TG08X0014', 'TG08X0008', 'TG08X0012', 'TG08X0016', 'TG08X0011']
    .map<BikeSeed>((plate, i) => ({
      bikeNumber: String(i + 30),
      bikeTypeName: 'Apache',
      engineCc: 160,
      licensePlate: plate,
      odometerKm: 4_800 + i * 900,
    })),
];

// Purchase batches — stocked 20 days ago so the weighted-avg cost is well-defined
// by the time the first service event lands.
const PURCHASE_SEEDS: Array<{
  partName: string;
  quantity: number;
  unit: 'g' | 'ml' | 'each';
  unitCost: number;
  daysAgo: number;
}> = [
  { partName: 'Brake pad', quantity: 80, unit: 'each', unitCost: 200, daysAgo: 50 },
  { partName: 'Brake pad', quantity: 40, unit: 'each', unitCost: 220, daysAgo: 18 },
  { partName: 'Brake shoe', quantity: 50, unit: 'each', unitCost: 150, daysAgo: 50 },
  { partName: 'Accelerator wire', quantity: 60, unit: 'each', unitCost: 80, daysAgo: 50 },
  { partName: 'Clutch wire', quantity: 60, unit: 'each', unitCost: 100, daysAgo: 50 },
  { partName: 'Engine oil', quantity: 30000, unit: 'ml', unitCost: 0.42, daysAgo: 50 },
  { partName: 'Engine oil', quantity: 10000, unit: 'ml', unitCost: 0.46, daysAgo: 15 },
  { partName: 'Gear oil', quantity: 15000, unit: 'ml', unitCost: 0.55, daysAgo: 50 },
  { partName: 'Air filter', quantity: 30, unit: 'each', unitCost: 350, daysAgo: 50 },
  { partName: 'Mobile holder', quantity: 20, unit: 'each', unitCost: 250, daysAgo: 50 },
];

// Minimum stock the operator wants on hand after a (re)seed — the seed adds a
// top-up `purchase` movement to fill whatever's missing so every part is
// guaranteed non-zero and at a known floor. Quantities are in each part's
// base unit (matches seed in `main/db/client.ts`).
const TARGET_STOCK: Array<{
  partName: string;
  target: number;
  unit: 'g' | 'ml' | 'each';
  unitCost: number;
}> = [
  { partName: 'Brake pad', target: 60, unit: 'each', unitCost: 220 },
  { partName: 'Brake shoe', target: 40, unit: 'each', unitCost: 150 },
  { partName: 'Accelerator wire', target: 40, unit: 'each', unitCost: 80 },
  { partName: 'Clutch wire', target: 40, unit: 'each', unitCost: 100 },
  { partName: 'Engine oil', target: 20000, unit: 'ml', unitCost: 0.46 },
  { partName: 'Gear oil', target: 8000, unit: 'ml', unitCost: 0.55 },
  { partName: 'Air filter', target: 25, unit: 'each', unitCost: 350 },
  { partName: 'Mobile holder', target: 15, unit: 'each', unitCost: 250 },
];

const TARGET_SERVICE_EVENTS = 30;

// Service-event patterns — varied so dashboard rollups are interesting.
type ServicePattern = {
  label: string;
  lines: Array<{ partName: string; quantity: number; unit: 'g' | 'ml' | 'each' }>;
};
const SERVICE_PATTERNS: ServicePattern[] = [
  {
    label: 'Oil change',
    lines: [
      { partName: 'Engine oil', quantity: 800, unit: 'ml' },
      { partName: 'Air filter', quantity: 1, unit: 'each' },
    ],
  },
  {
    label: 'Brake job',
    lines: [{ partName: 'Brake pad', quantity: 2, unit: 'each' }],
  },
  {
    label: 'Full service',
    lines: [
      { partName: 'Engine oil', quantity: 900, unit: 'ml' },
      { partName: 'Air filter', quantity: 1, unit: 'each' },
      { partName: 'Brake pad', quantity: 2, unit: 'each' },
    ],
  },
  {
    label: 'Accelerator wire repair',
    lines: [{ partName: 'Accelerator wire', quantity: 1, unit: 'each' }],
  },
  {
    label: 'Clutch wire repair',
    lines: [{ partName: 'Clutch wire', quantity: 1, unit: 'each' }],
  },
  {
    label: 'Brake shoe (rear)',
    lines: [{ partName: 'Brake shoe', quantity: 2, unit: 'each' }],
  },
  {
    label: 'Gear oil top-up',
    lines: [{ partName: 'Gear oil', quantity: 250, unit: 'ml' }],
  },
];

export type DemoSeedSummary = {
  suppliersCreated: number;
  bikesCreated: number;
  /** Initial historic-purchase movements added (only on the first seed run). */
  purchasesAdded: number;
  /** End-of-seed top-ups that brought any depleted part back to its target. */
  topUpsAdded: number;
  serviceEventsAdded: number;
  /** True when every step was a no-op — nothing needed adding. */
  alreadyPopulated: boolean;
};

export const DemoSeedService = {
  /**
   * Re-runnable demo seeder for prototyping/demo. Each step is idempotent —
   * suppliers/bikes only add what's missing, historic purchases only run on
   * the very first seed, service events back-fill up to TARGET_SERVICE_EVENTS,
   * and a final top-up `purchase` ensures every part ends with at least its
   * TARGET_STOCK. Click the button as many times as you like — depleted parts
   * get topped back up, missing services get back-filled.
   */
  run(
    db: AppDb,
    tenantId: number,
    actorId: string = SYSTEM_USER_ID,
  ): DemoSeedSummary {
    const bikeTypes = bikeTypeRepository.list(db, tenantId, { includeInactive: true });
    const bikeTypeKey = (cc: number, name: string) => `${cc}::${name.toLowerCase()}`;
    const bikeTypeByKey = new Map<string, BikeTypeRow>();
    for (const t of bikeTypes) bikeTypeByKey.set(bikeTypeKey(t.engineCc, t.name), t);

    const now = Date.now();
    let suppliersCreated = 0;
    let bikesCreated = 0;
    let purchasesAdded = 0;
    let topUpsAdded = 0;
    let serviceEventsAdded = 0;

    // --- Suppliers (idempotent by name) ----------------------------------
    for (const seed of SUPPLIER_SEEDS) {
      const existing = supplierRepository.findByName(db, tenantId, seed.name);
      if (existing) continue;
      supplierRepository.insert(db, {
        id: newId(),
        tenantId,
        name: seed.name,
        contactInfo: seed.contactInfo,
        notes: seed.notes,
        isActive: true,
        createdAt: now,
        updatedAt: now,
        createdBy: actorId,
        updatedBy: actorId,
      });
      suppliersCreated += 1;
    }

    // --- Bikes (idempotent by bike_number) -------------------------------
    for (const seed of BIKE_SEEDS) {
      const existing = bikeRepository.findByBikeNumber(db, tenantId, seed.bikeNumber);
      if (existing) continue;
      const bikeType = bikeTypeByKey.get(bikeTypeKey(seed.engineCc, seed.bikeTypeName));
      if (!bikeType) continue;
      bikeRepository.insert(db, {
        id: newId(),
        tenantId,
        bikeNumber: seed.bikeNumber,
        bikeTypeId: bikeType.id,
        licensePlate: seed.licensePlate,
        odometerKm: seed.odometerKm,
        notes: null,
        isActive: true,
        createdAt: now,
        updatedAt: now,
        createdBy: actorId,
        updatedBy: actorId,
      });
      bikesCreated += 1;
    }

    // --- Historic stock purchases (first run only) -----------------------
    // Skip if the install already has any purchase movements — we don't want
    // to spam duplicate purchase rows on every reseed click. Top-up below
    // handles the case where stock has been depleted since.
    const existingPurchases = stockMovementRepository.list(db, tenantId, {
      reason: 'purchase',
      limit: 1,
    });
    const partsByName = new Map<string, IngredientRow>();
    for (const p of ingredientRepository.list(db, tenantId, { includeInactive: true })) {
      partsByName.set(p.name.toLowerCase(), p);
    }
    if (existingPurchases.length === 0) {
      for (const purchase of PURCHASE_SEEDS) {
        const part = partsByName.get(purchase.partName.toLowerCase());
        if (!part) continue;
        InventoryService.applyMovement(
          db,
          tenantId,
          {
            ingredientId: part.id,
            quantity: purchase.quantity,
            unit: purchase.unit,
            reason: 'purchase',
            referenceType: 'manual',
            direction: 1,
            costPerUnitAtTime: purchase.unitCost,
            occurredAt: now - purchase.daysAgo * DAY_MS,
          },
          actorId,
          { skipAvailabilityRecompute: true },
        );
        purchasesAdded += 1;
      }
    }

    // Refresh part snapshots — applyMovement updated stock + avg cost.
    const refreshedParts = new Map<string, IngredientRow>();
    for (const p of ingredientRepository.list(db, tenantId, { includeInactive: true })) {
      refreshedParts.set(p.name.toLowerCase(), p);
    }

    // --- Service events --------------------------------------------------
    // Back-fill up to TARGET_SERVICE_EVENTS — never grow beyond that on
    // reseeds, so the demo timeline stays bounded.
    const activeBikes = bikeRepository.list(db, tenantId, { includeInactive: false });
    const existingEventsCount = serviceEventRepository.list(db, tenantId, {
      limit: 500,
    }).length;
    const toAdd = Math.max(0, TARGET_SERVICE_EVENTS - existingEventsCount);
    if (toAdd > 0 && activeBikes.length > 0) {
      // Spread the new events across the last 60 days, starting from the
      // most-recent end so the dashboard's "last 7 days" tile lights up.
      for (let i = 0; i < toAdd; i++) {
        const bike = activeBikes[(existingEventsCount + i) % activeBikes.length]!;
        const pattern = SERVICE_PATTERNS[(existingEventsCount + i) % SERVICE_PATTERNS.length]!;
        const daysAgo = Math.max(
          1,
          Math.floor((60 / TARGET_SERVICE_EVENTS) * (existingEventsCount + i)) + 1,
        );
        const occurredAt = now - daysAgo * DAY_MS;

        const usableLines = pattern.lines
          .map((l) => ({ part: refreshedParts.get(l.partName.toLowerCase()), line: l }))
          .filter(({ part, line }) => part && part.stockQuantity >= line.quantity);
        if (usableLines.length === 0) continue;

        try {
          seedServiceEvent(
            db,
            tenantId,
            actorId,
            bike.id,
            occurredAt,
            pattern.label,
            usableLines.map(({ part, line }) => ({
              ingredientId: part!.id,
              quantity: line.quantity,
              unit: line.unit,
            })),
          );
          for (const { part, line } of usableLines) {
            const cur = refreshedParts.get(part!.name.toLowerCase())!;
            refreshedParts.set(part!.name.toLowerCase(), {
              ...cur,
              stockQuantity: cur.stockQuantity - line.quantity,
            });
          }
          serviceEventsAdded += 1;
        } catch {
          // Best-effort — skip events that throw and continue.
        }
      }
    }

    // --- Stock top-up ----------------------------------------------------
    // Final guarantee: every part ends at ≥ TARGET_STOCK. The top-up posts a
    // single `purchase` movement at "yesterday" for the missing delta so the
    // dashboard's recent-spending tiles light up too.
    for (const target of TARGET_STOCK) {
      const part = refreshedParts.get(target.partName.toLowerCase());
      if (!part) continue;
      const deficit = target.target - part.stockQuantity;
      if (deficit <= 0) continue;
      InventoryService.applyMovement(
        db,
        tenantId,
        {
          ingredientId: part.id,
          quantity: deficit,
          unit: target.unit,
          reason: 'purchase',
          referenceType: 'manual',
          direction: 1,
          costPerUnitAtTime: target.unitCost,
          occurredAt: now - DAY_MS,
        },
        actorId,
        { skipAvailabilityRecompute: true },
      );
      topUpsAdded += 1;
    }

    const alreadyPopulated =
      suppliersCreated === 0 &&
      bikesCreated === 0 &&
      purchasesAdded === 0 &&
      topUpsAdded === 0 &&
      serviceEventsAdded === 0;

    return {
      suppliersCreated,
      bikesCreated,
      purchasesAdded,
      topUpsAdded,
      serviceEventsAdded,
      alreadyPopulated,
    };
  },

  /**
   * Wipe all demo-adjacent data so the next `run()` rebuilds from scratch.
   * Deletes service events, invoices, recipes, service templates, stock
   * movements, bikes, suppliers, stock takes — then resets the 8 seeded
   * parts to zero stock and zero avg cost. Bike types, tenants, and the
   * parts rows themselves stay (they're baseline data).
   */
  reset(db: AppDb, tenantId: number): { tablesCleared: number } {
    let cleared = 0;
    db.transaction((tx) => {
      // Child rows first so FKs don't block the parent deletes. service_event_lines
      // and invoice_lines have no tenant_id of their own; their parents do, so
      // we filter on the parent's tenancy where needed.
      tx.delete(serviceEventLines)
        .where(
          inArray(
            serviceEventLines.serviceEventId,
            db
              .select({ id: serviceEvents.id })
              .from(serviceEvents)
              .where(eq(serviceEvents.tenantId, tenantId)),
          ),
        )
        .run();
      cleared += 1;
      tx.delete(serviceEvents).where(eq(serviceEvents.tenantId, tenantId)).run();
      cleared += 1;
      tx.delete(invoiceLines)
        .where(
          inArray(
            invoiceLines.invoiceId,
            db
              .select({ id: invoices.id })
              .from(invoices)
              .where(eq(invoices.tenantId, tenantId)),
          ),
        )
        .run();
      cleared += 1;
      tx.delete(invoices).where(eq(invoices.tenantId, tenantId)).run();
      cleared += 1;
      tx.delete(stockTakeLines)
        .where(
          inArray(
            stockTakeLines.stockTakeId,
            db
              .select({ id: stockTakes.id })
              .from(stockTakes)
              .where(eq(stockTakes.tenantId, tenantId)),
          ),
        )
        .run();
      cleared += 1;
      tx.delete(stockTakes).where(eq(stockTakes.tenantId, tenantId)).run();
      cleared += 1;
      tx.delete(recipeIngredients)
        .where(
          inArray(
            recipeIngredients.recipeVersionId,
            db
              .select({ id: recipeVersions.id })
              .from(recipeVersions)
              .where(eq(recipeVersions.tenantId, tenantId)),
          ),
        )
        .run();
      cleared += 1;
      tx.delete(recipeVersions).where(eq(recipeVersions.tenantId, tenantId)).run();
      cleared += 1;
      tx.delete(serviceTemplates).where(eq(serviceTemplates.tenantId, tenantId)).run();
      cleared += 1;
      tx.delete(stockMovements).where(eq(stockMovements.tenantId, tenantId)).run();
      cleared += 1;
      tx.delete(bikes).where(eq(bikes.tenantId, tenantId)).run();
      cleared += 1;
      tx.delete(suppliers).where(eq(suppliers.tenantId, tenantId)).run();
      cleared += 1;
      // Reset the seeded parts catalog back to zero stock + zero avg cost.
      const now = Date.now();
      tx.update(ingredients)
        .set({
          stockQuantity: 0,
          reservedQuantity: 0,
          currentAvgCostPerUnit: 0,
          updatedAt: now,
        })
        .where(eq(ingredients.tenantId, tenantId))
        .run();
    });
    return { tablesCleared: cleared };
  },
};

function seedServiceEvent(
  db: AppDb,
  tenantId: number,
  actorId: string,
  bikeId: string,
  occurredAt: number,
  label: string,
  lines: Array<{ ingredientId: string; quantity: number; unit: 'g' | 'ml' | 'each' }>,
): void {
  db.transaction((tx) => {
    const event = serviceEventRepository.insert(tx, {
      id: newId(),
      tenantId,
      bikeId,
      serviceTemplateId: null,
      serviceTemplateVersionId: null,
      status: 'completed',
      startedAt: occurredAt,
      completedAt: occurredAt,
      cancelledAt: null,
      cancelledPartsUsed: null,
      odometerKm: null,
      notes: `Demo seed: ${label}`,
      createdAt: occurredAt,
      updatedAt: occurredAt,
      createdBy: actorId,
      updatedBy: actorId,
    });

    const inserted = serviceEventLineRepository.insertMany(
      tx,
      lines.map((l, idx) => ({
        id: newId(),
        serviceEventId: event.id,
        ingredientId: l.ingredientId,
        quantity: l.quantity,
        unit: l.unit,
        notes: null,
        displayOrder: idx,
      })),
    );

    for (const line of inserted) {
      InventoryService.applyMovement(
        tx,
        tenantId,
        {
          ingredientId: line.ingredientId,
          quantity: line.quantity,
          unit: line.unit,
          reason: 'service_consumed',
          referenceType: 'service_event_line',
          referenceId: line.id,
          direction: -1,
          occurredAt,
        },
        actorId,
        { skipAvailabilityRecompute: true },
      );
    }
  });
}
