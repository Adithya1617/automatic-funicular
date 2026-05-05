# Restaurant Inventory Management System — v1 Specification

**Client:** Laurans Food Court, DLF Gachibowli, Hyderabad
**Deployment:** Single-tenant desktop application installed on the client's Windows 10/11 PC
**Future direction:** Multi-tenant SaaS (architecture must permit clean migration)

---

## 1. Project context

The client runs a food court in Hyderabad and currently has no system to track ingredient inventory, recipe-driven stock deduction, or spending. Ingredient stock is managed informally; the operator cannot answer questions like "how much did I spend on tomatoes last month," "which dishes are unavailable right now because we're out of stock," or "what is my actual food cost per dish."

The client uses Swiggy and Zomato for online orders and a separate (currently unspecified) custom service for in-person orders. Inventory is restocked roughly weekly via printed/typed PDF invoices from suppliers (mostly online suppliers like Amazon Business).

The system being built is a desktop application that runs locally on the client's PC, manages ingredient inventory, menu items with recipes, automatic stock deduction when orders are delivered, invoice-based restocking, and a multi-period dashboard. v1 ships with mock ordering integrations; real Swiggy/Zomato/POS integrations are future work.

---

## 2. v1 scope summary

### In scope

- Ingredient management (CRUD, stock quantities, low-stock thresholds, weighted-average cost)
- Sub-recipes / Bill of Materials (prepared ingredients with their own recipes and production batches)
- Menu item management with recipes (raw + prepared ingredients)
- Variants (modeled as separate menu items, grouped for display)
- Recipe versioning (Path A — snapshot recipe version at time of each order)
- Mock ordering integrations (two channels — online delivery + offline POS), manual order entry, "fire test order" button
- Automatic stock deduction on delivered orders
- Order cancellation flow with "dish prepared yes/no" prompt
- Invoice entry with smart memory (per-supplier item history, mapping memory) — manual entry only
- PDF invoice file upload and storage
- Availability checking (precomputed `max_servings_available` per menu item, "out of stock" badge)
- Stock take / physical count reconciliation
- Dashboard with daily, weekly, monthly, custom range, year-over-year time periods
- CSV import for ingredients, suppliers, menu items, and recipes
- Seed data ("Spice Garden Cafe" demo restaurant)
- Local backup & restore (scheduled + manual)
- Windows installer (.exe via electron-builder), auto-updater channel

### Out of scope (deferred to future versions)

- OCR-based invoice parsing (v2 — manual entry with memory in v1)
- Modifier groups for per-order dish customizations (v1.5)
- Soft reservations on order placed (schema-ready in v1, logic in future)
- Real Swiggy / Zomato / POS integrations (future — adapter interface ready)
- Multi-user authentication, roles, audit log (future — schema columns ready)
- License key / activation (future)
- GST line item tracking (CGST/SGST/IGST split) — v1 stores total amount only
- Multi-tenancy (architecture ready, single tenant hardcoded in v1)
- Reorder auto-generation / purchase order workflow
- Recipe input shortcuts for informal Indian units (chamcha, mutthi, katori) — v1.5 nicety

---

## 3. Tech stack

### Desktop shell
- **Electron** (latest stable) with **electron-builder** for Windows MSI/NSIS installer
- **electron-updater** for future patch delivery (update manifest channel via static file host — to be configured at release time)
- **electron-rebuild / @electron/rebuild** for native module compilation (better-sqlite3)

### Frontend (renderer process)
- **React 18** + **TypeScript** (strict mode)
- **Vite** as build tool
- **Tailwind CSS** + **shadcn/ui** for components
- **TanStack Table** for data grids
- **Recharts** for dashboard charts
- **React Hook Form** + **Zod** for forms and validation
- **Zustand** for UI-only state
- **TanStack Query** for IPC data fetching/caching
- **date-fns** for date handling

### Backend (main process)
- **Node.js** + **TypeScript** (strict mode)
- Layered architecture: `repositories → services → IPC handlers`
- Business logic does not import Electron APIs

### Database
- **SQLite** via **better-sqlite3** (synchronous driver, fast)
- **Drizzle ORM** for typed access and migrations
- PostgreSQL-compatible SQL only (avoid SQLite-specific syntax)
- **UUID v7** primary keys throughout

### Shared
- **Zod schemas** + TypeScript types in `shared/` folder, consumed by both processes
- IPC contract is defined entirely by these schemas

### File storage
- Abstracted behind a `FileStorage` interface
- v1 implementation: local disk via Electron's `app.getPath('userData')/files/`
- Future S3/cloud implementation will swap in seamlessly

### Reports & exports
- **pdfmake** or **@react-pdf/renderer** for PDF generation (purchase orders, reports)
- **exceljs** for Excel exports
- **papaparse** for CSV import/export

### Background work
- `setInterval` in main process for order polling and nightly backup
- `node-cron` reserved for future use if scheduling complexity grows

---

## 4. Process & architecture overview

```
┌─────────────────────────────────────────────────────────┐
│   Renderer (React UI)                                   │
│   - Pages, components, hooks                            │
│   - Zustand UI state                                    │
│   - TanStack Query cache against IPC                    │
└──────────────┬──────────────────────────────────────────┘
               │ Typed IPC (contract = Zod schemas in shared/)
┌──────────────▼──────────────────────────────────────────┐
│   Main Process (Node.js backend)                        │
│   ┌─────────────────────────────────────────────────┐   │
│   │ IPC Handlers (thin pass-through layer)          │   │
│   ├─────────────────────────────────────────────────┤   │
│   │ Services (business logic — Electron-free)      │   │
│   │  InventoryService, MenuService, OrderService,  │   │
│   │  InvoiceService, DashboardService,             │   │
│   │  ProductionService, AvailabilityService,       │   │
│   │  StockTakeService, BackupService,              │   │
│   │  SeedDataService, CsvImportService             │   │
│   ├─────────────────────────────────────────────────┤   │
│   │ Repositories (Drizzle queries, one per entity) │   │
│   ├─────────────────────────────────────────────────┤   │
│   │ Adapters                                       │   │
│   │  OrderingServiceAdapter (interface),           │   │
│   │  MockOnlineDeliveryAdapter,                    │   │
│   │  MockOfflinePOSAdapter,                        │   │
│   │  FileStorage (interface) → LocalDiskStorage    │   │
│   └─────────────────────────────────────────────────┘   │
└──────────────┬──────────────────────────────────────────┘
               │
┌──────────────▼──────────────────────────────────────────┐
│   SQLite DB + invoice file storage                      │
│   (in app.getPath('userData'))                          │
└─────────────────────────────────────────────────────────┘
```

The IPC layer is the **single seam** between UI and backend. Treat it as an internal RPC API. When v2/v3 migrates to SaaS, this seam becomes the HTTP API and the underlying services/repositories are unchanged.

### Folder structure

```
laurans/
├── main/                    # Electron main process (backend)
│   ├── adapters/            # Ordering adapters, file storage
│   ├── db/                  # Drizzle schema, migrations, client
│   ├── repositories/        # One per entity
│   ├── services/            # Business logic
│   ├── ipc/                 # IPC handlers (thin)
│   ├── jobs/                # Polling loops, backup scheduler
│   └── index.ts             # Main entry point
├── renderer/                # React UI
│   ├── pages/               # Route-level pages
│   ├── components/          # Reusable components
│   ├── features/            # Feature-folder organization
│   ├── hooks/               # Custom hooks (incl. IPC query hooks)
│   ├── lib/                 # Frontend utilities
│   └── main.tsx             # Renderer entry point
├── shared/                  # Used by both processes
│   ├── schemas/             # Zod schemas (IPC contract)
│   ├── types/               # TypeScript types derived from schemas
│   ├── constants/           # Unit conversions, enums
│   └── utils/               # Pure utilities (unit converter, etc.)
├── seed/                    # Seed data definitions (Spice Garden Cafe)
├── electron-builder.yml     # Packaging config
├── drizzle.config.ts        # Drizzle config
├── package.json
└── tsconfig.json
```

---

## 5. Locked architectural decisions

These were debated and decided. They are not open for re-litigation during build.

### 5.1 Source of truth for stock — Option B with discipline
Each `Ingredient` row stores `stock_quantity`. Updates to stock **must** go through a single function (`InventoryService.applyMovement(...)`) that writes a `StockMovement` row and updates `stock_quantity` in the **same transaction**. No other code path updates `stock_quantity` directly.

A reconciliation utility on app startup sums all movements per ingredient and compares against `stock_quantity`. Any drift indicates a bug and is logged.

### 5.2 Order cancellations — append a reversal, never edit
When an order is cancelled after stock was deducted, the UX prompts: **"Was the dish already prepared? [Yes] [No]"**

- **No** → insert reversal movements with `reason='sale_reversal'`, opposite signs, referencing the original order. Stock is restored.
- **Yes** → insert wastage movements with `reason='wastage'` and a note linking to the cancelled order. Stock is **not** restored — it was used.

Original sale movements are never modified or deleted.

### 5.3 Recipe edits — Path A (snapshot via recipe_version_id)
When a recipe is edited, a new `RecipeVersion` row is created. New `RecipeIngredient` rows reference the new version. Old rows remain, frozen.

Each `OrderLine` captures the `recipe_version_id` active at the moment of order placement. Stock deduction at delivery time uses that captured version. Historical orders are not affected by future recipe edits.

### 5.4 Unit conversion — single source of truth
All conversions go through one module: `shared/utils/unitConverter.ts`. Conversion factors live in `shared/constants/unitConversions.ts`. Per-ingredient density overrides live on the `Ingredient` row as an optional `density_g_per_ml` field.

Base units use **Indian standard metrics**: `g` for solids, `ml` for liquids, `each` for countable items (eggs, lemons, etc.).

Once an ingredient has any stock movement, its `base_unit` is immutable.

### 5.5 Cost method — weighted average
On every `purchase` movement, recompute the ingredient's `current_avg_cost_per_unit` as a weighted average of existing stock × old cost + new stock × new cost.

Each `StockMovement` records `cost_per_unit_at_time` as a snapshot, so historical COGS reports are accurate even after later cost changes.

### 5.6 Stock deduction trigger — on delivery (v1)
Stock is deducted when an order moves to `delivered` status. Reservations are out of scope for v1 but the schema includes a `reserved_quantity` column on `Ingredient` (always 0 in v1) so reservations can be added later without migration.

### 5.7 Wastage / prep loss — track at the source
Whole-purchase prep loss (e.g., 1.5 kg whole chicken yields 1.0 kg usable meat) is tracked by booking the full 1.5 kg into stock as "chicken" and logging 0.5 kg as `prep_loss` movement when the bird is butchered. This means stock represents "what was bought," and prep loss appears as a real cost line on the dashboard.

### 5.8 Multi-channel ordering from day one
Two mock adapters in v1: `MockOnlineDeliveryAdapter` (simulates Swiggy/Zomato) and `MockOfflinePOSAdapter` (simulates the in-person system). All orders feed into one `Order` table with a `source` column. The dashboard breaks out revenue by channel.

A manual order entry screen exists as a permanent fallback, not just a demo tool.

### 5.9 Availability — precomputed cache
`MenuItemAvailability` table holds `max_servings_available` per menu item. Recomputed by `AvailabilityService` whenever any constituent ingredient's stock changes. BoM-aware (walks sub-recipes). Used by UI to show "out of stock" badges and by the dashboard to surface unavailable items.

### 5.10 Multi-tenant readiness
Every table has a `tenant_id` column. v1 hardcodes `tenant_id = 1`. Every query filters by `tenant_id`. Combined with UUID v7 primary keys, this makes the SaaS migration a refactor of the IPC layer, not a schema rewrite.

### 5.11 Future-readiness columns
Every entity table includes `created_by` and `updated_by` columns defaulting to a system user, so when multi-user auth lands later, no migration is needed for audit trail.

---

## 6. Data model

18 tables organized into seven groups. Drizzle schema definitions will be written by the build, but the conceptual structure is fixed here.

### 6.1 Configuration
- **Tenant** — `id` (UUID), `name`, `created_at`. One row in v1.
- **AppSettings** — key/value store for backup folder, alert preferences, currency display, etc.

### 6.2 Catalog
- **Ingredient** — `id`, `tenant_id`, `name`, `category`, `type` (`raw` | `prepared`), `base_unit` (`g` | `ml` | `each`), `stock_quantity`, `reserved_quantity` (always 0 in v1), `low_stock_threshold`, `current_avg_cost_per_unit`, `density_g_per_ml` (nullable), `is_active`, `created_at`, `updated_at`, `created_by`, `updated_by`.
- **Supplier** — `id`, `tenant_id`, `name`, `contact_info`, `notes`, audit cols.
- **MenuItem** — `id`, `tenant_id`, `name`, `category`, `selling_price`, `variant_group_id` (nullable, links variants), `display_order`, `is_active`, audit cols.
- **RecipeVersion** — `id`, `parent_id`, `parent_type` (`menu_item` | `ingredient`), `version_number`, `is_current`, `created_at`, `created_by`.
- **RecipeIngredient** — `id`, `recipe_version_id`, `child_ingredient_id`, `quantity`, `unit`, `notes`. Single table for both menu→ingredient and prepared→ingredient relationships, walked recursively for BoM.

### 6.3 Stock movement (the ledger)
- **StockMovement** — `id`, `tenant_id`, `ingredient_id`, `change_quantity` (signed, base unit), `cost_per_unit_at_time`, `reason` (enum: `purchase`, `sale`, `sale_reversal`, `wastage`, `prep_loss`, `production_input`, `production_output`, `adjustment`, `staff_meal`), `reference_type` (enum: `invoice_line`, `order_line`, `production_batch`, `stock_take`, `manual`), `reference_id`, `notes`, `occurred_at`, `created_at`, `created_by`.
  - Indexes: `(ingredient_id, occurred_at)`, `(reason, occurred_at)`, `(reference_type, reference_id)`.

### 6.4 Production
- **ProductionBatch** — `id`, `tenant_id`, `prepared_ingredient_id`, `recipe_version_id`, `expected_yield`, `actual_yield`, `produced_at`, `notes`, audit cols.
  - Creating a batch generates `production_input` movements (one per constituent), one `production_output` movement (positive on the prepared ingredient), and a `prep_loss` movement if `actual_yield < expected_yield`.

### 6.5 Orders
- **Order** — `id`, `tenant_id`, `external_order_id`, `source` (enum: `swiggy`, `zomato`, `offline_pos`, `manual_entry`, `mock_online`, `mock_offline`), `placed_at`, `delivered_at` (nullable), `cancelled_at` (nullable), `status`, `total_amount`, `notes`, audit cols.
- **OrderLine** — `id`, `order_id`, `menu_item_id`, `quantity`, `unit_price`, `recipe_version_id` (snapshot at order placement).
- **OrderingChannel** — config per adapter: `id`, `key`, `display_name`, `enabled`, `polling_interval_seconds`, `is_mock`.

### 6.6 Invoices
- **Invoice** — `id`, `tenant_id`, `supplier_id`, `invoice_number`, `invoice_date`, `total_amount`, `file_path` (nullable, relative to user-data dir), `status` (`draft` | `committed`), `notes`, audit cols.
- **InvoiceLine** — `id`, `invoice_id`, `raw_description` (what the invoice said), `ingredient_id` (nullable until mapped), `quantity`, `unit`, `unit_cost`, `total_cost`.
- **SupplierItemMapping** — `id`, `supplier_id`, `raw_description`, `ingredient_id`, `default_quantity`, `default_unit`, `last_used_at`. Powers the smart memory feature.

### 6.7 Stock take
- **StockTake** — `id`, `tenant_id`, `started_at`, `completed_at` (nullable), `status` (`in_progress` | `committed` | `discarded`), `notes`, audit cols.
- **StockTakeLine** — `id`, `stock_take_id`, `ingredient_id`, `book_quantity` (snapshot at start), `counted_quantity` (nullable until counted), `difference` (computed at commit).

### 6.8 Availability cache
- **MenuItemAvailability** — `id`, `menu_item_id`, `max_servings_available`, `bottleneck_ingredient_id` (nullable), `last_computed_at`.

---

## 7. Feature specifications

### 7.1 Ingredients

**Screens:**
- Ingredient list — TanStack Table grid with search, filter by category and type, sort. Columns: name, category, current stock (with unit), low-stock indicator, current avg cost, last movement date, status.
- Ingredient detail / edit — form for all fields, with a "Stock Movements" tab showing the full ledger for that ingredient, paginated, filterable by reason/date.
- Manual stock adjustment dialog — pick reason (`adjustment`, `wastage`, `staff_meal`, `prep_loss`), enter quantity (with unit), optional notes. Writes a movement and updates stock atomically.

**Behavior:**
- Cannot delete an ingredient that has any stock movements; offer "deactivate" (sets `is_active = false`) instead.
- Cannot change `base_unit` once any movement exists.
- Low-stock indicator turns on when `stock_quantity < low_stock_threshold`.

### 7.2 Suppliers
Standard CRUD. List, edit, deactivate. Suppliers used in any committed invoice cannot be deleted, only deactivated.

### 7.3 Menu items + variants

**Screens:**
- Menu item list — grid with category filter, availability badge, selling price, current theoretical food cost %.
- Menu item editor — form with name, category, price, variant group (optional), display order, active toggle, and a recipe builder section.
- Recipe builder — searchable add-row dropdown for ingredients (raw + prepared), quantity input, unit picker (with unit conversion preview), notes. Drag-to-reorder. Editing an existing recipe creates a new `RecipeVersion`.

**Variants:**
- Each variant is a separate `MenuItem`, linked via `variant_group_id`.
- "Create variant of this dish" action prefills a new menu item with a copy of the source recipe so the user just adjusts quantities.

**Validation:**
- Recipe BoM cannot exceed depth 5 (configurable constant).
- Cycles in BoM detected and rejected on save (e.g., A uses B uses A).
- Editing a recipe shows a diff before save.

### 7.4 Sub-recipes / production

**Screens:**
- Production batch list — recent batches, filter by prepared ingredient.
- "Make a batch" dialog — pick prepared ingredient, system shows current recipe with expected yield, user enters actual yield, optional notes. On submit, generates `production_input`, `production_output`, and optional `prep_loss` movements in one transaction.

**Behavior:**
- Prepared ingredients appear in the same `Ingredient` table as raw, distinguished by `type='prepared'`.
- Stock of prepared ingredients is incremented by `production_output` movements, decremented when sold via menu items.
- BoM walking is recursive — when a menu item uses a prepared ingredient that itself uses other prepared ingredients, deduction goes through prepared stock first; raw ingredients are only deducted via production batches.

### 7.5 Ordering integrations + stock deduction

**Adapters (v1 = mocks only):**

```typescript
interface OrderingServiceAdapter {
  source: OrderSource;
  fetchPendingOrders(): Promise<ExternalOrder[]>;
  markOrderProcessed?(externalOrderId: string): Promise<void>;
  subscribeToOrderEvents?(handler: (order: ExternalOrder) => void): void;
}
```

Two implementations in v1:
- **MockOnlineDeliveryAdapter** — emits orders with `source = 'mock_online'`.
- **MockOfflinePOSAdapter** — emits orders with `source = 'mock_offline'`.

A polling loop in `main/jobs/orderPoller.ts` invokes each enabled adapter on its configured interval (default 30 seconds) and processes new orders through `OrderService`.

**"Fire test order" button** — admin screen lets the user pick a channel, pick menu items + quantities, and immediately push an order through the chosen mock adapter. Useful for testing and demos.

**Manual order entry screen** — also a permanent feature. Pick channel = `manual_entry`, build an order, submit. Same downstream flow.

**Stock deduction flow (on `delivered` status):**

1. Look up order lines and their captured `recipe_version_id`.
2. For each line, walk the BoM:
   - For raw ingredient leaves, deduct directly.
   - For prepared ingredient nodes, deduct from prepared stock (do not explode into raw — prepared stock has its own balance).
3. Apply unit conversions through `unitConverter`.
4. Wrap all movements + stock_quantity updates in a single transaction.
5. Trigger `AvailabilityService.recomputeForIngredients(affectedIds)`.
6. If any ingredient drops below threshold, surface an in-app notification.

**Cancellation flow:**

1. UI prompts: "Was the dish already prepared? [Yes] [No]"
2. Generates `sale_reversal` movements (No) or `wastage` movements (Yes) referencing the cancelled order.
3. Original sale movements untouched.
4. Triggers availability recompute.

### 7.6 Availability checking

`AvailabilityService.recomputeForIngredients(ingredientIds)`:

For each menu item that uses any of the given ingredients (directly or via prepared sub-recipes), compute `max_servings_available`:

```
max_servings = floor(min over all required ingredients
  (available_stock / required_per_serving))
```

For prepared ingredients, available stock is the prepared ingredient's own `stock_quantity` (we do NOT explode into raw at availability-check time — if you've run out of biryani masala, you've run out of biryani masala until a new batch is produced).

Updates `MenuItemAvailability` row. UI subscribes via TanStack Query and shows badges live.

### 7.7 Invoices — smart manual entry

**Screens:**
- Invoice list — grid with date, supplier, invoice number, total, status.
- New invoice — pick supplier, enter invoice number and date, upload PDF (stored in `userData/files/invoices/{invoice_id}.pdf`). Add line items.
- Line item entry — when supplier is selected, the dropdown for "raw description" shows recent items from that supplier (via `SupplierItemMapping`) with last-known quantities and prices. Pick to autofill. Otherwise type a new description.
- Mapping prompt — for unmapped descriptions, on commit, prompt user to map each to an existing ingredient (or create a new one inline). Mapping is saved for future invoices.
- Bulk paste — paste-text-area with rule-based parser ("Description ... qty ... unit ... price") that creates draft line items the user reviews.

**On commit:**
- Each line item creates a `purchase` movement.
- Ingredient's `current_avg_cost_per_unit` is recomputed via weighted average.
- `SupplierItemMapping` rows created or `last_used_at` updated.
- Availability recomputed.
- Invoice status flips from `draft` to `committed` (after which it is read-only — edits require a credit note, future feature).

### 7.8 Stock take

**Screens:**
- Start stock take — confirms intent, snapshots `stock_quantity` of every active ingredient into `StockTakeLine.book_quantity`. Disables the order polling loop with a banner.
- Counting screen — single-page list of all ingredients with quantity input per row, optimized for keyboard-driven entry. Save-as-you-go.
- Review & commit — shows lines where counted ≠ book, with computed difference and a notes field. User confirms.
- On commit — for each line where `counted ≠ book`, insert one `adjustment` movement with the delta. Re-enable order polling.

**Behavior:**
- Only one stock take can be `in_progress` at a time.
- Discarding a stock take leaves stock untouched.
- Past stock takes are read-only history.

### 7.9 Dashboard

Single dashboard page with a global date-range picker (presets: Today, This Week, This Month, Last 30 Days, This Year, custom; plus a "Compare to" toggle for year-over-year).

**Tiles:**
- Current stock value (sum of `stock_quantity × current_avg_cost_per_unit` for active ingredients) — single number with sparkline of stock value over time.
- Spending in period — total invoice value, with breakdown by category and top 10 ingredients.
- Cost of goods sold (COGS) — sum of `|change_quantity| × cost_per_unit_at_time` for `sale` movements in period, broken down by menu item.
- Wastage & prep loss in period — same calc for `wastage`, `prep_loss`, `staff_meal` reasons.
- Top consuming dishes — sorted by ingredient cost consumed.
- Low stock list — ingredients below threshold, sorted by urgency (estimated days remaining based on consumption rate).
- Reorder suggestions — based on consumption rate, projected stockout date, suggested reorder quantity (parameterized by lead time per supplier — config defaults to 7 days).
- Theoretical food cost % per dish — `(recipe ingredient cost) / selling_price` for each menu item, with bar chart and table view.
- Revenue by channel — order revenue grouped by `source`.
- Order volume by channel — count grouped by `source`.

**Implementation:**
- All metrics compute live from `StockMovement`, `Invoice`, `Order`, `OrderLine`. No pre-aggregation in v1.
- Indexes on `(occurred_at)` and `(occurred_at, reason)` make this fast at restaurant scale.
- Date range is a first-class component — every tile takes `(start_date, end_date)` and optionally `(compare_start, compare_end)`.

### 7.10 CSV importer

Four templates, downloadable from the app:
- `ingredients.csv` — name, category, type, base_unit, low_stock_threshold, density_g_per_ml (optional)
- `suppliers.csv` — name, contact_info, notes
- `menu_items.csv` — name, category, selling_price, variant_group, display_order
- `recipes.csv` — parent_name, parent_type (`menu_item` | `ingredient`), child_ingredient_name, quantity, unit, notes

**Process:**
- Two-pass: validation first (collect all errors before committing anything), then commit in a single transaction.
- Dry-run mode that shows what would be imported without committing.
- Detailed error report — per-row issues with line numbers.
- Idempotent on retry — existing entities matched by name are updated, not duplicated.

### 7.11 Seed data — "Spice Garden Cafe"

`SeedDataService.loadDemoRestaurant()` populates:
- ~40 ingredients across vegetables, spices, dairy, meat, grains, oils, beverages
- ~5 prepared sub-recipes (biryani masala, garam masala, sauce base, marinade, dough)
- ~25 menu items including 3 with variants
- 4 suppliers with mapping history
- ~8 historical invoices spread over the past 30 days
- ~600 historical orders (mix of mock_online and mock_offline) spread over the past 30 days
- 2 historical stock takes
- A handful of wastage and cancellation entries

**Idempotent** — if seed data already exists (sentinel record), running again resets to the canonical state. Available via a "Load demo data" button in dev/admin settings.

### 7.12 Backup & restore

**Automatic backup:**
- Runs daily at a configurable time (default 3:00 AM).
- Copies the SQLite DB file plus the `files/` folder (invoice PDFs) to a configured backup folder (default: `userData/backups/`, configurable to a USB drive or cloud-synced folder like Google Drive Desktop).
- Folder name format: `backups/YYYY-MM-DD_HH-MM-SS/`.
- Retention: last 30 daily, last 12 weekly (Sunday), last 12 monthly (1st of month). Older are deleted.

**Manual backup:**
- "Backup now" button in settings — same operation, immediate.

**Restore:**
- On app startup, if no DB exists but a backup folder is configured and contains backups, app offers to restore from the most recent backup.
- Manual restore from settings — pick a backup folder, confirm, app shuts down, replaces DB and files folder, restarts.

---

## 8. Non-functional requirements

### 8.1 Platform
- Windows 10 (build 19041+) and Windows 11
- Single user (no auth in v1)
- Keyboard + mouse primary, touch secondary
- Default install path: `%LOCALAPPDATA%\Programs\Laurans` (per-user, no admin required)
- Default user data path: `%APPDATA%\Laurans`

### 8.2 Performance
- Cold start under 4 seconds on a midrange Windows 10 PC
- Dashboard queries on a year of data complete under 200ms
- Availability recompute after a stock movement completes under 500ms

### 8.3 Reliability
- All multi-step state changes wrapped in SQLite transactions
- Reconciliation check on app startup (sum of movements vs. stored stock per ingredient) — drift logged, never silently ignored
- Crash-safe: SQLite WAL mode, file flush on commit
- Graceful degradation if backup folder is missing or full

### 8.4 Security
- Code-signed `.exe` (Authenticode certificate, ~₹15-30k/year — to be procured before client-facing release)
- App data stored in user's profile, no system-level files
- No network calls in v1 except update check (electron-updater)

### 8.5 Internationalization
- v1: English only, INR currency, dd/mm/yyyy date format
- Strings centralized in a translations module from day one to enable future Hindi/Telugu addition

### 8.6 Localization specifics
- Indian metric base units: `g`, `ml`, `each`
- Currency: `₹` symbol, no decimals on display by default (paise can be entered, displayed as `₹125.50` when non-zero)
- INR formatting: Indian comma grouping (`₹1,23,456.78`)

---

## 9. Build sequence (vertical slices)

Build in vertical slices, each shippable end-to-end before the next starts. Prevents the "everything is half-done" trap.

| # | Slice | Approx time |
|---|---|---|
| 1 | Skeleton: Electron + Vite + React + TS + Drizzle + folder structure + IPC ping/pong + DB migrate + seed loader scaffold | 1 wk |
| 2 | Ingredients + suppliers + manual stock adjustments + stock movement ledger view | 1 wk |
| 3 | Recipes / BoM + recipe versioning + production batches | 1.5 wks |
| 4 | Menu items + variants + availability cache | 1 wk |
| 5 | Mock ordering adapters + order processing + cancellation flow + manual order entry + "fire test order" | 1.5 wks |
| 6 | Invoice entry with smart memory + PDF storage + supplier mappings | 1.5 wks |
| 7 | Stock take flow | 0.5 wk |
| 8 | Dashboard with all date ranges + reports + exports | 1.5 wks |
| 9 | CSV importer | 1 wk |
| 10 | Backup/restore + Windows packaging + installer + polish | 1 wk |

**Total: ~11–12 weeks of focused build.**

---

## 10. Future roadmap (informational, not v1)

- **v1.1** — GST line items, modifiers, soft reservations, multi-user auth + audit log
- **v1.5** — OCR-based invoice parsing (Tesseract.js or LLM-based, user-confirmable), informal Indian unit shortcuts (chamcha/mutthi/katori), reorder auto-PO generation
- **v2** — Real Swiggy/Zomato/POS adapters (likely via Petpooja or UrbanPiper)
- **v3** — Multi-tenant SaaS migration: SQLite → PostgreSQL, Electron main → Node.js server, IPC → HTTPS API, license/activation, web dashboard

---

## 11. Appendix — open items to confirm before kickoff

These are fine to default to the suggestions below unless the client says otherwise.

1. **Backup default folder** — user-configurable on first run; default = `userData/backups/`. Recommend prompting on first launch.
2. **Polling interval defaults** — 30 seconds for both mock channels.
3. **Low-stock alert default** — in-app notification only in v1; email/SMS deferred.
4. **App theme** — light mode default, dark mode available via settings. shadcn/ui supports both.
5. **Auto-start on boot** — off by default; setting available in preferences.
6. **First-run wizard** — short onboarding that asks: backup folder, prompts to load seed data or start blank, prompts to import via CSV.
