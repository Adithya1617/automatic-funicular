import { useMemo, useState } from 'react';
import {
  rangeFromPreset,
  type PresetKey,
  compareRangeYoY,
} from '@renderer/features/dashboard/dateRange';
import { DateRangePicker } from '@renderer/features/dashboard/DateRangePicker';
import { StockValueTile } from '@renderer/features/dashboard/StockValueTile';
import {
  LowStockTile,
  ReorderTile,
  SpendingTile,
  WastageTile,
} from '@renderer/features/dashboard/SimpleTiles';
import {
  CostPerBikeTile,
  CostPerBikeTypeTile,
  ServiceVolumeTile,
  TheoreticalServiceCostTile,
  TopConsumedPartsTile,
} from '@renderer/features/dashboard/BikeTiles';
import { ExportButtons } from '@renderer/features/dashboard/ExportButtons';
import type { DateRange } from '@shared/schemas/dashboard';

const DEFAULT_PRESET: PresetKey = 'this_month';

export function DashboardPage() {
  const [preset, setPreset] = useState<PresetKey>(DEFAULT_PRESET);
  const [range, setRange] = useState<DateRange>(() => rangeFromPreset(DEFAULT_PRESET));
  const [compareYoY, setCompareYoY] = useState(false);

  const compareRange = useMemo(
    () => (compareYoY ? compareRangeYoY(range) : null),
    [compareYoY, range],
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <DateRangePicker
          preset={preset}
          range={range}
          onPresetChange={setPreset}
          onRangeChange={(r) => {
            setRange(r);
            if (preset !== 'custom') setPreset('custom');
          }}
          compareYoY={compareYoY}
          onCompareChange={setCompareYoY}
        />
        <ExportButtons range={range} />
      </div>

      {compareRange ? (
        <div className="rounded-md bg-background-info px-2.5 py-1.5 text-[11px] text-text-info">
          Comparing to {new Date(compareRange.startMs).toLocaleDateString('en-IN')} →{' '}
          {new Date(compareRange.endMs).toLocaleDateString('en-IN')}.
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        <StockValueTile range={range} />
        <SpendingTile range={range} />
        <WastageTile range={range} />
        <CostPerBikeTile range={range} />
        <CostPerBikeTypeTile range={range} />
        <TopConsumedPartsTile range={range} />
        <ServiceVolumeTile range={range} />
        <TheoreticalServiceCostTile />
        <LowStockTile range={range} />
        <ReorderTile range={range} />
      </div>

      {compareRange ? <CompareSection range={compareRange} /> : null}
    </div>
  );
}

function CompareSection({ range }: { range: DateRange }) {
  // Render a slimmer compare grid against the prior-year range — the same
  // tiles will compute against the YoY range and surface side-by-side.
  return (
    <div className="rounded-lg border border-dashed border-border-tertiary bg-background-secondary p-3">
      <h2 className="mb-2 text-[11px] font-medium uppercase tracking-wider text-text-tertiary">
        Same range, last year
      </h2>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        <SpendingTile range={range} />
        <CostPerBikeTile range={range} />
        <ServiceVolumeTile range={range} />
      </div>
    </div>
  );
}
