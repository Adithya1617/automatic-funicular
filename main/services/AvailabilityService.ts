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
  async list(
    db: AppDb,
    tenantId: number,
    menuItemIds?: string[],
  ): Promise<MenuItemAvailability[]> {
    const rows = await menuItemAvailabilityRepository.list(db, tenantId, menuItemIds);
    return rows.map((row) => row as unknown as MenuItemAvailability);
  },

  /**
   * Recompute every active menu item's availability. Used after large state
   * changes (e.g. seed data load); called individually for targeted updates.
   */
  async recomputeAllMenuItems(db: AppDb, tenantId: number): Promise<void> {
    const menus = await menuItemRepository.listAllActive(db, tenantId);
    for (const menu of menus) {
      const computed = await computeForMenuItem(db, tenantId, menu.id);
      await writeRow(db, tenantId, computed);
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
  async recomputeForIngredients(
    db: AppDb,
    tenantId: number,
    ingredientIds: string[],
  ): Promise<void> {
    if (ingredientIds.length === 0) return;
    const affected = await findAffectedMenuItems(db, tenantId, ingredientIds);
    for (const menuId of affected) {
      const computed = await computeForMenuItem(db, tenantId, menuId);
      await writeRow(db, tenantId, computed);
    }
  },

  /**
   * Recompute a single menu item — used when its own recipe was edited.
   * Cheaper than walking the dependency graph since the recipe edit is the
   * trigger.
   */
  async recomputeForMenuItem(db: AppDb, tenantId: number, menuItemId: string): Promise<void> {
    const computed = await computeForMenuItem(db, tenantId, menuItemId);
    await writeRow(db, tenantId, computed);
  },
};

async function writeRow(db: AppDb, tenantId: number, computed: AvailabilityRow): Promise<void> {
  await menuItemAvailabilityRepository.upsert(db, {
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
async function computeForMenuItem(
  db: AppDb,
  tenantId: number,
  menuItemId: string,
): Promise<AvailabilityRow> {
  const recipe = await recipeRepository.findActiveVersion(db, {
    tenantId,
    parentId: menuItemId,
    parentType: 'menu_item',
  });
  if (!recipe) {
    return { menuItemId, maxServingsAvailable: 0, bottleneckIngredientId: null };
  }
  const rows = await recipeRepository.ingredientsForVersion(db, recipe.id);
  if (rows.length === 0) {
    return { menuItemId, maxServingsAvailable: 0, bottleneckIngredientId: null };
  }

  let min = Number.POSITIVE_INFINITY;
  let bottleneck: string | null = null;
  for (const row of rows) {
    const child = await ingredientRepository.findById(db, tenantId, row.childIngredientId);
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
async function findAffectedMenuItems(
  db: AppDb,
  tenantId: number,
  ingredientIds: string[],
): Promise<Set<string>> {
  const affected = new Set<string>();
  const ids = new Set(ingredientIds);

  // 1. Prepared ingredients whose active recipe references any of these.
  const allActive = await ingredientRepository.list(db, tenantId, { includeInactive: false });
  const preparedDependents: string[] = [];
  for (const ing of allActive) {
    if (ing.type !== 'prepared') continue;
    if (ids.has(ing.id)) continue; // already in the trigger set
    const recipe = await recipeRepository.findActiveVersion(db, {
      tenantId,
      parentId: ing.id,
      parentType: 'ingredient',
    });
    if (!recipe) continue;
    const rows = await recipeRepository.ingredientsForVersion(db, recipe.id);
    if (rows.some((r) => ids.has(r.childIngredientId))) {
      preparedDependents.push(ing.id);
    }
  }

  // The full "ingredients of interest" set for menu lookup is direct + indirect.
  const lookup = new Set([...ingredientIds, ...preparedDependents]);

  // 2. Walk every active menu item's active recipe; mark affected if any row
  //    references any id in `lookup`.
  const menus = await menuItemRepository.listAllActive(db, tenantId);
  for (const menu of menus) {
    const recipe = await recipeRepository.findActiveVersion(db, {
      tenantId,
      parentId: menu.id,
      parentType: 'menu_item',
    });
    if (!recipe) continue;
    const rows = await recipeRepository.ingredientsForVersion(db, recipe.id);
    if (rows.some((r) => lookup.has(r.childIngredientId))) {
      affected.add(menu.id);
    }
  }

  return affected;
}
