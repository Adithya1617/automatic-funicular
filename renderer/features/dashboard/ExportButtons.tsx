import { useState } from 'react';
import { Download } from 'lucide-react';
import { Button } from '@renderer/components/ui/button';
import { useExportReport } from '@renderer/hooks/ipc/useReport';
import type { DateRange } from '@shared/schemas/dashboard';
import type { ReportKind } from '@shared/schemas/report';

const REPORT_LABELS: Record<ReportKind, string> = {
  movements: 'Movements',
  cogs: 'COGS',
  spending: 'Spending',
};

export function ExportButtons({ range }: { range: DateRange }) {
  const exportReport = useExportReport();
  const [error, setError] = useState<string | null>(null);

  async function download(kind: ReportKind) {
    setError(null);
    try {
      const { filename, content } = await exportReport.mutateAsync({ kind, range });
      const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed');
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5">
        {(Object.keys(REPORT_LABELS) as ReportKind[]).map((kind) => (
          <Button
            key={kind}
            type="button"
            variant="secondary"
            size="md"
            onClick={() => download(kind)}
            disabled={exportReport.isPending}
          >
            <Download className="h-3 w-3" />
            {REPORT_LABELS[kind]}
          </Button>
        ))}
      </div>
      {error ? <span className="text-[11px] text-text-danger">{error}</span> : null}
    </div>
  );
}
