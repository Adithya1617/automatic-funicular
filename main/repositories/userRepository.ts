import { and, asc, eq } from 'drizzle-orm';
import type { AppDb } from '../db/client';
import { users, type UserRow, type UserInsert } from '../db/schema';

export const userRepository = {
  async list(db: AppDb, tenantId: number): Promise<UserRow[]> {
    return db
      .select()
      .from(users)
      .where(eq(users.tenantId, tenantId))
      .orderBy(asc(users.email));
  },

  async findById(db: AppDb, tenantId: number, id: string): Promise<UserRow | undefined> {
    const rows = await db
      .select()
      .from(users)
      .where(and(eq(users.tenantId, tenantId), eq(users.id, id)));
    return rows[0];
  },

  async findByEmail(db: AppDb, tenantId: number, email: string): Promise<UserRow | undefined> {
    const rows = await db
      .select()
      .from(users)
      .where(and(eq(users.tenantId, tenantId), eq(users.email, email)));
    return rows[0];
  },

  async insert(db: AppDb, row: UserInsert): Promise<UserRow> {
    const [inserted] = await db.insert(users).values(row).returning();
    if (!inserted) throw new Error('user insert returned no row');
    return inserted;
  },

  async update(
    db: AppDb,
    tenantId: number,
    id: string,
    patch: Partial<UserInsert>,
  ): Promise<UserRow | undefined> {
    const [updated] = await db
      .update(users)
      .set(patch)
      .where(and(eq(users.tenantId, tenantId), eq(users.id, id)))
      .returning();
    return updated;
  },
};
