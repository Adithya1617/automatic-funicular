import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  Bike,
  CreateBikeInput,
  ListBikeTypesInput,
  ListBikesInput,
  UpdateBikeInput,
} from '@shared/schemas/bike';
import { unwrap } from '@renderer/lib/ipc';

const bikesKey = (filter: ListBikesInput | undefined = undefined) =>
  ['bikes', filter ?? {}] as const;
const bikeKey = (id: string) => ['bike', id] as const;
const bikeTypesKey = (filter: ListBikeTypesInput | undefined = undefined) =>
  ['bikeTypes', filter ?? {}] as const;

export function useBikes(filter: ListBikesInput = { includeInactive: false }) {
  return useQuery({
    queryKey: bikesKey(filter),
    queryFn: () => unwrap(window.hyprride.bike.list(filter)),
  });
}

export function useBike(id: string | null | undefined) {
  return useQuery({
    queryKey: bikeKey(id ?? ''),
    queryFn: () => unwrap(window.hyprride.bike.get({ id: id! })),
    enabled: Boolean(id),
  });
}

export function useBikeTypes(
  filter: ListBikeTypesInput = { includeInactive: false },
) {
  return useQuery({
    queryKey: bikeTypesKey(filter),
    queryFn: () => unwrap(window.hyprride.bike.listTypes(filter)),
  });
}

export function useCreateBike() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateBikeInput) =>
      unwrap(window.hyprride.bike.create(input)),
    onSuccess: (created: Bike) => {
      qc.invalidateQueries({ queryKey: ['bikes'] });
      qc.setQueryData(bikeKey(created.id), created);
    },
  });
}

export function useUpdateBike() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateBikeInput) =>
      unwrap(window.hyprride.bike.update(input)),
    onSuccess: (updated: Bike) => {
      qc.invalidateQueries({ queryKey: ['bikes'] });
      qc.setQueryData(bikeKey(updated.id), updated);
    },
  });
}

export function useDeactivateBike() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => unwrap(window.hyprride.bike.deactivate({ id })),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bikes'] });
    },
  });
}
