import { useMemo } from 'react';
import { flexRender, getCoreRowModel, useReactTable, createColumnHelper } from '@tanstack/react-table';
import type { Ingredient } from '@shared/schemas/ingredient';
import { Badge } from '@renderer/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@renderer/components/ui/table';
import { formatINR } from '@shared/utils/currency';
import { formatRelativeTime, formatStock } from '@renderer/lib/format';

type Props = {
  rows: Ingredient[];
  selectedId?: string;
  onSelect: (id: string) => void;
};

const columnHelper = createColumnHelper<Ingredient>();

export function IngredientsTable({ rows, selectedId, onSelect }: Props) {
  const columns = useMemo(
    () => [
      columnHelper.accessor('name', {
        header: 'Name',
        cell: (cell) => (
          <div className="flex flex-col">
            <span className="font-medium text-text-primary">{cell.getValue()}</span>
            <span className="text-[10px] text-text-tertiary">{cell.row.original.category}</span>
          </div>
        ),
      }),
      columnHelper.accessor('type', {
        header: 'Type',
        cell: (cell) => (
          <Badge variant={cell.getValue() === 'prepared' ? 'prepared' : 'neutral'}>
            {cell.getValue()}
          </Badge>
        ),
      }),
      columnHelper.accessor('stockQuantity', {
        header: 'Stock',
        cell: (cell) => <StockCell ingredient={cell.row.original} />,
      }),
      columnHelper.accessor('currentAvgCostPerUnit', {
        header: 'Avg cost',
        cell: (cell) => {
          const v = cell.getValue();
          return (
            <span className="text-right tabular-nums text-text-primary">
              {v > 0 ? `${formatINR(v)}/${cell.row.original.baseUnit}` : '—'}
            </span>
          );
        },
      }),
      columnHelper.accessor('updatedAt', {
        header: 'Last move',
        cell: (cell) => (
          <span className="text-text-tertiary">{formatRelativeTime(cell.getValue())}</span>
        ),
      }),
    ],
    [],
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
                <TableHead key={h.id}>{flexRender(h.column.columnDef.header, h.getContext())}</TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.map((row) => {
            const isSelected = row.original.id === selectedId;
            return (
              <TableRow
                key={row.id}
                data-state={isSelected ? 'selected' : undefined}
                onClick={() => onSelect(row.original.id)}
                className={
                  isSelected
                    ? 'cursor-pointer border-l-2 border-l-text-info'
                    : 'cursor-pointer'
                }
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                ))}
              </TableRow>
            );
          })}
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={columns.length} className="text-center text-text-tertiary">
                No ingredients yet — click <span className="font-medium">+ New ingredient</span> to add one.
              </TableCell>
            </TableRow>
          ) : null}
        </TableBody>
      </Table>
    </div>
  );
}

function StockCell({ ingredient }: { ingredient: Ingredient }) {
  const { stockQuantity, lowStockThreshold } = ingredient;
  const denominator = lowStockThreshold > 0 ? lowStockThreshold * 4 : 1;
  const fraction = Math.max(0, Math.min(1, stockQuantity / denominator));
  const pct = Math.round(fraction * 100);

  let color = 'bg-text-success';
  if (fraction < 0.5) color = 'bg-text-danger';
  else if (fraction < 0.75) color = 'bg-text-warning';

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between text-[12px]">
        <span className="font-medium text-text-primary">
          {formatStock(stockQuantity, ingredient.baseUnit)}
        </span>
        {lowStockThreshold > 0 ? (
          <span className="text-[10px] text-text-tertiary">
            low: {formatStock(lowStockThreshold, ingredient.baseUnit)}
          </span>
        ) : null}
      </div>
      <div className="h-[4px] w-full overflow-hidden rounded-full bg-background-tertiary">
        <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
