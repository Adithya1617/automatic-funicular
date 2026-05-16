# Hyprride Inventory — engineering memory for Claude Code

This file is the project's operating contract. Read it at the start of every session.

This codebase started as **Laurans Food Court** (restaurant inventory). The
`hyprride` branch forks it for **Hyprride Bike Rentals** (Madhapur, Hyderabad) —
a scooter/bike rental service with ~40 bikes that needs to track parts (oil,
brake pads, filters, etc.), supplier invoices, and per-bike servicing cost.
**Laurans stays alive on `main`; do not back-port Hyprride changes to it.**

The original Laurans spec lives at `SPECIFICATION.md` / `CLAUDE_CODE_PROMPT.md`
— it's historical context, not the contract for this branch. When this file
disagrees with those, **this file wins**.

---

## Working agreement

1. **One slice at a time.** Build vertical slices in the order in §"Slice plan"
   below. Stop at the end of a slice and wait for verification before starting
   the next.
2. **List every npm package before installing**, with a one-line reason each.
   Wait for approval. Never silently add a dependency.
3. **Never relitigate locked decisions silently.** If a locked decision below is
   in the way, raise it explicitly and ask. Do not work around it.
4. **List the directory tree for non-trivial scaffolding work** before creating
   files.
5. **No DB writes outside services.** No Electron imports inside services or
   repositories.
6. **Reconciliation passes or it's a bug.** If app startup logs stock drift,
   that's a real defect — don't suppress it.

---

## Domain model (Hyprride)

| Concept | Table / module | Notes |
|---|---|---|
| Part | `ingredients` (table not yet renamed; UI label flips slice-by-slice) | Oil, brake pads, brake fluid, air filter, etc. `base_unit` is `ml` / `L` / `each`. Stock + weighted-avg cost behaviour is unchanged. |
| Supplier | `suppliers` | Bosch, Castrol, local shop. Same model as Laurans. |
| Invoice (+ PDF parsing) | `invoices` / `invoice_lines` | Owner uploads supplier bills; commits write one `purchase` movement per line. |
| Bike type | (new in slice H4) `bike_types` | Fixed enum-style rows: `110cc Activa`, `125cc Ntorq`, `160cc Apache RTR`. |
| Bike | (new in slice H2) `bikes` | ~40 instances. `bike_number` unique, `bike_type_id` FK, optional plate / odometer / notes. |
| Service template | (new in slice H4) reuses RecipeVersion-style versioning per bike type | "Standard service", "Oil change", "Brake job". Versioned — edits create new version; past service events keep their snapshot. **Optional** as of H10: the primary flow doesn't use templates. |
| Service event | (new in slice H5, ad-hoc flow added H10) replaces `orders` | Linked to one bike. `service_template_id` / `..._version_id` are **nullable** — the primary "Start servicing" UX is ad-hoc (operator ticks parts, stock deducts in one tx via `ServiceService.createAdHoc`). Template-driven events still capture the active version at create time (Path A snapshot). Status: `in_progress → completed`, with `cancelled` as a terminal state. On `completed` (or one-shot ad-hoc create), deducts parts via `applyMovement`. |
| Stock take | `stock_takes` | Unchanged. |
| Dashboard | rebuilt slice H6 | Bike-centric tiles: cost per bike, cost per bike type, parts consumed, top-consumed parts, low stock, reorder suggestions, service volume by bike type, wastage, theoretical service cost per template. |
| CSV importer | retarget slice H8 | Kinds become `parts`, `suppliers`, `bikes`, `service_templates`. |

Modules to **delete** in slice H7: mock ordering adapters
(`MockOnlineDeliveryAdapter`, `MockOfflinePOSAdapter`), `orderPoller`,
`menuItemAvailability` cache, production batches. Bike-rental servicing is
manual-entry only — no POS feed, no production runs.

---

## Locked architectural decisions

These carry over from Laurans because they're sound and orthogonal to domain.
Renamed for clarity where needed; the *rule* doesn't change.

### Stock writes — single chokepoint
`InventoryService.applyMovement(...)` is the **only** function that writes
`Ingredient.stock_quantity` (will be renamed to Part later). It writes the
`StockMovement` row and updates the part's stock in the **same transaction**.
Every other path that needs to change stock — purchases, service consumption,
service cancellations, stock takes, manual adjustments — goes through it.
Direct stock_quantity updates anywhere else are a bug.

### Service cancellations — append-only
Original consumption movements are immutable. On cancel:
- *Parts were actually used / installed* → write `wastage` movements (stock NOT restored).
- *Parts were not yet used* → write `sale_reversal`-equivalent movements (stock restored).

Never edit or delete the original consumption rows. (Same pattern as Laurans's
order cancellation logic — just renamed.)

### Template versioning — snapshot per event
Editing a service template creates a new version; old version rows are frozen.
Each service event captures the active `service_template_version_id` at draft
creation. Stock deduction on completion uses the captured version. Historical
service events are not affected by future template edits.

### Unit conversion — single module
All conversions go through `shared/utils/unitConverter.ts`. Conversion factors
live in `shared/constants/unitConversions.ts`. Per-part density overrides on
`Ingredient.density_g_per_ml` (oils especially: SAE 10W30, 20W50, etc., often
specified by manufacturer in mL but invoiced in L). Base units: `g`, `ml`,
`each`. **Once a part has any movement, its `base_unit` is immutable.**

### Cost method — weighted average
On every `purchase` movement, recompute `currentAvgCostPerUnit` as a weighted
average. Each `StockMovement` records `cost_per_unit_at_time` as an immutable
snapshot for accurate historical cost-of-servicing.

### Stock deduction trigger — on `completed`
Service events deduct parts when status moves to `completed`. (The
`reserved_quantity` column from Laurans's schema is kept but always 0 in v1.)

### Multi-tenant readiness — every query is tenant-scoped
Every table has a `tenant_id` column. v1 hardcodes `DEFAULT_TENANT_ID = 1`
(`shared/constants/system.ts`). **Every query goes through a tenant-scoped
repository method that filters by `tenant_id`** — even with one tenant.

### Audit columns — always present
Every entity table has `created_at`, `updated_at`, `created_by`, `updated_by`.
v1 defaults `created_by` / `updated_by` to `SYSTEM_USER_ID`.

### IDs and timestamps
Primary keys are UUID v7 generated server-side. Never trust client-supplied IDs
for new records. Timestamps stored as Unix milliseconds (integer).

### IPC seam = the API
The IPC layer between renderer and main is the **only** seam. It is defined
entirely by Zod schemas in `shared/schemas/`. Treat it as a published RPC
contract. The preload bridge is now `window.hyprride` (was `window.laurans`).

---

## Forbidden in v1 code

- SQLite-only SQL (e.g. `INSERT OR REPLACE`) — must be PostgreSQL-compatible.
- Auto-increment integer primary keys — UUID v7 only.
- Direct `stock_quantity` writes outside `InventoryService.applyMovement`.
- Electron API imports inside `services/` or `repositories/`.
- Business logic inside IPC handlers — handlers are 3-line pass-throughs.
- Renderer importing from `main/` — only `shared/` and the contextBridge surface.
- Storing absolute file paths — paths are relative to `userData`.
- Skipping the `tenant_id` filter "because there's only one tenant."
- Back-porting Hyprride changes onto `main` (the Laurans branch).

---

## Slice plan (Hyprride)

| # | Status | Scope |
|---|---|---|
| H1 | done | **Rebrand.** package.json, electron-builder, app title, sidebar logo, NotInElectron copy. SQLite filename `laurans.sqlite` → `hyprride.sqlite`. Preload bridge `window.laurans` → `window.hyprride` (+ `HyprrideBridge` type). Default tenant name "Hyprride Bike Rentals". CSV / report / backup filename prefixes flipped. CLAUDE.md rewritten as the Hyprride contract. **No DB schema changes; routes & module names unchanged for now — they get renamed module-by-module in subsequent slices.** |
| H2 | pending | **Bikes table + bike CRUD.** New migration: `bike_types` (3 seed rows) + `bikes`. `BikeService`, `BikeRepository`, `/bikes` list page + editor. Replace `/menu` nav entry → `/bikes`. Menu pages can stay alive in code for now (deleted in H7); we just stop linking to them. |
| H3 | pending | **Rename ingredients UI → "Parts".** Add a `category` preset list (Oil / Brake / Filter / Tyre / Misc) shown in the editor (column already exists). Route `/ingredients` → `/parts`. Underlying table can stay `ingredients` for now (table rename punted). |
| H4 | pending | **Service templates** (versioned, replaces menu/recipes UI). Reuse `RecipeService` internals; new IPC surface (`serviceTemplate.*`). Each template belongs to a `bike_type_id`. |
| H5 | pending | **Service events** (replaces orders). New table, `ServiceService.complete(...)` calls `InventoryService.applyMovement` per template line. Cancel logic mirrors Laurans. Manual entry only — no adapters. |
| H6 | pending | **Bike-centric dashboard** (tiles described in §"Domain model"). |
| H7 | pending | **Code deletion.** Drop `MockOnlineDeliveryAdapter`, `MockOfflinePOSAdapter`, `orderPoller`, `menuItemAvailability` cache, production batches module, old menu pages. IPC cleanup. |
| H8 | pending | **CSV importer retargeting.** Kinds: `parts`, `suppliers`, `bikes`, `service_templates`. Drop `menu_items` / `recipes` template variants. |
| H9 | pending | **Settings rebrand + about page.** New About copy for Hyprride. Optionally rename underlying tables (`ingredients`→`parts`, `orders`→`service_events`) via Drizzle migration if appetite; otherwise punt further. |
| H10 | pending | **Ad-hoc "Start servicing" flow.** Migration 0012 nullable `service_events.service_template_id` / `..._version_id`; new `ServiceService.createAdHoc(bikeId, lines[])` creates + completes in one tx, deducting stock; `QuickServiceDialog` (bike picker + part checkboxes with quantity inputs) becomes the primary Services tab entry point. |

---

## Active deferred work

- **First-boot auto-restore prompt** (carried over from Laurans slice 10): when
  the app launches with no `hyprride.sqlite` but a configured backup folder
  containing one or more snapshots, offer to restore from the most recent.
- **Weekly + monthly retention** layered on top of daily-30 (carried over).
- **PDF preview in-app** for invoice attachments (carried over).
- **Reverse-invoice flow** (carried over).
- **Table renames** (`ingredients` → `parts`, `orders` → `service_events`) —
  punted to slice H9 or beyond. UI labels change earlier; SQL identifiers can
  wait so we don't churn migrations mid-feature.

---

## Dev quirks worth remembering

- **`ELECTRON_RUN_AS_NODE=1` in this shell** — npm scripts prefix with
  `env -u ELECTRON_RUN_AS_NODE` so Electron actually runs as Electron.
- **`better-sqlite3` ABI** — `@electron/rebuild` builds it against Electron's
  Node on `postinstall`. Vitest runs on system Node, so DB-touching tests
  **mock the repos**. If a future slice insists on real DB tests, add a
  `pretest npm rebuild better-sqlite3` and a `posttest` re-rebuild.
- **shadcn primitives** are hand-written in `renderer/components/ui/`. Don't
  run the shadcn CLI without checking — it'll overwrite tweaked classNames.
- **IPC handlers stay 3 lines.** Anything bigger means logic crept out of the
  service. `makeHandler(schema, fn)` enforces this shape.
- **DevTools toggle env var is now `HYPRRIDE_DEVTOOLS=1`** (was `LAURANS_DEVTOOLS`).
