# Hyprride Inventory

Servicing & parts inventory management for **Hyprride Bike Rentals**
(Madhapur, Hyderabad). Single-tenant Windows desktop app, architected for
future multi-tenant SaaS migration.

> This branch (`hyprride`) is a fork of the **Laurans Food Court** restaurant
> inventory codebase on `main`. Architectural decisions carry over verbatim;
> the domain model is being retargeted to bikes, parts, and service events.
> Laurans stays alive on `main`.

See [`CLAUDE.md`](./CLAUDE.md) for the operating contract, locked decisions,
and slice plan. The historical Laurans spec
([`SPECIFICATION.md`](./SPECIFICATION.md),
[`CLAUDE_CODE_PROMPT.md`](./CLAUDE_CODE_PROMPT.md)) remains for context.

## Status

**Slice H1 (rebrand only).** Branding, DB filename, and IPC bridge swapped
from Laurans → Hyprride. Underlying data model and routes are still the
restaurant ones — they get retargeted in slices H2–H9.

## Requirements

- Node.js 20.x or 22.x
- npm 10+
- Linux/macOS for development; Windows is the target deployment platform.

## Run

```bash
npm install
npm run dev
```

## Other scripts

```bash
npm run typecheck   # tsc --noEmit on both renderer and main/preload/shared
npm run build       # electron-vite build
npm run test        # vitest
npm run package:win # Windows installer (NSIS)
```

## Layout

```
main/      Electron main process (services, repos, DB, IPC, jobs)
preload/   contextBridge surface — exposes window.hyprride
renderer/  React UI (Vite-served in dev)
shared/    Zod schemas, constants, utils consumed by both processes
```
