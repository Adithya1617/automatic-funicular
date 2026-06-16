import type { AppDb } from '../db/client';
import { newId } from '../lib/ids';
import { ingredientRepository } from '../repositories/ingredientRepository';
import { menuItemRepository } from '../repositories/menuItemRepository';
import { recipeRepository } from '../repositories/recipeRepository';
import { serviceTemplateRepository } from '../repositories/serviceTemplateRepository';
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
  async getActive(
    db: AppDb,
    tenantId: number,
    parentId: string,
    parentType: RecipeParentType,
  ): Promise<RecipeWithIngredients | null> {
    const version = await recipeRepository.findActiveVersion(db, {
      tenantId,
      parentId,
      parentType,
    });
    if (!version) return null;
    const ings = await recipeRepository.ingredientsForVersion(db, version.id);
    return {
      ...(version as RecipeVersion),
      ingredients: ings as unknown as RecipeIngredient[],
    };
  },

  async listVersions(
    db: AppDb,
    tenantId: number,
    parentId: string,
    parentType: RecipeParentType,
  ): Promise<RecipeVersion[]> {
    const versions = await recipeRepository.listVersions(db, { tenantId, parentId, parentType });
    return versions.map((v) => v as unknown as RecipeVersion);
  },

  /**
   * Validates and persists a new RecipeVersion (Path A snapshot semantics:
   * old rows stay frozen). Wraps the flip-current + insert-version +
   * insert-ingredients in a single transaction.
   */
  async saveVersion(
    db: AppDb,
    tenantId: number,
    input: SaveRecipeVersionInput,
    actorId: string = SYSTEM_USER_ID,
  ): Promise<RecipeWithIngredients> {
    let parentName: string;
    if (input.parentType === 'menu_item') {
      const menuItem = await menuItemRepository.findById(db, tenantId, input.parentId);
      if (!menuItem) throw new NotFoundError('MenuItem', input.parentId);
      parentName = menuItem.name;
    } else if (input.parentType === 'service_template') {
      const template = await serviceTemplateRepository.findById(db, tenantId, input.parentId);
      if (!template) throw new NotFoundError('ServiceTemplate', input.parentId);
      parentName = template.name;
    } else {
      const ingredient = await ingredientRepository.findById(db, tenantId, input.parentId);
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
    const childIds: string[] = [];
    for (const row of input.rows) {
      const child = await ingredientRepository.findById(db, tenantId, row.childIngredientId);
      if (!child) throw new NotFoundError('Ingredient', row.childIngredientId);
      // Throws ValidationError if the unit can't be converted.
      toBase(row.quantity, row.unit, child.baseUnit, {
        densityGPerMl: child.densityGPerMl ?? undefined,
      });
      childIds.push(child.id);
    }

    // Cycle detection only applies when the parent is itself an ingredient —
    // a menu item can't appear as a child of any recipe, so cycles can't form.
    if (input.parentType === 'ingredient') {
      await detectCycle(db, tenantId, input.parentId, childIds);
    }

    const result = await db.transaction(async (tx) => {
      await recipeRepository.clearCurrentFlag(tx, {
        tenantId,
        parentId: input.parentId,
        parentType: input.parentType,
      });

      const versionNumber = await recipeRepository.nextVersionNumber(tx, {
        tenantId,
        parentId: input.parentId,
        parentType: input.parentType,
      });

      const now = Date.now();
      const versionRow = await recipeRepository.insertVersion(tx, {
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

      const ingredientRows = await recipeRepository.insertIngredients(
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
      await AvailabilityService.recomputeForMenuItem(db, tenantId, input.parentId);
    } else if (input.parentType === 'ingredient') {
      // Editing a prepared ingredient's recipe affects every menu using it
      // (the recipe rows changed but stock didn't — still need to refresh
      // the cache because the ingredient's "qty per serving" path is now
      // different in some menus' food cost calc later. Keep it simple:
      // recompute menus that depend on this prepared ingredient.)
      await AvailabilityService.recomputeForIngredients(db, tenantId, [input.parentId]);
    }
    // service_template: no availability cache to bust — service events compute
    // feasibility on demand from the active template.

    return result;
  },

  /**
   * Walk the BoM rooted at the active version of (parentId, parentType).
   * Children are expanded recursively only for `prepared` ingredients,
   * up to MAX_BOM_DEPTH.
   */
  async walkBoM(
    db: AppDb,
    tenantId: number,
    parentId: string,
    parentType: RecipeParentType,
    maxDepth: number = MAX_BOM_DEPTH,
  ): Promise<BoMNode[]> {
    const recipe = await RecipeService.getActive(db, tenantId, parentId, parentType);
    if (!recipe) return [];
    return walkChildren(db, tenantId, recipe.ingredients, maxDepth, new Set([parentId]));
  },
};

async function walkChildren(
  db: AppDb,
  tenantId: number,
  rows: RecipeIngredient[],
  remainingDepth: number,
  visited: Set<string>,
): Promise<BoMNode[]> {
  const out: BoMNode[] = [];
  for (const row of rows) {
    const child = await ingredientRepository.findById(db, tenantId, row.childIngredientId);
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
      const childRecipe = await recipeRepository.findActiveVersion(db, {
        tenantId,
        parentId: child.id,
        parentType: 'ingredient',
      });
      if (childRecipe) {
        const childRows = await recipeRepository.ingredientsForVersion(db, childRecipe.id);
        node.children = await walkChildren(
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
async function detectCycle(
  db: AppDb,
  tenantId: number,
  parentId: string,
  immediateChildIds: string[],
): Promise<void> {
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

    const child = await ingredientRepository.findById(db, tenantId, frame.id);
    if (!child || child.type !== 'prepared') continue;

    const recipe = await recipeRepository.findActiveVersion(db, {
      tenantId,
      parentId: child.id,
      parentType: 'ingredient',
    });
    if (!recipe) continue;

    const grandchildren = await recipeRepository.ingredientsForVersion(db, recipe.id);
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
