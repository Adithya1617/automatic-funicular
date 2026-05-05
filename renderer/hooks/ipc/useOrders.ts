import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CancelOrderInput,
  ListOrdersInput,
} from '@shared/schemas/order';
import type { SubmitManualOrderInput } from '@shared/schemas/ordering';
import { unwrap } from '@renderer/lib/ipc';

const ordersKey = (filter: ListOrdersInput | undefined = undefined) =>
  ['orders', filter ?? {}] as const;
const orderKey = (id: string) => ['order', id] as const;

const baseFilter: ListOrdersInput = { limit: 200 };

export function useOrders(filter: ListOrdersInput = baseFilter) {
  return useQuery({
    queryKey: ordersKey(filter),
    queryFn: () => unwrap(window.laurans.order.list(filter)),
    refetchInterval: 5_000,
  });
}

export function useOrder(id: string | undefined) {
  return useQuery({
    queryKey: id ? orderKey(id) : ['order', 'none'],
    queryFn: () => unwrap(window.laurans.order.get({ id: id! })),
    enabled: !!id,
  });
}

function useOrderMutation<TIn, TOut>(fn: (input: TIn) => Promise<TOut>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['ingredients'] });
      qc.invalidateQueries({ queryKey: ['stockMovements'] });
      qc.invalidateQueries({ queryKey: ['availability'] });
    },
  });
}

export function useSubmitManualOrder() {
  return useOrderMutation((input: SubmitManualOrderInput) =>
    unwrap(window.laurans.order.submitManual(input)),
  );
}

export function useMarkPreparing() {
  return useOrderMutation((id: string) =>
    unwrap(window.laurans.order.markPreparing({ id })),
  );
}

export function useMarkDelivered() {
  return useOrderMutation((id: string) =>
    unwrap(window.laurans.order.markDelivered({ id })),
  );
}

export function useCancelOrder() {
  return useOrderMutation((input: CancelOrderInput) =>
    unwrap(window.laurans.order.cancel(input)),
  );
}
