import { AsyncLocalStorage } from 'node:async_hooks';
import { DEFAULT_TENANT_ID, SYSTEM_USER_ID } from '@shared/constants/system';
import type { AuthUser } from '@shared/schemas/auth';

/**
 * Per-request context. The auth middleware validates the session cookie and
 * runs the rest of the request inside `runWithUser`, so the existing
 * `makeHandler` route fns (which only receive `input`) can still read the
 * authenticated user via `currentUser()` / `currentActorId()` — letting us
 * thread the real user id into created_by/updated_by without changing the
 * IPC-shared handler signature.
 */
type RequestStore = { user: AuthUser };

const storage = new AsyncLocalStorage<RequestStore>();

export function runWithUser<T>(user: AuthUser, fn: () => T): T {
  return storage.run({ user }, fn);
}

export function currentUser(): AuthUser | undefined {
  return storage.getStore()?.user;
}

/** Acting user id for audit columns; SYSTEM_USER_ID when unauthenticated. */
export function currentActorId(): string {
  return storage.getStore()?.user.id ?? SYSTEM_USER_ID;
}

/** v1 is single-tenant; sourced here so call sites don't hardcode it. */
export function currentTenantId(): number {
  return DEFAULT_TENANT_ID;
}
