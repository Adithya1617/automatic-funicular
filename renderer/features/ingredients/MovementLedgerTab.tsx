import type { Ingredient } from '@shared/schemas/ingredient';
import { Badge, type BadgeProps } from '@renderer/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@renderer/components/ui/table';
import { useStockMovements } from '@renderer/hooks/ipc/useStockMovements';
import { formatINR } from '@shared/utils/currency';
import { formatDateTime, formatStock } from '@renderer/lib/format';
import type { StockMovementReason } from '@shared/constants/enums';

const REASON_VARIANT: Record<StockMovementReason, BadgeProps['variant']> = {
  purchase: 'success',
  sale: 'info',
  sale_reversal: 'info',
  wastage: 'danger',
  prep_loss: 'danger',
  staff_meal: 'warning',
  production_input: 'prepared',
  production_output: 'prepared',
  adjustment: 'neutral',
  service_consumed: 'info',
  service_reversal: 'info',
};

const REASON_LABEL: Record<StockMovementReason, string> = {
  purchase: 'purchase',
  sale: 'sale',
  sale_reversal: 'reversal',
  wastage: 'wastage',
  prep_loss: 'prep loss',
  staff_meal: 'staff meal',
  production_input: 'prep input',
  production_output: 'prep output',
  adjustment: 'adjustment',
  service_consumed: 'service',
  service_reversal: 'service reversal',
};

export function MovementLedgerTab({ ingredient }: { ingredient: Ingredient }) {
  const { data: movements = [], isLoading } = useStockMovements({
    ingredientId: ingredient.id,
    limit: 50,
  });

  if (isLoading) {
    return <div className="px-1 py-4 text-text-tertiary">Loading…</div>;
  }
  if (movements.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border-tertiary bg-background-secondary px-3 py-6 text-center text-text-tertiary">
        No movements yet · this part has never been bought, used in service, or counted.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border-tertiary bg-background-primary">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Reason</TableHead>
            <TableHead>Description</TableHead>
            <TableHead className="text-right">Qty</TableHead>
            <TableHead className="text-right">Cost</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {movements.map((m) => {
            const positive = m.changeQuantity >= 0;
            return (
              <TableRow key={m.id}>
                <TableCell className="text-text-tertiary">
                  {formatDateTime(m.occurredAt)}
                </TableCell>
                <TableCell>
                  <Badge variant={REASON_VARIANT[m.reason]}>{REASON_LABEL[m.reason]}</Badge>
                </TableCell>
                <TableCell className="text-text-secondary">
                  {m.notes ?? m.referenceId ?? '—'}
                </TableCell>
                <TableCell
                  className={
                    'text-right tabular-nums ' +
                    (positive ? 'text-text-success' : 'text-text-danger')
                  }
                >
                  {positive ? '+' : '−'}
                  {formatStock(Math.abs(m.changeQuantity), ingredient.baseUnit)}
                </TableCell>
                <TableCell className="text-right tabular-nums text-text-secondary">
                  {m.costPerUnitAtTime != null ? formatINR(m.costPerUnitAtTime) : '—'}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
