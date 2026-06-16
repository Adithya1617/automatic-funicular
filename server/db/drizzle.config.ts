import type { Config } from 'drizzle-kit';

/**
 * Postgres drizzle-kit config for the web migration.
 *   npm run db:pg:generate   -> emit SQL migrations from server/db/schema.ts
 *   npm run db:pg:migrate    -> apply them to DATABASE_URL
 *
 * The legacy SQLite config (./drizzle.config.ts) stays until W1 retires it.
 */
export default {
  schema: './server/db/schema.ts',
  out: './server/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://hyprride:hyprride@localhost:5433/hyprride',
  },
} satisfies Config;
