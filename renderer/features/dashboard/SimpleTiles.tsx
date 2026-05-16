import { formatINR } from '@shared/utils/currency';
import { formatStock } from '@renderer/lib/format';
import type { DateRange } from '@shared/schemas/dashboard';
import {
  useLowStock,
  useReorder,
  useSpending,
  useWastage,
} from '@renderer/hooks/ipc/useDashboard';
import { Tile, TileNumber } from './Tile';

export function SpendingTile({ range }: { range: DateRange }) {
  const { data } = useSpending(range);
  return (
    <Tile title="Spending in period" subtitle="Committed invoice totals">
      <TileNumber
        value={data ? formatINR(data.totalSpend) : '—'}
        helpText={data ? `${data.invoiceCount} invoices` : undefined}
      />
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <SmallTable
          title="By category"
          rows={data?.byCategory.slice(0, 6).map((c) => ({ name: c.category, value: c.amount })) ?? []}
          format={formatINR}
        />
        <SmallTable
          title="Top parts"
          rows={data?.topIngredients.map((i) => ({ name: i.ingredientName, value: i.amount })) ?? []}
          format={formatINR}
        />
      </div>
    </Tile>
  );
}

export function WastageTile({ range }: { range: DateRange }) {
  const { data } = useWastage(range);
  return (
    <Tile title="Wastage & loss" subtitle="Wastage, prep loss, staff meal">
      <TileNumber value={data ? formatINR(data.totalLoss) : '—'} helpText="Total loss in period" />
      <SmallTable
        title="By reason"
        rows={data?.byReason.map((r) => ({ name: r.reason, value: r.amount })) ?? []}
        format={formatINR}
      />
      <SmallTable
        title="Top parts"
        rows={data?.topIngredients.slice(0, 5).map((r) => ({ name: r.ingredientName, value: r.amount })) ?? []}
        format={formatINR}
      />
    </Tile>
  );
}

export function LowStockTile({ range }: { range: DateRange }) {
  const { data } = useLowStock(range);
  return (
    <Tile title="Low stock" subtitle="Below threshold or running out within 14 days">
      {data?.rows.length === 0 ? (
        <p className="text-[11px] text-text-tertiary">Nothing flagged.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border-tertiary text-[12px]">
          {(data?.rows ?? []).slice(0, 8).map((r) => (
            <li key={r.ingredientId} className="flex items-center justify-between py-1.5">
              <span className="text-text-primary">{r.ingredientName}</span>
              <span className="flex items-center gap-3 text-text-secondary">
                <span className="tabular-nums">{formatStock(r.stockQuantity, r.baseUnit)}</span>
                <span
                  className={
                    r.daysRemaining !== null && r.daysRemaining < 3
                      ? 'tabular-nums text-text-danger'
                      : 'tabular-nums'
                  }
                >
                  {r.daysRemaining === null ? '—' : `${r.daysRemaining.toFixed(1)}d`}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Tile>
  );
}

export function ReorderTile({ range }: { range: DateRange }) {
  const { data } = useReorder(range);
  return (
    <Tile
      title="Reorder suggestions"
      subtitle="Lead time + 7-day buffer based on consumption"
    >
      {data?.rows.length === 0 ? (
        <p className="text-[11px] text-text-tertiary">Nothing to reorder.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border-tertiary text-[12px]">
          {(data?.rows ?? []).slice(0, 8).map((r) => (
            <li key={r.ingredientId} className="flex items-center justify-between py-1.5">
              <span className="text-text-primary">{r.ingredientName}</span>
              <span className="flex items-center gap-3 text-text-secondary">
                <span className="tabular-nums">
                  Order {formatStock(r.suggestedOrderQuantity, r.baseUnit)}
                </span>
                <span className="tabular-nums">
                  {r.daysRemaining === null ? '—' : `${r.daysRemaining.toFixed(1)}d left`}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Tile>
  );
}

function SmallTable({
  title,
  rows,
  format,
}: {
  title: string;
  rows: Array<{ name: string; value: number }>;
  format: (n: number) => string;
}) {
  return (
    <div className="flex flex-col gap-1">
      {title ? (
        <div className="text-[10px] uppercase tracking-wider text-text-tertiary">{title}</div>
      ) : null}
      {rows.length === 0 ? (
        <p className="text-[11px] text-text-tertiary">No data.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border-tertiary text-[12px]">
          {rows.map((r) => (
            <li key={r.name} className="flex items-center justify-between py-1">
              <span className="truncate pr-2 text-text-primary">{r.name}</span>
              <span className="tabular-nums text-text-secondary">{format(r.value)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
