import { and, asc, eq, like } from 'drizzle-orm';
import type { AppDb } from '../db/client';
import { menuItems, type MenuItemRow, type MenuItemInsert } from '../db/schema';

export type MenuItemFilter = {
  search?: string;
  category?: string;
  includeInactive?: boolean;
};

export const menuItemRepository = {
  async list(db: AppDb, tenantId: number, filter: MenuItemFilter = {}): Promise<MenuItemRow[]> {
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
      .orderBy(asc(menuItems.displayOrder), asc(menuItems.name));
  },

  async findById(db: AppDb, tenantId: number, id: string): Promise<MenuItemRow | undefined> {
    const rows = await db
      .select()
      .from(menuItems)
      .where(and(eq(menuItems.tenantId, tenantId), eq(menuItems.id, id)));
    return rows[0];
  },

  async findByName(db: AppDb, tenantId: number, name: string): Promise<MenuItemRow | undefined> {
    const rows = await db
      .select()
      .from(menuItems)
      .where(and(eq(menuItems.tenantId, tenantId), eq(menuItems.name, name)));
    return rows[0];
  },

  async findByVariantGroup(
    db: AppDb,
    tenantId: number,
    groupId: string,
  ): Promise<MenuItemRow[]> {
    return db
      .select()
      .from(menuItems)
      .where(and(eq(menuItems.tenantId, tenantId), eq(menuItems.variantGroupId, groupId)))
      .orderBy(asc(menuItems.displayOrder), asc(menuItems.name));
  },

  async insert(db: AppDb, row: MenuItemInsert): Promise<MenuItemRow> {
    const [inserted] = await db.insert(menuItems).values(row).returning();
    if (!inserted) throw new Error('menu item insert returned no row');
    return inserted;
  },

  async update(
    db: AppDb,
    tenantId: number,
    id: string,
    patch: Partial<MenuItemInsert>,
  ): Promise<MenuItemRow | undefined> {
    const [updated] = await db
      .update(menuItems)
      .set(patch)
      .where(and(eq(menuItems.tenantId, tenantId), eq(menuItems.id, id)))
      .returning();
    return updated;
  },

  async listAllActive(db: AppDb, tenantId: number): Promise<MenuItemRow[]> {
    return db
      .select()
      .from(menuItems)
      .where(and(eq(menuItems.tenantId, tenantId), eq(menuItems.isActive, true)));
  },
};
