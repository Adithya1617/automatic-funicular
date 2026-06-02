import { useMemo } from 'react';
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  createColumnHelper,
} from '@tanstack/react-table';
import type { Bike, BikeType } from '@shared/schemas/bike';
import type { MaintenanceRow } from '@shared/schemas/dashboard';
import { formatBikeTypeLabel } from '@shared/utils/bikeType';
import { dueLabel } from '@renderer/lib/maintenance';
import { cn } from '@renderer/lib/cn';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@renderer/components/ui/table';

type Props = {
  rows: Bike[];
  bikeTypes: BikeType[];
  onSelect: (id: string) => void;
  /** Per-bike maintenance countdowns, keyed by bike id (optional). */
  scheduleByBike?: Map<string, MaintenanceRow>;
};

const columnHelper = createColumnHelper<Bike>();

export function BikesTable({ rows, bikeTypes, onSelect, scheduleByBike }: Props) {
  const typeNameById = useMemo(
    () => new Map(bikeTypes.map((t) => [t.id, formatBikeTypeLabel(t)])),
    [bikeTypes],
  );

  const columns = useMemo(
    () => [
      columnHelper.accessor('bikeNumber', {
        header: 'Bike #',
        cell: (cell) => (
          <span className="font-medium text-text-primary">{cell.getValue()}</span>
        ),
      }),
      columnHelper.accessor('bikeTypeId', {
        header: 'Model',
        cell: (cell) => (
          <span className="text-text-secondary">
            {typeNameById.get(cell.getValue()) ?? '—'}
          </span>
        ),
      }),
      columnHelper.accessor('licensePlate', {
        header: 'Plate',
        cell: (cell) => (
          <span className="font-mono text-[12px] text-text-secondary">
            {cell.getValue() ?? '—'}
          </span>
        ),
      }),
      columnHelper.accessor('odometerKm', {
        header: 'Odometer',
        cell: (cell) => {
          const v = cell.getValue();
          return (
            <span className="tabular-nums text-text-secondary">
              {v != null ? `${v.toLocaleString('en-IN')} km` : '—'}
            </span>
          );
        },
      }),
      columnHelper.display({
        id: 'serviceDue',
        header: 'Service due',
        cell: (cell) => (
          <DueCell days={scheduleByBike?.get(cell.row.original.id)?.serviceDaysRemaining} />
        ),
      }),
      columnHelper.display({
        id: 'washDue',
        header: 'Wash due',
        cell: (cell) => (
          <DueCell days={scheduleByBike?.get(cell.row.original.id)?.washDaysRemaining} />
        ),
      }),
    ],
    [typeNameById, scheduleByBike],
  );

  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="overflow-hidden rounded-lg border border-border-tertiary bg-background-primary">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((hg) => (
            <TableRow key={hg.id}>
              {hg.headers.map((h) => (
                <TableHead key={h.id}>
                  {flexRender(h.column.columnDef.header, h.getContext())}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.map((row) => (
            <TableRow
              key={row.id}
              onClick={() => onSelect(row.original.id)}
              className="cursor-pointer"
            >
              {row.getVisibleCells().map((cell) => (
                <TableCell key={cell.id}>
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </TableCell>
              ))}
            </TableRow>
          ))}
          {rows.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={columns.length}
                className="text-center text-text-tertiary"
              >
                No bikes yet — click <span className="font-medium">+ New bike</span> to add one.
              </TableCell>
            </TableRow>
          ) : null}
        </TableBody>
      </Table>
    </div>
  );
}

/** Renders a maintenance countdown. `undefined` days = schedule not loaded
 *  (shows "—"); `null` = never done (shows "never", urgent). */
function DueCell({ days }: { days: number | null | undefined }) {
  if (days === undefined) {
    return <span className="text-text-tertiary">—</span>;
  }
  const label = dueLabel(days);
  return (
    <span
      className={cn(
        'text-[12px] tabular-nums',
        label.urgent ? 'font-medium text-text-danger' : 'text-text-secondary',
      )}
    >
      {label.text}
    </span>
  );
}
