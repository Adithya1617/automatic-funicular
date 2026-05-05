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
All conversions go through `shared/utils/unitConverter.ts` (lands in slice 2 alongside
the first `InventoryService.applyMovement` callers; slice 1 ships only the INR and
dd/mm/yyyy helpers in `shared/utils/`). Conversion factors live in
`shared/constants/unitConversions.ts`. Per-ingredient density overrides on
`Ingredient.density_g_per_ml`. Base units: `g`, `ml`, `each`. **Once an ingredient
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

## Slice progress

| # | Status | Scope |
|---|---|---|
| 1 | done | App shell, 8 placeholder routes, INR + dd/mm/yyyy helpers in `shared/`. |
| 2 | done | DB + migrations, `InventoryService.applyMovement`, ingredient & supplier CRUD, manual stock adjustment, movement ledger tab, reconciliation on boot. |
| 3 | done | Recipe versions + BoM (cycle detection, `MAX_BOM_DEPTH=5`), production batches with `production_input`/`production_output`/`prep_loss` movements. Recipe + Batches tabs on prepared ingredients only. |
| 4 | done | Menu items + variants + availability cache. `RecipeService` now handles `parent_type='menu_item'`. `AvailabilityService.recomputeForIngredients` (BoM-aware invalidation, non-explosive computation per §3.9) hooked post-commit on `applyMovement`; `recordBatch` skips per-call recompute and unions affected ids once at the end. Menu list with availability badges, full menu editor with drag-to-reorder recipe rows, recipe diff modal. |
| 5 | done | Mock ordering adapters (`MockOnlineDeliveryAdapter`, `MockOfflinePOSAdapter`) + `orderPoller` (per-channel `setInterval`, skips while `stockTakeLock` is set). `OrderService` handles placement (Path A recipe-version snapshot per line), `markPreparing`/`markDelivered` (BoM-walked `sale` movements), and cancellation per locked decision §3.2 — `delivered + alreadyPrepared=false` → `sale_reversal`, `delivered + alreadyPrepared=true` → `wastage` (over-deducts stock; reconciliation passes, operator corrects via stock take). `/orders/live` feed (5s refetch, filter chips, source filter) + `/orders/new` manual entry with channel routing. |
| 6 | done | Invoice entry with smart memory + PDF storage + supplier mappings. `InvoiceService.commit` writes one `purchase` movement per line via `applyMovement` and upserts `supplier_item_mappings(supplier_id, raw_description)` per line. `InventoryService.applyMovement` now recomputes `currentAvgCostPerUnit` (weighted-avg, locked decision §3.5) on `purchase` and `production_output` movements; cost is normalised to per-base-unit before storage. `ProductionService.recordBatch` computes total input cost / expected_yield as the `production_output` cost — slice-3 deferral closed. `LocalDiskStorage` (`FileStorage` interface in `shared/`) backs PDF attachments at `userData/files/invoices/{id}.pdf`. Renderer: invoices list, full editor with PDF drop zone, line-item rows with supplier-history popover, totals card, draft → committed transition. |
| 7 | done | Stock take flow. `StockTakeService.start` snapshots active ingredients into `stock_take_lines.book_quantity` and sets the cross-module `stockTakeLock` so the order poller pauses until the take closes. `saveCount` is per-row save-as-you-go. `commit` walks every line; for each `counted ≠ book` it writes one `adjustment` movement (in the ingredient's base unit) via `applyMovement` with `referenceType='stock_take'`; uncounted lines are skipped, zero-diff lines just record a 0 difference. `discard` closes the take untouched. Both terminal paths free the lock and union-recompute availability. Renderer: single page that flips between Start (notes + past takes), Count (single-page input list with live diff + counted progress), and Review &amp; commit (variances summary + commit). |
| 8 | done | Dashboard + reports + CSV exports. New `DashboardService` covers all 10 tiles in spec §7.9: stock value (now + daily-bucketed sparkline), spending (totals + by-category + top ingredients), COGS (by menu item via the `order_line` referenceId on `sale` movements), wastage (by reason + top ingredients), top dishes, low stock (consumption-rate driven days-remaining), reorder suggestions (lead time + 7-day buffer; default `REORDER_LEAD_TIME_DAYS=7` in `shared/constants/system.ts`), theoretical food cost % per dish, revenue by channel (delivered orders), order volume by channel (all placed). New repos `*.listInRange / listSince / listForOrders / listForInvoices / listCommittedInRange` keep date-bounded queries indexed. `InventoryService.applyMovement` now snapshots `currentAvgCostPerUnit` onto every `sale / sale_reversal / wastage / prep_loss / staff_meal / adjustment` movement that ships without an explicit cost — closes spec §5.5's "every movement carries a cost snapshot" gap so COGS / wastage reports actually have numbers to multiply. New `ReportService.export` writes RFC-4180 CSV (`shared/utils/csv.ts`) for movements / COGS / spending; renderer downloads via Blob URL. Renderer: rebuilt `DashboardPage` with global date-range picker (Today / This week / This month / Last 30 / This year / Custom + YoY compare toggle), Recharts sparkline + bar charts, 10 tile components in [`renderer/features/dashboard/`](renderer/features/dashboard/), `ExportButtons`. |
| 9 | done | CSV importer. New `CsvImportService.run({ kind, content, dryRun })` handles ingredients / suppliers / menu_items / recipes per spec §7.10. Two-pass: validation collects all per-row issues with line numbers, then a single transaction commits when `dryRun=false` and there are zero issues. Idempotent: existing entities are matched by name (case-insensitive) and updated, never duplicated. Ingredients refuse `base_unit` change once movements exist (locked decision §3.4). Menu-items mint one shared `variant_group_id` per `variant_group` label within a single import. Recipes group rows by parent and call `RecipeService.saveVersion` once per parent so each commit creates a new `RecipeVersion` (locked decision §3.3); validates parent exists, prepared-only for ingredient parents, child exists, unit converts. Hand-rolled RFC-4180 parser in [`shared/utils/csvParser.ts`](shared/utils/csvParser.ts) handles quoted cells with embedded commas / quotes / newlines / CRLF / BOM. New `CsvTemplateService.template(kind)` emits header + sample rows for each kind. Renderer: rebuilt `CsvImportPage` with Tabs per kind, "Download template" → Blob download, file picker, "Validate (dry-run)" then "Commit import" gated on zero issues, full per-row error table with line numbers, summary badges (totalRows / new / update / skipped). |
| 10 | done | Backup/restore + Windows packaging + polish. New `BackupService` (snapshot + retention + restore) drives by `BackupScheduler` (daily fire on configurable time-of-day) and a manual "Backup now" action. New `AppSettingsService` persists backup folder/time/lastRun and `firstRunCompleted` in the existing `app_settings` key/value table. Settings page rebuilt with three panels: Backup &amp; restore (folder picker via `dialog.showOpenDialog` IPC, time picker, recent backups table, "Restore from…"), Reconciliation (surfaces `runReconciliation` drifts captured at boot, with a "Re-run" button), About. `electron-builder.yml` lands with NSIS Windows config (`oneClick: false`, `perMachine: false`, `allowToChangeInstallationDirectory: true`) and `extraResources` so migrations ship at `process.resourcesPath/db/migrations` (closes slice-10 deferred work). New `package:win` npm script for building the installer. Restore relaunches the app cleanly via `app.relaunch(); app.exit(0)` after the file copy. |

## Active deferred work (must address by the slice noted)

- **Slice 10 deferrals:** Weekly (12 Sundays) + monthly (12 first-of-months)
  retention layered on top of the daily-30 already shipping (spec §7.12). And
  first-boot auto-restore prompt: when the app launches with no `laurans.sqlite`
  but a configured backup folder containing one or more snapshots, offer to
  restore from the most recent (spec §7.12 line 466).
- **Future polish:** Reverse-invoice flow (committed invoices write opposing
  movements). Today the editor is read-only on committed invoices and the
  spec calls reversal a v1.1 feature. PDF preview in-app (currently we store
  but don't display).

## Dev quirks worth remembering

- **`ELECTRON_RUN_AS_NODE=1` in this shell** — npm scripts prefix with
  `env -u ELECTRON_RUN_AS_NODE` so Electron actually runs as Electron. Don't drop
  the prefix unless that env var is gone.
- **`better-sqlite3` ABI** — `@electron/rebuild` builds it against Electron's Node
  on `postinstall`. Vitest runs on system Node, so DB-touching tests **mock the
  repos**. If a future slice insists on real DB tests, add a `pretest`
  `npm rebuild better-sqlite3` and a `posttest` re-rebuild.
- **shadcn primitives** are hand-written in `renderer/components/ui/`. Don't run
  the shadcn CLI without checking — it'll overwrite tweaked classNames.
- **IPC handlers stay 3 lines.** Anything bigger means logic crept out of the
  service. `makeHandler(schema, fn)` enforces this shape.
