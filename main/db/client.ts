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

  ensureBikeTypes(db, now);
}

function ensureBikeTypes(db: ConcreteDb, now: number): void {
  // Hyprride fleet has three bike models. Service templates and individual
  // bikes both reference these rows, so seed them on first boot.
  const seeds: Array<{ name: string; engineCc: number; displayOrder: number }> = [
    { name: '110cc Activa', engineCc: 110, displayOrder: 1 },
    { name: '125cc Ntorq', engineCc: 125, displayOrder: 2 },
    { name: '160cc Apache RTR', engineCc: 160, displayOrder: 3 },
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

