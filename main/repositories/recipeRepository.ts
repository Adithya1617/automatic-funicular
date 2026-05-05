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
  findActiveVersion(db: AppDb, sel: ParentSelector): RecipeVersionRow | undefined {
    return db
      .select()
      .from(recipeVersions)
      .where(
        and(
          eq(recipeVersions.tenantId, sel.tenantId),
          eq(recipeVersions.parentId, sel.parentId),
          eq(recipeVersions.parentType, sel.parentType),
          eq(recipeVersions.isCurrent, true),
        ),
      )
      .get();
  },

  findVersionById(db: AppDb, tenantId: number, id: string): RecipeVersionRow | undefined {
    return db
      .select()
      .from(recipeVersions)
      .where(and(eq(recipeVersions.tenantId, tenantId), eq(recipeVersions.id, id)))
      .get();
  },

  listVersions(db: AppDb, sel: ParentSelector): RecipeVersionRow[] {
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
      .orderBy(desc(recipeVersions.versionNumber))
      .all();
  },

  nextVersionNumber(db: AppDb, sel: ParentSelector): number {
    const result = db
      .select({ value: max(recipeVersions.versionNumber) })
      .from(recipeVersions)
      .where(
        and(
          eq(recipeVersions.tenantId, sel.tenantId),
          eq(recipeVersions.parentId, sel.parentId),
          eq(recipeVersions.parentType, sel.parentType),
        ),
      )
      .get();
    return (result?.value ?? 0) + 1;
  },

  insertVersion(db: AppDb, row: RecipeVersionInsert): RecipeVersionRow {
    return db.insert(recipeVersions).values(row).returning().get();
  },

  insertIngredients(
    db: AppDb,
    rows: RecipeIngredientInsert[],
  ): RecipeIngredientRow[] {
    if (rows.length === 0) return [];
    return db.insert(recipeIngredients).values(rows).returning().all();
  },

  clearCurrentFlag(db: AppDb, sel: ParentSelector): void {
    db.update(recipeVersions)
      .set({ isCurrent: false })
      .where(
        and(
          eq(recipeVersions.tenantId, sel.tenantId),
          eq(recipeVersions.parentId, sel.parentId),
          eq(recipeVersions.parentType, sel.parentType),
          eq(recipeVersions.isCurrent, true),
        ),
      )
      .run();
  },

  ingredientsForVersion(db: AppDb, versionId: string): RecipeIngredientRow[] {
    return db
      .select()
      .from(recipeIngredients)
      .where(eq(recipeIngredients.recipeVersionId, versionId))
      .orderBy(asc(recipeIngredients.displayOrder), asc(recipeIngredients.id))
      .all();
  },

  ingredientsForVersions(db: AppDb, versionIds: string[]): RecipeIngredientRow[] {
    if (versionIds.length === 0) return [];
    return db
      .select()
      .from(recipeIngredients)
      .where(inArray(recipeIngredients.recipeVersionId, versionIds))
      .all();
  },
};
