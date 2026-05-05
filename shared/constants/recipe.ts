export const MAX_BOM_DEPTH = 5;

export const RECIPE_PARENT_TYPES = ['menu_item', 'ingredient'] as const;
export type RecipeParentType = (typeof RECIPE_PARENT_TYPES)[number];
