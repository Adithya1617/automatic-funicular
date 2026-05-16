import type { DateRange } from '@shared/schemas/dashboard';
import { Tile, TileNumber } from './Tile';
import {
  useCostPerBike,
  useCostPerBikeType,
  useServiceVolumeByBikeType,
  useTheoreticalServiceCost,
  useTopConsumedParts,
} from '@renderer/hooks/ipc/useDashboard';
import { formatINR } from '@shared/utils/currency';
import { formatRelativeTime, formatStock } from '@renderer/lib/format';

/* ---------- Cost per bike (table tile) ---------- */
export function CostPerBikeTile({ range }: { range: DateRange }) {
  const { data, isLoading } = useCostPerBike(range);
  return (
    <Tile
      title="Cost per bike"
      subtitle="Parts installed × cost snapshot, by bike. Reversed services don't count."
      className="xl:col-span-2"
    >
      {isLoading ? (
        <div className="text-text-tertiary">Loading…</div>
      ) : !data || data.rows.length === 0 ? (
        <div className="text-text-tertiary">No completed services in this range.</div>
      ) : (
        <div className="flex flex-col gap-2">
          <TileNumber
            value={formatINR(data.totalCost)}
            helpText={`across ${data.rows.length} bikes`}
          />
          <div className="overflow-hidden rounded-md border border-border-tertiary">
            <table className="w-full text-[12px]">
              <thead className="bg-background-secondary text-text-tertiary">
                <tr>
                  <th className="px-2 py-1.5 text-left font-medium">Bike</th>
                  <th className="px-2 py-1.5 text-left font-medium">Model</th>
                  <th className="px-2 py-1.5 text-right font-medium">Cost</th>
                  <th className="px-2 py-1.5 text-right font-medium">Services</th>
                  <th className="px-2 py-1.5 text-right font-medium">Last service</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.slice(0, 12).map((row) => (
                  <tr key={row.bikeId} className="border-t border-border-tertiary">
                    <td className="px-2 py-1.5 font-medium text-text-primary">
                      {row.bikeNumber}
                    </td>
                    <td className="px-2 py-1.5 text-text-secondary">{row.bikeTypeName}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-text-primary">
                      {formatINR(row.partsCost)}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-text-secondary">
                      {row.servicesCount}
                    </td>
                    <td className="px-2 py-1.5 text-right text-text-tertiary">
                      {row.lastServiceAt ? formatRelativeTime(row.lastServiceAt) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Tile>
  );
}

/* ---------- Cost per bike type ---------- */
export function CostPerBikeTypeTile({ range }: { range: DateRange }) {
  const { data, isLoading } = useCostPerBikeType(range);
  const max = (data?.rows ?? []).reduce(
    (m, r) => (r.partsCost > m ? r.partsCost : m),
    0,
  );
  return (
    <Tile
      title="Cost by bike type"
      subtitle="Parts spend rolled up by model."
    >
      {isLoading ? (
        <div className="text-text-tertiary">Loading…</div>
      ) : !data || data.rows.length === 0 ? (
        <div className="text-text-tertiary">No data.</div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {data.rows.map((row) => {
            const pct = max > 0 ? (row.partsCost / max) * 100 : 0;
            return (
              <div key={row.bikeTypeId} className="flex flex-col gap-1">
                <div className="flex items-center justify-between text-[12px]">
                  <span className="font-medium text-text-primary">{row.bikeTypeName}</span>
                  <span className="tabular-nums text-text-primary">{formatINR(row.partsCost)}</span>
                </div>
                <div className="h-[6px] w-full overflow-hidden rounded-full bg-background-tertiary">
                  <div
                    className="h-full bg-text-info"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="text-[10px] text-text-tertiary">
                  {row.bikeCount} bike(s) · {row.servicesCount} service(s)
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Tile>
  );
}

/* ---------- Top consumed parts ---------- */
export function TopConsumedPartsTile({ range }: { range: DateRange }) {
  const { data, isLoading } = useTopConsumedParts(range);
  return (
    <Tile title="Top consumed parts" subtitle="Across all completed services in the range.">
      {isLoading ? (
        <div className="text-text-tertiary">Loading…</div>
      ) : !data || data.rows.length === 0 ? (
        <div className="text-text-tertiary">No parts consumed in this range.</div>
      ) : (
        <ul className="flex flex-col">
          {data.rows.map((row) => (
            <li
              key={row.ingredientId}
              className="flex items-center justify-between border-b border-border-tertiary py-1 text-[12px] last:border-b-0"
            >
              <div className="flex flex-col">
                <span className="font-medium text-text-primary">{row.ingredientName}</span>
                <span className="text-[10px] text-text-tertiary">
                  {formatStock(row.totalQuantity, row.baseUnit)}
                </span>
              </div>
              <span className="tabular-nums text-text-primary">{formatINR(row.totalCost)}</span>
            </li>
          ))}
        </ul>
      )}
    </Tile>
  );
}

/* ---------- Service volume by bike type ---------- */
export function ServiceVolumeTile({ range }: { range: DateRange }) {
  const { data, isLoading } = useServiceVolumeByBikeType(range);
  const max = (data?.rows ?? []).reduce(
    (m, r) => (r.servicesCount > m ? r.servicesCount : m),
    0,
  );
  return (
    <Tile
      title="Services by bike type"
      subtitle="Completed services in the range."
    >
      {isLoading ? (
        <div className="text-text-tertiary">Loading…</div>
      ) : !data || data.totalServices === 0 ? (
        <div className="text-text-tertiary">No completed services in this range.</div>
      ) : (
        <div className="flex flex-col gap-2.5">
          <TileNumber
            value={data.totalServices}
            helpText={data.totalServices === 1 ? 'service' : 'services'}
          />
          {data.rows.map((row) => {
            const pct = max > 0 ? (row.servicesCount / max) * 100 : 0;
            return (
              <div key={row.bikeTypeId} className="flex flex-col gap-1">
                <div className="flex items-center justify-between text-[12px]">
                  <span className="text-text-secondary">{row.bikeTypeName}</span>
                  <span className="tabular-nums text-text-primary">{row.servicesCount}</span>
                </div>
                <div className="h-[6px] w-full overflow-hidden rounded-full bg-background-tertiary">
                  <div
                    className="h-full bg-text-success"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Tile>
  );
}

/* ---------- Theoretical service cost per template ---------- */
export function TheoreticalServiceCostTile() {
  const { data, isLoading } = useTheoreticalServiceCost();
  return (
    <Tile
      title="Theoretical service cost"
      subtitle="Sum of part qty × current avg cost over each template's active recipe."
    >
      {isLoading ? (
        <div className="text-text-tertiary">Loading…</div>
      ) : !data || data.rows.length === 0 ? (
        <div className="text-text-tertiary">No service templates yet.</div>
      ) : (
        <div className="overflow-hidden rounded-md border border-border-tertiary">
          <table className="w-full text-[12px]">
            <thead className="bg-background-secondary text-text-tertiary">
              <tr>
                <th className="px-2 py-1.5 text-left font-medium">Template</th>
                <th className="px-2 py-1.5 text-left font-medium">Model</th>
                <th className="px-2 py-1.5 text-right font-medium">Cost / service</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => (
                <tr
                  key={row.serviceTemplateId}
                  className="border-t border-border-tertiary"
                >
                  <td className="px-2 py-1.5 font-medium text-text-primary">
                    {row.serviceTemplateName}
                    {!row.hasActiveRecipe ? (
                      <span className="ml-1 text-[10px] text-text-warning">
                        no active recipe
                      </span>
                    ) : null}
                  </td>
                  <td className="px-2 py-1.5 text-text-secondary">{row.bikeTypeName}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-text-primary">
                    {row.hasActiveRecipe ? formatINR(row.totalCost) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Tile>
  );
}
