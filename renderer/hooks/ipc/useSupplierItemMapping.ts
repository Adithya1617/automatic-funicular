import { useQuery } from '@tanstack/react-query';
import type { SuggestSupplierItemInput } from '@shared/schemas/supplierItemMapping';
import { unwrap } from '@renderer/lib/ipc';

export function useSupplierItemSuggestions(
  input: SuggestSupplierItemInput | null,
) {
  return useQuery({
    queryKey: input
      ? ['supplierItemMapping', 'suggest', input.supplierId, input.partial, input.limit]
      : ['supplierItemMapping', 'suggest', 'none'],
    queryFn: () => unwrap(window.hyprride.supplierItemMapping.suggest(input!)),
    enabled: !!input?.supplierId,
  });
}
