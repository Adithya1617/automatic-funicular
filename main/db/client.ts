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

  ensureMockOrderingChannels(db, now);
}

function ensureMockOrderingChannels(db: ConcreteDb, now: number): void {
  const seeds: Array<{ key: string; displayName: string }> = [
    { key: 'mock_online', displayName: 'Mock online (Swiggy)' },
    { key: 'mock_offline', displayName: 'Mock offline POS' },
  ];
  for (const seed of seeds) {
    const existing = db
      .select()
      .from(schema.orderingChannels)
      .where(eq(schema.orderingChannels.key, seed.key))
      .all();
    if (existing.length > 0) continue;
    db.insert(schema.orderingChannels)
      .values({
        id: newId(),
        tenantId: DEFAULT_TENANT_ID,
        key: seed.key,
        displayName: seed.displayName,
        enabled: true,
        pollingIntervalSeconds: 30,
        isMock: true,
        createdAt: now,
        updatedAt: now,
      })
      .run();
  }
}
