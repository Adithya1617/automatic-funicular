export const MAX_BOM_DEPTH = 5;

// 'menu_item' / 'ingredient' are Laurans heritage. 'service_template' is the
// Hyprride parent type — same recipe_versions table, no availability cache,
// no cycle detection (templates can't appear as children of any recipe row).
export const RECIPE_PARENT_TYPES = ['menu_item', 'ingredient', 'service_template'] as const;
export type RecipeParentType = (typeof RECIPE_PARENT_TYPES)[number];
