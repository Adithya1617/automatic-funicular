import { useQuery } from '@tanstack/react-query';
import type { ListAvailabilityInput } from '@shared/schemas/availability';
import { unwrap } from '@renderer/lib/ipc';

export function useAvailability(input: ListAvailabilityInput = {}) {
  return useQuery({
    queryKey: ['availability', input],
    queryFn: () => unwrap(window.laurans.availability.list(input)),
  });
}
