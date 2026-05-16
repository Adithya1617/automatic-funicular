import { useQuery } from '@tanstack/react-query';
import type { ListStockMovementsInput } from '@shared/schemas/stockMovement';
import { unwrap } from '@renderer/lib/ipc';

export function useStockMovements(filter: ListStockMovementsInput) {
  return useQuery({
    queryKey: ['stockMovements', filter],
    queryFn: () => unwrap(window.hyprride.stockMovement.list(filter)),
    enabled: !!filter.ingredientId,
  });
}
