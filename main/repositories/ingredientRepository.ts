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
  list(db: AppDb, tenantId: number, filter: IngredientFilter = {}): IngredientRow[] {
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
      .orderBy(asc(ingredients.name))
      .all();
  },

  findById(db: AppDb, tenantId: number, id: string): IngredientRow | undefined {
    return db
      .select()
      .from(ingredients)
      .where(and(eq(ingredients.tenantId, tenantId), eq(ingredients.id, id)))
      .get();
  },

  findByName(db: AppDb, tenantId: number, name: string): IngredientRow | undefined {
    return db
      .select()
      .from(ingredients)
      .where(and(eq(ingredients.tenantId, tenantId), eq(ingredients.name, name)))
      .get();
  },

  insert(db: AppDb, row: IngredientInsert): IngredientRow {
    return db.insert(ingredients).values(row).returning().get();
  },

  update(
    db: AppDb,
    tenantId: number,
    id: string,
    patch: Partial<IngredientInsert>,
  ): IngredientRow | undefined {
    return db
      .update(ingredients)
      .set(patch)
      .where(and(eq(ingredients.tenantId, tenantId), eq(ingredients.id, id)))
      .returning()
      .get();
  },

  /** Unsafe in normal flows — used only by InventoryService. */
  setStockQuantity(
    db: AppDb,
    tenantId: number,
    id: string,
    stockQuantity: number,
    updatedAt: number,
    updatedBy: string,
  ): void {
    db.update(ingredients)
      .set({ stockQuantity, updatedAt, updatedBy })
      .where(and(eq(ingredients.tenantId, tenantId), eq(ingredients.id, id)))
      .run();
  },

  /** Stock + weighted-avg cost in one update — used by InventoryService when
   *  a movement carries a cost (purchase, production_output). */
  setStockAndCost(
    db: AppDb,
    tenantId: number,
    id: string,
    stockQuantity: number,
    currentAvgCostPerUnit: number,
    updatedAt: number,
    updatedBy: string,
  ): void {
    db.update(ingredients)
      .set({ stockQuantity, currentAvgCostPerUnit, updatedAt, updatedBy })
      .where(and(eq(ingredients.tenantId, tenantId), eq(ingredients.id, id)))
      .run();
  },
};
