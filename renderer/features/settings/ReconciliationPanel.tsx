import { Activity } from 'lucide-react';
import { Badge } from '@renderer/components/ui/badge';
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
  useReconciliation,
  useRerunReconciliation,
} from '@renderer/hooks/ipc/useReconciliation';
import { formatDateTime } from '@renderer/lib/format';

export function ReconciliationPanel() {
  const { data } = useReconciliation();
  const rerun = useRerunReconciliation();

  const drifts = data?.drifts ?? [];
  const ranAt = data?.ranAtMs ?? null;
  const clean = drifts.length === 0;

  return (
    <section className="rounded-lg border border-border-tertiary bg-background-primary p-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[13px] font-medium text-text-primary">
            Reconciliation
          </h2>
          <p className="mt-1 text-[12px] text-text-secondary">
            Sums every ingredient's signed movements and compares to the cached
            stock. Drift is a defect — the operator should be told, not silenced.
          </p>
        </div>
        <Button
          type="button"
          variant="secondary"
          size="md"
          onClick={() => rerun.mutate()}
          disabled={rerun.isPending}
        >
          <Activity className="h-3 w-3" /> Re-run
        </Button>
      </div>

      <div className="mt-3 flex items-center gap-2 text-[11px] text-text-tertiary">
        Last run:{' '}
        {ranAt !== null ? formatDateTime(ranAt) : 'not yet'}
        {data === null ? null : clean ? (
          <Badge variant="success">CLEAN</Badge>
        ) : (
          <Badge variant="danger">{drifts.length} DRIFT</Badge>
        )}
      </div>

      {data === null ? (
        <p className="mt-2 text-[12px] text-text-secondary">
          No reconciliation has run yet. Click Re-run to compute now.
        </p>
      ) : clean ? (
        <p className="mt-2 text-[12px] text-text-secondary">
          All ingredient stocks match the movement ledger.
        </p>
      ) : (
        <div className="mt-2 overflow-hidden rounded-lg border border-border-tertiary">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ingredient</TableHead>
                <TableHead>Stored</TableHead>
                <TableHead>Movement sum</TableHead>
                <TableHead>Drift</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {drifts.map((d) => (
                <TableRow key={d.ingredientId}>
                  <TableCell className="font-medium text-text-primary">
                    {d.ingredientName}
                  </TableCell>
                  <TableCell className="text-text-secondary tabular-nums">
                    {d.storedStock.toFixed(3)}
                  </TableCell>
                  <TableCell className="text-text-secondary tabular-nums">
                    {d.movementSum.toFixed(3)}
                  </TableCell>
                  <TableCell className="tabular-nums text-text-danger">
                    {d.drift.toFixed(3)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}
