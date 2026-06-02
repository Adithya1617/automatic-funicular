import { useMemo } from 'react';
import type { DateRange, MaintenanceRow } from '@shared/schemas/dashboard';
import { Tile } from './Tile';
import { Button } from '@renderer/components/ui/button';
import {
  useMaintenanceSchedule,
  useServiceVolumeByBike,
} from '@renderer/hooks/ipc/useDashboard';
import { dueLabel, dueSortKey } from '@renderer/lib/maintenance';
import { cn } from '@renderer/lib/cn';

/** Bikes within this many days of being due (or overdue / never done) surface
 *  in the alert panels. */
const SOON_DAYS = 7;

type AlertTileProps = {
  onStart: (bikeId: string) => void;
};

/* ---------- Service due (45-day countdown) ---------- */
export function ServiceDueTile({ onStart }: AlertTileProps) {
  const { data, isLoading } = useMaintenanceSchedule();
  const rows = useMemo(
    () => pickDue(data?.rows ?? [], (r) => r.serviceDaysRemaining),
    [data],
  );
  return (
    <Tile
      title="Service due"
      subtitle="Oil change every 45 days. Overdue and due-soon bikes first."
    >
      <MaintenanceList
        isLoading={isLoading}
        rows={rows}
        days={(r) => r.serviceDaysRemaining}
        emptyText="Every bike is serviced and up to date."
        actionLabel="Request service"
        onStart={onStart}
      />
    </Tile>
  );
}

/* ---------- Wash due (15-day countdown) ---------- */
export function WashDueTile({ onStart }: AlertTileProps) {
  const { data, isLoading } = useMaintenanceSchedule();
  const rows = useMemo(
    () => pickDue(data?.rows ?? [], (r) => r.washDaysRemaining),
    [data],
  );
  return (
    <Tile
      title="Wash due"
      subtitle="Wash every 15 days. Overdue and due-soon bikes first."
    >
      <MaintenanceList
        isLoading={isLoading}
        rows={rows}
        days={(r) => r.washDaysRemaining}
        emptyText="Every bike has been washed recently."
        actionLabel="Request wash"
        onStart={onStart}
      />
    </Tile>
  );
}

/* ---------- Services by bike ---------- */
export function ServicesByBikeTile({ range }: { range: DateRange }) {
  const { data, isLoading } = useServiceVolumeByBike(range);
  return (
    <Tile
      title="Services by bike"
      subtitle="Completed service / repair / wash per bike in the range."
      className="xl:col-span-2"
    >
      {isLoading ? (
        <div className="text-text-tertiary">Loading…</div>
      ) : !data || data.rows.length === 0 ? (
        <div className="text-text-tertiary">No completed activity in this range.</div>
      ) : (
        <div className="overflow-hidden rounded-md border border-border-tertiary">
          <table className="w-full text-[12px]">
            <thead className="bg-background-secondary text-text-tertiary">
              <tr>
                <th className="px-2 py-1.5 text-left font-medium">Bike</th>
                <th className="px-2 py-1.5 text-left font-medium">Model</th>
                <th className="px-2 py-1.5 text-right font-medium">Services</th>
                <th className="px-2 py-1.5 text-right font-medium">Repairs</th>
                <th className="px-2 py-1.5 text-right font-medium">Washes</th>
                <th className="px-2 py-1.5 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.slice(0, 14).map((row) => (
                <tr key={row.bikeId} className="border-t border-border-tertiary">
                  <td className="px-2 py-1.5 font-medium text-text-primary">
                    {row.bikeNumber}
                  </td>
                  <td className="px-2 py-1.5 text-text-secondary">{row.bikeTypeName}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-text-secondary">
                    {row.serviceCount}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-text-secondary">
                    {row.repairCount}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-text-secondary">
                    {row.washCount}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums font-medium text-text-primary">
                    {row.total}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Tile>
  );
}

/* ---------- shared list body for the two alert tiles ---------- */
function MaintenanceList({
  isLoading,
  rows,
  days,
  emptyText,
  actionLabel,
  onStart,
}: {
  isLoading: boolean;
  rows: MaintenanceRow[];
  days: (r: MaintenanceRow) => number | null;
  emptyText: string;
  actionLabel: string;
  onStart: (bikeId: string) => void;
}) {
  if (isLoading) return <div className="text-text-tertiary">Loading…</div>;
  if (rows.length === 0) return <div className="text-text-tertiary">{emptyText}</div>;
  return (
    <ul className="flex flex-col">
      {rows.map((row) => {
        const label = dueLabel(days(row));
        return (
          <li
            key={row.bikeId}
            className="flex items-center justify-between gap-2 border-b border-border-tertiary py-1.5 last:border-b-0"
          >
            <div className="flex min-w-0 flex-col">
              <span className="text-[12px] font-medium text-text-primary">
                {row.bikeNumber}
              </span>
              <span className="truncate text-[10px] text-text-tertiary">
                {row.bikeTypeName}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  'rounded-[8px] px-1.5 py-px text-[11px] font-medium tabular-nums',
                  label.urgent
                    ? 'bg-background-danger text-text-danger'
                    : 'text-text-secondary',
                )}
              >
                {label.text}
              </span>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => onStart(row.bikeId)}
              >
                {actionLabel}
              </Button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** Keep only bikes that are due-soon / overdue / never done, most urgent first. */
function pickDue(
  rows: MaintenanceRow[],
  days: (r: MaintenanceRow) => number | null,
): MaintenanceRow[] {
  return rows
    .filter((r) => {
      const d = days(r);
      return d === null || d <= SOON_DAYS;
    })
    .sort((a, b) => dueSortKey(days(a)) - dueSortKey(days(b)));
}
