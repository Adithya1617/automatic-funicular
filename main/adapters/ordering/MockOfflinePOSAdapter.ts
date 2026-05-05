import type { OrderingServiceAdapter } from '@shared/adapters/OrderingServiceAdapter';
import type { ExternalOrder } from '@shared/schemas/ordering';

/**
 * Simulates the in-person POS. Same shape as the online adapter, different
 * source tag — kept as a separate class so we can diverge their behaviour
 * later (e.g. POS may push synchronously instead of polling).
 */
export class MockOfflinePOSAdapter implements OrderingServiceAdapter {
  readonly source = 'mock_offline' as const;
  private readonly queue: ExternalOrder[] = [];
  private readonly processed = new Set<string>();

  fetchPendingOrders(): Promise<ExternalOrder[]> {
    const drained = this.queue.splice(0, this.queue.length);
    return Promise.resolve(drained);
  }

  injectOrder(order: ExternalOrder): void {
    if (order.source !== this.source) {
      throw new Error(
        `MockOfflinePOSAdapter cannot accept an order with source=${order.source}`,
      );
    }
    this.queue.push(order);
  }

  markOrderProcessed(externalOrderId: string): Promise<void> {
    this.processed.add(externalOrderId);
    return Promise.resolve();
  }
}
