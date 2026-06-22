import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { History, Pencil, Plus } from 'lucide-react';
import { Button } from '@renderer/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@renderer/components/ui/table';
import {
  useServiceEventsWithCost,
  useSetServiceEventStatus,
} from '@renderer/hooks/ipc/useServiceEvents';
import { useBikes } from '@renderer/hooks/ipc/useBikes';
import { useIngredients } from '@renderer/hooks/ipc/useIngredients';
import { formatDate } from '@renderer/lib/format';
import { formatINR } from '@shared/utils/currency';
import type { SettableServiceEventStatus } from '@shared/schemas/serviceEvent';
import { RepairDialog } from '@renderer/features/repairs/RepairDialog';
import { BikeHistoryDialog } from '@renderer/features/maintenance/BikeHistoryDialog';
import { StatusSelect } from '@renderer/features/maintenance/StatusSelect';
import { DeleteEventButton } from '@renderer/features/maintenance/DeleteEventButton';

export function RepairsPage() {
  const navigate = useNavigate();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);

  const { data: events = [], isLoading } = useServiceEventsWithCost({
    kind: 'repair',
    limit: 200,
  });
  const { data: bikes = [] } = useBikes({ includeInactive: true });
  const { data: parts = [] } = useIngredients({ includeInactive: false });
  const setStatus = useSetServiceEventStatus();

  const bikeById = useMemo(() => new Map(bikes.map((b) => [b.id, b])), [bikes]);
  const canStart = bikes.some((b) => b.isActive) && parts.some((p) => p.isActive);

  async function changeStatus(id: string, status: SettableServiceEventStatus) {
    setStatusError(null);
    try {
      await setStatus.mutateAsync({ id, status });
    } catch (err) {
      setStatusError(err instanceof Error ? err.message : 'Could not change status');
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[12px] text-text-tertiary">
          Ad-hoc fixes — log whichever parts the repair used.
        </p>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            size="md"
            onClick={() => setHistoryOpen(true)}
          >
            <History className="h-3.5 w-3.5" /> History
          </Button>
          <Button
            type="button"
            variant="primary"
            size="md"
            onClick={() => setDialogOpen(true)}
            disabled={!canStart}
          >
            <Plus className="h-3.5 w-3.5" /> Request repair
          </Button>
        </div>
      </div>

      {!canStart ? (
        <div className="rounded-lg border border-dashed border-border-tertiary bg-background-secondary px-4 py-3 text-[12px] text-text-tertiary">
          Add at least one active bike and one active part before recording a repair.
        </div>
      ) : null}

      {statusError ? (
        <div className="rounded-md bg-background-danger px-2.5 py-1.5 text-[12px] text-text-danger">
          {statusError}
        </div>
      ) : null}

      {isLoading ? (
        <div className="rounded-lg border border-border-tertiary bg-background-primary px-4 py-6 text-text-tertiary">
          Loading repairs…
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border-tertiary bg-background-primary">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Bike</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Cost</TableHead>
                <TableHead className="text-right">Odometer</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {events.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-text-tertiary">
                    No repairs yet — click <span className="font-medium">+ Request repair</span> to add one.
                  </TableCell>
                </TableRow>
              ) : (
                events.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell>
                      <span className="font-medium text-text-primary">
                        {bikeById.get(e.bikeId)?.bikeNumber ?? e.bikeId.slice(0, 8)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-text-tertiary">
                        {formatDate(e.completedAt ?? e.startedAt)}
                      </span>
                    </TableCell>
                    <TableCell onClick={(ev) => ev.stopPropagation()}>
                      <StatusSelect
                        status={e.status}
                        onChange={(s) => changeStatus(e.id, s)}
                        disabled={setStatus.isPending}
                      />
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-medium text-text-primary">
                      {e.status === 'completed' ? formatINR(e.partsCost) : '—'}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-text-secondary">
                      {e.odometerKm != null ? `${e.odometerKm.toLocaleString('en-IN')} km` : '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => navigate(`/services/${e.id}/edit`)}
                          title="Edit"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <DeleteEventButton
                          eventId={e.id}
                          kind="repair"
                          completed={e.status === 'completed'}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      <RepairDialog open={dialogOpen} onOpenChange={setDialogOpen} />
      <BikeHistoryDialog open={historyOpen} onOpenChange={setHistoryOpen} kind="repair" />
    </div>
  );
}
