import { z } from 'zod';

/**
 * Permissive UUID matcher that accepts v1–v7 (Zod's built-in `.uuid()`
 * rejects v7 in some versions). Server-side IDs are always UUID v7.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-7][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const idSchema = z.string().regex(UUID_RE, 'Expected UUID');
