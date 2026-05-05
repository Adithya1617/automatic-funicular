import { useMemo } from 'react';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { Paperclip } from 'lucide-react';
import type { Invoice } from '@shared/schemas/invoice';
import type { Supplier } from '@shared/schemas/supplier';
import { Badge } from '@renderer/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@renderer/components/ui/table';
import { formatINR } from '@shared/utils/currency';
import { formatDateDMY } from '@shared/utils/date';

type Props = {
  rows: Invoice[];
  suppliersById: Map<string, Supplier>;
  onSelect: (id: string) => void;
};

const columnHelper = createColumnHelper<Invoice>();

export function InvoicesTable({ rows, suppliersById, onSelect }: Props) {
  const columns = useMemo(
    () => [
      columnHelper.accessor('invoiceDate', {
        header: 'Date',
        cell: (cell) => (
          <span className="text-text-tertiary">{formatDateDMY(cell.getValue())}</span>
        ),
      }),
      columnHelper.accessor('supplierId', {
        header: 'Supplier',
        cell: (cell) => (
          <span className="font-medium text-text-primary">
            {suppliersById.get(cell.getValue())?.name ?? '—'}
          </span>
        ),
      }),
      columnHelper.accessor('invoiceNumber', {
        header: 'Number',
        cell: (cell) => (
          <span className="font-mono text-[11px] text-text-secondary">{cell.getValue()}</span>
        ),
      }),
      columnHelper.accessor('totalAmount', {
        header: 'Total',
        cell: (cell) => (
          <span className="tabular-nums text-text-primary">{formatINR(cell.getValue())}</span>
        ),
      }),
      columnHelper.accessor('status', {
        header: 'Status',
        cell: (cell) => (
          <Badge variant={cell.getValue() === 'committed' ? 'success' : 'warning'}>
            {cell.getValue() === 'committed' ? 'committed' : 'draft'}
          </Badge>
        ),
      }),
      columnHelper.accessor('filePath', {
        header: 'PDF',
        cell: (cell) =>
          cell.getValue() ? (
            <Paperclip className="h-3.5 w-3.5 text-text-tertiary" />
          ) : (
            <span className="text-text-tertiary">—</span>
          ),
      }),
    ],
    [suppliersById],
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
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={columns.length} className="text-center text-text-tertiary">
                No invoices yet — click <span className="font-medium">+ New invoice</span> to add one.
              </TableCell>
            </TableRow>
          ) : (
            table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                onClick={() => onSelect(row.original.id)}
                className="cursor-pointer"
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
