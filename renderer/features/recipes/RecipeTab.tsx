import type { Ingredient } from '@shared/schemas/ingredient';
import { useIngredients } from '@renderer/hooks/ipc/useIngredients';
import { useActiveRecipe } from '@renderer/hooks/ipc/useRecipe';
import { RecipeBuilder } from './RecipeBuilder';

export function RecipeTab({ parent }: { parent: Ingredient }) {
  const { data: ingredients = [], isLoading: ingsLoading } = useIngredients({
    includeInactive: false,
  });
  const { data: activeRecipe = null, isLoading: recipeLoading } = useActiveRecipe(
    parent.id,
    'ingredient',
  );

  if (ingsLoading || recipeLoading) {
    return <div className="px-1 py-4 text-text-tertiary">Loading recipe…</div>;
  }

  return (
    <RecipeBuilder
      parentId={parent.id}
      parentType="ingredient"
      parentName={parent.name}
      parentBaseUnit={parent.baseUnit}
      ingredients={ingredients}
      active={activeRecipe}
    />
  );
}
