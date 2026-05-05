import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CommitStockTakeInput,
  DiscardStockTakeInput,
  ListStockTakesInput,
  SaveStockTakeCountInput,
  StartStockTakeInput,
} from '@shared/schemas/stockTake';
import { unwrap } from '@renderer/lib/ipc';

const stockTakesKey = (filter: ListStockTakesInput | undefined = undefined) =>
  ['stockTakes', filter ?? {}] as const;
const stockTakeKey = (id: string) => ['stockTake', id] as const;
const inProgressKey = ['stockTake', 'inProgress'] as const;

export function useStockTakes(filter: ListStockTakesInput = { limit: 100 }) {
  return useQuery({
    queryKey: stockTakesKey(filter),
    queryFn: () => unwrap(window.laurans.stockTake.list(filter)),
  });
}

export function useStockTake(id: string | undefined) {
  return useQuery({
    queryKey: id ? stockTakeKey(id) : ['stockTake', 'none'],
    queryFn: () => unwrap(window.laurans.stockTake.get({ id: id! })),
    enabled: !!id,
  });
}

export function useStockTakeInProgress() {
  return useQuery({
    queryKey: inProgressKey,
    queryFn: () => unwrap(window.laurans.stockTake.getInProgress({})),
    refetchOnWindowFocus: true,
  });
}

function useStockTakeMutation<TIn, TOut>(fn: (input: TIn) => Promise<TOut>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['stockTakes'] });
      qc.invalidateQueries({ queryKey: ['stockTake'] });
      qc.invalidateQueries({ queryKey: ['ingredients'] });
      qc.invalidateQueries({ queryKey: ['stockMovements'] });
      qc.invalidateQueries({ queryKey: ['availability'] });
    },
  });
}

export function useStartStockTake() {
  return useStockTakeMutation((input: StartStockTakeInput) =>
    unwrap(window.laurans.stockTake.start(input)),
  );
}

export function useSaveStockTakeCount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SaveStockTakeCountInput) =>
      unwrap(window.laurans.stockTake.saveCount(input)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['stockTake'] });
    },
  });
}

export function useCommitStockTake() {
  return useStockTakeMutation((input: CommitStockTakeInput) =>
    unwrap(window.laurans.stockTake.commit(input)),
  );
}

export function useDiscardStockTake() {
  return useStockTakeMutation((input: DiscardStockTakeInput) =>
    unwrap(window.laurans.stockTake.discard(input)),
  );
}
