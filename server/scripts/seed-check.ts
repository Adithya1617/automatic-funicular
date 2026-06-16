/**
 * Smoke-test: run the real openDb() (migrate + bootstrap seed) against the
 * Docker Postgres, then print the seeded rows. Closes W0's seed gap and proves
 * the async bootstrap path works.
 *
 *   npx tsx server/scripts/seed-check.ts
 */
import { join } from 'node:path';
import { openDb } from '../db/client';
import { bikeTypes, ingredients, tenants } from '../db/schema';

async function main(): Promise<void> {
  const connectionString =
    process.env.DATABASE_URL ?? 'postgres://hyprride:hyprride@localhost:5433/hyprride';
  const migrationsFolder = join(process.cwd(), 'server', 'db', 'migrations');

  const { db, close } = await openDb({ connectionString, migrationsFolder });

  const t = await db.select().from(tenants);
  const bt = await db.select().from(bikeTypes);
  const parts = await db.select().from(ingredients);

  console.log(`tenants:    ${t.length} -> ${t.map((x) => x.name).join(', ')}`);
  console.log(`bike_types: ${bt.length} -> ${bt.map((x) => x.name).join(', ')}`);
  console.log(`parts:      ${parts.length} -> ${parts.map((x) => x.name).join(', ')}`);

  await close();
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
