import { useQuery } from '@tanstack/react-query';
import type { ListOrderingChannelsInput } from '@shared/schemas/ordering';
import { unwrap } from '@renderer/lib/ipc';

export function useOrderingChannels(input: ListOrderingChannelsInput = { enabledOnly: true }) {
  return useQuery({
    queryKey: ['orderingChannels', input],
    queryFn: () => unwrap(window.laurans.orderingChannel.list(input)),
  });
}
