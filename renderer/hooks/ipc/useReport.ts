import { useMutation } from '@tanstack/react-query';
import type {
  ExportReportInput,
  ExportReportResponse,
} from '@shared/schemas/report';
import { unwrap } from '@renderer/lib/ipc';

export function useExportReport() {
  return useMutation<ExportReportResponse, Error, ExportReportInput>({
    mutationFn: (input) => unwrap(window.laurans.report.exportCsv(input)),
  });
}
