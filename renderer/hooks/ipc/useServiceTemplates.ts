import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateServiceTemplateInput,
  ListServiceTemplatesInput,
  ServiceTemplate,
  UpdateServiceTemplateInput,
} from '@shared/schemas/serviceTemplate';
import { unwrap } from '@renderer/lib/ipc';

const listKey = (filter: ListServiceTemplatesInput | undefined = undefined) =>
  ['serviceTemplates', filter ?? {}] as const;
const itemKey = (id: string) => ['serviceTemplate', id] as const;

export function useServiceTemplates(
  filter: ListServiceTemplatesInput = { includeInactive: false },
) {
  return useQuery({
    queryKey: listKey(filter),
    queryFn: () => unwrap(window.hyprride.serviceTemplate.list(filter)),
  });
}

export function useServiceTemplate(id: string | null | undefined) {
  return useQuery({
    queryKey: itemKey(id ?? ''),
    queryFn: () => unwrap(window.hyprride.serviceTemplate.get({ id: id! })),
    enabled: Boolean(id),
  });
}

export function useCreateServiceTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateServiceTemplateInput) =>
      unwrap(window.hyprride.serviceTemplate.create(input)),
    onSuccess: (created: ServiceTemplate) => {
      qc.invalidateQueries({ queryKey: ['serviceTemplates'] });
      qc.setQueryData(itemKey(created.id), created);
    },
  });
}

export function useUpdateServiceTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateServiceTemplateInput) =>
      unwrap(window.hyprride.serviceTemplate.update(input)),
    onSuccess: (updated: ServiceTemplate) => {
      qc.invalidateQueries({ queryKey: ['serviceTemplates'] });
      qc.setQueryData(itemKey(updated.id), updated);
    },
  });
}

export function useDeactivateServiceTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(window.hyprride.serviceTemplate.deactivate({ id })),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['serviceTemplates'] });
    },
  });
}
