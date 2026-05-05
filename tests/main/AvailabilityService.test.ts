import { afterEach, describe, expect, it, vi } from 'vitest';
import { AvailabilityService } from '../../main/services/AvailabilityService';
import { ingredientRepository } from '../../main/repositories/ingredientRepository';
import { menuItemAvailabilityRepository } from '../../main/repositories/menuItemAvailabilityRepository';
import { menuItemRepository } from '../../main/repositories/menuItemRepository';
import { recipeRepository } from '../../main/repositories/recipeRepository';
import { DEFAULT_TENANT_ID, SYSTEM_USER_ID } from '@shared/constants/system';
import type {
  IngredientRow,
  MenuItemAvailabilityRow,
  MenuItemRow,
  RecipeIngredientRow,
  RecipeVersionRow,
} from '../../main/db/schema';

const MENU_BIRYANI = '01900000-0000-7000-8000-000000000d01';
const MENU_BUTTER_CHICKEN = '01900000-0000-7000-8000-000000000d02';
const ING_RICE = '01900000-0000-7000-8000-000000000e01';
const ING_PANEER = '01900000-0000-7000-8000-000000000e02';
const PREP_BIRYANI_MASALA = '01900000-0000-7000-8000-000000000e03';
const ING_CUMIN = '01900000-0000-7000-8000-000000000e04';

function ing(overrides: Partial<IngredientRow>): IngredientRow {
  return {
    id: 'x',
    tenantId: DEFAULT_TENANT_ID,
    name: 'X',
    category: 'Test',
    type: 'raw',
    baseUnit: 'g',
    stockQuantity: 0,
    reservedQuantity: 0,
    lowStockThreshold: 0,
    currentAvgCostPerUnit: 0,
    densityGPerMl: null,
    isActive: true,
    createdAt: 0,
    updatedAt: 0,
    createdBy: SYSTEM_USER_ID,
    updatedBy: SYSTEM_USER_ID,
    ...overrides,
  };
}

function menu(overrides: Partial<MenuItemRow>): MenuItemRow {
  return {
    id: 'm',
    tenantId: DEFAULT_TENANT_ID,
    name: 'Menu',
    category: 'Test',
    sellingPrice: 100,
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

function recipeVersion(parentId: string, parentType: 'menu_item' | 'ingredient'): RecipeVersionRow {
  return {
    id: `rv-${parentId}`,
    tenantId: DEFAULT_TENANT_ID,
    parentId,
    parentType,
    versionNumber: 1,
    isCurrent: true,
    targetYield: 1,
    notes: null,
    createdAt: 0,
    createdBy: SYSTEM_USER_ID,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('AvailabilityService.recomputeForMenuItem — single-menu math', () => {
  it('floors the smallest stock/required ratio, identifies bottleneck', () => {
    vi.spyOn(recipeRepository, 'findActiveVersion').mockReturnValue(
      recipeVersion(MENU_BIRYANI, 'menu_item'),
    );
    vi.spyOn(recipeRepository, 'ingredientsForVersion').mockReturnValue([
      // 200g rice per serving; 1500g in stock → 7 servings
      {
        id: 'ri-1',
        recipeVersionId: `rv-${MENU_BIRYANI}`,
        childIngredientId: ING_RICE,
        quantity: 200,
        unit: 'g',
        notes: null,
        displayOrder: 0,
      },
      // 100g paneer per serving; 350g in stock → 3 servings (bottleneck)
      {
        id: 'ri-2',
        recipeVersionId: `rv-${MENU_BIRYANI}`,
        childIngredientId: ING_PANEER,
        quantity: 100,
        unit: 'g',
        notes: null,
        displayOrder: 1,
      },
    ] as RecipeIngredientRow[]);
    vi.spyOn(ingredientRepository, 'findById').mockImplementation((_db, _tid, id) => {
      if (id === ING_RICE) return ing({ id: ING_RICE, name: 'Rice', stockQuantity: 1500 });
      if (id === ING_PANEER) return ing({ id: ING_PANEER, name: 'Paneer', stockQuantity: 350 });
      return undefined;
    });

    const upserts: Array<Parameters<typeof menuItemAvailabilityRepository.upsert>[1]> = [];
    vi.spyOn(menuItemAvailabilityRepository, 'upsert').mockImplementation(
      (_db, row) => {
        upserts.push(row);
        return row as MenuItemAvailabilityRow;
      },
    );

    AvailabilityService.recomputeForMenuItem({} as never, DEFAULT_TENANT_ID, MENU_BIRYANI);

    expect(upserts).toHaveLength(1);
    expect(upserts[0]!.menuItemId).toBe(MENU_BIRYANI);
    expect(upserts[0]!.maxServingsAvailable).toBe(3);
    expect(upserts[0]!.bottleneckIngredientId).toBe(ING_PANEER);
  });

  it('reads prepared children at their own stock, not their raw constituents', () => {
    // Menu uses 50g of biryani-masala (prepared). Prepared has 200g in stock.
    // 200/50 = 4 servings. Cumin (raw constituent of biryani-masala) being 0
    // must NOT cause availability to drop — locked decision §3.9 / §5.9.
    vi.spyOn(recipeRepository, 'findActiveVersion').mockReturnValue(
      recipeVersion(MENU_BIRYANI, 'menu_item'),
    );
    vi.spyOn(recipeRepository, 'ingredientsForVersion').mockReturnValue([
      {
        id: 'ri-1',
        recipeVersionId: `rv-${MENU_BIRYANI}`,
        childIngredientId: PREP_BIRYANI_MASALA,
        quantity: 50,
        unit: 'g',
        notes: null,
        displayOrder: 0,
      },
    ] as RecipeIngredientRow[]);
    vi.spyOn(ingredientRepository, 'findById').mockImplementation((_db, _tid, id) => {
      if (id === PREP_BIRYANI_MASALA)
        return ing({ id: PREP_BIRYANI_MASALA, name: 'Biryani Masala', type: 'prepared', stockQuantity: 200 });
      if (id === ING_CUMIN) return ing({ id: ING_CUMIN, name: 'Cumin', stockQuantity: 0 });
      return undefined;
    });

    const upserts: Array<Parameters<typeof menuItemAvailabilityRepository.upsert>[1]> = [];
    vi.spyOn(menuItemAvailabilityRepository, 'upsert').mockImplementation(
      (_db, row) => {
        upserts.push(row);
        return row as MenuItemAvailabilityRow;
      },
    );

    AvailabilityService.recomputeForMenuItem({} as never, DEFAULT_TENANT_ID, MENU_BIRYANI);

    expect(upserts[0]!.maxServingsAvailable).toBe(4);
    expect(upserts[0]!.bottleneckIngredientId).toBe(PREP_BIRYANI_MASALA);
  });

  it('returns 0 with null bottleneck when no active recipe exists', () => {
    vi.spyOn(recipeRepository, 'findActiveVersion').mockReturnValue(undefined);
    const upserts: Array<Parameters<typeof menuItemAvailabilityRepository.upsert>[1]> = [];
    vi.spyOn(menuItemAvailabilityRepository, 'upsert').mockImplementation(
      (_db, row) => {
        upserts.push(row);
        return row as MenuItemAvailabilityRow;
      },
    );

    AvailabilityService.recomputeForMenuItem({} as never, DEFAULT_TENANT_ID, MENU_BIRYANI);

    expect(upserts[0]!.maxServingsAvailable).toBe(0);
    expect(upserts[0]!.bottleneckIngredientId).toBeNull();
  });
});

describe('AvailabilityService.recomputeForIngredients — invalidation graph', () => {
  it('targets menus that reference the ingredient directly OR via a prepared sub-recipe', () => {
    // Wiring:
    //   biryani uses biryani_masala (prepared) which uses cumin
    //   butter_chicken uses paneer directly
    // Trigger: cumin changes. Expected affected menus: biryani only.
    vi.spyOn(ingredientRepository, 'list').mockReturnValue([
      ing({ id: PREP_BIRYANI_MASALA, type: 'prepared' }),
      ing({ id: ING_CUMIN, type: 'raw' }),
      ing({ id: ING_PANEER, type: 'raw' }),
      ing({ id: ING_RICE, type: 'raw' }),
    ]);
    vi.spyOn(menuItemRepository, 'listAllActive').mockReturnValue([
      menu({ id: MENU_BIRYANI }),
      menu({ id: MENU_BUTTER_CHICKEN }),
    ]);
    vi.spyOn(recipeRepository, 'findActiveVersion').mockImplementation((_db, sel) => {
      if (sel.parentId === PREP_BIRYANI_MASALA)
        return recipeVersion(PREP_BIRYANI_MASALA, 'ingredient');
      if (sel.parentId === MENU_BIRYANI) return recipeVersion(MENU_BIRYANI, 'menu_item');
      if (sel.parentId === MENU_BUTTER_CHICKEN)
        return recipeVersion(MENU_BUTTER_CHICKEN, 'menu_item');
      return undefined;
    });
    vi.spyOn(recipeRepository, 'ingredientsForVersion').mockImplementation((_db, vid) => {
      if (vid === `rv-${PREP_BIRYANI_MASALA}`)
        return [
          {
            id: 'ri-cumin',
            recipeVersionId: vid,
            childIngredientId: ING_CUMIN,
            quantity: 5,
            unit: 'g',
            notes: null,
            displayOrder: 0,
          },
        ] as RecipeIngredientRow[];
      if (vid === `rv-${MENU_BIRYANI}`)
        return [
          {
            id: 'ri-bm',
            recipeVersionId: vid,
            childIngredientId: PREP_BIRYANI_MASALA,
            quantity: 50,
            unit: 'g',
            notes: null,
            displayOrder: 0,
          },
        ] as RecipeIngredientRow[];
      if (vid === `rv-${MENU_BUTTER_CHICKEN}`)
        return [
          {
            id: 'ri-pn',
            recipeVersionId: vid,
            childIngredientId: ING_PANEER,
            quantity: 100,
            unit: 'g',
            notes: null,
            displayOrder: 0,
          },
        ] as RecipeIngredientRow[];
      return [];
    });
    vi.spyOn(ingredientRepository, 'findById').mockImplementation((_db, _tid, id) => {
      if (id === PREP_BIRYANI_MASALA)
        return ing({ id: PREP_BIRYANI_MASALA, type: 'prepared', stockQuantity: 1000 });
      if (id === ING_PANEER) return ing({ id: ING_PANEER, stockQuantity: 1000 });
      return undefined;
    });

    const targeted: string[] = [];
    vi.spyOn(menuItemAvailabilityRepository, 'upsert').mockImplementation((_db, row) => {
      targeted.push(row.menuItemId);
      return row as MenuItemAvailabilityRow;
    });

    AvailabilityService.recomputeForIngredients({} as never, DEFAULT_TENANT_ID, [ING_CUMIN]);

    expect(targeted.sort()).toEqual([MENU_BIRYANI]);
  });
});
