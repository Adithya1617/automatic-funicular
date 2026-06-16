# Deploying Hyprride (web)

The app is a single container (Hono API that also serves the React/PWA bundle)
plus Postgres and Caddy for automatic HTTPS. HTTPS is **required** for staff to
install the PWA on their phones and for secure cookies to work.

## Prerequisites

- A Linux host (small VPS is plenty) with Docker + Docker Compose.
- A domain name (e.g. `hyprride.example.com`) whose DNS A-record points at the
  host's public IP, with ports **80** and **443** open.

## First deploy

```bash
git clone <repo> && cd hyprride
cp .env.prod.example .env
#  -> edit .env: set POSTGRES_PASSWORD, OWNER_PASSWORD, and DOMAIN
docker compose -f docker-compose.prod.yml up -d --build
```

Caddy fetches a Let's Encrypt certificate for `DOMAIN` automatically. Open
`https://DOMAIN`, sign in as `OWNER_EMAIL` / `OWNER_PASSWORD`, and **change the
owner password** (and add staff accounts) from the app.

On phones: open `https://DOMAIN` in Chrome/Safari → "Add to Home Screen" to
install it as an app.

## Bringing your existing data over (one time)

Copy the office PC's `hyprride.sqlite` to the host, then:

```bash
# 1. build better-sqlite3 for system Node (only needed for this script)
npm ci && npm rebuild better-sqlite3
# 2. point DATABASE_URL at the production Postgres (or run inside the network)
DATABASE_URL=postgres://hyprride:<password>@localhost:5432/hyprride \
  npx tsx --tsconfig tsconfig.server.json \
  server/scripts/migrate-from-sqlite.ts /path/to/hyprride.sqlite
```

It REPLACES every domain table with the SQLite rows in one transaction and
leaves the `users` table (your accounts) untouched. Run it once, ideally right
after the first boot and before staff start entering data.

## Updating

```bash
git pull
docker compose -f docker-compose.prod.yml up -d --build
```

Schema migrations run automatically on boot (`openDb()`), and the service worker
auto-updates the installed PWA.

## Notes

- **Backups:** use Postgres backups, e.g. a cron'd
  `docker compose -f docker-compose.prod.yml exec db pg_dump -U hyprride hyprride > backup.sql`.
  (The old SQLite file-copy backup was retired with Electron; scheduled
  in-app backups are slice W6.)
- **PaaS alternative:** the same `Dockerfile` deploys on Render / Railway / Fly,
  paired with their managed Postgres — set `DATABASE_URL`, `OWNER_PASSWORD`,
  `SERVE_WEB=1` as env vars; their platform provides HTTPS, so Caddy isn't
  needed.
- **Local LAN without a domain:** staff get the responsive layout in a phone
  browser, but PWA install + service worker need a secure context — so a real
  HTTPS domain (above) is what makes the installable app work.
