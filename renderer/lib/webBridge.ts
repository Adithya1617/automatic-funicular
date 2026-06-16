import { IPC, type IpcResult } from '@shared/schemas/ipc';
import type { HyprrideBridge } from '@shared/bridge';

/**
 * Browser transport for the IPC bridge.
 *
 * Under Electron, `window.hyprride` is provided by the preload contextBridge.
 * In a plain browser it's absent, so we synthesize an identically-shaped object
 * (driven off the `IPC` channel registry) whose every method POSTs to the Hono
 * API and returns the same `{ ok, data }` / `{ ok, error }` envelope. Because
 * the shape and return type match `HyprrideBridge` exactly, every renderer hook
 * and `unwrap()` keeps working unchanged.
 */

// Same-origin by default (dev: Vite proxies /api → API; prod: served together).
// Override with VITE_API_URL to point at a different API origin.
const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? '';

async function call(channel: string, input: unknown): Promise<IpcResult<unknown>> {
  const path = channel.replace(':', '/'); // 'ingredient:list' -> 'ingredient/list'
  try {
    const res = await fetch(`${API_BASE}/api/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include', // send the session cookie
      body: JSON.stringify(input ?? {}),
    });
    const text = await res.text();
    let result: IpcResult<unknown>;
    try {
      result = JSON.parse(text) as IpcResult<unknown>;
    } catch {
      // Non-JSON body (e.g. a 404 for a not-yet-implemented route) — surface it
      // as the same error envelope shape so unwrap() throws an IpcError.
      result = {
        ok: false,
        error: {
          code: 'UNKNOWN',
          message: `HTTP ${res.status}: ${text.slice(0, 200) || res.statusText}`,
        },
      };
    }
    // Session expired mid-use → let the app drop back to the login screen.
    if (!result.ok && result.error.code === 'UNAUTHENTICATED' && typeof window !== 'undefined') {
      window.dispatchEvent(new Event('hyprride:unauthenticated'));
    }
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: { code: 'UNKNOWN', message: `Network error: ${message}` } };
  }
}

function buildBridge(): HyprrideBridge {
  const bridge: Record<string, Record<string, (input: unknown) => Promise<IpcResult<unknown>>>> = {};
  for (const [domain, methods] of Object.entries(IPC)) {
    const group: Record<string, (input: unknown) => Promise<IpcResult<unknown>>> = {};
    for (const [method, channel] of Object.entries(methods)) {
      group[method] = (input: unknown) => call(channel, input);
    }
    bridge[domain] = group;
  }
  return bridge as unknown as HyprrideBridge;
}

/**
 * Installs the fetch bridge as `window.hyprride` when the Electron preload
 * bridge is absent (i.e. running in a browser). No-op under Electron.
 */
export function installWebBridge(): void {
  if (typeof window === 'undefined') return;
  if (!window.hyprride) {
    window.hyprride = buildBridge();
  }
}
