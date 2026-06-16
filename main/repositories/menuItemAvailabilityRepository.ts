import { and, eq, inArray } from 'drizzle-orm';
import type { AppDb } from '../db/client';
import {
  menuItemAvailability,
  type MenuItemAvailabilityRow,
  type MenuItemAvailabilityInsert,
} from '../db/schema';

export const menuItemAvailabilityRepository = {
  async list(
    db: AppDb,
    tenantId: number,
    menuItemIds?: string[],
  ): Promise<MenuItemAvailabilityRow[]> {
    const conditions = [eq(menuItemAvailability.tenantId, tenantId)];
    if (menuItemIds && menuItemIds.length > 0) {
      conditions.push(inArray(menuItemAvailability.menuItemId, menuItemIds));
    }
    return db
      .select()
      .from(menuItemAvailability)
      .where(and(...conditions));
  },

  async findByMenuItem(
    db: AppDb,
    tenantId: number,
    menuItemId: string,
  ): Promise<MenuItemAvailabilityRow | undefined> {
    const rows = await db
      .select()
      .from(menuItemAvailability)
      .where(
        and(
          eq(menuItemAvailability.tenantId, tenantId),
          eq(menuItemAvailability.menuItemId, menuItemId),
        ),
      );
    return rows[0];
  },

  async upsert(db: AppDb, row: MenuItemAvailabilityInsert): Promise<MenuItemAvailabilityRow> {
    const existing = await menuItemAvailabilityRepository.findByMenuItem(
      db,
      row.tenantId,
      row.menuItemId,
    );
    if (existing) {
      const [updated] = await db
        .update(menuItemAvailability)
        .set({
          maxServingsAvailable: row.maxServingsAvailable,
          bottleneckIngredientId: row.bottleneckIngredientId ?? null,
          lastComputedAt: row.lastComputedAt,
        })
        .where(eq(menuItemAvailability.id, existing.id))
        .returning();
      if (!updated) throw new Error('availability update returned no row');
      return updated;
    }
    const [inserted] = await db.insert(menuItemAvailability).values(row).returning();
    if (!inserted) throw new Error('availability insert returned no row');
    return inserted;
  },
};
