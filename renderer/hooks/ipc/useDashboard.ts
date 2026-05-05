import { useQuery } from '@tanstack/react-query';
import type { DateRange } from '@shared/schemas/dashboard';
import { unwrap } from '@renderer/lib/ipc';

const rangeKey = (range: DateRange) => [range.startMs, range.endMs] as const;

export function useStockValue() {
  return useQuery({
    queryKey: ['dashboard', 'stockValue'],
    queryFn: () => unwrap(window.laurans.dashboard.stockValue({})),
  });
}

export function useStockValueSeries(range: DateRange) {
  return useQuery({
    queryKey: ['dashboard', 'stockValueSeries', ...rangeKey(range)],
    queryFn: () => unwrap(window.laurans.dashboard.stockValueSeries({ range })),
  });
}

export function useSpending(range: DateRange) {
  return useQuery({
    queryKey: ['dashboard', 'spending', ...rangeKey(range)],
    queryFn: () => unwrap(window.laurans.dashboard.spending({ range })),
  });
}

export function useCogs(range: DateRange) {
  return useQuery({
    queryKey: ['dashboard', 'cogs', ...rangeKey(range)],
    queryFn: () => unwrap(window.laurans.dashboard.cogs({ range })),
  });
}

export function useWastage(range: DateRange) {
  return useQuery({
    queryKey: ['dashboard', 'wastage', ...rangeKey(range)],
    queryFn: () => unwrap(window.laurans.dashboard.wastage({ range })),
  });
}

export function useTopDishes(range: DateRange) {
  return useQuery({
    queryKey: ['dashboard', 'topDishes', ...rangeKey(range)],
    queryFn: () => unwrap(window.laurans.dashboard.topDishes({ range })),
  });
}

export function useLowStock(range: DateRange) {
  return useQuery({
    queryKey: ['dashboard', 'lowStock', ...rangeKey(range)],
    queryFn: () => unwrap(window.laurans.dashboard.lowStock({ range })),
  });
}

export function useReorder(range: DateRange) {
  return useQuery({
    queryKey: ['dashboard', 'reorder', ...rangeKey(range)],
    queryFn: () => unwrap(window.laurans.dashboard.reorder({ range })),
  });
}

export function useFoodCost() {
  return useQuery({
    queryKey: ['dashboard', 'foodCost'],
    queryFn: () => unwrap(window.laurans.dashboard.foodCost({})),
  });
}

export function useRevenueByChannel(range: DateRange) {
  return useQuery({
    queryKey: ['dashboard', 'revenueByChannel', ...rangeKey(range)],
    queryFn: () => unwrap(window.laurans.dashboard.revenueByChannel({ range })),
  });
}

export function useOrderVolumeByChannel(range: DateRange) {
  return useQuery({
    queryKey: ['dashboard', 'orderVolumeByChannel', ...rangeKey(range)],
    queryFn: () => unwrap(window.laurans.dashboard.orderVolumeByChannel({ range })),
  });
}
