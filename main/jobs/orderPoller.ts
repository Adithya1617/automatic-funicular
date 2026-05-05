import { getDb } from '../db/client';
import { orderingChannelRepository } from '../repositories/orderingChannelRepository';
import { orderingAdapterRegistry } from '../adapters/ordering/registry';
import { OrderService } from '../services/OrderService';
import { stockTakeLock } from '../lib/stockTakeLock';
import { DEFAULT_TENANT_ID } from '@shared/constants/system';
import type { OrderingServiceAdapter } from '@shared/adapters/OrderingServiceAdapter';

type Timer = ReturnType<typeof setInterval>;

const timers = new Map<string, Timer>();

/**
 * Start an interval per enabled adapter on its configured polling interval.
 * Each tick: skip if a stock take is in progress; otherwise drain the
 * adapter's pending queue and route through OrderService.
 */
export function startOrderPoller(): void {
  stopOrderPoller();
  const channels = orderingChannelRepository.list(getDb().db, DEFAULT_TENANT_ID, true);
  for (const channel of channels) {
    const adapter = orderingAdapterRegistry.get(channel.key as Parameters<typeof orderingAdapterRegistry.get>[0]);
    if (!adapter) continue;
    const intervalMs = Math.max(1, channel.pollingIntervalSeconds) * 1000;
    const timer = setInterval(() => {
      void runOnce(adapter);
    }, intervalMs);
    timers.set(channel.key, timer);
  }
}

export function stopOrderPoller(): void {
  for (const timer of timers.values()) clearInterval(timer);
  timers.clear();
}

/**
 * Single-tick worker; exported for tests so they can drive the poller
 * deterministically without waiting on `setInterval`.
 */
export async function runOnce(adapter: OrderingServiceAdapter): Promise<void> {
  if (stockTakeLock.value) return;
  const orders = await adapter.fetchPendingOrders();
  for (const external of orders) {
    try {
      OrderService.processIncomingOrder(getDb().db, DEFAULT_TENANT_ID, external);
      if (adapter.markOrderProcessed) {
        await adapter.markOrderProcessed(external.externalOrderId);
      }
    } catch (err) {
      // Don't crash the poller on a single bad order — log and continue.
      console.error(
        `[orderPoller] failed to process ${external.source}/${external.externalOrderId}:`,
        err,
      );
    }
  }
}
