import { Input } from '@renderer/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@renderer/components/ui/select';
import { Switch } from '@renderer/components/ui/switch';
import {
  PRESETS,
  PRESET_LABELS,
  dateToInputValue,
  inputValueToUnixMs,
  rangeFromPreset,
  type PresetKey,
} from './dateRange';
import type { DateRange } from '@shared/schemas/dashboard';

export type DateRangePickerProps = {
  preset: PresetKey;
  range: DateRange;
  onPresetChange: (preset: PresetKey) => void;
  onRangeChange: (range: DateRange) => void;
  compareYoY: boolean;
  onCompareChange: (compare: boolean) => void;
};

export function DateRangePicker({
  preset,
  range,
  onPresetChange,
  onRangeChange,
  compareYoY,
  onCompareChange,
}: DateRangePickerProps) {
  const isCustom = preset === 'custom';
  return (
    <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border-tertiary bg-background-primary p-3">
      <div className="flex flex-col gap-1">
        <label className="text-[11px] text-text-tertiary">Range</label>
        <Select
          value={preset}
          onValueChange={(v) => {
            const next = v as PresetKey;
            onPresetChange(next);
            if (next !== 'custom') onRangeChange(rangeFromPreset(next));
          }}
        >
          <SelectTrigger className="w-[170px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PRESETS.map((p) => (
              <SelectItem key={p} value={p}>
                {PRESET_LABELS[p]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-[11px] text-text-tertiary">From</label>
        <Input
          type="date"
          value={dateToInputValue(range.startMs)}
          disabled={!isCustom}
          onChange={(e) =>
            onRangeChange({
              ...range,
              startMs: inputValueToUnixMs(e.target.value, false),
            })
          }
          className="w-[160px]"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-[11px] text-text-tertiary">To</label>
        <Input
          type="date"
          value={dateToInputValue(range.endMs)}
          disabled={!isCustom}
          onChange={(e) =>
            onRangeChange({
              ...range,
              endMs: inputValueToUnixMs(e.target.value, true),
            })
          }
          className="w-[160px]"
        />
      </div>
      <label className="flex items-center gap-2 pb-1.5 text-[12px] text-text-secondary">
        <Switch checked={compareYoY} onCheckedChange={onCompareChange} />
        Compare to last year
      </label>
    </div>
  );
}
