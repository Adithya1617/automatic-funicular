import type { IpcResult } from '@shared/schemas/ipc';

export class IpcError extends Error {
  readonly code: string;
  readonly fields?: Record<string, string>;

  constructor(code: string, message: string, fields?: Record<string, string>) {
    super(message);
    this.name = 'IpcError';
    this.code = code;
    if (fields) this.fields = fields;
  }
}

/**
 * Resolve an IpcResult into a value, or throw `IpcError` so TanStack Query
 * sees it as a rejection. Renderer code never has to switch on `ok`.
 */
export async function unwrap<T>(promise: Promise<IpcResult<T>>): Promise<T> {
  const result = await promise;
  if (result.ok) return result.data;
  throw new IpcError(result.error.code, result.error.message, result.error.fields);
}
