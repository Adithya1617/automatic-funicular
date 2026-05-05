import type { OrderSource } from '../constants/enums';
import type { ExternalOrder } from '../schemas/ordering';

/**
 * Contract every channel adapter must implement. Mocks add `injectOrder`
 * so test orders can flow through the same poller path real orders will.
 * Real adapters add `markOrderProcessed` so they don't re-deliver.
 */
export interface OrderingServiceAdapter {
  readonly source: OrderSource;
  fetchPendingOrders(): Promise<ExternalOrder[]>;
  injectOrder?(order: ExternalOrder): void;
  markOrderProcessed?(externalOrderId: string): Promise<void>;
}
