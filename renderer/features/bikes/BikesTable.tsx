import { useMemo } from 'react';
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  createColumnHelper,
} from '@tanstack/react-table';
import type { Bike, BikeType } from '@shared/schemas/bike';
import { formatBikeTypeLabel } from '@shared/utils/bikeType';
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
};

const columnHelper = createColumnHelper<Bike>();

export function BikesTable({ rows, bikeTypes, onSelect }: Props) {
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
    ],
    [typeNameById],
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
