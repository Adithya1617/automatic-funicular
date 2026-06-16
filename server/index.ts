import { join } from 'node:path';
import { serve } from '@hono/node-server';
import { openDb } from './db/client';
import { createApp } from './api/app';

/**
 * Web API entry. Opens the Postgres pool (running migrations + bootstrap seeds
 * on first boot), then serves the Hono app. Run with:
 *   npm run dev:server      (watch mode)
 *   TSX_TSCONFIG_PATH=tsconfig.server.json tsx server/index.ts
 */
async function main(): Promise<void> {
  const connectionString =
    process.env.DATABASE_URL ?? 'postgres://hyprride:hyprride@localhost:5433/hyprride';
  const migrationsFolder = join(process.cwd(), 'server', 'db', 'migrations');
  await openDb({ connectionString, migrationsFolder });

  const app = createApp();
  const port = Number(process.env.PORT ?? 3001);
  serve({ fetch: app.fetch, port }, (info) => {
    console.log(`Hyprride API listening on http://localhost:${info.port}`);
  });
}

main().catch((err) => {
  console.error('Failed to start API server:', err);
  process.exit(1);
});
