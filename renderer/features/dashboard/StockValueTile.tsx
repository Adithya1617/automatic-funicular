import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatINR } from '@shared/utils/currency';
import type { DateRange } from '@shared/schemas/dashboard';
import { useStockValue, useStockValueSeries } from '@renderer/hooks/ipc/useDashboard';
import { Tile, TileNumber } from './Tile';

export function StockValueTile({ range }: { range: DateRange }) {
  const { data: now } = useStockValue();
  const { data: series } = useStockValueSeries(range);

  return (
    <Tile title="Current stock value" subtitle="Inventory on hand × weighted-avg cost">
      <TileNumber
        value={now ? formatINR(now.totalValue) : '—'}
        helpText={
          series && series.points.length > 0
            ? `${series.points.length} data points in range`
            : undefined
        }
      />
      <div className="mt-3 h-[120px]">
        {series && series.points.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={series.points} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
              <defs>
                <linearGradient id="stockValGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-text-info)" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="var(--color-text-info)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="bucketMs"
                tickFormatter={(v) =>
                  new Date(Number(v)).toLocaleDateString('en-IN', {
                    day: '2-digit',
                    month: 'short',
                  })
                }
                fontSize={10}
                stroke="var(--color-text-tertiary)"
              />
              <YAxis
                tickFormatter={(v) => formatINR(Number(v))}
                fontSize={10}
                stroke="var(--color-text-tertiary)"
              />
              <Tooltip
                formatter={(v) => formatINR(Number(v))}
                labelFormatter={(v) => new Date(Number(v)).toLocaleDateString('en-IN')}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke="var(--color-text-info)"
                fill="url(#stockValGrad)"
                strokeWidth={1.5}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full items-center justify-center text-[11px] text-text-tertiary">
            No movements in range
          </div>
        )}
      </div>
    </Tile>
  );
}
