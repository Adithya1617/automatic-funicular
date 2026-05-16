import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { eq, type ExtractTablesWithRelations } from 'drizzle-orm';
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import { DEFAULT_TENANT_ID, SYSTEM_USER_ID } from '@shared/constants/system';
import { newId } from '../lib/ids';
import * as schema from './schema';

type Schema = typeof schema;

/**
 * Repositories and services accept either the top-level Drizzle handle or
 * a transaction handle (which Drizzle types separately). Both conform to
 * `BaseSQLiteDatabase`, so we widen here.
 */
export type AppDb = BaseSQLiteDatabase<'sync', unknown, Schema, ExtractTablesWithRelations<Schema>>;

type ConcreteDb = ReturnType<typeof drizzle<Schema>>;

export type DbClient = {
  db: ConcreteDb;
  raw: Database.Database;
  close: () => void;
};

let singleton: DbClient | undefined;

type OpenOptions = {
  /** Absolute path to the SQLite file. */
  filePath: string;
  /** Absolute path to the migrations folder. */
  migrationsFolder: string;
};

export function openDb({ filePath, migrationsFolder }: OpenOptions): DbClient {
  if (singleton) return singleton;

  mkdirSync(dirname(filePath), { recursive: true });

  const sqlite = new Database(filePath);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');

  const db = drizzle(sqlite, { schema });

  migrate(db, { migrationsFolder });
  ensureBootstrapRows(db);

  singleton = {
    db,
    raw: sqlite,
    close: () => {
      sqlite.close();
      singleton = undefined;
    },
  };
  return singleton;
}

export function getDb(): DbClient {
  if (!singleton) {
    throw new Error('DB has not been opened — call openDb() during app bootstrap');
  }
  return singleton;
}

function ensureBootstrapRows(db: ConcreteDb): void {
  const now = Date.now();
  const existing = db
    .select()
    .from(schema.tenants)
    .where(eq(schema.tenants.id, DEFAULT_TENANT_ID))
    .all();
  if (existing.length === 0) {
    db.insert(schema.tenants)
      .values({ id: DEFAULT_TENANT_ID, name: 'Hyprride Bike Rentals', createdAt: now })
      .run();
  }

  // Touch system user constant by writing a small marker so future settings code
  // has a row to read; harmless if already present.
  db.insert(schema.appSettings)
    .values({ key: 'system_user_id', value: SYSTEM_USER_ID, updatedAt: now })
    .onConflictDoNothing()
    .run();

  // Seeds (bike types + the 8 Hyprride parts) run on first boot only. Once
  // `bootstrap.seedsApplied` is set we never re-insert — a deleted seed row
  // stays deleted across relaunches and restores-from-backup.
  if (!readSeedsAppliedFlag(db)) {
    ensureBikeTypes(db, now);
    ensureSeedParts(db, now);
    db.insert(schema.appSettings)
      .values({
        key: 'bootstrap.seedsApplied',
        value: JSON.stringify(true),
        updatedAt: now,
      })
      .onConflictDoNothing()
      .run();
  }
}

function readSeedsAppliedFlag(db: ConcreteDb): boolean {
  const row = db
    .select()
    .from(schema.appSettings)
    .where(eq(schema.appSettings.key, 'bootstrap.seedsApplied'))
    .get();
  if (!row) return false;
  try {
    return JSON.parse(row.value) === true;
  } catch {
    return false;
  }
}

function ensureBikeTypes(db: ConcreteDb, now: number): void {
  // Hyprride fleet — `name` is just the model. `engineCc` lives in its own
  // column; UI renders combined as `${engineCc}cc ${name}` via
  // shared/utils/bikeType.ts. Service templates and individual bikes both
  // reference these rows, so seed them on first boot.
  const seeds: Array<{ name: string; engineCc: number; displayOrder: number }> = [
    { name: 'Activa', engineCc: 110, displayOrder: 1 },
    { name: 'Ntorq', engineCc: 125, displayOrder: 2 },
    { name: 'Jupiter', engineCc: 125, displayOrder: 3 },
    { name: 'Raider', engineCc: 125, displayOrder: 4 },
    { name: 'Yamaha RayZR', engineCc: 125, displayOrder: 5 },
    { name: 'Hero Destiny', engineCc: 125, displayOrder: 6 },
    { name: 'Apache', engineCc: 160, displayOrder: 7 },
  ];
  for (const seed of seeds) {
    const existing = db
      .select()
      .from(schema.bikeTypes)
      .where(eq(schema.bikeTypes.name, seed.name))
      .all();
    if (existing.length > 0) continue;
    db.insert(schema.bikeTypes)
      .values({
        id: newId(),
        tenantId: DEFAULT_TENANT_ID,
        name: seed.name,
        engineCc: seed.engineCc,
        displayOrder: seed.displayOrder,
        isActive: true,
        createdAt: now,
        updatedAt: now,
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      })
      .run();
  }
}

function ensureSeedParts(db: ConcreteDb, now: number): void {
  // First-boot seed of the eight Hyprride parts the operator told us about.
  // Skipped per row if a part with the same name already exists, so a
  // re-launched app does not re-create what the operator may have renamed
  // or deleted. Stock and cost start at 0 — they grow via purchase invoices.
  type PartSeed = {
    name: string;
    category: string;
    baseUnit: 'g' | 'ml' | 'each';
  };
  const seeds: PartSeed[] = [
    { name: 'Brake pad', category: 'Brake', baseUnit: 'each' },
    { name: 'Brake shoe', category: 'Brake', baseUnit: 'each' },
    { name: 'Accelerator wire', category: 'Cable', baseUnit: 'each' },
    { name: 'Clutch wire', category: 'Cable', baseUnit: 'each' },
    { name: 'Engine oil', category: 'Oil', baseUnit: 'ml' },
    { name: 'Gear oil', category: 'Oil', baseUnit: 'ml' },
    { name: 'Air filter', category: 'Filter', baseUnit: 'each' },
    { name: 'Mobile holder', category: 'Accessory', baseUnit: 'each' },
  ];
  for (const seed of seeds) {
    const existing = db
      .select()
      .from(schema.ingredients)
      .where(eq(schema.ingredients.name, seed.name))
      .all();
    if (existing.length > 0) continue;
    db.insert(schema.ingredients)
      .values({
        id: newId(),
        tenantId: DEFAULT_TENANT_ID,
        name: seed.name,
        category: seed.category,
        type: 'raw',
        baseUnit: seed.baseUnit,
        stockQuantity: 0,
        reservedQuantity: 0,
        lowStockThreshold: 0,
        currentAvgCostPerUnit: 0,
        densityGPerMl: null,
        isActive: true,
        createdAt: now,
        updatedAt: now,
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      })
      .run();
  }
}

