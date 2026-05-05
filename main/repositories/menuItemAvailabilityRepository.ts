import { and, eq, inArray } from 'drizzle-orm';
import type { AppDb } from '../db/client';
import {
  menuItemAvailability,
  type MenuItemAvailabilityRow,
  type MenuItemAvailabilityInsert,
} from '../db/schema';

export const menuItemAvailabilityRepository = {
  list(
    db: AppDb,
    tenantId: number,
    menuItemIds?: string[],
  ): MenuItemAvailabilityRow[] {
    const conditions = [eq(menuItemAvailability.tenantId, tenantId)];
    if (menuItemIds && menuItemIds.length > 0) {
      conditions.push(inArray(menuItemAvailability.menuItemId, menuItemIds));
    }
    return db
      .select()
      .from(menuItemAvailability)
      .where(and(...conditions))
      .all();
  },

  findByMenuItem(
    db: AppDb,
    tenantId: number,
    menuItemId: string,
  ): MenuItemAvailabilityRow | undefined {
    return db
      .select()
      .from(menuItemAvailability)
      .where(
        and(
          eq(menuItemAvailability.tenantId, tenantId),
          eq(menuItemAvailability.menuItemId, menuItemId),
        ),
      )
      .get();
  },

  upsert(db: AppDb, row: MenuItemAvailabilityInsert): MenuItemAvailabilityRow {
    const existing = menuItemAvailabilityRepository.findByMenuItem(
      db,
      row.tenantId,
      row.menuItemId,
    );
    if (existing) {
      return db
        .update(menuItemAvailability)
        .set({
          maxServingsAvailable: row.maxServingsAvailable,
          bottleneckIngredientId: row.bottleneckIngredientId ?? null,
          lastComputedAt: row.lastComputedAt,
        })
        .where(eq(menuItemAvailability.id, existing.id))
        .returning()
        .get();
    }
    return db.insert(menuItemAvailability).values(row).returning().get();
  },
};
