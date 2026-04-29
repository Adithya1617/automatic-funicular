import { z } from 'zod';

export const pingResponseSchema = z.literal('pong');
export type PingResponse = z.infer<typeof pingResponseSchema>;
