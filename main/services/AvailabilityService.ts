import type { AppDb } from '../db/client';
import { newId } from '../lib/ids';
import { ingredientRepository } from '../repositories/ingredientRepository';
import { menuItemAvailabilityRepository } from '../repositories/menuItemAvailabilityRepository';
import { menuItemRepository } from '../repositories/menuItemRepository';
import { recipeRepository } from '../repositories/recipeRepository';
import type { MenuItemAvailability } from '@shared/schemas/availability';
import { toBase } from '@shared/utils/unitConverter';

type AvailabilityRow = {
  menuItemId: string;
  maxServingsAvailable: number;
  bottleneckIngredientId: string | null;
};

export const AvailabilityService = {
  list(
    db: AppDb,
    tenantId: number,
    menuItemIds?: string[],
  ): MenuItemAvailability[] {
    return menuItemAvailabilityRepository
      .list(db, tenantId, menuItemIds)
      .map((row) => row as unknown as MenuItemAvailability);
  },

  /**
   * Recompute every active menu item's availability. Used after large state
   * changes (e.g. seed data load); called individually for targeted updates.
   */
  recomputeAllMenuItems(db: AppDb, tenantId: number): void {
    const menuIds = menuItemRepository
      .listAllActive(db, tenantId)
      .map((m) => m.id);
    for (const id of menuIds) {
      const computed = computeForMenuItem(db, tenantId, id);
      writeRow(db, tenantId, computed);
    }
  },

  /**
   * BoM-aware invalidation, BoM-non-explosive computation
   * (locked decision §3.9 / §5.9).
   *
   * Find every menu item that depends on any of the given ingredients —
   * directly via its own recipe rows, or indirectly because it uses a
   * prepared ingredient whose recipe references one of them. Then recompute
   * each affected menu's availability looking only at its immediate recipe.
   */
  recomputeForIngredients(
    db: AppDb,
    tenantId: number,
    ingredientIds: string[],
  ): void {
    if (ingredientIds.length === 0) return;
    const affected = findAffectedMenuItems(db, tenantId, ingredientIds);
    for (const menuId of affected) {
      const computed = computeForMenuItem(db, tenantId, menuId);
      writeRow(db, tenantId, computed);
    }
  },

  /**
   * Recompute a single menu item — used when its own recipe was edited.
   * Cheaper than walking the dependency graph since the recipe edit is the
   * trigger.
   */
  recomputeForMenuItem(db: AppDb, tenantId: number, menuItemId: string): void {
    const computed = computeForMenuItem(db, tenantId, menuItemId);
    writeRow(db, tenantId, computed);
  },
};

function writeRow(db: AppDb, tenantId: number, computed: AvailabilityRow): void {
  menuItemAvailabilityRepository.upsert(db, {
    id: newId(),
    tenantId,
    menuItemId: computed.menuItemId,
    maxServingsAvailable: computed.maxServingsAvailable,
    bottleneckIngredientId: computed.bottleneckIngredientId,
    lastComputedAt: Date.now(),
  });
}

/**
 * For one menu item: walk its immediate recipe rows. For each row, compute
 * floor(child.stockQuantity / qty_per_serving_in_child_base_unit). The min
 * across rows is the menu's max servings. Bottleneck = the row producing that
 * min. Prepared children are read at their own stock — we do NOT explode into
 * raw constituents here.
 */
function computeForMenuItem(
  db: AppDb,
  tenantId: number,
  menuItemId: string,
): AvailabilityRow {
  const recipe = recipeRepository.findActiveVersion(db, {
    tenantId,
    parentId: menuItemId,
    parentType: 'menu_item',
  });
  if (!recipe) {
    return { menuItemId, maxServingsAvailable: 0, bottleneckIngredientId: null };
  }
  const rows = recipeRepository.ingredientsForVersion(db, recipe.id);
  if (rows.length === 0) {
    return { menuItemId, maxServingsAvailable: 0, bottleneckIngredientId: null };
  }

  let min = Number.POSITIVE_INFINITY;
  let bottleneck: string | null = null;
  for (const row of rows) {
    const child = ingredientRepository.findById(db, tenantId, row.childIngredientId);
    if (!child) {
      // Missing ingredient — treat as out of stock.
      min = 0;
      bottleneck = row.childIngredientId;
      break;
    }
    let qtyPerServingBase: number;
    try {
      qtyPerServingBase = toBase(row.quantity, row.unit, child.baseUnit, {
        densityGPerMl: child.densityGPerMl ?? undefined,
      });
    } catch {
      min = 0;
      bottleneck = child.id;
      break;
    }
    if (qtyPerServingBase <= 0) {
      // Recipe row has nonsensical qty — skip in the min calc rather than
      // letting it dominate as Infinity.
      continue;
    }
    const ratio = child.stockQuantity / qtyPerServingBase;
    if (ratio < min) {
      min = ratio;
      bottleneck = child.id;
    }
  }

  if (!Number.isFinite(min)) {
    return { menuItemId, maxServingsAvailable: 0, bottleneckIngredientId: null };
  }
  return {
    menuItemId,
    maxServingsAvailable: Math.max(0, Math.floor(min)),
    bottleneckIngredientId: bottleneck,
  };
}

/**
 * Resolve which menu items must be recomputed when these ingredient ids
 * change. Direct hit = menu's own recipe references the ingredient. Indirect
 * hit = a prepared ingredient whose recipe references one of these is used
 * by a menu.
 */
function findAffectedMenuItems(
  db: AppDb,
  tenantId: number,
  ingredientIds: string[],
): Set<string> {
  const affected = new Set<string>();
  const ids = new Set(ingredientIds);

  // 1. Prepared ingredients whose active recipe references any of these.
  const allActive = ingredientRepository.list(db, tenantId, { includeInactive: false });
  const preparedDependents: string[] = [];
  for (const ing of allActive) {
    if (ing.type !== 'prepared') continue;
    if (ids.has(ing.id)) continue; // already in the trigger set
    const recipe = recipeRepository.findActiveVersion(db, {
      tenantId,
      parentId: ing.id,
      parentType: 'ingredient',
    });
    if (!recipe) continue;
    const rows = recipeRepository.ingredientsForVersion(db, recipe.id);
    if (rows.some((r) => ids.has(r.childIngredientId))) {
      preparedDependents.push(ing.id);
    }
  }

  // The full "ingredients of interest" set for menu lookup is direct + indirect.
  const lookup = new Set([...ingredientIds, ...preparedDependents]);

  // 2. Walk every active menu item's active recipe; mark affected if any row
  //    references any id in `lookup`.
  const menuIds = menuItemRepository.listAllActive(db, tenantId).map((m) => m.id);
  for (const menuId of menuIds) {
    const recipe = recipeRepository.findActiveVersion(db, {
      tenantId,
      parentId: menuId,
      parentType: 'menu_item',
    });
    if (!recipe) continue;
    const rows = recipeRepository.ingredientsForVersion(db, recipe.id);
    if (rows.some((r) => lookup.has(r.childIngredientId))) {
      affected.add(menuId);
    }
  }

  return affected;
}
