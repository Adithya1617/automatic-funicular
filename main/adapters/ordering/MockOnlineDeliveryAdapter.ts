import type { OrderingServiceAdapter } from '@shared/adapters/OrderingServiceAdapter';
import type { ExternalOrder } from '@shared/schemas/ordering';

/**
 * Simulates Swiggy/Zomato. Holds an in-memory queue. `injectOrder` pushes;
 * the next `fetchPendingOrders` drains the queue.
 */
export class MockOnlineDeliveryAdapter implements OrderingServiceAdapter {
  readonly source = 'mock_online' as const;
  private readonly queue: ExternalOrder[] = [];
  private readonly processed = new Set<string>();

  fetchPendingOrders(): Promise<ExternalOrder[]> {
    const drained = this.queue.splice(0, this.queue.length);
    return Promise.resolve(drained);
  }

  injectOrder(order: ExternalOrder): void {
    if (order.source !== this.source) {
      throw new Error(
        `MockOnlineDeliveryAdapter cannot accept an order with source=${order.source}`,
      );
    }
    this.queue.push(order);
  }

  markOrderProcessed(externalOrderId: string): Promise<void> {
    this.processed.add(externalOrderId);
    return Promise.resolve();
  }
}
