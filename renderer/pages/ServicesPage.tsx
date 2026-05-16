import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { Button } from '@renderer/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@renderer/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@renderer/components/ui/table';
import { Badge } from '@renderer/components/ui/badge';
import { useServiceEvents } from '@renderer/hooks/ipc/useServiceEvents';
import { useBikes } from '@renderer/hooks/ipc/useBikes';
import { useServiceTemplates } from '@renderer/hooks/ipc/useServiceTemplates';
import { useIngredients } from '@renderer/hooks/ipc/useIngredients';
import { formatRelativeTime } from '@renderer/lib/format';
import { SERVICE_EVENT_STATUSES, type ServiceEventStatus } from '@shared/schemas/serviceEvent';
import { QuickServiceDialog } from '@renderer/features/services/QuickServiceDialog';

const STATUS_FILTER_VALUES = ['all', ...SERVICE_EVENT_STATUSES] as const;
type StatusFilter = (typeof STATUS_FILTER_VALUES)[number];

export function ServicesPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<StatusFilter>('all');
  const [dialogOpen, setDialogOpen] = useState(false);

  const filter = useMemo(() => {
    const f: Parameters<typeof useServiceEvents>[0] = { limit: 200 };
    if (status !== 'all') f.status = status as ServiceEventStatus;
    return f;
  }, [status]);

  const { data: events = [], isLoading } = useServiceEvents(filter);
  const { data: bikes = [] } = useBikes({ includeInactive: true });
  const { data: templates = [] } = useServiceTemplates({ includeInactive: true });
  const { data: parts = [] } = useIngredients({ includeInactive: false });

  const bikeById = useMemo(() => new Map(bikes.map((b) => [b.id, b])), [bikes]);
  const templateById = useMemo(
    () => new Map(templates.map((t) => [t.id, t])),
    [templates],
  );

  // Quick service only needs a bike + at least one part. Templates are
  // optional; they're only used by the legacy template-driven path.
  const canStart = bikes.some((b) => b.isActive) && parts.some((p) => p.isActive);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-1 items-center gap-2">
          <Select value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {SERVICE_EVENT_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s.replace('_', ' ')}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          type="button"
          variant="primary"
          size="md"
          onClick={() => setDialogOpen(true)}
          disabled={!canStart}
        >
          <Plus className="h-3.5 w-3.5" /> Start servicing
        </Button>
      </div>

      {!canStart ? (
        <div className="rounded-lg border border-dashed border-border-tertiary bg-background-secondary px-4 py-3 text-[12px] text-text-tertiary">
          Add at least one active bike and one active part before starting a service.
        </div>
      ) : null}

      {isLoading ? (
        <div className="rounded-lg border border-border-tertiary bg-background-primary px-4 py-6 text-text-tertiary">
          Loading services…
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border-tertiary bg-background-primary">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Bike</TableHead>
                <TableHead>Template</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Started</TableHead>
                <TableHead className="text-right">Odometer</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {events.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-text-tertiary">
                    No service events yet — click <span className="font-medium">+ Start servicing</span> to record one.
                  </TableCell>
                </TableRow>
              ) : (
                events.map((e) => (
                  <TableRow
                    key={e.id}
                    onClick={() => navigate(`/services/${e.id}/edit`)}
                    className="cursor-pointer"
                  >
                    <TableCell>
                      <span className="font-medium text-text-primary">
                        {bikeById.get(e.bikeId)?.bikeNumber ?? e.bikeId.slice(0, 8)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-text-secondary">
                        {e.serviceTemplateId
                          ? templateById.get(e.serviceTemplateId)?.name ?? '—'
                          : 'Quick service'}
                      </span>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={e.status} />
                    </TableCell>
                    <TableCell>
                      <span className="text-text-tertiary">
                        {formatRelativeTime(e.startedAt)}
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-text-secondary">
                      {e.odometerKm != null ? `${e.odometerKm.toLocaleString('en-IN')} km` : '—'}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      <QuickServiceDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  );
}

function StatusBadge({ status }: { status: ServiceEventStatus }) {
  if (status === 'in_progress') return <Badge variant="info">in progress</Badge>;
  if (status === 'completed') return <Badge variant="success">completed</Badge>;
  return <Badge variant="neutral">cancelled</Badge>;
}
