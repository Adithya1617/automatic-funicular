import { and, asc, desc, eq, inArray, max } from 'drizzle-orm';
import type { AppDb } from '../db/client';
import {
  recipeIngredients,
  recipeVersions,
  type RecipeIngredientInsert,
  type RecipeIngredientRow,
  type RecipeVersionInsert,
  type RecipeVersionRow,
} from '../db/schema';
import type { RecipeParentType } from '@shared/constants/recipe';

type ParentSelector = {
  tenantId: number;
  parentId: string;
  parentType: RecipeParentType;
};

export const recipeRepository = {
  async findActiveVersion(db: AppDb, sel: ParentSelector): Promise<RecipeVersionRow | undefined> {
    const rows = await db
      .select()
      .from(recipeVersions)
      .where(
        and(
          eq(recipeVersions.tenantId, sel.tenantId),
          eq(recipeVersions.parentId, sel.parentId),
          eq(recipeVersions.parentType, sel.parentType),
          eq(recipeVersions.isCurrent, true),
        ),
      );
    return rows[0];
  },

  async findVersionById(
    db: AppDb,
    tenantId: number,
    id: string,
  ): Promise<RecipeVersionRow | undefined> {
    const rows = await db
      .select()
      .from(recipeVersions)
      .where(and(eq(recipeVersions.tenantId, tenantId), eq(recipeVersions.id, id)));
    return rows[0];
  },

  async listVersions(db: AppDb, sel: ParentSelector): Promise<RecipeVersionRow[]> {
    return db
      .select()
      .from(recipeVersions)
      .where(
        and(
          eq(recipeVersions.tenantId, sel.tenantId),
          eq(recipeVersions.parentId, sel.parentId),
          eq(recipeVersions.parentType, sel.parentType),
        ),
      )
      .orderBy(desc(recipeVersions.versionNumber));
  },

  async nextVersionNumber(db: AppDb, sel: ParentSelector): Promise<number> {
    const rows = await db
      .select({ value: max(recipeVersions.versionNumber) })
      .from(recipeVersions)
      .where(
        and(
          eq(recipeVersions.tenantId, sel.tenantId),
          eq(recipeVersions.parentId, sel.parentId),
          eq(recipeVersions.parentType, sel.parentType),
        ),
      );
    return (rows[0]?.value ?? 0) + 1;
  },

  async insertVersion(db: AppDb, row: RecipeVersionInsert): Promise<RecipeVersionRow> {
    const [inserted] = await db.insert(recipeVersions).values(row).returning();
    if (!inserted) throw new Error('recipe version insert returned no row');
    return inserted;
  },

  async insertIngredients(
    db: AppDb,
    rows: RecipeIngredientInsert[],
  ): Promise<RecipeIngredientRow[]> {
    if (rows.length === 0) return [];
    return db.insert(recipeIngredients).values(rows).returning();
  },

  async clearCurrentFlag(db: AppDb, sel: ParentSelector): Promise<void> {
    await db
      .update(recipeVersions)
      .set({ isCurrent: false })
      .where(
        and(
          eq(recipeVersions.tenantId, sel.tenantId),
          eq(recipeVersions.parentId, sel.parentId),
          eq(recipeVersions.parentType, sel.parentType),
          eq(recipeVersions.isCurrent, true),
        ),
      );
  },

  async ingredientsForVersion(db: AppDb, versionId: string): Promise<RecipeIngredientRow[]> {
    return db
      .select()
      .from(recipeIngredients)
      .where(eq(recipeIngredients.recipeVersionId, versionId))
      .orderBy(asc(recipeIngredients.displayOrder), asc(recipeIngredients.id));
  },

  async ingredientsForVersions(
    db: AppDb,
    versionIds: string[],
  ): Promise<RecipeIngredientRow[]> {
    if (versionIds.length === 0) return [];
    return db
      .select()
      .from(recipeIngredients)
      .where(inArray(recipeIngredients.recipeVersionId, versionIds));
  },
};
