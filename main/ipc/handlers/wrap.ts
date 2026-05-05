import type { z } from 'zod';
import { isDomainError } from '@shared/errors/DomainError';
import type { IpcResult } from '@shared/schemas/ipc';

/**
 * Wraps a service call as an IPC handler:
 *   - parses the input through the schema
 *   - invokes the handler
 *   - serializes domain errors into IpcResult.error
 * Handlers stay 3 lines: parse, call service, return.
 */
export function makeHandler<TSchema extends z.ZodTypeAny, TOutput>(
  schema: TSchema,
  fn: (input: z.output<TSchema>) => TOutput | Promise<TOutput>,
): (_event: unknown, raw: unknown) => Promise<IpcResult<TOutput>> {
  return async (_event, raw) => {
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      return {
        ok: false,
        error: {
          code: 'VALIDATION',
          message: parsed.error.issues
            .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
            .join('; '),
        },
      };
    }
    try {
      const data = await fn(parsed.data);
      return { ok: true, data };
    } catch (err) {
      if (isDomainError(err)) {
        const error: IpcResult<TOutput> = {
          ok: false,
          error: { code: err.code, message: err.message },
        };
        if (err.fields) (error as { ok: false; error: { fields?: Record<string, string> } }).error.fields = err.fields;
        return error;
      }
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, error: { code: 'UNKNOWN', message } };
    }
  };
}
