import { useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  CsvImportInput,
  CsvImportResult,
  CsvTemplateInput,
  CsvTemplateResponse,
} from '@shared/schemas/csvImport';
import { unwrap } from '@renderer/lib/ipc';

export function useCsvTemplate() {
  return useMutation<CsvTemplateResponse, Error, CsvTemplateInput>({
    mutationFn: (input) => unwrap(window.hyprride.csvImport.template(input)),
  });
}

export function useCsvImport() {
  const qc = useQueryClient();
  return useMutation<CsvImportResult, Error, CsvImportInput>({
    mutationFn: (input) => unwrap(window.hyprride.csvImport.run(input)),
    onSuccess: (result) => {
      if (!result.committed) return;
      // Touch the caches the import could have affected.
      qc.invalidateQueries({ queryKey: ['ingredients'] });
      qc.invalidateQueries({ queryKey: ['suppliers'] });
      qc.invalidateQueries({ queryKey: ['menuItems'] });
      qc.invalidateQueries({ queryKey: ['availability'] });
      qc.invalidateQueries({ queryKey: ['recipe'] });
    },
  });
}
