import type { ProductionBatch } from '@shared/schemas/production';
import type { BaseUnit } from '@shared/constants/enums';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@renderer/components/ui/table';
import { formatDateTime, formatStock } from '@renderer/lib/format';

type Props = {
  batches: ProductionBatch[];
  baseUnit: BaseUnit;
};

export function BatchesTable({ batches, baseUnit }: Props) {
  if (batches.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border-tertiary bg-background-secondary px-3 py-6 text-center text-text-tertiary">
        No batches yet — record your first one with “+ Make batch”.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border-tertiary bg-background-primary">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Produced</TableHead>
            <TableHead className="text-right">Expected</TableHead>
            <TableHead className="text-right">Actual</TableHead>
            <TableHead className="text-right">Prep loss</TableHead>
            <TableHead>Notes</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {batches.map((b) => {
            const loss = b.expectedYield - b.actualYield;
            return (
              <TableRow key={b.id}>
                <TableCell className="text-text-tertiary">{formatDateTime(b.producedAt)}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatStock(b.expectedYield, baseUnit)}
                </TableCell>
                <TableCell className="text-right tabular-nums text-text-success">
                  {formatStock(b.actualYield, baseUnit)}
                </TableCell>
                <TableCell
                  className={`text-right tabular-nums ${loss > 0 ? 'text-text-danger' : 'text-text-tertiary'}`}
                >
                  {loss > 0 ? `−${formatStock(loss, baseUnit)}` : '—'}
                </TableCell>
                <TableCell className="text-text-secondary">{b.notes ?? '—'}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
