import { afterEach, describe, expect, it, vi } from 'vitest';
import { MenuService } from '../../main/services/MenuService';
import { menuItemRepository } from '../../main/repositories/menuItemRepository';
import { recipeRepository } from '../../main/repositories/recipeRepository';
import { AvailabilityService } from '../../main/services/AvailabilityService';
import { RecipeService } from '../../main/services/RecipeService';
import { DEFAULT_TENANT_ID, SYSTEM_USER_ID } from '@shared/constants/system';
import { ConflictError, NotFoundError } from '@shared/errors/DomainError';
import type { MenuItemRow, RecipeIngredientRow, RecipeVersionRow } from '../../main/db/schema';

const SOURCE_ID = '01900000-0000-7000-8000-0000000000c1';
const NEW_GROUP_ID = '01900000-0000-7000-8000-0000000000c2';

function mi(overrides: Partial<MenuItemRow>): MenuItemRow {
  return {
    id: SOURCE_ID,
    tenantId: DEFAULT_TENANT_ID,
    name: 'Paneer Biryani',
    category: 'Biryani',
    sellingPrice: 280,
    variantGroupId: null,
    displayOrder: 0,
    isActive: true,
    createdAt: 0,
    updatedAt: 0,
    createdBy: SYSTEM_USER_ID,
    updatedBy: SYSTEM_USER_ID,
    ...overrides,
  };
}

function makeFakeDb() {
  const fakeDb = {
    transaction: vi.fn((fn: (tx: unknown) => unknown) => fn(fakeDb)),
  };
  return fakeDb;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('MenuService.create — uniqueness + availability hook', () => {
  it('rejects duplicate names within a tenant', () => {
    const db = makeFakeDb();
    vi.spyOn(menuItemRepository, 'findByName').mockReturnValue(mi({}));

    expect(() =>
      MenuService.create(db as never, DEFAULT_TENANT_ID, {
        name: 'Paneer Biryani',
        category: 'Biryani',
        sellingPrice: 280,
        variantGroupId: null,
        displayOrder: 0,
      }),
    ).toThrow(ConflictError);
  });

  it('inserts and triggers availability recompute for the new menu item', () => {
    const db = makeFakeDb();
    vi.spyOn(menuItemRepository, 'findByName').mockReturnValue(undefined);
    const insert = vi
      .spyOn(menuItemRepository, 'insert')
      .mockImplementation((_db, row) => row as MenuItemRow);
    const recompute = vi
      .spyOn(AvailabilityService, 'recomputeForMenuItem')
      .mockImplementation(() => undefined);

    const created = MenuService.create(db as never, DEFAULT_TENANT_ID, {
      name: 'Veg Biryani',
      category: 'Biryani',
      sellingPrice: 220,
      variantGroupId: null,
      displayOrder: 1,
    });

    expect(insert).toHaveBeenCalledTimes(1);
    expect(recompute).toHaveBeenCalledWith(db, DEFAULT_TENANT_ID, created.id);
  });
});

describe('MenuService.createVariant', () => {
  it('mints a new variant_group_id when source has none, back-fills source, and copies recipe', () => {
    const db = makeFakeDb();
    const source = mi({ id: SOURCE_ID, variantGroupId: null });
    vi.spyOn(menuItemRepository, 'findById').mockReturnValue(source);
    vi.spyOn(menuItemRepository, 'findByName').mockReturnValue(undefined);

    const updateCalls: Array<{ id: string; patch: Record<string, unknown> }> = [];
    vi.spyOn(menuItemRepository, 'update').mockImplementation(
      (_db, _tid, id, patch) => {
        updateCalls.push({ id, patch: patch as Record<string, unknown> });
        return source;
      },
    );

    const insertedItems: MenuItemRow[] = [];
    vi.spyOn(menuItemRepository, 'insert').mockImplementation((_db, row) => {
      insertedItems.push(row as MenuItemRow);
      return row as MenuItemRow;
    });

    vi.spyOn(AvailabilityService, 'recomputeForMenuItem').mockImplementation(() => undefined);
    vi.spyOn(recipeRepository, 'findActiveVersion').mockReturnValue({
      id: 'rv-source',
      tenantId: DEFAULT_TENANT_ID,
      parentId: SOURCE_ID,
      parentType: 'menu_item',
      versionNumber: 1,
      isCurrent: true,
      targetYield: 1,
      notes: null,
      createdAt: 0,
      createdBy: SYSTEM_USER_ID,
    });
    vi.spyOn(recipeRepository, 'ingredientsForVersion').mockReturnValue([
      {
        id: 'ri-1',
        recipeVersionId: 'rv-source',
        childIngredientId: 'ing-a',
        quantity: 100,
        unit: 'g',
        notes: null,
        displayOrder: 0,
      },
    ] as RecipeIngredientRow[]);

    const saveSpy = vi
      .spyOn(RecipeService, 'saveVersion')
      .mockImplementation(() => ({
        id: 'rv-new',
        tenantId: DEFAULT_TENANT_ID,
        parentId: insertedItems[0]?.id ?? '',
        parentType: 'menu_item',
        versionNumber: 1,
        isCurrent: true,
        targetYield: 1,
        notes: null,
        createdAt: 0,
        createdBy: SYSTEM_USER_ID,
        ingredients: [],
      }));

    const result = MenuService.createVariant(db as never, DEFAULT_TENANT_ID, {
      sourceId: SOURCE_ID,
      name: 'Paneer Biryani (Large)',
      sellingPrice: 340,
    });

    // Source was patched with a new group id.
    const sourcePatch = updateCalls.find((c) => c.id === SOURCE_ID);
    expect(sourcePatch?.patch['variantGroupId']).toBeDefined();
    const groupId = sourcePatch?.patch['variantGroupId'] as string;

    // The created variant carries the same group id.
    expect(insertedItems).toHaveLength(1);
    expect(insertedItems[0]!.variantGroupId).toBe(groupId);
    expect(insertedItems[0]!.name).toBe('Paneer Biryani (Large)');

    // The source's recipe was copied into the variant.
    expect(saveSpy).toHaveBeenCalledTimes(1);
    expect(result.recipe?.id).toBe('rv-new');
  });

  it('reuses existing variant_group_id when source already has one', () => {
    const db = makeFakeDb();
    const source = mi({ id: SOURCE_ID, variantGroupId: NEW_GROUP_ID });
    vi.spyOn(menuItemRepository, 'findById').mockReturnValue(source);
    vi.spyOn(menuItemRepository, 'findByName').mockReturnValue(undefined);

    const updateSpy = vi.spyOn(menuItemRepository, 'update').mockImplementation(
      (_db, _tid, _id, _patch) => source,
    );
    vi.spyOn(menuItemRepository, 'insert').mockImplementation((_db, row) => row as MenuItemRow);
    vi.spyOn(AvailabilityService, 'recomputeForMenuItem').mockImplementation(() => undefined);
    vi.spyOn(recipeRepository, 'findActiveVersion').mockReturnValue(undefined);

    MenuService.createVariant(db as never, DEFAULT_TENANT_ID, {
      sourceId: SOURCE_ID,
      name: 'Paneer Biryani (Spicy)',
      sellingPrice: 280,
    });

    // No back-fill update call should target the source's variantGroupId
    // (we may still touch the source for other reasons, but not to set the group).
    const sourceGroupPatches = updateSpy.mock.calls.filter(
      (c) =>
        c[2] === SOURCE_ID &&
        Object.prototype.hasOwnProperty.call(c[3] as Record<string, unknown>, 'variantGroupId'),
    );
    expect(sourceGroupPatches).toHaveLength(0);
  });

  it('throws NotFoundError when source missing', () => {
    const db = makeFakeDb();
    vi.spyOn(menuItemRepository, 'findById').mockReturnValue(undefined);

    expect(() =>
      MenuService.createVariant(db as never, DEFAULT_TENANT_ID, {
        sourceId: SOURCE_ID,
        name: 'X',
        sellingPrice: 100,
      }),
    ).toThrow(NotFoundError);
  });
});
