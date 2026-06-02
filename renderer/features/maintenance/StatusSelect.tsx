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
  type ServiceEventStatus,
  type SettableServiceEventStatus,
} from '@shared/schemas/serviceEvent';
import { ServiceStatusBadge } from './ServiceStatusBadge';

type Props = {
  status: ServiceEventStatus;
  onChange: (status: SettableServiceEventStatus) => void;
  disabled?: boolean;
};

/**
 * Inline status control for a list row. While an event is requested or under
 * service the operator can advance it (the dropdown); reaching "Completed"
 * deducts stock. Completed / cancelled are terminal, shown as a read-only badge
 * (revert via the editor's cancel flow).
 */
export function StatusSelect({ status, onChange, disabled }: Props) {
  if (status === 'completed' || status === 'cancelled') {
    return <ServiceStatusBadge status={status} />;
  }
  return (
    <Select
      value={status}
      onValueChange={(v) => onChange(v as SettableServiceEventStatus)}
      disabled={disabled}
    >
      <SelectTrigger className="h-7 w-[150px]">
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
