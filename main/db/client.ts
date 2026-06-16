/**
 * Re-exports the Postgres client (server/db/client.ts).
 *
 * Repositories and services keep importing `AppDb` / `getDb` from '../db/client'
 * unchanged; they now resolve to the async node-postgres client. The SQLite
 * (better-sqlite3) implementation was retired in the web migration (slice W1) —
 * `AppDb` is now a Postgres handle, so every repository method is async.
 */
export * from '../../server/db/client';
