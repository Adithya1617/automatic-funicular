import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serveStatic } from '@hono/node-server/serve-static';
import { routes } from './routes';
import {
  authMiddleware,
  loginHandler,
  logoutHandler,
  meHandler,
  ownerGuard,
} from './auth';

/**
 * Builds the Hono app. Middleware order matters (Hono wraps routes registered
 * after a `use`):
 *   1. CORS (credentials on, for cookie auth)
 *   2. public:  POST /api/auth/login, GET /health
 *   3. authMiddleware — every later /api/* route requires a valid session
 *   4. ownerGuard     — owner-only routes reject staff
 *   5. the route registry (each `POST /api/<key>`) + logout/me
 *
 * Each registry route returns the `{ ok, data }` / `{ ok, error }` envelope as
 * JSON, so the renderer's `unwrap()` is unchanged.
 */
export function createApp(): Hono {
  const app = new Hono();

  // Credentials must be allowed so the browser sends the session cookie.
  // (In dev the Vite proxy makes this same-origin, so CORS isn't triggered.)
  app.use('/api/*', cors({ origin: (o) => o ?? '*', credentials: true }));

  app.get('/health', (c) => c.json({ ok: true, service: 'hyprride-api' }));

  // Public — must be reachable without a session.
  app.post('/api/auth/login', loginHandler);

  // Everything below requires a valid session.
  app.use('/api/*', authMiddleware);
  app.use('/api/*', ownerGuard);

  app.post('/api/auth/logout', logoutHandler);
  app.get('/api/auth/me', meHandler);

  for (const [key, handler] of Object.entries(routes)) {
    app.post(`/api/${key}`, async (c) => {
      let body: unknown = {};
      try {
        body = await c.req.json();
      } catch {
        body = {};
      }
      const result = await handler(null, body);
      return c.json(result);
    });
  }

  // Production: serve the built web bundle from the same origin (no CORS), with
  // SPA fallback to index.html. In dev the Vite server serves the renderer, so
  // this is gated on SERVE_WEB=1. Registered last so it never shadows /api.
  if (process.env.SERVE_WEB === '1') {
    const root = process.env.WEB_ROOT ?? './out/web';
    app.use('/*', serveStatic({ root }));
    app.get('*', serveStatic({ path: 'index.html', root }));
  }

  return app;
}
