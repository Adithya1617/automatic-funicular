# Claude Code Kickoff Prompt — Laurans Inventory Management System

> **How to use this document**
> Paste this entire document into Claude Code at the very start of the project. Treat it as the project's constitution — every coding decision should refer back to it. Do not modify the locked architectural decisions in §3 without explicit user sign-off. The companion document `SPECIFICATION.md` contains the full functional spec; this prompt is the *engineering* contract.

---

## 1. Project identity

You are building **Laurans Inventory** — a single-tenant Windows desktop application for restaurant inventory management. The first client is Laurans Food Court, DLF Gachibowli, Hyderabad. The architecture must be ready for multi-tenant SaaS migration in v2/v3 without a rewrite, but v1 ships as a desktop install.

**You are not just generating code. You are operating as a senior engineer building a long-lived production system.** Prioritize clarity, type safety, transaction correctness, and the seam between UI and backend. Avoid clever shortcuts that will hurt the SaaS migration later.

---

## 2. Locked tech stack (do not deviate without confirmation)

- **Shell:** Electron (latest stable) + electron-builder + electron-updater
- **Frontend:** React 18 + TypeScript (strict) + Vite
- **UI:** Tailwind CSS + shadcn/ui + TanStack Table + Recharts + React Hook Form + Zod + Zustand + TanStack Query + date-fns
- **Backend (main process):** Node.js + TypeScript (strict)
- **DB:** SQLite via better-sqlite3, accessed through **Drizzle ORM**, PostgreSQL-compatible SQL only
- **IDs:** UUID v7 everywhere — no auto-increment integers
- **File storage:** abstracted behind `FileStorage` interface; v1 uses local disk via `app.getPath('userData')/files/`
- **Reports/exports:** pdfmake or @react-pdf/renderer, exceljs, papaparse
- **Native rebuild:** `@electron/rebuild` for better-sqlite3

**Forbidden in v1 code:**
- SQLite-specific SQL syntax that doesn't work on Postgres (e.g., `INSERT OR REPLACE`)
- Auto-increment integer primary keys
- Direct `stock_quantity` updates outside `InventoryService.applyMovement(...)`
- Electron API imports inside `services/` or `repositories/`
- Any business logic inside IPC handlers

---

## 3. Locked architectural decisions

These were debated and agreed. Do not change them without explicit user approval.

### 3.1 Stock source of truth — stored on `Ingredient.stock_quantity` with discipline
Every stock change goes through **one function** — `InventoryService.applyMovement(...)` — which writes a `StockMovement` row and updates `Ingredient.stock_quantity` in the **same transaction**. No exceptions.

A reconciliation utility runs on app startup: sums all movements per ingredient, compares against stored stock, logs any drift. Surface this to the user in admin settings.

### 3.2 Order cancellations — append reversal, never edit
UX prompts: *"Was the dish already prepared? [Yes] [No]"*
- **No** → `sale_reversal` movements with opposite signs, stock restored
- **Yes** → `wastage` movements referencing the cancelled order, stock NOT restored
Original sale movements are immutable.

### 3.3 Recipe versioning — Path A (snapshot via `recipe_version_id`)
Editing a recipe creates a new `RecipeVersion`; old rows are frozen. Each `OrderLine` captures the active `recipe_version_id` at order placement. Stock deduction at delivery uses that captured version.

### 3.4 Unit conversion — single source of truth
All conversions go through `shared/utils/unitConverter.ts`. Conversion factors in `shared/constants/unitConversions.ts`. Per-ingredient density overrides on `Ingredient.density_g_per_ml`.

**Base units:** Indian standard metrics — `g` for solids, `ml` for liquids, `each` for countable items.
Once an ingredient has any movement, its `base_unit` is **immutable**.

### 3.5 Cost method — weighted average
On every `purchase` movement, recompute `Ingredient.current_avg_cost_per_unit` as a weighted average. Each `StockMovement` records `cost_per_unit_at_time` snapshot for accurate historical COGS.

### 3.6 Stock deduction trigger — on delivered status (v1)
Stock deducts when an order moves to `delivered`. The `Ingredient.reserved_quantity` column exists in v1 but is always 0 — it's there to permit reservations later without migration.

### 3.7 Prep loss — track at the source
Whole purchases enter stock as bought. Prep loss (e.g., 1.5 kg whole chicken yields 1.0 kg meat) is logged as a `prep_loss` movement when butchering happens. Stock represents what was bought.

### 3.8 Multi-channel ordering — built in from day one
Two mock adapters in v1: `MockOnlineDeliveryAdapter` (`mock_online`) and `MockOfflinePOSAdapter` (`mock_offline`). All orders feed one `Order` table with a `source` column. Manual order entry is a permanent feature (`manual_entry`), not just a demo affordance. Dashboard breaks out everything by `source`.

### 3.9 Availability — precomputed cache
`MenuItemAvailability.max_servings_available` is computed by `AvailabilityService.recomputeForIngredients(ids)` on every stock change. BoM-aware: prepared ingredients are NOT exploded into raw at availability check time — running out of biryani masala means the dish is unavailable until a new batch is produced.

### 3.10 Multi-tenant readiness — present-but-unused
Every table has a `tenant_id` column. v1 hardcodes `tenant_id = 1`. Every query filters by `tenant_id` even though there's only one. UUID v7 primary keys.

### 3.11 Audit columns — always present
Every entity table has `created_at`, `updated_at`, `created_by`, `updated_by`. v1 hardcodes `created_by`/`updated_by` to a system user constant. When auth lands, no migration needed.

### 3.12 The IPC seam is the API
The IPC layer between renderer and main is the **only** seam between UI and backend. It is defined entirely by Zod schemas in `shared/`. Treat it as a published RPC API. When v3 SaaS migration happens, this seam becomes HTTP and nothing else changes.

---

## 4. Folder structure (canonical)

Create exactly this structure. Do not deviate.

```
laurans/
├── main/                       # Electron main process (backend)
│   ├── adapters/
│   │   ├── ordering/
│   │   │   ├── OrderingServiceAdapter.ts    # interface
│   │   │   ├── MockOnlineDeliveryAdapter.ts
│   │   │   └── MockOfflinePOSAdapter.ts
│   │   └── storage/
│   │       ├── FileStorage.ts                # interface
│   │       └── LocalDiskStorage.ts
│   ├── db/
│   │   ├── schema.ts                         # Drizzle table definitions
│   │   ├── migrations/                       # Drizzle migration files
│   │   └── client.ts                         # DB connection setup
│   ├── repositories/
│   │   ├── ingredientRepository.ts
│   │   ├── supplierRepository.ts
│   │   ├── menuItemRepository.ts
│   │   ├── recipeRepository.ts
│   │   ├── stockMovementRepository.ts
│   │   ├── productionBatchRepository.ts
│   │   ├── orderRepository.ts
│   │   ├── invoiceRepository.ts
│   │   ├── supplierItemMappingRepository.ts
│   │   ├── stockTakeRepository.ts
│   │   └── menuItemAvailabilityRepository.ts
│   ├── services/
│   │   ├── InventoryService.ts               # the only writer of stock_quantity
│   │   ├── MenuService.ts
│   │   ├── RecipeService.ts                  # BoM walking, versioning
│   │   ├── ProductionService.ts
│   │   ├── OrderService.ts
│   │   ├── InvoiceService.ts
│   │   ├── DashboardService.ts
│   │   ├── AvailabilityService.ts
│   │   ├── StockTakeService.ts
│   │   ├── BackupService.ts
│   │   ├── SeedDataService.ts
│   │   └── CsvImportService.ts
│   ├── ipc/
│   │   ├── handlers/                         # one file per domain
│   │   └── register.ts                       # wires handlers on app start
│   ├── jobs/
│   │   ├── orderPoller.ts
│   │   ├── backupScheduler.ts
│   │   └── reconciliation.ts                 # startup stock check
│   └── index.ts                              # main entry point
├── renderer/
│   ├── pages/                                # route-level pages
│   ├── features/                             # feature folders (ingredients, menu, orders, invoices, dashboard, etc.)
│   ├── components/                           # shared components
│   ├── hooks/
│   │   └── ipc/                              # one TanStack Query hook per IPC channel
│   ├── lib/
│   ├── styles/
│   └── main.tsx
├── shared/
│   ├── schemas/                              # Zod schemas (IPC contract)
│   ├── types/                                # types derived from schemas
│   ├── constants/
│   │   ├── unitConversions.ts
│   │   ├── enums.ts                          # StockMovementReason, OrderSource, etc.
│   │   └── system.ts                         # SYSTEM_USER_ID, DEFAULT_TENANT_ID, etc.
│   └── utils/
│       └── unitConverter.ts
├── seed/
│   └── spiceGardenCafe.ts                    # the demo restaurant
├── electron-builder.yml
├── drizzle.config.ts
├── package.json
├── tsconfig.json                             # strict mode, paths configured
└── README.md
```

---

## 5. Coding standards

### 5.1 TypeScript
- `strict: true`, `noUncheckedIndexedAccess: true`
- No `any`. If you need it, use `unknown` and narrow.
- All types derived from Zod schemas via `z.infer` — schemas are the single source of truth.
- Path aliases: `@main/*`, `@renderer/*`, `@shared/*`, `@seed/*`.

### 5.2 Naming
- Files: camelCase for modules, PascalCase for component files and class-like services.
- Tables: PascalCase singular (`Ingredient`, `StockMovement`).
- Columns: snake_case (`stock_quantity`, `current_avg_cost_per_unit`).
- IPC channels: `domain:action` format (`ingredient:list`, `order:cancel`).

### 5.3 Layer rules (enforced)
- IPC handlers contain only: input validation (Zod parse), service call, output serialization. **3-line bodies as a rule.**
- Services contain business logic. They depend on repositories and other services, not on Electron, not on Drizzle directly.
- Repositories contain Drizzle queries. They return plain typed objects.
- Adapters implement interfaces from `shared/`. They are injected, not imported by name.
- Renderer never imports from `main/`. Only from `shared/` and via IPC hooks.

### 5.4 Transactions
Any operation that writes more than one row must run inside a single Drizzle transaction. Helper: `withTransaction(db, async (tx) => { ... })`.

The function `InventoryService.applyMovement(...)` is the only place `Ingredient.stock_quantity` is updated. It always opens a transaction and writes both the movement and the stock update.

### 5.5 IDs and timestamps
- All primary keys: UUID v7 generated server-side. Never trust client-supplied IDs for new records.
- All timestamps stored as Unix milliseconds (integer) for portability. Convert to/from `Date` at the schema boundary using Zod transforms.

### 5.6 Errors
- Define a `DomainError` class hierarchy in `shared/errors`. Throw typed errors from services.
- IPC handlers catch domain errors and return `{ ok: false, error: { code, message, fields? } }`.
- Successful responses: `{ ok: true, data: ... }`.
- Renderer's IPC hook layer translates these into TanStack Query errors.

### 5.7 Tests (lightweight in v1)
- Vitest for unit tests on services and unit converter.
- Each service has at least one test for its happy path and its primary invariant (e.g., `applyMovement` test asserts movement + stock update happen atomically).
- No requirement for renderer component tests in v1 — it slows things down without proportional value here. We test the backend and exercise the UI manually.

---

## 6. Build sequence (vertical slices)

Build in this exact order. Each slice is shippable end-to-end before the next starts.

### Slice 1 — Skeleton (week 1)
**Deliverable:** App boots. IPC ping/pong works. DB migrates on first run. Seed loader scaffold exists. Reconciliation runs on startup.

Tasks:
1. Initialize repo with `package.json`, `tsconfig.json` (strict, path aliases), `electron-builder.yml`, `drizzle.config.ts`.
2. Set up Electron + Vite + React with TypeScript. Get a window opening.
3. Set up Tailwind + shadcn/ui base.
4. Create `shared/` folder with the constants and a single example Zod schema.
5. Implement IPC ping/pong with the typed handler/hook pattern.
6. Set up Drizzle: create `Tenant` and `AppSettings` tables, seed `tenant_id = 1`. Confirm migrations run on app launch.
7. Stub out `SeedDataService.loadDemoRestaurant()` (no-op for now) and a settings UI button to invoke it.
8. Implement reconciliation job (no-op for now since no movements exist).
9. README with build/run instructions.

**Acceptance:** Run `npm run dev`, app launches, dev tools show "ping ok", DB file appears in user-data dir.

### Slice 2 — Ingredients, suppliers, manual stock adjustments (week 2)
**Deliverable:** User can create/edit ingredients and suppliers, manually adjust stock, view the ledger.

Tasks:
1. Drizzle schema for `Ingredient`, `Supplier`, `StockMovement`. Migrations.
2. Repositories for all three.
3. `InventoryService.applyMovement(...)` — transactional, the **only** writer of stock.
4. IPC handlers: `ingredient:list/get/create/update/deactivate`, `supplier:*`, `stockMovement:list`, `inventory:applyMovement`.
5. Renderer features: ingredient list (TanStack Table), ingredient editor with movement ledger tab, manual adjustment dialog, supplier list & editor.
6. Unit converter module + tests.
7. Reconciliation job actually checks now.

**Acceptance:** Create an ingredient with stock 10, adjust by -2 with reason wastage, ledger shows it, stock shows 8, reconciliation passes.

### Slice 3 — Recipes, BoM, production batches (weeks 3–4)
**Deliverable:** User can define recipes for menu items and prepared ingredients, with BoM walking. Production batches record yield and prep loss.

Tasks:
1. Schema: `RecipeVersion`, `RecipeIngredient`, `ProductionBatch`. Migrations.
2. `RecipeService.createVersion(...)` — handles immutability of old versions.
3. `RecipeService.walkBoM(parentId, parentType, version)` — recursive walk with cycle detection (depth max 5, configurable).
4. `ProductionService.recordBatch(...)` — generates `production_input`, `production_output`, optional `prep_loss` movements in one transaction.
5. IPC handlers and renderer screens for recipe builder and "Make a batch" dialog.
6. **Note:** menu items don't exist yet at this point. Recipes for prepared ingredients can still be built and tested. Defer `parent_type='menu_item'` recipes to slice 4 wiring.

**Acceptance:** Define a "Biryani Masala" prepared ingredient with a recipe. Record a production batch. Verify input ingredients deducted, output stock incremented, prep loss logged if yield mismatch. Reconciliation still passes.

### Slice 4 — Menu items, variants, availability (week 5)
**Deliverable:** Menu items with recipes (raw + prepared). Variants. Availability cache live.

Tasks:
1. Schema: `MenuItem`, `MenuItemAvailability`. Migrations.
2. Wire up `parent_type='menu_item'` in recipe builder.
3. `AvailabilityService.recomputeForIngredients(ids)` — BoM-aware.
4. Hook availability recompute into `InventoryService.applyMovement(...)` post-commit.
5. Renderer: menu item list with availability badges, menu item editor, variant grouping UI.

**Acceptance:** Create a menu item using a prepared ingredient. Verify availability shows correctly, drops to 0 when prepared stock is 0, recovers after production batch.

### Slice 5 — Mock ordering, order processing, cancellation (weeks 6–7)
**Deliverable:** Two mock channels emit orders, orders deduct stock on delivery, cancellation prompts handle prepared/not-prepared.

Tasks:
1. Schema: `Order`, `OrderLine`, `OrderingChannel`. Migrations.
2. `OrderingServiceAdapter` interface in `shared/`. Both mock implementations.
3. `OrderService.processDelivery(orderId)` — walks BoM, deducts stock, transactional.
4. `OrderService.cancelOrder(orderId, alreadyPrepared: boolean)` — generates reversal or wastage movements.
5. `orderPoller` job — invokes adapters on configured intervals.
6. Renderer: order list, order detail, cancellation dialog, "fire test order" admin screen, manual order entry screen.

**Acceptance:** Fire a test order via mock_online channel, observe stock deducted on delivery, cancel another order with "prepared = yes", verify wastage movements (not reversal). Reconciliation passes.

### Slice 6 — Invoices, smart memory, PDF storage (weeks 8–9)
**Deliverable:** User can enter invoices manually, system remembers per-supplier mappings, PDF stored on disk, stock and cost recomputed on commit.

Tasks:
1. Schema: `Invoice`, `InvoiceLine`, `SupplierItemMapping`. Migrations.
2. `LocalDiskStorage` implementation of `FileStorage` interface. Invoice PDFs stored at `userData/files/invoices/{invoice_id}.pdf`.
3. `InvoiceService.commit(invoiceId)` — generates `purchase` movements, recomputes weighted-avg cost, updates mappings, transactional.
4. Renderer: invoice list, invoice editor with line item dropdown showing supplier history, mapping prompt for unmapped descriptions, bulk paste parser.

**Acceptance:** Upload a PDF, enter line items, commit, observe stock increased and cost updated. Re-enter same supplier, see autocomplete from history.

### Slice 7 — Stock take (week 10, first half)
**Deliverable:** Periodic physical count flow with pause-the-poller behavior.

Tasks:
1. Schema: `StockTake`, `StockTakeLine`. Migrations.
2. `StockTakeService.start/save/commit/discard` — pauses orderPoller while in_progress.
3. Renderer: start screen, count screen, review-and-commit screen.

**Acceptance:** Start a stock take, count some ingredients with deltas, commit, verify adjustment movements written.

### Slice 8 — Dashboard (weeks 10 second half – 11)
**Deliverable:** All dashboard tiles working with daily/weekly/monthly/custom/YoY date ranges.

Tasks:
1. `DashboardService` with one method per tile, each taking `(start, end, compareStart?, compareEnd?)`.
2. Indexes verified for performance: `(occurred_at, reason)` on StockMovement, `(invoice_date)` on Invoice.
3. Renderer: dashboard page with global date picker, all tiles, charts via Recharts.
4. Excel + PDF report exports.

**Acceptance:** Dashboard loads under 1 second on seeded data covering 30 days. All tiles correct. YoY comparison works.

### Slice 9 — CSV importer (week 12, first half)
**Deliverable:** Four CSV templates importable with validation, dry-run, error report.

Tasks:
1. `CsvImportService` with two-pass logic per entity type.
2. Renderer: import screen with file picker per entity, dry-run results display, error report.
3. Template download from the app.

**Acceptance:** Wipe DB, import all four CSVs of seeded data, app state matches what seed would produce.

### Slice 10 — Backup, restore, packaging, polish (week 12 second half)
**Deliverable:** Production-ready Windows installer with backup/restore.

Tasks:
1. `BackupService` with auto-schedule + manual button.
2. Restore-on-startup-when-DB-missing flow.
3. electron-builder config for NSIS installer.
4. electron-updater config (manifest URL placeholder for now).
5. App icon, splash, About dialog.
6. End-to-end smoke test on a clean Windows VM.

**Acceptance:** Clean Windows 10/11 VM, install the `.exe`, app launches, seeded demo data loads, backup runs, app uninstalls cleanly.

---

## 7. The first prompt (paste-this-after-this-document)

Once you've read this entire document, do not start writing feature code. **Start with Slice 1.** Your first PR should be the skeleton only. Specifically:

1. Read `SPECIFICATION.md` (the companion document) carefully.
2. Confirm back to me your understanding of: (a) the locked decisions in §3, (b) the folder structure in §4, (c) the Slice 1 acceptance criteria.
3. Ask me about anything ambiguous.
4. Then begin Slice 1. Stop after Slice 1 and let me verify before moving to Slice 2.

---

## 8. Recurring rules to apply at every step

1. **Before any DB write that touches `Ingredient.stock_quantity`** — verify you're going through `InventoryService.applyMovement(...)`. If not, stop and route through it.
2. **Before any IPC handler grows past ~5 lines** — extract the logic into a service method. Handlers are pass-throughs.
3. **Before any service imports from Electron** — stop. Move that concern to a job, an adapter, or the IPC layer.
4. **Before deleting an entity** — check for referential integrity. Most entities should be deactivated (`is_active = false`), not deleted.
5. **Before adding a SQLite-specific feature** — check it works on PostgreSQL too. If not, find another way.
6. **Before responding "done"** — run reconciliation. If stock and movements disagree, you have a bug.
7. **Before adding a column** — ask: is this single-tenant only? Audit-related? Future-flag? Make the right call now to avoid migration debt.
8. **When writing tests for a service** — at minimum, test the invariant the service exists to protect (movements + stock atomicity, recipe version immutability, weighted avg correctness, BoM cycle detection, etc.).

---

## 9. Anti-patterns to avoid

These have come up in similar projects. Don't reintroduce them.

- **"I'll just update stock_quantity here, it's a simple case."** — No. Always go through `applyMovement`.
- **"I'll edit the existing movement instead of creating a reversal."** — No. Append-only ledger.
- **"I'll inline this conversion factor, it's only used once."** — No. All conversions through `unitConverter`.
- **"This handler is small, I'll put the SQL right in it."** — No. Repositories own SQL, handlers don't.
- **"Drizzle has a SQLite-only helper that's faster."** — Don't use it. Postgres compatibility costs you nothing now.
- **"I'll store the file path as an absolute path so it's clearer."** — No. Relative to user-data so backups portable.
- **"Tenant ID is always 1, no need to filter by it."** — No. Filter anyway. The day you forget is the day you go multi-tenant.

---

## 10. Definition of done for v1

The v1 build is "done" when:

1. All 10 slices are complete and accepted.
2. Reconciliation passes on a freshly-seeded database after running for at least 100 simulated orders.
3. A clean Windows 10 and a clean Windows 11 machine can install the `.exe`, run the app, load seed data, and execute every primary flow without error.
4. Backup, restore, and CSV import round-trip preserves data exactly.
5. Dashboard tiles match hand-computed values on a small fixture dataset.
6. No `any` types remain in the codebase.
7. README is up to date with build, run, package, and troubleshooting instructions.

When all of these are green, we ship v1 to the client.

---

*End of Claude Code kickoff prompt. Companion document: SPECIFICATION.md.*
