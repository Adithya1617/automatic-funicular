import { eq, lt } from 'drizzle-orm';
import type { AppDb } from '../db/client';
import { sessions, type SessionRow, type SessionInsert } from '../db/schema';

export const sessionRepository = {
  async findById(db: AppDb, id: string): Promise<SessionRow | undefined> {
    const rows = await db.select().from(sessions).where(eq(sessions.id, id));
    return rows[0];
  },

  async insert(db: AppDb, row: SessionInsert): Promise<SessionRow> {
    const [inserted] = await db.insert(sessions).values(row).returning();
    if (!inserted) throw new Error('session insert returned no row');
    return inserted;
  },

  async deleteById(db: AppDb, id: string): Promise<void> {
    await db.delete(sessions).where(eq(sessions.id, id));
  },

  /** Housekeeping — drop sessions whose expiry has passed. */
  async deleteExpired(db: AppDb, nowMs: number): Promise<void> {
    await db.delete(sessions).where(lt(sessions.expiresAt, nowMs));
  },
};
