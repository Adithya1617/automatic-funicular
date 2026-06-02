import { useQuery } from '@tanstack/react-query';
import type { DateRange } from '@shared/schemas/dashboard';
import { unwrap } from '@renderer/lib/ipc';

const rangeKey = (range: DateRange) => [range.startMs, range.endMs] as const;

export function useStockValue() {
  return useQuery({
    queryKey: ['dashboard', 'stockValue'],
    queryFn: () => unwrap(window.hyprride.dashboard.stockValue({})),
  });
}

export function useStockValueSeries(range: DateRange) {
  return useQuery({
    queryKey: ['dashboard', 'stockValueSeries', ...rangeKey(range)],
    queryFn: () => unwrap(window.hyprride.dashboard.stockValueSeries({ range })),
  });
}

export function useSpending(range: DateRange) {
  return useQuery({
    queryKey: ['dashboard', 'spending', ...rangeKey(range)],
    queryFn: () => unwrap(window.hyprride.dashboard.spending({ range })),
  });
}

export function useWastage(range: DateRange) {
  return useQuery({
    queryKey: ['dashboard', 'wastage', ...rangeKey(range)],
    queryFn: () => unwrap(window.hyprride.dashboard.wastage({ range })),
  });
}

export function useLowStock(range: DateRange) {
  return useQuery({
    queryKey: ['dashboard', 'lowStock', ...rangeKey(range)],
    queryFn: () => unwrap(window.hyprride.dashboard.lowStock({ range })),
  });
}

export function useReorder(range: DateRange) {
  return useQuery({
    queryKey: ['dashboard', 'reorder', ...rangeKey(range)],
    queryFn: () => unwrap(window.hyprride.dashboard.reorder({ range })),
  });
}

// Hyprride bike-centric tiles.
export function useCostPerBike(range: DateRange) {
  return useQuery({
    queryKey: ['dashboard', 'costPerBike', ...rangeKey(range)],
    queryFn: () => unwrap(window.hyprride.dashboard.costPerBike({ range })),
  });
}

export function useCostPerBikeType(range: DateRange) {
  return useQuery({
    queryKey: ['dashboard', 'costPerBikeType', ...rangeKey(range)],
    queryFn: () => unwrap(window.hyprride.dashboard.costPerBikeType({ range })),
  });
}

export function useTopConsumedParts(range: DateRange) {
  return useQuery({
    queryKey: ['dashboard', 'topConsumedParts', ...rangeKey(range)],
    queryFn: () => unwrap(window.hyprride.dashboard.topConsumedParts({ range })),
  });
}

export function useServiceVolumeByBikeType(range: DateRange) {
  return useQuery({
    queryKey: ['dashboard', 'serviceVolumeByBikeType', ...rangeKey(range)],
    queryFn: () =>
      unwrap(window.hyprride.dashboard.serviceVolumeByBikeType({ range })),
  });
}

export function useServiceVolumeByBike(range: DateRange) {
  return useQuery({
    queryKey: ['dashboard', 'serviceVolumeByBike', ...rangeKey(range)],
    queryFn: () => unwrap(window.hyprride.dashboard.serviceVolumeByBike({ range })),
  });
}

export function useMaintenanceSchedule() {
  return useQuery({
    queryKey: ['dashboard', 'maintenanceSchedule'],
    queryFn: () => unwrap(window.hyprride.dashboard.maintenanceSchedule({})),
  });
}

export function useTheoreticalServiceCost() {
  return useQuery({
    queryKey: ['dashboard', 'theoreticalServiceCost'],
    queryFn: () => unwrap(window.hyprride.dashboard.theoreticalServiceCost({})),
  });
}
