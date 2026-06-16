import { and, eq, type ExtractTablesWithRelations } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { Pool } from 'pg';
import bcrypt from 'bcryptjs';
import { DEFAULT_TENANT_ID, SYSTEM_USER_ID } from '../../shared/constants/system';
import { newId } from '../../main/lib/ids';
import * as schema from './schema';

type Schema = typeof schema;

/**
 * Postgres analogue of main/db/client.ts's `AppDb`. Widened to the base
 * `PgDatabase` so repositories accept either the top-level handle or a
 * transaction handle (Drizzle types them separately, both extend this).
 */
export type AppDb = PgDatabase<PgQueryResultHKT, Schema, ExtractTablesWithRelations<Schema>>;

export type DbClient = {
  db: AppDb;
  pool: Pool;
  close: () => Promise<void>;
};

let singleton: DbClient | undefined;

type OpenOptions = {
  /** Postgres connection string (DATABASE_URL). */
  connectionString: string;
  /** Absolute path to the drizzle migrations folder (server/db/migrations). */
  migrationsFolder: string;
};

export async function openDb({ connectionString, migrationsFolder }: OpenOptions): Promise<DbClient> {
  if (singleton) return singleton;

  const pool = new Pool({ connectionString });
  const db = drizzle(pool, { schema });

  await migrate(db, { migrationsFolder });
  await ensureBootstrapRows(db);

  singleton = {
    db,
    pool,
    close: async () => {
      await pool.end();
      singleton = undefined;
    },
  };
  return singleton;
}

export function getDb(): DbClient {
  if (!singleton) {
    throw new Error('DB has not been opened — call openDb() during server bootstrap');
  }
  return singleton;
}

async function ensureBootstrapRows(db: AppDb): Promise<void> {
  const now = Date.now();
  const existing = await db
    .select()
    .from(schema.tenants)
    .where(eq(schema.tenants.id, DEFAULT_TENANT_ID));
  if (existing.length === 0) {
    await db
      .insert(schema.tenants)
      .values({ id: DEFAULT_TENANT_ID, name: 'Hyprride Bike Rentals', createdAt: now });
  }

  // Touch system user constant so future settings code has a row to read.
  await db
    .insert(schema.appSettings)
    .values({ key: 'system_user_id', value: SYSTEM_USER_ID, updatedAt: now })
    .onConflictDoNothing();

  // Seeds (bike types + the 8 Hyprride parts) run on first boot only. Once
  // `bootstrap.seedsApplied` is set we never re-insert — a deleted seed row
  // stays deleted across relaunches and restores-from-backup.
  if (!(await readSeedsAppliedFlag(db))) {
    await ensureBikeTypes(db, now);
    await ensureSeedParts(db, now);
    await db
      .insert(schema.appSettings)
      .values({
        key: 'bootstrap.seedsApplied',
        value: JSON.stringify(true),
        updatedAt: now,
      })
      .onConflictDoNothing();
  }

  await ensureOwnerUser(db, now);
}

async function ensureOwnerUser(db: AppDb, now: number): Promise<void> {
  // Seed the first owner account only when no users exist, so a deleted owner
  // isn't silently recreated. Credentials come from env; the default password
  // is a placeholder meant to be changed on first login.
  const existing = await db.select().from(schema.users).limit(1);
  if (existing.length > 0) return;
  const email = (process.env.OWNER_EMAIL ?? 'tech@hyprride.com').trim().toLowerCase();
  const password = process.env.OWNER_PASSWORD ?? 'hyprride';
  await db.insert(schema.users).values({
    id: newId(),
    tenantId: DEFAULT_TENANT_ID,
    email,
    passwordHash: bcrypt.hashSync(password, 10),
    name: 'Owner',
    role: 'owner',
    isActive: true,
    createdAt: now,
    updatedAt: now,
    createdBy: SYSTEM_USER_ID,
    updatedBy: SYSTEM_USER_ID,
  });
  if (!process.env.OWNER_PASSWORD) {
    console.warn(
      `[bootstrap] Seeded owner '${email}' with the DEFAULT password 'hyprride'. ` +
        `Set OWNER_PASSWORD or change it after first login.`,
    );
  }
}

async function readSeedsAppliedFlag(db: AppDb): Promise<boolean> {
  const rows = await db
    .select()
    .from(schema.appSettings)
    .where(eq(schema.appSettings.key, 'bootstrap.seedsApplied'));
  const row = rows[0];
  if (!row) return false;
  try {
    return JSON.parse(row.value) === true;
  } catch {
    return false;
  }
}

async function ensureBikeTypes(db: AppDb, now: number): Promise<void> {
  const seeds: Array<{ name: string; engineCc: number; displayOrder: number }> = [
    { name: 'Activa', engineCc: 110, displayOrder: 1 },
    { name: 'Ntorq', engineCc: 125, displayOrder: 2 },
    { name: 'Jupiter', engineCc: 110, displayOrder: 3 },
    { name: 'Jupiter', engineCc: 125, displayOrder: 4 },
    { name: 'Raider', engineCc: 125, displayOrder: 5 },
    { name: 'Yamaha RayZR', engineCc: 125, displayOrder: 5 },
    { name: 'Hero Destiny', engineCc: 125, displayOrder: 6 },
    { name: 'Apache', engineCc: 160, displayOrder: 7 },
  ];
  for (const seed of seeds) {
    const existing = await db
      .select()
      .from(schema.bikeTypes)
      .where(and(eq(schema.bikeTypes.name, seed.name), eq(schema.bikeTypes.engineCc, seed.engineCc)));
    if (existing.length > 0) continue;
    await db.insert(schema.bikeTypes).values({
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
    });
  }
}

async function ensureSeedParts(db: AppDb, now: number): Promise<void> {
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
    const existing = await db
      .select()
      .from(schema.ingredients)
      .where(eq(schema.ingredients.name, seed.name));
    if (existing.length > 0) continue;
    await db.insert(schema.ingredients).values({
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
    });
  }
}
