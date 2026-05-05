import { useMemo } from 'react';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';
import type { MenuItem } from '@shared/schemas/menuItem';
import type { MenuItemAvailability } from '@shared/schemas/availability';
import { Badge } from '@renderer/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@renderer/components/ui/table';
import { formatINR } from '@shared/utils/currency';

type Props = {
  rows: MenuItem[];
  availability: Map<string, MenuItemAvailability>;
  onSelect: (id: string) => void;
};

const columnHelper = createColumnHelper<MenuItem>();

export function MenuItemsTable({ rows, availability, onSelect }: Props) {
  const columns = useMemo(
    () => [
      columnHelper.accessor('name', {
        header: 'Name',
        cell: (cell) => (
          <div className="flex flex-col">
            <span className="font-medium text-text-primary">{cell.getValue()}</span>
            <span className="text-[10px] text-text-tertiary">
              {cell.row.original.category}
              {cell.row.original.variantGroupId ? ' · variant' : ''}
            </span>
          </div>
        ),
      }),
      columnHelper.accessor('sellingPrice', {
        header: 'Price',
        cell: (cell) => (
          <span className="tabular-nums text-text-primary">{formatINR(cell.getValue())}</span>
        ),
      }),
      columnHelper.display({
        id: 'availability',
        header: 'Availability',
        cell: ({ row }) => {
          const a = availability.get(row.original.id);
          const servings = a?.maxServingsAvailable ?? null;
          if (!row.original.isActive) return <Badge variant="neutral">Inactive</Badge>;
          if (servings == null) return <Badge variant="neutral">—</Badge>;
          if (servings === 0) return <Badge variant="danger">Out of stock</Badge>;
          if (servings < 5) return <Badge variant="warning">{servings} left</Badge>;
          return <Badge variant="success">{servings} left</Badge>;
        },
      }),
      columnHelper.accessor('isActive', {
        header: 'Status',
        cell: (cell) => (
          <Badge variant={cell.getValue() ? 'success' : 'neutral'}>
            {cell.getValue() ? 'active' : 'inactive'}
          </Badge>
        ),
      }),
    ],
    [availability],
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
                No menu items yet — click <span className="font-medium">+ New menu item</span> to add one.
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
