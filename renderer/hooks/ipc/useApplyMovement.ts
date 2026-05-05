import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ManualAdjustmentInput } from '@shared/schemas/inventory';
import { unwrap } from '@renderer/lib/ipc';

export function useApplyMovement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ManualAdjustmentInput) =>
      unwrap(window.laurans.inventory.applyMovement(input)),
    onSuccess: (_data, input) => {
      qc.invalidateQueries({ queryKey: ['ingredients'] });
      qc.invalidateQueries({ queryKey: ['ingredient', input.ingredientId] });
      qc.invalidateQueries({ queryKey: ['stockMovements'] });
    },
  });
}
