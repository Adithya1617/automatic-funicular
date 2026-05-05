import type { OrderingServiceAdapter } from '@shared/adapters/OrderingServiceAdapter';
import type { OrderSource } from '@shared/constants/enums';
import { MockOfflinePOSAdapter } from './MockOfflinePOSAdapter';
import { MockOnlineDeliveryAdapter } from './MockOnlineDeliveryAdapter';

let adapters: Map<OrderSource, OrderingServiceAdapter> | undefined;

function ensure(): Map<OrderSource, OrderingServiceAdapter> {
  if (!adapters) {
    adapters = new Map<OrderSource, OrderingServiceAdapter>([
      ['mock_online', new MockOnlineDeliveryAdapter()],
      ['mock_offline', new MockOfflinePOSAdapter()],
    ]);
  }
  return adapters;
}

export const orderingAdapterRegistry = {
  get(source: OrderSource): OrderingServiceAdapter | undefined {
    return ensure().get(source);
  },
  require(source: OrderSource): OrderingServiceAdapter {
    const adapter = ensure().get(source);
    if (!adapter) throw new Error(`No ordering adapter registered for source=${source}`);
    return adapter;
  },
  list(): OrderingServiceAdapter[] {
    return [...ensure().values()];
  },
  /** Test-only — clears state so each test starts clean. */
  __reset(): void {
    adapters = undefined;
  },
};
