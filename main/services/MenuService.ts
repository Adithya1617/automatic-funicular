import type { AppDb } from '../db/client';
import { newId } from '../lib/ids';
import { menuItemRepository } from '../repositories/menuItemRepository';
import { recipeRepository } from '../repositories/recipeRepository';
import { AvailabilityService } from './AvailabilityService';
import { RecipeService } from './RecipeService';
import type {
  CreateMenuItemInput,
  CreateVariantInput,
  ListMenuItemsInput,
  MenuItem,
  UpdateMenuItemInput,
} from '@shared/schemas/menuItem';
import type { RecipeWithIngredients } from '@shared/schemas/recipe';
import {
  ConflictError,
  NotFoundError,
} from '@shared/errors/DomainError';
import { SYSTEM_USER_ID } from '@shared/constants/system';

function toMenuItem(row: ReturnType<typeof menuItemRepository.findById>): MenuItem {
  if (!row) throw new Error('toMenuItem called with empty row');
  return row as unknown as MenuItem;
}

export const MenuService = {
  list(db: AppDb, tenantId: number, filter: ListMenuItemsInput): MenuItem[] {
    return menuItemRepository
      .list(db, tenantId, filter)
      .map((row) => row as unknown as MenuItem);
  },

  get(db: AppDb, tenantId: number, id: string): MenuItem {
    const row = menuItemRepository.findById(db, tenantId, id);
    if (!row) throw new NotFoundError('MenuItem', id);
    return toMenuItem(row);
  },

  create(
    db: AppDb,
    tenantId: number,
    input: CreateMenuItemInput,
    actorId: string = SYSTEM_USER_ID,
  ): MenuItem {
    const dup = menuItemRepository.findByName(db, tenantId, input.name);
    if (dup) {
      throw new ConflictError(`A menu item named "${input.name}" already exists`, {
        name: 'duplicate',
      });
    }
    const now = Date.now();
    const row = menuItemRepository.insert(db, {
      id: newId(),
      tenantId,
      name: input.name,
      category: input.category,
      sellingPrice: input.sellingPrice,
      variantGroupId: input.variantGroupId,
      displayOrder: input.displayOrder,
      isActive: true,
      createdAt: now,
      updatedAt: now,
      createdBy: actorId,
      updatedBy: actorId,
    });
    AvailabilityService.recomputeForMenuItem(db, tenantId, row.id);
    return toMenuItem(row);
  },

  update(
    db: AppDb,
    tenantId: number,
    input: UpdateMenuItemInput,
    actorId: string = SYSTEM_USER_ID,
  ): MenuItem {
    const existing = menuItemRepository.findById(db, tenantId, input.id);
    if (!existing) throw new NotFoundError('MenuItem', input.id);

    if (input.name && input.name !== existing.name) {
      const dup = menuItemRepository.findByName(db, tenantId, input.name);
      if (dup && dup.id !== existing.id) {
        throw new ConflictError(`A menu item named "${input.name}" already exists`, {
          name: 'duplicate',
        });
      }
    }

    const patch: Record<string, unknown> = { updatedAt: Date.now(), updatedBy: actorId };
    if (input.name !== undefined) patch['name'] = input.name;
    if (input.category !== undefined) patch['category'] = input.category;
    if (input.sellingPrice !== undefined) patch['sellingPrice'] = input.sellingPrice;
    if (input.variantGroupId !== undefined) patch['variantGroupId'] = input.variantGroupId;
    if (input.displayOrder !== undefined) patch['displayOrder'] = input.displayOrder;
    if (input.isActive !== undefined) patch['isActive'] = input.isActive;

    const row = menuItemRepository.update(db, tenantId, input.id, patch);
    if (!row) throw new NotFoundError('MenuItem', input.id);
    return toMenuItem(row);
  },

  deactivate(
    db: AppDb,
    tenantId: number,
    id: string,
    actorId: string = SYSTEM_USER_ID,
  ): MenuItem {
    const existing = menuItemRepository.findById(db, tenantId, id);
    if (!existing) throw new NotFoundError('MenuItem', id);
    const row = menuItemRepository.update(db, tenantId, id, {
      isActive: false,
      updatedAt: Date.now(),
      updatedBy: actorId,
    });
    if (!row) throw new NotFoundError('MenuItem', id);
    return toMenuItem(row);
  },

  /**
   * Create a sibling menu item that shares the source's variant group, copying
   * the source's active recipe rows so the user just edits quantities. If the
   * source has no group yet, mints one and back-fills the source.
   */
  createVariant(
    db: AppDb,
    tenantId: number,
    input: CreateVariantInput,
    actorId: string = SYSTEM_USER_ID,
  ): { menuItem: MenuItem; recipe: RecipeWithIngredients | null } {
    const source = menuItemRepository.findById(db, tenantId, input.sourceId);
    if (!source) throw new NotFoundError('MenuItem', input.sourceId);

    return db.transaction((tx) => {
      let groupId = source.variantGroupId;
      if (!groupId) {
        groupId = newId();
        menuItemRepository.update(tx, tenantId, source.id, {
          variantGroupId: groupId,
          updatedAt: Date.now(),
          updatedBy: actorId,
        });
      }

      const created = MenuService.create(
        tx,
        tenantId,
        {
          name: input.name,
          category: source.category,
          sellingPrice: input.sellingPrice,
          variantGroupId: groupId,
          displayOrder: source.displayOrder + 1,
        },
        actorId,
      );

      // Copy source's active recipe (if any) into the new variant.
      const sourceRecipe = recipeRepository.findActiveVersion(tx, {
        tenantId,
        parentId: source.id,
        parentType: 'menu_item',
      });
      let copiedRecipe: RecipeWithIngredients | null = null;
      if (sourceRecipe) {
        const rows = recipeRepository.ingredientsForVersion(tx, sourceRecipe.id);
        if (rows.length > 0) {
          copiedRecipe = RecipeService.saveVersion(
            tx,
            tenantId,
            {
              parentId: created.id,
              parentType: 'menu_item',
              targetYield: sourceRecipe.targetYield,
              notes: sourceRecipe.notes,
              rows: rows.map((r, idx) => ({
                childIngredientId: r.childIngredientId,
                quantity: r.quantity,
                unit: r.unit,
                notes: r.notes,
                displayOrder: idx,
              })),
            },
            actorId,
          );
        }
      }

      return { menuItem: created, recipe: copiedRecipe };
    });
  },
};
