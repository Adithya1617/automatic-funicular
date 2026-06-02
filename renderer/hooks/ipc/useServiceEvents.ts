import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CancelServiceEventInput,
  CreateAdHocServiceEventInput,
  CreateServiceEventInput,
  ListServiceEventsInput,
  ServiceEvent,
  ServiceEventKind,
  ServiceEventWithLines,
  SetServiceEventStatusInput,
  UpdateServiceEventLinesInput,
} from '@shared/schemas/serviceEvent';
import { unwrap } from '@renderer/lib/ipc';

const listKey = (filter: ListServiceEventsInput | undefined = undefined) =>
  ['serviceEvents', filter ?? {}] as const;
const itemKey = (id: string) => ['serviceEvent', id] as const;

// Service events show stock-relevant state — keep a short refresh interval
// so a freshly-completed event appears without a manual reload. 5s mirrors
// what the Laurans live-orders page used to do.
const REFRESH_MS = 5000;

export function useServiceEvents(
  filter: ListServiceEventsInput = { limit: 200 },
  options: { refreshIntervalMs?: number } = {},
) {
  return useQuery({
    queryKey: listKey(filter),
    queryFn: () => unwrap(window.hyprride.serviceEvent.list(filter)),
    refetchInterval: options.refreshIntervalMs ?? REFRESH_MS,
  });
}

/**
 * Like useServiceEvents but each row carries its parts lines + actual cost
 * (`partsCost`). Used by the section list pages to show a Cost column.
 */
export function useServiceEventsWithCost(
  filter: ListServiceEventsInput = { limit: 200 },
  options: { refreshIntervalMs?: number } = {},
) {
  return useQuery({
    queryKey: ['serviceEvents', 'withCost', filter] as const,
    queryFn: () => unwrap(window.hyprride.serviceEvent.listWithLines(filter)),
    refetchInterval: options.refreshIntervalMs ?? REFRESH_MS,
  });
}

export function useServiceEvent(id: string | null | undefined) {
  return useQuery({
    queryKey: itemKey(id ?? ''),
    queryFn: () => unwrap(window.hyprride.serviceEvent.get({ id: id! })),
    enabled: Boolean(id),
  });
}

/**
 * Per-bike history for one section (kind), each event with its parts lines.
 * Disabled until a bike is picked.
 */
export function useServiceEventHistory(
  bikeId: string | null | undefined,
  kind: ServiceEventKind,
) {
  return useQuery({
    queryKey: ['serviceEvents', 'history', kind, bikeId ?? ''] as const,
    queryFn: () =>
      unwrap(
        window.hyprride.serviceEvent.listWithLines({
          bikeId: bikeId!,
          kind,
          limit: 200,
        }),
      ),
    enabled: Boolean(bikeId),
  });
}

export function useCreateServiceEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateServiceEventInput) =>
      unwrap(window.hyprride.serviceEvent.create(input)),
    onSuccess: (created: ServiceEventWithLines) => {
      qc.invalidateQueries({ queryKey: ['serviceEvents'] });
      qc.setQueryData(itemKey(created.id), created);
    },
  });
}

export function useCreateAdHocServiceEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateAdHocServiceEventInput) =>
      unwrap(window.hyprride.serviceEvent.createAdHoc(input)),
    onSuccess: (created: ServiceEventWithLines) => {
      qc.invalidateQueries({ queryKey: ['serviceEvents'] });
      // Ad-hoc create deducts stock in the same tx, so refresh part stock
      // counts + movement timelines too.
      qc.invalidateQueries({ queryKey: ['ingredients'] });
      qc.invalidateQueries({ queryKey: ['stockMovements'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.setQueryData(itemKey(created.id), created);
    },
  });
}

export function useUpdateServiceEventLines() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateServiceEventLinesInput) =>
      unwrap(window.hyprride.serviceEvent.updateLines(input)),
    onSuccess: (updated: ServiceEventWithLines) => {
      qc.invalidateQueries({ queryKey: ['serviceEvents'] });
      qc.setQueryData(itemKey(updated.id), updated);
    },
  });
}

export function useCompleteServiceEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(window.hyprride.serviceEvent.complete({ id })),
    onSuccess: (updated: ServiceEventWithLines) => {
      qc.invalidateQueries({ queryKey: ['serviceEvents'] });
      qc.invalidateQueries({ queryKey: ['ingredients'] });
      qc.invalidateQueries({ queryKey: ['stockMovements'] });
      qc.setQueryData(itemKey(updated.id), updated);
    },
  });
}

export function useSetServiceEventStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SetServiceEventStatusInput) =>
      unwrap(window.hyprride.serviceEvent.setStatus(input)),
    onSuccess: (updated: ServiceEventWithLines) => {
      qc.invalidateQueries({ queryKey: ['serviceEvents'] });
      // Completing deducts stock; refresh part counts, movements, dashboard.
      qc.invalidateQueries({ queryKey: ['ingredients'] });
      qc.invalidateQueries({ queryKey: ['stockMovements'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.setQueryData(itemKey(updated.id), updated);
    },
  });
}

export function useCancelServiceEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CancelServiceEventInput) =>
      unwrap(window.hyprride.serviceEvent.cancel(input)),
    onSuccess: (updated: ServiceEventWithLines) => {
      qc.invalidateQueries({ queryKey: ['serviceEvents'] });
      qc.invalidateQueries({ queryKey: ['ingredients'] });
      qc.invalidateQueries({ queryKey: ['stockMovements'] });
      qc.setQueryData(itemKey(updated.id), updated);
    },
  });
}

// Re-export the row type for table consumers.
export type { ServiceEvent };
