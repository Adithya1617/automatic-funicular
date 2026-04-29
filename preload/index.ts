import { contextBridge } from 'electron';

const api = {
  ping: async (): Promise<'pong'> => 'pong',
} as const;

export type LauransBridge = typeof api;

contextBridge.exposeInMainWorld('laurans', api);
