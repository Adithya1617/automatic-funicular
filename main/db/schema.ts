/**
 * Re-exports the Postgres schema (server/db/schema.ts).
 *
 * The original SQLite (drizzle-orm/sqlite-core) definitions were retired in the
 * web migration (slice W1). Repositories and services keep importing tables and
 * row/insert types from '../db/schema' unchanged — they now resolve to the
 * Postgres pg-core schema.
 */
export * from '../../server/db/schema';
