import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ListBatchesInput, RecordBatchInput } from '@shared/schemas/production';
import { unwrap } from '@renderer/lib/ipc';

export function useProductionBatches(filter: ListBatchesInput) {
  return useQuery({
    queryKey: ['productionBatches', filter],
    queryFn: () => unwrap(window.laurans.production.list(filter)),
  });
}

export function useRecordBatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: RecordBatchInput) =>
      unwrap(window.laurans.production.recordBatch(input)),
    onSuccess: (_data, input) => {
      qc.invalidateQueries({ queryKey: ['productionBatches'] });
      qc.invalidateQueries({ queryKey: ['ingredients'] });
      qc.invalidateQueries({ queryKey: ['ingredient', input.preparedIngredientId] });
      qc.invalidateQueries({ queryKey: ['stockMovements'] });
    },
  });
}
