import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { unwrap } from '@renderer/lib/ipc';

const KEY = ['reconciliation'] as const;

export function useReconciliation() {
  return useQuery({
    queryKey: KEY,
    queryFn: () => unwrap(window.hyprride.reconciliation.latest({})),
  });
}

export function useRerunReconciliation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => unwrap(window.hyprride.reconciliation.rerun({})),
    onSuccess: (data) => qc.setQueryData(KEY, data),
  });
}
