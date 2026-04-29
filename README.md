# Laurans Inventory

Restaurant inventory management for Laurans Food Court (Hyderabad). Single-tenant
Windows desktop app, architected for future multi-tenant SaaS migration.

See [`SPECIFICATION.md`](./SPECIFICATION.md) for the full functional spec,
[`CLAUDE_CODE_PROMPT.md`](./CLAUDE_CODE_PROMPT.md) for the engineering contract, and
[`CLAUDE.md`](./CLAUDE.md) for the working agreement and locked decisions.

## Status

**Slice 1 (scaffolding only).** App shell + placeholder routes. No database, no real
features yet.

## Requirements

- Node.js 20.x or 22.x
- npm 10+
- Linux/macOS for development; Windows is the target deployment platform.

## Run

```bash
npm install
npm run dev
```

The Electron window opens with the sidebar shell. The 8 routes (Dashboard,
Live orders, Ingredients, Menu, Invoices, Stock take, CSV import, Settings) all
render their placeholder. Dashboard is the landing route.

## Other scripts

```bash
npm run typecheck   # tsc --noEmit on both renderer and main/preload/shared
npm run build       # electron-vite build (no installer yet — slice 9)
```

## Layout

```
main/      Electron main process (backend, future home of services + DB)
preload/   contextBridge surface — currently a ping stub
renderer/  React UI (Vite-served in dev)
shared/    Zod schemas, constants, utils consumed by both processes
```
