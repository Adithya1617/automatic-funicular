import type { Context, Next } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { getDb } from '../db/client';
import { AuthService, SESSION_TTL_MS } from '../../main/services/AuthService';
import { loginInputSchema } from '@shared/schemas/auth';
import type { AuthUser } from '@shared/schemas/auth';
import { isDomainError } from '@shared/errors/DomainError';
import { currentTenantId, runWithUser } from './requestContext';

// Lets `c.set('user', ...)` / `c.get('user')` be typed across the app.
declare module 'hono' {
  interface ContextVariableMap {
    user: AuthUser;
  }
}

export const SESSION_COOKIE = 'hyprride_session';

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'Lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  };
}

/** POST /api/auth/login — public. Sets the session cookie, returns the user. */
export async function loginHandler(c: Context): Promise<Response> {
  let body: unknown = {};
  try {
    body = await c.req.json();
  } catch {
    body = {};
  }
  const parsed = loginInputSchema.safeParse(body);
  if (!parsed.success) {
    const message = parsed.error.issues
      .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('; ');
    return c.json({ ok: false, error: { code: 'VALIDATION', message } }, 400);
  }
  try {
    const { user, token } = await AuthService.login(
      getDb().db,
      currentTenantId(),
      parsed.data.email,
      parsed.data.password,
    );
    setCookie(c, SESSION_COOKIE, token, cookieOptions());
    return c.json({ ok: true, data: user });
  } catch (err) {
    if (isDomainError(err)) {
      return c.json({ ok: false, error: { code: err.code, message: err.message } }, 401);
    }
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ ok: false, error: { code: 'UNKNOWN', message } }, 500);
  }
}

/** POST /api/auth/logout — clears the session + cookie. Idempotent. */
export async function logoutHandler(c: Context): Promise<Response> {
  const token = getCookie(c, SESSION_COOKIE);
  await AuthService.logout(getDb().db, token);
  deleteCookie(c, SESSION_COOKIE, { path: '/' });
  return c.json({ ok: true, data: { ok: true } });
}

/** GET /api/auth/me — the signed-in user (auth middleware guarantees one). */
export function meHandler(c: Context): Response {
  const user = c.get('user') as AuthUser | undefined;
  if (!user) {
    return c.json({ ok: false, error: { code: 'UNAUTHENTICATED', message: 'Not signed in' } }, 401);
  }
  return c.json({ ok: true, data: user });
}

/**
 * Auth gate for /api/* (registered after the public login route). Validates the
 * session cookie, stashes the user on the context, and runs the rest of the
 * request inside the AsyncLocalStorage scope so route fns can read it.
 */
export async function authMiddleware(c: Context, next: Next): Promise<Response | void> {
  const token = getCookie(c, SESSION_COOKIE);
  const user = await AuthService.validateSession(getDb().db, token);
  if (!user) {
    return c.json(
      { ok: false, error: { code: 'UNAUTHENTICATED', message: 'Sign in to continue' } },
      401,
    );
  }
  c.set('user', user);
  return runWithUser(user, () => next());
}

// Routes only the owner may call.
const OWNER_ONLY = new Set([
  'user/list',
  'user/create',
  'user/deactivate',
  'demo/seed',
  'demo/seedBikes',
  'demo/reset',
  'appSettings/setBackupFolder',
  'appSettings/setBackupTime',
]);

/** Blocks owner-only routes for staff (runs after authMiddleware). */
export async function ownerGuard(c: Context, next: Next): Promise<Response | void> {
  const key = c.req.path.replace(/^\/api\//, '');
  const user = c.get('user') as AuthUser | undefined;
  if (OWNER_ONLY.has(key) && user?.role !== 'owner') {
    return c.json(
      { ok: false, error: { code: 'FORBIDDEN', message: 'Owner access required' } },
      403,
    );
  }
  return next();
}
