import { ipcMain } from 'electron';
import { getDb } from '../../db/client';
import { orderingChannelRepository } from '../../repositories/orderingChannelRepository';
import { DEFAULT_TENANT_ID } from '@shared/constants/system';
import { IPC } from '@shared/schemas/ipc';
import {
  listOrderingChannelsInputSchema,
  type OrderingChannel,
} from '@shared/schemas/ordering';
import { makeHandler } from './wrap';

export function registerOrderingChannelHandlers(): void {
  ipcMain.handle(
    IPC.orderingChannel.list,
    makeHandler(listOrderingChannelsInputSchema, (input) => {
      const rows = orderingChannelRepository.list(
        getDb().db,
        DEFAULT_TENANT_ID,
        input.enabledOnly,
      );
      return rows as unknown as OrderingChannel[];
    }),
  );
}
