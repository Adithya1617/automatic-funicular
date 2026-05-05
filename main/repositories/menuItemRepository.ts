import { and, asc, eq, like } from 'drizzle-orm';
import type { AppDb } from '../db/client';
import { menuItems, type MenuItemRow, type MenuItemInsert } from '../db/schema';

export type MenuItemFilter = {
  search?: string;
  category?: string;
  includeInactive?: boolean;
};

export const menuItemRepository = {
  list(db: AppDb, tenantId: number, filter: MenuItemFilter = {}): MenuItemRow[] {
    const conditions = [eq(menuItems.tenantId, tenantId)];
    if (!filter.includeInactive) conditions.push(eq(menuItems.isActive, true));
    if (filter.category) conditions.push(eq(menuItems.category, filter.category));
    if (filter.search) {
      conditions.push(like(menuItems.name, `%${filter.search.toLowerCase()}%`));
    }
    return db
      .select()
      .from(menuItems)
      .where(and(...conditions))
      .orderBy(asc(menuItems.displayOrder), asc(menuItems.name))
      .all();
  },

  findById(db: AppDb, tenantId: number, id: string): MenuItemRow | undefined {
    return db
      .select()
      .from(menuItems)
      .where(and(eq(menuItems.tenantId, tenantId), eq(menuItems.id, id)))
      .get();
  },

  findByName(db: AppDb, tenantId: number, name: string): MenuItemRow | undefined {
    return db
      .select()
      .from(menuItems)
      .where(and(eq(menuItems.tenantId, tenantId), eq(menuItems.name, name)))
      .get();
  },

  findByVariantGroup(db: AppDb, tenantId: number, groupId: string): MenuItemRow[] {
    return db
      .select()
      .from(menuItems)
      .where(and(eq(menuItems.tenantId, tenantId), eq(menuItems.variantGroupId, groupId)))
      .orderBy(asc(menuItems.displayOrder), asc(menuItems.name))
      .all();
  },

  insert(db: AppDb, row: MenuItemInsert): MenuItemRow {
    return db.insert(menuItems).values(row).returning().get();
  },

  update(
    db: AppDb,
    tenantId: number,
    id: string,
    patch: Partial<MenuItemInsert>,
  ): MenuItemRow | undefined {
    return db
      .update(menuItems)
      .set(patch)
      .where(and(eq(menuItems.tenantId, tenantId), eq(menuItems.id, id)))
      .returning()
      .get();
  },

  listAllActive(db: AppDb, tenantId: number): MenuItemRow[] {
    return db
      .select()
      .from(menuItems)
      .where(and(eq(menuItems.tenantId, tenantId), eq(menuItems.isActive, true)))
      .all();
  },
};
