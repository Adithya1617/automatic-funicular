import type { OrderSource } from '@shared/constants/enums';
import type { OrderStatus } from '@shared/schemas/order';
import type { BadgeProps } from '@renderer/components/ui/badge';

export const SOURCE_LABEL: Record<OrderSource, string> = {
  swiggy: 'Swiggy',
  zomato: 'Zomato',
  offline_pos: 'Offline POS',
  manual_entry: 'Manual',
  mock_online: 'Mock online',
  mock_offline: 'Mock offline',
};

export const SOURCE_BADGE_VARIANT: Record<OrderSource, BadgeProps['variant']> = {
  swiggy: 'warning',
  zomato: 'danger',
  offline_pos: 'success',
  manual_entry: 'neutral',
  mock_online: 'warning',
  mock_offline: 'success',
};

export const STATUS_LABEL: Record<OrderStatus, string> = {
  pending: 'New',
  preparing: 'Preparing',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

export const STATUS_STRIPE: Record<OrderStatus, string> = {
  pending: 'bg-text-info',
  preparing: 'bg-text-warning',
  delivered: 'bg-text-success',
  cancelled: 'bg-text-danger',
};

export const STATUS_DOT: Record<OrderStatus, string> = {
  pending: 'bg-text-info',
  preparing: 'bg-text-warning',
  delivered: 'bg-text-success',
  cancelled: 'bg-text-danger',
};
