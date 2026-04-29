# Laurans Inventory — engineering memory for Claude Code

This file is the project's operating contract. Read it at the start of every session.
The exhaustive spec is `SPECIFICATION.md`; the kickoff prompt is `CLAUDE_CODE_PROMPT.md`.
This file holds the **decisions that are not open for re-litigation** plus our **working
agreement**. If something here disagrees with `SPECIFICATION.md`, ask — do not silently
deviate.

---

## Working agreement

1. **One slice at a time.** Build vertical slices in the order listed in
   `SPECIFICATION.md` §9 / `CLAUDE_CODE_PROMPT.md` §6. Stop at the end of a slice and
   wait for verification before starting the next.
2. **List every npm package before installing**, with a one-line reason each. Wait for
   approval. Never silently add a dependency.
3. **Never relitigate locked decisions silently.** If a locked decision below is in the
   way, raise it explicitly and ask. Do not work around it.
4. **List the directory tree for non-trivial scaffolding work** before creating files.
5. **No DB writes outside services.** No Electron imports inside services or repositories.
6. **Reconciliation passes or it's a bug.** If app startup logs stock drift, that's a
   real defect — don't suppress it.

---

## Locked architectural decisions (compressed from SPECIFICATION.md §5)

### Stock writes — single chokepoint
`InventoryService.applyMovement(...)` is the **only** function that writes
`Ingredient.stock_quantity`. It writes the `StockMovement` row and updates
`stock_quantity` in the **same transaction**. Every other path that needs to change
stock — purchases, sales, cancellations, production, stock takes, manual adjustments —
goes through it. Direct stock_quantity updates anywhere else are a bug.

### Order cancellations — append-only
Original sale movements are immutable. On cancel:
- *Dish was prepared* → write `wastage` movements (stock NOT restored).
- *Dish was not prepared* → write `sale_reversal` movements (stock restored).
Never edit or delete the original sale rows.

### Recipe versioning — Path A snapshot
Editing a recipe creates a new `RecipeVersion`; old rows are frozen. Each `OrderLine`
captures the active `recipe_version_id` at order placement. Stock deduction at delivery
uses the captured version. Historical orders are not affected by future recipe edits.

### Unit conversion — single module
All conversions go through `shared/utils/unitConverter.ts` (slice 1 ships only the INR
and date helpers; the unit converter lands in slice 1's "proper" build). Conversion
factors live in `shared/constants/unitConversions.ts`. Per-ingredient density overrides
on `Ingredient.density_g_per_ml`. Base units: `g`, `ml`, `each`. **Once an ingredient
has any movement, its `base_unit` is immutable.**

### Cost method — weighted average
On every `purchase` movement, recompute `Ingredient.current_avg_cost_per_unit` as a
weighted average. Each `StockMovement` records `cost_per_unit_at_time` as an immutable
snapshot for accurate historical COGS.

### Stock deduction trigger — on `delivered`
v1 deducts when an order moves to `delivered`. `Ingredient.reserved_quantity` exists in
the schema but is always 0 in v1 (reservations are post-v1).

### Multi-channel ordering — built in from day one
Two mock adapters: `MockOnlineDeliveryAdapter` (`mock_online`) and
`MockOfflinePOSAdapter` (`mock_offline`). All orders feed one `Order` table with a
`source` column. Manual entry (`manual_entry`) is a permanent feature, not a demo
affordance.

### Availability — precomputed cache
`MenuItemAvailability.max_servings_available` is recomputed by
`AvailabilityService.recomputeForIngredients(ids)` after every stock change.
**BoM-aware but not BoM-explosive at availability time** — running out of biryani
masala means dependent dishes are unavailable until a new batch is produced. Don't
explode prepared into raw at availability check time.

### Multi-tenant readiness — every query is tenant-scoped
Every table has a `tenant_id` column. v1 hardcodes `DEFAULT_TENANT_ID = 1`
(`shared/constants/system.ts`). **Every query goes through a tenant-scoped repository
method that filters by `tenant_id`** — even with one tenant. Forgetting this on day
one is how SaaS migrations leak data.

### Audit columns — always present
Every entity table has `created_at`, `updated_at`, `created_by`, `updated_by`. v1
defaults `created_by` / `updated_by` to `SYSTEM_USER_ID`. No migration needed when auth
lands.

### IDs and timestamps
Primary keys are UUID v7 generated server-side. Never trust client-supplied IDs for
new records. Timestamps stored as Unix milliseconds (integer) for portability.

### Polling pauses during stock take
`orderPoller` checks `Application.stockTakeLock` (or equivalent) and skips a tick
when a stock take is in progress. This prevents stock movements from racing with the
counted quantities. Resume on commit or discard.

### IPC seam = the API
The IPC layer between renderer and main is the **only** seam. It is defined entirely
by Zod schemas in `shared/schemas/`. Treat it as a published RPC contract. v3 SaaS
migration replaces this with HTTP, services unchanged.

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

---

## Slice 1 (current) — scaffolding only

**Done when:** `npm run dev` opens an Electron window with a 138px sidebar, top bar,
and the 8 placeholder routes navigable. No DB, no IPC handlers (preload exposes a
`ping` stub for wiring proof only).

**Stack installed:** Electron + electron-vite + React 18 + TypeScript (strict) +
Tailwind v3 + lucide-react + react-router-dom + zod. shadcn primitives added per-need
in later slices.

**Color tokens, density, sidebar/top-bar layout** — sourced from
`files/laurans-wireframes/WIREFRAMES.md` § 0. CSS variables live in
`renderer/styles/globals.css` and are exposed to Tailwind via `tailwind.config.ts`.

**Already in `shared/`:**
- `constants/system.ts` — `DEFAULT_TENANT_ID`, `SYSTEM_USER_ID`.
- `schemas/ping.ts` — proof-of-wiring Zod schema.
- `utils/currency.ts` — `formatINR()` (Indian comma grouping).
- `utils/date.ts` — `formatDateDMY()` (dd/mm/yyyy).
