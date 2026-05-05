import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runOnce } from '../../main/jobs/orderPoller';
import * as dbClient from '../../main/db/client';
import { OrderService } from '../../main/services/OrderService';
import { stockTakeLock } from '../../main/lib/stockTakeLock';
import type { OrderingServiceAdapter } from '@shared/adapters/OrderingServiceAdapter';
import type { ExternalOrder } from '@shared/schemas/ordering';
import type { OrderWithLines } from '@shared/schemas/order';

function makeAdapter(orders: ExternalOrder[]): OrderingServiceAdapter & {
  fetchPendingOrders: ReturnType<typeof vi.fn>;
  markOrderProcessed: ReturnType<typeof vi.fn>;
} {
  return {
    source: 'mock_online',
    fetchPendingOrders: vi.fn().mockResolvedValue(orders),
    markOrderProcessed: vi.fn().mockResolvedValue(undefined),
  };
}

beforeEach(() => {
  stockTakeLock.value = null;
  vi.spyOn(dbClient, 'getDb').mockReturnValue({
    db: {} as never,
    raw: {} as never,
    close: () => undefined,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('orderPoller.runOnce', () => {
  it('drains the adapter queue and routes each order through OrderService.processIncomingOrder', async () => {
    const adapter = makeAdapter([
      {
        externalOrderId: 'ext-1',
        source: 'mock_online',
        placedAt: 1,
        totalAmount: 100,
        notes: null,
        lines: [{ menuItemId: '01900000-0000-7000-8000-0000000a1001', quantity: 1, unitPrice: 100 }],
      },
    ]);
    const process = vi
      .spyOn(OrderService, 'processIncomingOrder')
      .mockReturnValue({ id: 'o1' } as unknown as OrderWithLines);

    await runOnce(adapter);

    expect(adapter.fetchPendingOrders).toHaveBeenCalledTimes(1);
    expect(process).toHaveBeenCalledTimes(1);
    expect(adapter.markOrderProcessed).toHaveBeenCalledWith('ext-1');
  });

  it('skips work when stockTakeLock is set', async () => {
    stockTakeLock.value = 'st-in-progress';
    const adapter = makeAdapter([
      {
        externalOrderId: 'ext-2',
        source: 'mock_online',
        placedAt: 1,
        totalAmount: 0,
        notes: null,
        lines: [{ menuItemId: '01900000-0000-7000-8000-0000000a1001', quantity: 1, unitPrice: 0 }],
      },
    ]);
    const process = vi.spyOn(OrderService, 'processIncomingOrder');

    await runOnce(adapter);

    expect(adapter.fetchPendingOrders).not.toHaveBeenCalled();
    expect(process).not.toHaveBeenCalled();
  });

  it('logs and continues when one order fails to process', async () => {
    const adapter = makeAdapter([
      {
        externalOrderId: 'bad',
        source: 'mock_online',
        placedAt: 1,
        totalAmount: 0,
        notes: null,
        lines: [{ menuItemId: 'x', quantity: 1, unitPrice: 0 }],
      },
      {
        externalOrderId: 'good',
        source: 'mock_online',
        placedAt: 2,
        totalAmount: 0,
        notes: null,
        lines: [{ menuItemId: 'x', quantity: 1, unitPrice: 0 }],
      },
    ]);
    const process = vi
      .spyOn(OrderService, 'processIncomingOrder')
      .mockImplementationOnce(() => {
        throw new Error('boom');
      })
      .mockReturnValueOnce({ id: 'good' } as unknown as OrderWithLines);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await runOnce(adapter);

    expect(process).toHaveBeenCalledTimes(2);
    expect(adapter.markOrderProcessed).toHaveBeenCalledTimes(1);
    expect(adapter.markOrderProcessed).toHaveBeenCalledWith('good');
  });
});
