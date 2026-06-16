import type { AuthUser, LoginInput } from '@shared/schemas/auth';
import type { IpcResult } from '@shared/schemas/ipc';

// Same default as the bridge: same-origin (dev proxy / prod); override via env.
const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? '';

async function authFetch<T>(path: string, init?: RequestInit): Promise<IpcResult<T>> {
  try {
    const res = await fetch(`${API_BASE}${path}`, { credentials: 'include', ...init });
    const text = await res.text();
    try {
      return JSON.parse(text) as IpcResult<T>;
    } catch {
      return { ok: false, error: { code: 'UNKNOWN', message: `HTTP ${res.status}` } };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: { code: 'UNKNOWN', message: `Network error: ${message}` } };
  }
}

/** The signed-in user, or null if there's no valid session. */
export async function fetchMe(): Promise<AuthUser | null> {
  const r = await authFetch<AuthUser>('/api/auth/me');
  return r.ok ? r.data : null;
}

export async function loginRequest(input: LoginInput): Promise<AuthUser> {
  const r = await authFetch<AuthUser>('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!r.ok) throw new Error(r.error.message);
  return r.data;
}

export async function logoutRequest(): Promise<void> {
  await authFetch('/api/auth/logout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
}
