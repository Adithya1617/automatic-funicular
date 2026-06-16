/**
 * One-time data migration: copy the Electron app's SQLite database
 * (hyprride.sqlite, from the office PC) into Postgres.
 *
 *   1. npm rebuild better-sqlite3   # build it for system Node (it ships built
 *                                   # for Electron's ABI; this script runs on
 *                                   # plain Node). After W7 retires Electron a
 *                                   # normal `npm install` already does this.
 *   2. docker compose up -d         # Postgres must be running
 *   3. npx tsx --tsconfig tsconfig.server.json \
 *        server/scripts/migrate-from-sqlite.ts "C:\\path\\to\\hyprride.sqlite"
 *
 * It REPLACES the contents of every domain table in Postgres with the SQLite
 * rows (run it once, against a fresh DB). It does NOT touch `users` / `sessions`
 * (auth is web-only), so the seeded owner account survives. The whole copy runs
 * in a single transaction — on any error nothing is committed.
 *
 * The only value transform needed is boolean columns: SQLite stores them as
 * 0/1 integers, Postgres wants true/false. Timestamps are Unix-ms integers in
 * both. Column names are identical between the two schemas.
 */
import Database from 'better-sqlite3';
import { join } from 'node:path';
import { openDb } from '../db/client';

// Boolean columns per table (SQLite 0/1 -> Postgres boolean). Everything else
// copies verbatim.
const BOOL_COLS: Record<string, string[]> = {
  ingredients: ['is_active'],
  suppliers: ['is_active'],
  recipe_versions: ['is_current'],
  menu_items: ['is_active'],
  orders: ['cancelled_prepared'],
  ordering_channels: ['enabled', 'is_mock'],
  bike_types: ['is_active'],
  bikes: ['is_active'],
  service_templates: ['is_active'],
  service_events: ['cancelled_parts_used'],
};

// Parent-before-child order (FK-safe for inserts; reversed for deletes).
const TABLE_ORDER = [
  'tenants',
  'app_settings',
  'bike_types',
  'ingredients',
  'suppliers',
  'menu_items',
  'recipe_versions',
  'orders',
  'ordering_channels',
  'stock_takes',
  'bikes',
  'service_templates',
  'recipe_ingredients',
  'menu_item_availability',
  'production_batches',
  'stock_movements',
  'invoices',
  'supplier_item_mappings',
  'stock_take_lines',
  'order_lines',
  'service_events',
  'invoice_lines',
  'service_event_lines',
];

function toBool(v: unknown): boolean | null {
  if (v === null || v === undefined) return null;
  return Boolean(v);
}

async function main(): Promise<void> {
  const sqlitePath = process.argv[2] ?? process.env.SQLITE_PATH;
  if (!sqlitePath) {
    console.error(
      'Usage: tsx --tsconfig tsconfig.server.json server/scripts/migrate-from-sqlite.ts <hyprride.sqlite>',
    );
    process.exit(1);
  }

  const connectionString =
    process.env.DATABASE_URL ?? 'postgres://hyprride:hyprride@localhost:5433/hyprride';
  const migrationsFolder = join(process.cwd(), 'server', 'db', 'migrations');
  const { pool } = await openDb({ connectionString, migrationsFolder });

  const sqlite = new Database(sqlitePath, { readonly: true });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Clear existing rows, children first.
    for (const table of [...TABLE_ORDER].reverse()) {
      await client.query(`DELETE FROM "${table}"`);
    }

    let total = 0;
    for (const table of TABLE_ORDER) {
      let rows: Array<Record<string, unknown>>;
      try {
        rows = sqlite.prepare(`SELECT * FROM "${table}"`).all() as Array<Record<string, unknown>>;
      } catch {
        console.log(`  ${table.padEnd(24)} (absent in SQLite — skipped)`);
        continue;
      }
      if (rows.length === 0) {
        console.log(`  ${table.padEnd(24)} 0`);
        continue;
      }
      const boolCols = new Set(BOOL_COLS[table] ?? []);
      const cols = Object.keys(rows[0]!);
      const colList = cols.map((c) => `"${c}"`).join(', ');
      const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
      const stmt = `INSERT INTO "${table}" (${colList}) VALUES (${placeholders})`;
      for (const row of rows) {
        const values = cols.map((c) => (boolCols.has(c) ? toBool(row[c]) : row[c]));
        await client.query(stmt, values);
      }
      total += rows.length;
      console.log(`  ${table.padEnd(24)} ${rows.length}`);
    }

    await client.query('COMMIT');
    console.log(`\nDone — copied ${total} rows. (users/sessions left intact.)`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('\nMigration FAILED and was rolled back — Postgres is unchanged.');
    console.error(err);
    process.exitCode = 1;
  } finally {
    client.release();
    sqlite.close();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
