import type { AppDb } from '../db/client';
import { newId } from '../lib/ids';
import { ingredientRepository } from '../repositories/ingredientRepository';
import { menuItemRepository } from '../repositories/menuItemRepository';
import { recipeRepository } from '../repositories/recipeRepository';
import { AvailabilityService } from './AvailabilityService';
import type {
  RecipeWithIngredients,
  RecipeIngredient,
  RecipeVersion,
  SaveRecipeVersionInput,
} from '@shared/schemas/recipe';
import type { RecipeParentType } from '@shared/constants/recipe';
import { MAX_BOM_DEPTH } from '@shared/constants/recipe';
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from '@shared/errors/DomainError';
import { SYSTEM_USER_ID } from '@shared/constants/system';
import { toBase } from '@shared/utils/unitConverter';

export type BoMNode = {
  ingredientId: string;
  ingredientName: string;
  type: 'raw' | 'prepared';
  /** Quantity required at this node, in the parent recipe's `unit`. */
  quantity: number;
  unit: string;
  /** Children only present for `type === 'prepared'` and only walked up to MAX_BOM_DEPTH. */
  children: BoMNode[];
};

export const RecipeService = {
  getActive(
    db: AppDb,
    tenantId: number,
    parentId: string,
    parentType: RecipeParentType,
  ): RecipeWithIngredients | null {
    const version = recipeRepository.findActiveVersion(db, {
      tenantId,
      parentId,
      parentType,
    });
    if (!version) return null;
    const ings = recipeRepository.ingredientsForVersion(db, version.id);
    return {
      ...(version as RecipeVersion),
      ingredients: ings as unknown as RecipeIngredient[],
    };
  },

  listVersions(
    db: AppDb,
    tenantId: number,
    parentId: string,
    parentType: RecipeParentType,
  ): RecipeVersion[] {
    return recipeRepository
      .listVersions(db, { tenantId, parentId, parentType })
      .map((v) => v as unknown as RecipeVersion);
  },

  /**
   * Validates and persists a new RecipeVersion (Path A snapshot semantics:
   * old rows stay frozen). Wraps the flip-current + insert-version +
   * insert-ingredients in a single transaction.
   */
  saveVersion(
    db: AppDb,
    tenantId: number,
    input: SaveRecipeVersionInput,
    actorId: string = SYSTEM_USER_ID,
  ): RecipeWithIngredients {
    let parentName: string;
    if (input.parentType === 'menu_item') {
      const menuItem = menuItemRepository.findById(db, tenantId, input.parentId);
      if (!menuItem) throw new NotFoundError('MenuItem', input.parentId);
      parentName = menuItem.name;
    } else {
      const ingredient = ingredientRepository.findById(db, tenantId, input.parentId);
      if (!ingredient) throw new NotFoundError('Ingredient', input.parentId);
      if (ingredient.type !== 'prepared') {
        throw new ValidationError(
          `Recipes on ingredients require type='prepared' (parent ${ingredient.name} is ${ingredient.type})`,
        );
      }
      parentName = ingredient.name;
    }

    if (input.rows.length === 0) {
      throw new ValidationError('Recipe must have at least one ingredient row');
    }

    // No self-loop at row level (only meaningful for ingredient parents — a
    // menu item can't be in an ingredient list anyway, but cheap to keep).
    for (const row of input.rows) {
      if (row.childIngredientId === input.parentId) {
        throw new ValidationError(
          `Recipe cannot include its own parent (${parentName})`,
        );
      }
    }

    // Resolve children, validate units convert to each child's base unit.
    const children = input.rows.map((row) => {
      const child = ingredientRepository.findById(db, tenantId, row.childIngredientId);
      if (!child) throw new NotFoundError('Ingredient', row.childIngredientId);
      // Throws ValidationError if the unit can't be converted.
      toBase(row.quantity, row.unit, child.baseUnit, {
        densityGPerMl: child.densityGPerMl ?? undefined,
      });
      return child;
    });

    // Cycle detection only applies when the parent is itself an ingredient —
    // a menu item can't appear as a child of any recipe, so cycles can't form.
    if (input.parentType === 'ingredient') {
      detectCycle(db, tenantId, input.parentId, children.map((c) => c.id));
    }

    const result = db.transaction((tx) => {
      recipeRepository.clearCurrentFlag(tx, {
        tenantId,
        parentId: input.parentId,
        parentType: input.parentType,
      });

      const versionNumber = recipeRepository.nextVersionNumber(tx, {
        tenantId,
        parentId: input.parentId,
        parentType: input.parentType,
      });

      const now = Date.now();
      const versionRow = recipeRepository.insertVersion(tx, {
        id: newId(),
        tenantId,
        parentId: input.parentId,
        parentType: input.parentType,
        versionNumber,
        isCurrent: true,
        targetYield: input.targetYield,
        notes: input.notes,
        createdAt: now,
        createdBy: actorId,
      });

      const ingredientRows = recipeRepository.insertIngredients(
        tx,
        input.rows.map((row, idx) => ({
          id: newId(),
          recipeVersionId: versionRow.id,
          childIngredientId: row.childIngredientId,
          quantity: row.quantity,
          unit: row.unit,
          notes: row.notes,
          displayOrder: row.displayOrder || idx,
        })),
      );

      return {
        ...(versionRow as RecipeVersion),
        ingredients: ingredientRows as unknown as RecipeIngredient[],
      };
    });

    // Recipe edits change menu availability. Trigger after the tx commits so
    // reads inside the recompute see the new rows.
    if (input.parentType === 'menu_item') {
      AvailabilityService.recomputeForMenuItem(db, tenantId, input.parentId);
    } else {
      // Editing a prepared ingredient's recipe affects every menu using it
      // (the recipe rows changed but stock didn't — still need to refresh
      // the cache because the ingredient's "qty per serving" path is now
      // different in some menus' food cost calc later. Keep it simple:
      // recompute menus that depend on this prepared ingredient.)
      AvailabilityService.recomputeForIngredients(db, tenantId, [input.parentId]);
    }

    return result;
  },

  /**
   * Walk the BoM rooted at the active version of (parentId, parentType).
   * Children are expanded recursively only for `prepared` ingredients,
   * up to MAX_BOM_DEPTH.
   */
  walkBoM(
    db: AppDb,
    tenantId: number,
    parentId: string,
    parentType: RecipeParentType,
    maxDepth: number = MAX_BOM_DEPTH,
  ): BoMNode[] {
    const recipe = RecipeService.getActive(db, tenantId, parentId, parentType);
    if (!recipe) return [];
    return walkChildren(db, tenantId, recipe.ingredients, maxDepth, new Set([parentId]));
  },
};

function walkChildren(
  db: AppDb,
  tenantId: number,
  rows: RecipeIngredient[],
  remainingDepth: number,
  visited: Set<string>,
): BoMNode[] {
  const out: BoMNode[] = [];
  for (const row of rows) {
    const child = ingredientRepository.findById(db, tenantId, row.childIngredientId);
    if (!child) continue;
    const node: BoMNode = {
      ingredientId: child.id,
      ingredientName: child.name,
      type: child.type,
      quantity: row.quantity,
      unit: row.unit,
      children: [],
    };
    if (child.type === 'prepared' && remainingDepth > 1 && !visited.has(child.id)) {
      const childRecipe = recipeRepository.findActiveVersion(db, {
        tenantId,
        parentId: child.id,
        parentType: 'ingredient',
      });
      if (childRecipe) {
        const childRows = recipeRepository.ingredientsForVersion(db, childRecipe.id);
        node.children = walkChildren(
          db,
          tenantId,
          childRows as unknown as RecipeIngredient[],
          remainingDepth - 1,
          new Set([...visited, child.id]),
        );
      }
    }
    out.push(node);
  }
  return out;
}

/**
 * DFS through every descendant prepared ingredient's active recipe. If any
 * descendant references `parentId`, raise `ConflictError` describing the cycle.
 * Also enforces MAX_BOM_DEPTH.
 */
function detectCycle(
  db: AppDb,
  tenantId: number,
  parentId: string,
  immediateChildIds: string[],
): void {
  type Frame = { id: string; depth: number; chain: string[] };
  const visited = new Set<string>();
  const stack: Frame[] = immediateChildIds.map((id) => ({
    id,
    depth: 1,
    chain: [parentId, id],
  }));

  while (stack.length > 0) {
    const frame = stack.pop()!;
    if (frame.depth > MAX_BOM_DEPTH) {
      throw new ValidationError(
        `Recipe BoM exceeds maximum depth of ${MAX_BOM_DEPTH} (chain: ${frame.chain.join(' → ')})`,
      );
    }
    if (visited.has(frame.id)) continue;
    visited.add(frame.id);

    const child = ingredientRepository.findById(db, tenantId, frame.id);
    if (!child || child.type !== 'prepared') continue;

    const recipe = recipeRepository.findActiveVersion(db, {
      tenantId,
      parentId: child.id,
      parentType: 'ingredient',
    });
    if (!recipe) continue;

    const grandchildren = recipeRepository.ingredientsForVersion(db, recipe.id);
    for (const gc of grandchildren) {
      if (gc.childIngredientId === parentId) {
        throw new ConflictError(
          `Recipe creates a BoM cycle: ${[...frame.chain, parentId].join(' → ')}`,
        );
      }
      stack.push({
        id: gc.childIngredientId,
        depth: frame.depth + 1,
        chain: [...frame.chain, gc.childIngredientId],
      });
    }
  }
}
