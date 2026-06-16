import { and, asc, eq, like, or } from 'drizzle-orm';
import type { AppDb } from '../db/client';
import { ingredients, type IngredientRow, type IngredientInsert } from '../db/schema';

export type IngredientFilter = {
  search?: string;
  category?: string;
  type?: 'raw' | 'prepared';
  includeInactive?: boolean;
};

export const ingredientRepository = {
  async list(
    db: AppDb,
    tenantId: number,
    filter: IngredientFilter = {},
  ): Promise<IngredientRow[]> {
    const conditions = [eq(ingredients.tenantId, tenantId)];
    if (!filter.includeInactive) conditions.push(eq(ingredients.isActive, true));
    if (filter.category) conditions.push(eq(ingredients.category, filter.category));
    if (filter.type) conditions.push(eq(ingredients.type, filter.type));
    if (filter.search) {
      const pattern = `%${filter.search.toLowerCase()}%`;
      const like1 = like(ingredients.name, pattern);
      const like2 = like(ingredients.category, pattern);
      const matches = or(like1, like2);
      if (matches) conditions.push(matches);
    }
    return db
      .select()
      .from(ingredients)
      .where(and(...conditions))
      .orderBy(asc(ingredients.name));
  },

  async findById(db: AppDb, tenantId: number, id: string): Promise<IngredientRow | undefined> {
    const rows = await db
      .select()
      .from(ingredients)
      .where(and(eq(ingredients.tenantId, tenantId), eq(ingredients.id, id)));
    return rows[0];
  },

  async findByName(
    db: AppDb,
    tenantId: number,
    name: string,
  ): Promise<IngredientRow | undefined> {
    const rows = await db
      .select()
      .from(ingredients)
      .where(and(eq(ingredients.tenantId, tenantId), eq(ingredients.name, name)));
    return rows[0];
  },

  async insert(db: AppDb, row: IngredientInsert): Promise<IngredientRow> {
    const [inserted] = await db.insert(ingredients).values(row).returning();
    if (!inserted) throw new Error('ingredient insert returned no row');
    return inserted;
  },

  async update(
    db: AppDb,
    tenantId: number,
    id: string,
    patch: Partial<IngredientInsert>,
  ): Promise<IngredientRow | undefined> {
    const [updated] = await db
      .update(ingredients)
      .set(patch)
      .where(and(eq(ingredients.tenantId, tenantId), eq(ingredients.id, id)))
      .returning();
    return updated;
  },

  /** Unsafe in normal flows — used only by InventoryService. */
  async setStockQuantity(
    db: AppDb,
    tenantId: number,
    id: string,
    stockQuantity: number,
    updatedAt: number,
    updatedBy: string,
  ): Promise<void> {
    await db
      .update(ingredients)
      .set({ stockQuantity, updatedAt, updatedBy })
      .where(and(eq(ingredients.tenantId, tenantId), eq(ingredients.id, id)));
  },

  /** Stock + weighted-avg cost in one update — used by InventoryService when
   *  a movement carries a cost (purchase, production_output). */
  async setStockAndCost(
    db: AppDb,
    tenantId: number,
    id: string,
    stockQuantity: number,
    currentAvgCostPerUnit: number,
    updatedAt: number,
    updatedBy: string,
  ): Promise<void> {
    await db
      .update(ingredients)
      .set({ stockQuantity, currentAvgCostPerUnit, updatedAt, updatedBy })
      .where(and(eq(ingredients.tenantId, tenantId), eq(ingredients.id, id)));
  },
};
