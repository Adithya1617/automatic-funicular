import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateMenuItemInput,
  CreateVariantInput,
  ListMenuItemsInput,
  MenuItem,
  UpdateMenuItemInput,
} from '@shared/schemas/menuItem';
import { unwrap } from '@renderer/lib/ipc';

const menuItemsKey = (filter: ListMenuItemsInput | undefined = undefined) =>
  ['menuItems', filter ?? {}] as const;
const menuItemKey = (id: string) => ['menuItem', id] as const;

export function useMenuItems(filter: ListMenuItemsInput = { includeInactive: false }) {
  return useQuery({
    queryKey: menuItemsKey(filter),
    queryFn: () => unwrap(window.hyprride.menuItem.list(filter)),
  });
}

export function useMenuItem(id: string | undefined) {
  return useQuery({
    queryKey: id ? menuItemKey(id) : ['menuItem', 'none'],
    queryFn: () => unwrap(window.hyprride.menuItem.get({ id: id! })),
    enabled: !!id,
  });
}

export function useCreateMenuItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateMenuItemInput) =>
      unwrap(window.hyprride.menuItem.create(input)),
    onSuccess: (created: MenuItem) => {
      qc.invalidateQueries({ queryKey: ['menuItems'] });
      qc.invalidateQueries({ queryKey: ['availability'] });
      qc.setQueryData(menuItemKey(created.id), created);
    },
  });
}

export function useUpdateMenuItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateMenuItemInput) =>
      unwrap(window.hyprride.menuItem.update(input)),
    onSuccess: (updated: MenuItem) => {
      qc.invalidateQueries({ queryKey: ['menuItems'] });
      qc.setQueryData(menuItemKey(updated.id), updated);
    },
  });
}

export function useDeactivateMenuItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => unwrap(window.hyprride.menuItem.deactivate({ id })),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['menuItems'] });
    },
  });
}

export function useCreateVariant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateVariantInput) =>
      unwrap(window.hyprride.menuItem.createVariant(input)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['menuItems'] });
      qc.invalidateQueries({ queryKey: ['availability'] });
    },
  });
}
