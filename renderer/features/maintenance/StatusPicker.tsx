import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@renderer/components/ui/select';
import {
  SERVICE_EVENT_STATUS_LABELS,
  SETTABLE_SERVICE_EVENT_STATUSES,
  type SettableServiceEventStatus,
} from '@shared/schemas/serviceEvent';

type Props = {
  value: SettableServiceEventStatus;
  onChange: (status: SettableServiceEventStatus) => void;
};

/**
 * Status chooser for the create dialogs — always shows all three settable
 * states (Requested / Under service / Completed). "Completed" deducts stock on
 * submit; the others record the (planned) work without touching stock.
 */
export function StatusPicker({ value, onChange }: Props) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as SettableServiceEventStatus)}>
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {SETTABLE_SERVICE_EVENT_STATUSES.map((s) => (
          <SelectItem key={s} value={s}>
            {SERVICE_EVENT_STATUS_LABELS[s]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
