import { useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  ManualAdjustmentInput,
  RecordPurchaseInput,
} from '@shared/schemas/inventory';
import { unwrap } from '@renderer/lib/ipc';

export function useApplyMovement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ManualAdjustmentInput) =>
      unwrap(window.hyprride.inventory.applyMovement(input)),
    onSuccess: (_data, input) => {
      qc.invalidateQueries({ queryKey: ['ingredients'] });
      qc.invalidateQueries({ queryKey: ['ingredient', input.ingredientId] });
      qc.invalidateQueries({ queryKey: ['stockMovements'] });
    },
  });
}

/** Buy Parts: records a purchase that increases a part's stock (and lifts its
 *  weighted-avg cost when a cost is supplied). Invalidates the parts list and
 *  movement ledgers so both the Parts page and the purchase log refresh. */
export function useRecordPurchase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: RecordPurchaseInput) =>
      unwrap(window.hyprride.inventory.recordPurchase(input)),
    onSuccess: (_data, input) => {
      qc.invalidateQueries({ queryKey: ['ingredients'] });
      qc.invalidateQueries({ queryKey: ['ingredient', input.ingredientId] });
      qc.invalidateQueries({ queryKey: ['stockMovements'] });
    },
  });
}
