import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Tile } from './Tile';
import { StatusSelect } from '@renderer/features/maintenance/StatusSelect';
import {
  useServiceEvents,
  useSetServiceEventStatus,
} from '@renderer/hooks/ipc/useServiceEvents';
import { useBikes } from '@renderer/hooks/ipc/useBikes';
import { formatRelativeTime } from '@renderer/lib/format';
import type {
  ServiceEventKind,
  SettableServiceEventStatus,
} from '@shared/schemas/serviceEvent';

const KIND_LABEL: Record<ServiceEventKind, string> = {
  service: 'Service',
  repair: 'Repair',
  wash: 'Wash',
};

/**
 * Open maintenance work — every requested / under-service event across all
 * three sections, editable inline (advance the status; completing deducts
 * parts). Rows drop off once completed. Service/repair bike numbers link to the
 * full editor for changing parts before completion.
 */
export function PendingJobsTile() {
  const { data: requested = [] } = useServiceEvents({ status: 'requested', limit: 200 });
  const { data: under = [] } = useServiceEvents({ status: 'in_progress', limit: 200 });
  const { data: bikes = [] } = useBikes({ includeInactive: true });
  const setStatus = useSetServiceEventStatus();
  const [error, setError] = useState<string | null>(null);

  const bikeById = useMemo(() => new Map(bikes.map((b) => [b.id, b])), [bikes]);
  const rows = useMemo(
    () => [...requested, ...under].sort((a, b) => b.startedAt - a.startedAt),
    [requested, under],
  );

  async function change(id: string, status: SettableServiceEventStatus) {
    setError(null);
    try {
      await setStatus.mutateAsync({ id, status });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not change status');
    }
  }

  return (
    <Tile
      title="Pending jobs"
      subtitle="Requested & under-service work — advance the status to complete (completing deducts parts)."
      className="xl:col-span-3"
    >
      {error ? (
        <div className="mb-2 rounded-md bg-background-danger px-2.5 py-1.5 text-[12px] text-text-danger">
          {error}
        </div>
      ) : null}
      {rows.length === 0 ? (
        <div className="text-text-tertiary">No open jobs — everything is completed.</div>
      ) : (
        <div className="overflow-hidden rounded-md border border-border-tertiary">
          <table className="w-full text-[12px]">
            <thead className="bg-background-secondary text-text-tertiary">
              <tr>
                <th className="px-2 py-1.5 text-left font-medium">Bike</th>
                <th className="px-2 py-1.5 text-left font-medium">Type</th>
                <th className="px-2 py-1.5 text-left font-medium">Requested</th>
                <th className="px-2 py-1.5 text-left font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => {
                const bikeNumber =
                  bikeById.get(e.bikeId)?.bikeNumber ?? e.bikeId.slice(0, 8);
                return (
                  <tr key={e.id} className="border-t border-border-tertiary">
                    <td className="px-2 py-1.5 font-medium text-text-primary">
                      {e.kind === 'wash' ? (
                        bikeNumber
                      ) : (
                        <Link
                          to={`/services/${e.id}/edit`}
                          className="hover:underline"
                        >
                          {bikeNumber}
                        </Link>
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-text-secondary">
                      {KIND_LABEL[e.kind]}
                    </td>
                    <td className="px-2 py-1.5 text-text-tertiary">
                      {formatRelativeTime(e.startedAt)}
                    </td>
                    <td className="px-2 py-1.5">
                      <StatusSelect
                        status={e.status}
                        onChange={(s) => change(e.id, s)}
                        disabled={setStatus.isPending}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Tile>
  );
}
