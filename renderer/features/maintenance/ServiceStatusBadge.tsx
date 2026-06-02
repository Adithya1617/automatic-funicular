import { Badge, type BadgeProps } from '@renderer/components/ui/badge';
import {
  SERVICE_EVENT_STATUS_LABELS,
  type ServiceEventStatus,
} from '@shared/schemas/serviceEvent';

const VARIANT: Record<ServiceEventStatus, BadgeProps['variant']> = {
  requested: 'warning',
  in_progress: 'info',
  completed: 'success',
  cancelled: 'neutral',
};

export function ServiceStatusBadge({ status }: { status: ServiceEventStatus }) {
  return <Badge variant={VARIANT[status]}>{SERVICE_EVENT_STATUS_LABELS[status]}</Badge>;
}
