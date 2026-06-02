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

/** Recent purchase movements across all parts — backs the Buy Parts log. */
export function usePurchaseHistory(limit = 50) {
  const filter: ListStockMovementsInput = { reason: 'purchase', limit };
  return useQuery({
    queryKey: ['stockMovements', filter],
    queryFn: () => unwrap(window.hyprride.stockMovement.list(filter)),
  });
}
