import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateSupplierInput,
  ListSuppliersInput,
  Supplier,
  UpdateSupplierInput,
} from '@shared/schemas/supplier';
import { unwrap } from '@renderer/lib/ipc';

const suppliersKey = (filter: ListSuppliersInput | undefined = undefined) =>
  ['suppliers', filter ?? {}] as const;
const supplierKey = (id: string) => ['supplier', id] as const;

export function useSuppliers(filter: ListSuppliersInput = { includeInactive: false }) {
  return useQuery({
    queryKey: suppliersKey(filter),
    queryFn: () => unwrap(window.hyprride.supplier.list(filter)),
  });
}

export function useCreateSupplier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSupplierInput) =>
      unwrap(window.hyprride.supplier.create(input)),
    onSuccess: (created: Supplier) => {
      qc.invalidateQueries({ queryKey: ['suppliers'] });
      qc.setQueryData(supplierKey(created.id), created);
    },
  });
}

export function useUpdateSupplier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateSupplierInput) =>
      unwrap(window.hyprride.supplier.update(input)),
    onSuccess: (updated: Supplier) => {
      qc.invalidateQueries({ queryKey: ['suppliers'] });
      qc.setQueryData(supplierKey(updated.id), updated);
    },
  });
}

export function useDeactivateSupplier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => unwrap(window.hyprride.supplier.deactivate({ id })),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['suppliers'] });
    },
  });
}
