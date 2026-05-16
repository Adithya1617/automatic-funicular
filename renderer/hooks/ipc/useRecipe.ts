import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SaveRecipeVersionInput } from '@shared/schemas/recipe';
import type { RecipeParentType } from '@shared/constants/recipe';
import { unwrap } from '@renderer/lib/ipc';

const activeKey = (parentId: string, parentType: RecipeParentType) =>
  ['recipe', 'active', parentType, parentId] as const;

export function useActiveRecipe(parentId: string | undefined, parentType: RecipeParentType) {
  return useQuery({
    queryKey: parentId ? activeKey(parentId, parentType) : ['recipe', 'active', 'none'],
    queryFn: () =>
      unwrap(window.hyprride.recipe.getActive({ parentId: parentId!, parentType })),
    enabled: !!parentId,
  });
}

export function useSaveRecipeVersion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SaveRecipeVersionInput) =>
      unwrap(window.hyprride.recipe.saveVersion(input)),
    onSuccess: (_data, input) => {
      qc.invalidateQueries({ queryKey: activeKey(input.parentId, input.parentType) });
      qc.invalidateQueries({ queryKey: ['recipe', 'versions', input.parentType, input.parentId] });
    },
  });
}
