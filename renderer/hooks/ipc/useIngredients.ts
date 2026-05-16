import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateIngredientInput,
  Ingredient,
  ListIngredientsInput,
  UpdateIngredientInput,
} from '@shared/schemas/ingredient';
import { unwrap } from '@renderer/lib/ipc';

const ingredientsKey = (filter: ListIngredientsInput | undefined = undefined) =>
  ['ingredients', filter ?? {}] as const;
const ingredientKey = (id: string) => ['ingredient', id] as const;

export function useIngredients(filter: ListIngredientsInput = { includeInactive: false }) {
  return useQuery({
    queryKey: ingredientsKey(filter),
    queryFn: () => unwrap(window.hyprride.ingredient.list(filter)),
  });
}

export function useIngredient(id: string | undefined) {
  return useQuery({
    queryKey: id ? ingredientKey(id) : ['ingredient', 'none'],
    queryFn: () => unwrap(window.hyprride.ingredient.get({ id: id! })),
    enabled: !!id,
  });
}

export function useCreateIngredient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateIngredientInput) =>
      unwrap(window.hyprride.ingredient.create(input)),
    onSuccess: (created: Ingredient) => {
      qc.invalidateQueries({ queryKey: ['ingredients'] });
      qc.setQueryData(ingredientKey(created.id), created);
    },
  });
}

export function useUpdateIngredient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateIngredientInput) =>
      unwrap(window.hyprride.ingredient.update(input)),
    onSuccess: (updated: Ingredient) => {
      qc.invalidateQueries({ queryKey: ['ingredients'] });
      qc.setQueryData(ingredientKey(updated.id), updated);
    },
  });
}

export function useDeactivateIngredient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => unwrap(window.hyprride.ingredient.deactivate({ id })),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ingredients'] });
    },
  });
}
