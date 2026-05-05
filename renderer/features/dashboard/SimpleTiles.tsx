import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatINR } from '@shared/utils/currency';
import { formatStock } from '@renderer/lib/format';
import type { DateRange } from '@shared/schemas/dashboard';
import {
  useCogs,
  useFoodCost,
  useLowStock,
  useOrderVolumeByChannel,
  useReorder,
  useRevenueByChannel,
  useSpending,
  useTopDishes,
  useWastage,
} from '@renderer/hooks/ipc/useDashboard';
import { Tile, TileNumber } from './Tile';

const SOURCE_LABELS: Record<string, string> = {
  swiggy: 'Swiggy',
  zomato: 'Zomato',
  offline_pos: 'Offline POS',
  manual_entry: 'Manual',
  mock_online: 'Mock online',
  mock_offline: 'Mock offline',
};

const CHART_PALETTE = [
  'var(--color-text-info)',
  'var(--color-text-success)',
  'var(--color-text-warning)',
  'var(--color-text-danger)',
  'var(--color-text-secondary)',
];

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
          title="Top ingredients"
          rows={data?.topIngredients.map((i) => ({ name: i.ingredientName, value: i.amount })) ?? []}
          format={formatINR}
        />
      </div>
    </Tile>
  );
}

export function CogsTile({ range }: { range: DateRange }) {
  const { data } = useCogs(range);
  return (
    <Tile
      title="Cost of goods sold (COGS)"
      subtitle="Sale movements × cost-at-time, by menu item"
    >
      <div className="grid grid-cols-2 gap-2">
        <TileNumber value={data ? formatINR(data.totalCogs) : '—'} helpText="COGS" />
        <TileNumber value={data ? formatINR(data.totalRevenue) : '—'} helpText="Revenue" />
      </div>
      <SmallTable
        title="By menu item"
        rows={data?.rows.slice(0, 6).map((r) => ({ name: r.menuItemName, value: r.cogs })) ?? []}
        format={formatINR}
      />
    </Tile>
  );
}

export function WastageTile({ range }: { range: DateRange }) {
  const { data } = useWastage(range);
  return (
    <Tile title="Wastage & prep loss" subtitle="Wastage, prep loss, staff meal">
      <TileNumber value={data ? formatINR(data.totalLoss) : '—'} helpText="Total loss in period" />
      <SmallTable
        title="By reason"
        rows={data?.byReason.map((r) => ({ name: r.reason, value: r.amount })) ?? []}
        format={formatINR}
      />
      <SmallTable
        title="Top ingredients"
        rows={data?.topIngredients.slice(0, 5).map((r) => ({ name: r.ingredientName, value: r.amount })) ?? []}
        format={formatINR}
      />
    </Tile>
  );
}

export function TopDishesTile({ range }: { range: DateRange }) {
  const { data } = useTopDishes(range);
  return (
    <Tile title="Top consuming dishes" subtitle="By ingredient cost consumed">
      <SmallTable
        title=""
        rows={data?.rows.slice(0, 8).map((r) => ({ name: r.menuItemName, value: r.cogs })) ?? []}
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

export function FoodCostTile() {
  const { data } = useFoodCost();
  const rows = (data?.rows ?? [])
    .filter((r) => r.foodCostPercent !== null)
    .slice(0, 10)
    .map((r) => ({
      name: r.menuItemName,
      pct: Math.round((r.foodCostPercent ?? 0) * 100),
    }));
  return (
    <Tile title="Theoretical food cost %" subtitle="Recipe cost ÷ selling price">
      <div className="h-[220px]">
        {rows.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 8, left: 4, bottom: 0 }}>
              <CartesianGrid strokeDasharray="2 2" stroke="var(--color-border-tertiary)" />
              <XAxis type="number" stroke="var(--color-text-tertiary)" fontSize={10} />
              <YAxis
                type="category"
                dataKey="name"
                stroke="var(--color-text-tertiary)"
                fontSize={10}
                width={120}
              />
              <Tooltip formatter={(v) => `${Number(v)}%`} />
              <Bar dataKey="pct" radius={[0, 4, 4, 0]}>
                {rows.map((row, idx) => (
                  <Cell
                    key={row.name}
                    fill={
                      row.pct > 40
                        ? 'var(--color-text-danger)'
                        : row.pct > 30
                          ? 'var(--color-text-warning)'
                          : CHART_PALETTE[idx % CHART_PALETTE.length] ?? 'var(--color-text-info)'
                    }
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-[11px] text-text-tertiary">No menu items priced yet.</p>
        )}
      </div>
    </Tile>
  );
}

export function ChannelRevenueTile({ range }: { range: DateRange }) {
  const { data } = useRevenueByChannel(range);
  const rows = (data?.rows ?? [])
    .filter((r) => r.revenue > 0 || r.orderCount > 0)
    .map((r) => ({ name: SOURCE_LABELS[r.source] ?? r.source, value: r.revenue }));
  return (
    <Tile title="Revenue by channel" subtitle="Delivered orders only">
      <div className="h-[160px]">
        {rows.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="2 2" stroke="var(--color-border-tertiary)" />
              <XAxis dataKey="name" stroke="var(--color-text-tertiary)" fontSize={10} />
              <YAxis stroke="var(--color-text-tertiary)" fontSize={10} tickFormatter={(v) => formatINR(Number(v))} />
              <Tooltip formatter={(v) => formatINR(Number(v))} />
              <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                {rows.map((row, idx) => (
                  <Cell key={row.name} fill={CHART_PALETTE[idx % CHART_PALETTE.length] ?? 'var(--color-text-info)'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-[11px] text-text-tertiary">No delivered orders in range.</p>
        )}
      </div>
    </Tile>
  );
}

export function ChannelVolumeTile({ range }: { range: DateRange }) {
  const { data } = useOrderVolumeByChannel(range);
  const rows = (data?.rows ?? [])
    .filter((r) => r.orderCount > 0)
    .map((r) => ({ name: SOURCE_LABELS[r.source] ?? r.source, value: r.orderCount }));
  return (
    <Tile title="Order volume by channel" subtitle="All placed orders">
      <div className="h-[160px]">
        {rows.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="2 2" stroke="var(--color-border-tertiary)" />
              <XAxis dataKey="name" stroke="var(--color-text-tertiary)" fontSize={10} />
              <YAxis stroke="var(--color-text-tertiary)" fontSize={10} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                {rows.map((row, idx) => (
                  <Cell key={row.name} fill={CHART_PALETTE[idx % CHART_PALETTE.length] ?? 'var(--color-text-info)'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-[11px] text-text-tertiary">No orders in range.</p>
        )}
      </div>
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
