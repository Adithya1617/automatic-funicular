# Laurans wireframes — implementation spec

> This document is the source of truth for UI implementation. The rendered HTML files
> in this folder are visual reference. When the two disagree, this document wins.
>
> Cross-references to `SPECIFICATION.md` use § notation (e.g. §4.2). Cross-references
> to data tables use `code style`.

---

## 0. Global design system

### App shell (every screen)

**Layout:** persistent left sidebar (138px desktop, collapsible on smaller widths) +
main content area with a top bar.

**Sidebar contents, in order:**

1. Brand mark (`L` square + "Laurans" wordmark)
2. **Operations** group label
   - Dashboard
   - Live orders (with red badge showing pending+preparing count, e.g. `3`)
   - Ingredients
   - Menu
   - Invoices
   - Stock take
3. **System** group label
   - CSV import
   - Settings

The active item gets a white background, full border, and `font-weight: 500`. Inactive
items are 32px tall with `color: var(--color-text-secondary)`.

**Top bar contents:**

- Page title (h1, 17px, weight 500) on the left
- Page-specific controls on the right (date range, filter dropdowns, primary action button)
- Notification bell (icon button, 30×30) with red pulse dot when there are unattended events

The top bar has a 0.5px bottom border that separates it from the page body.

### Color semantics

Single neutral surface palette + one semantic ramp. **Color encodes meaning, never decoration.**

| Use case | Token | Notes |
|----------|-------|-------|
| Success / created / delivered / OK stock | `--color-text-success` (#3B6D11) | green |
| Info / new order / updating / book qty | `--color-text-info` (#185FA5) | blue |
| Warning / preparing / low-but-ok stock / fuzzy match | `--color-text-warning` (#854F0B) | amber |
| Danger / cancel / out of stock / error / wastage | `--color-text-danger` (#A32D2D) | red |
| Production / prepared sub-recipe | purple ramp | only used as a small "prep" tag |
| Neutral / structural / adjustment / inactive | gray ramp | gray |

**Order source badges** use distinct colors so they're scannable in the live feed:

| Source | Background | Text |
|--------|-----------|------|
| Swiggy | `#FAEEDA` (amber 50) | `#854F0B` (amber 800) |
| Zomato | `#FCEBEB` (red 50) | `#A32D2D` (red 800) |
| Offline POS | `#E1F5EE` (teal 50) | `#0F6E56` (teal 800) |
| Manual | `#F1EFE8` (gray 50) | `#444441` (gray 800) |

### Density & touch

Touch is a real input mode (the owner uses a touchscreen sometimes), so:

- Primary action buttons: ≥40px tall (use `min-height: 40px`)
- Secondary buttons / icon buttons: ≥32px tall
- Table row heights: 36–40px
- Input fields: 32–36px tall
- Tap targets at least 32×32px for icon-only controls
- Generous spacing between adjacent buttons (≥6px gap)

But we are not building for primary touch. Default text and label sizes are desktop-first
(13–14px body, 11–12px metadata).

### Component library

Use **shadcn/ui** for the foundation. Specific mappings:

| UI region | shadcn/ui component |
|-----------|--------------------|
| Sidebar nav | `<NavigationMenu>` styled, or a custom Tailwind list — both fine |
| KPI tiles | Plain `<Card>` variant, no border, secondary background |
| Tables | shadcn `<Table>` + TanStack Table for sort/filter/pagination |
| Dropdown menus | `<Select>` or `<DropdownMenu>` |
| Filter chips | `<Badge variant="secondary">` with `aria-pressed` |
| Toast | `<Sonner>` (recommended) or shadcn `<Toast>` |
| Modals | `<Dialog>` for blocking, `<Sheet>` (right slide-in) for non-blocking detail panels |
| Toggle switches | `<Switch>` |
| Stepper | Custom — see screen 6 |
| Auto-complete | `<Command>` (cmdk) inside a `<Popover>` |

### Numbers and dates

- Currency: `Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })`
  → renders as `₹2,84,500` (Indian comma grouping, no decimals for whole rupees)
- Dates in tables: `dd/mm/yyyy` (e.g. `28/04/2026`)
- Date+time in ledgers: `28 Apr 14:22`
- Quantities: 3-decimal precision for stock counts (`2.400 kg`), integer for counts
- Round all displayed numbers — never show `0.30000000000000004`. Use `Math.round`,
  `.toFixed(n)`, or `Intl.NumberFormat`.

### Notification rules (relevant to multiple screens)

When a new order arrives:

1. Sound: short, distinct chime — store the audio file in `renderer/public/sounds/new-order.mp3`.
   User can mute in Settings.
2. Toast: slide in from top-right, blue accent, auto-dismiss after 6 seconds. Format:
   `New order from {Source} · #{externalRef} just arrived`
3. Live orders feed: prepend the new order card with a `NEW` pill and a blue left bar
   that fades to neutral after 60 seconds (or after the order moves to "preparing").

When stock crosses below `low_stock_threshold`:

1. Bell pulse turns on (red dot)
2. No toast (low stock isn't an interrupt-level event)
3. Dashboard "Low stock" card highlights the item

### Empty / loading / error states

Every list view must handle:

- **Empty** — friendly illustration optional, single sentence ("No invoices yet · add your first one")
  + primary action button. Don't show empty tables with just headers.
- **Loading** — skeleton rows (3–5 of them), not spinners. For dashboards, skeleton
  the KPI tile values but keep the labels.
- **Error** — banner at top of the content area with `var(--color-background-danger)`
  background, retry button. Don't replace the whole page with an error state.

---

## 1. Dashboard

**Route:** `/` (landing screen — opens here on app launch)
**Reference:** `01-dashboard.html`

### Purpose

At-a-glance view of cost performance and operational health. The owner opens the app,
glances at this for ~5 seconds, and either acts on something (low stock alert) or
navigates to detail.

### Top bar controls

- Date range picker (default: "Last 30 days"). Other presets: Today, Yesterday,
  Last 7 days, Last 30 days, This month, Last month, Custom.
- "Compare YoY" toggle button (acts like a chip — pressed state visible).
- Notification bell.

### Body regions

#### KPI strip (4 tiles, full width, equal columns)

Each tile uses `--color-background-secondary`, no border, `border-radius: var(--border-radius-md)`,
padding `1rem`.

| Tile | Value | Sub-line |
|------|-------|----------|
| Stock value | sum of `qty_on_hand × cost_per_unit_avg` for all ingredients | sparkline of last 14 days |
| Spending | sum of committed invoice totals in date range | `▲ 8.2% vs prev` (green up = bad if you're trying to cut costs, but most owners read up=growth, so explicit "vs prev" copy clarifies) |
| COGS | sum of recipe-cost × deliveredOrders.qty in date range | `▼ 3.1% vs prev` |
| Wastage | sum of wastage movement values in date range | `5.4% of spend` |

> **Compute COGS from `RecipeVersion` snapshots** (Path A versioning), not the live recipe.
> See SPECIFICATION.md §4.2.

#### Top consuming dishes (left card, half width)

Horizontal bar chart, top 5 dishes by total recipe-cost consumed in the date range.
Each row: dish name, bar (relative to top dish = 100%), rupee value right-aligned.
Click a row → navigate to that dish's analytics drilldown (deferred — see §0 deferred).

#### Low stock (right card, half width)

List of ingredients where `qty_on_hand` is below `low_stock_threshold` OR projected
days-of-cover is < 7 days. Each row: ingredient name + days-remaining pill (red if <2,
amber if <7, hidden if >=7). Click → navigate to ingredient detail.

Days-remaining = `qty_on_hand / avg_daily_consumption_30d`. If denominator is zero, show "—".

#### Revenue by channel (left card, half width)

Stacked breakdown: Swiggy / Zomato / Offline POS / Manual. Each row: colored dot,
channel name, revenue + percentage. Order: highest revenue first.

#### Reorder suggestions (right card, half width)

Top 4 items where `qty_on_hand < 7-day projected consumption`. Each row: ingredient
+ suggested quantity (rounded to next purchase pack size from supplier history) +
default supplier name.

Click → opens a "Create purchase order" prompt (PO is deferred for v1, but the click
should `console.log` the intent so the wiring is in place).

### States to handle

- **Empty (new tenant)** — KPIs show "—", cards show "Not enough data yet · come back after your first invoice"
- **Loading** — skeleton all values, keep labels
- **Stock take in progress** — banner at top: "A stock take is in progress · numbers may shift on commit"
- **Compare YoY: on but no prior-year data** — KPI sublines hide instead of showing "vs prev"

### Data needs

```ts
type DashboardSummary = {
  stockValue: number; stockValueSparkline: number[];
  spend: number; spendDeltaPct: number;
  cogs: number; cogsDeltaPct: number;
  wastage: number; wastageOfSpendPct: number;
  topDishes: { id: string; name: string; cost: number }[]; // top 5
  lowStock: { id: string; name: string; daysRemaining: number | null }[];
  revenueByChannel: { channel: ChannelKey; revenue: number; pct: number }[];
  reorderSuggestions: { ingredientId: string; ingredientName: string; suggestedQty: number; unit: string; supplierName: string }[];
};
```

Service: `DashboardService.getSummary(dateRange, compareYoY)` aggregates from
`stock_movements`, `orders`, `order_lines`, `invoices`.

---

## 2. Live orders feed

**Route:** `/orders/live`
**Reference:** `02-live-orders.html`

### Purpose

Real-time list of orders the kitchen is working through. Owner uses this to track
fulfillment and intervene (mark delivered, cancel) when needed.

### Top bar controls

- Channel filter dropdown ("All channels" → Swiggy / Zomato / Offline POS / Manual)
- Primary button: "+ Fire test order" — opens the manual order entry screen with
  channel preset to "Mock online (Swiggy)" or whatever the user last picked. This
  is the only UI affordance for testing in v1.

### Body regions

#### Filter chip row

`All`, `Pending`, `Preparing`, `Delivered`, `Cancelled` — single-select. Each chip
shows a count badge. Default: All. Cancelled chip is right-aligned with a left
margin-auto so it visually separates from the active-status chips.

#### New-order toast (above the list, dismissible)

When a new order arrives via the polling adapter:

- Sound chime fires
- Toast slides in: blue background, info icon, copy: `New order from {source} · #{externalRef} just arrived`
- The order card is prepended to the list with `NEW` pill + blue left bar

Toast auto-dismisses after 6s. List card retains the `NEW` pill for 60 seconds.

#### Order cards

Each card is a 3-column grid: status bar (4px wide colored stripe) | body | actions.

Card body shows:
- **Top row:** source badge + monospace order ID + `NEW` pill (if applicable) + relative time right-aligned
- **Items row:** comma-separated `{qty}× {name}` list
- **Meta row:** status indicator (colored dot + label) + total rupee amount + optional "Stock deducted" hint when delivered

Status bar colors:
- New / pending → blue (`--color-text-info`)
- Preparing → amber (`--color-text-warning`)
- Delivered → green (`--color-text-success`)
- Cancelled → red (`--color-text-danger`)

Action column:
- For pending/preparing: stacked "Mark delivered" (primary green button, 36px) + "Cancel" (danger outline, 36px)
- For delivered/cancelled: "View detail" (secondary outline)

The "Mark delivered" button calls `OrderService.markDelivered(orderId)` which writes
the `sale` movements via `InventoryService.applyMovement` (see SPECIFICATION.md §4.1).

### Cancel flow

Clicking "Cancel" opens a `<Dialog>` with two buttons asking "Was the dish already prepared?":

- **Yes, it was prepared** → cancellation produces `wastage` movements at recipe quantity
- **No, not yet prepared** → cancellation produces no movements (or, for already-delivered orders that are being reversed, `sale_reversal` movements)

This is locked decision §5.2 from the spec.

### Polling

`OnlineChannelAdapter` and `OfflineChannelAdapter` poll every 30s (configurable in
Settings). Polling is **paused** while a stock take is in progress (see screen 6).

### States to handle

- **Empty queue** — "No active orders. New orders will appear here." + button to fire test order.
- **Polling paused** — yellow banner across the top: "Order polling paused (stock take in progress)"
- **Adapter error** — red banner: "Connection to {channel} lost · retrying in 30s · {retry now button}"

### Data needs

`OrderService.listLiveOrders(filter: { channel?, status? })` returns `Order[]` with
nested `OrderLine[]`. Use TanStack Query with 5s `refetchInterval` (so the UI
updates within 5s of any backend poll).

---

## 3. Ingredients — list with movement ledger

**Route:** `/ingredients`
**Reference:** `03-ingredients.html`

### Purpose

Owner browses the full ingredient catalog, sees which are running low, and drills
into any ingredient to see its complete movement history (every purchase, sale,
wastage, prep loss, adjustment).

### Top bar controls

- Secondary button: "Adjust stock" — opens the manual adjustment dialog (reason picker:
  `manual_adjustment` / `wastage` / `production_loss` / `recount`, plus quantity + notes).
  Writes via `InventoryService.applyMovement`.
- Primary button: "+ New ingredient" — opens the new-ingredient form (deferred from
  this wireframe set, but trivial — see SPECIFICATION.md §3 ingredient table).

### Body regions

#### Toolbar

- Search input (full-width flex item) — fuzzy match against `ingredient.name` and `ingredient.alias[]`
- Category dropdown ("All categories" / category list)
- Type dropdown ("Type: all" / `raw` / `prepared`)

#### Ingredients table

TanStack Table, sortable on every column.

| Column | Width | Content |
|--------|-------|---------|
| Name | 32% | name (weight 500) + category subtext |
| Type | 14% | pill — `raw` (gray) or `prepared` (purple) |
| Stock | 28% | "current qty + unit" + threshold "low: X" → both above a thin progress bar; bar color = green/amber/red by health |
| Avg cost | 14% | `₹X/unit` right-aligned |
| Last move | 12% | relative time ("2h ago", "yesterday", "3d ago") |

Stock bar fill = `qty_on_hand / (low_stock_threshold × 4)`, capped at 100%. So
"low" sits at 25%, "comfortable" at 100%. Color thresholds: red <50%, amber <75%, green ≥75%.

Click a row → it becomes selected (blue tint, blue left accent), and the **Movement
ledger panel** below populates with that ingredient's data. URL updates to
`/ingredients?selected={id}` so refresh preserves state.

#### Movement ledger panel (when row selected)

White card under the table. Contents:

- **Header:** check icon + "{Ingredient name} · stock movements" + right-aligned mini-stats: Stock, Avg cost, Value
- **Tab strip:** Movements / Recipes using this / Suppliers / Edit
- **Body (Movements tab):** scrolling list, ~10 rows visible. Each row:

| Column | Content |
|--------|---------|
| Date | `dd MMM HH:mm` in tertiary text |
| Reason | colored pill — `purchase` (green) / `sale` (blue) / `wastage` (red) / `production` (purple) / `adjustment` (gray) |
| Description | order ref, invoice ref, or note |
| Qty | `+0.5 kg` (green) or `−0.3 kg` (red), right-aligned |
| Cost | `₹420` per unit at time of movement, or `—` if not applicable |

Source the ledger from `stock_movements` ordered by `created_at DESC`, paged at 50.

### States to handle

- **Empty** — "Add your first ingredient" CTA
- **Search no results** — "No ingredients match '{query}'"
- **No movements yet** — within ledger panel: "No movements yet · this ingredient has never been bought, sold, or counted"

### Data needs

```ts
IngredientService.list(filter): Ingredient[] // with `qtyOnHand`, `avgCost`, `lastMovementAt`
IngredientService.getMovements(ingredientId, page): StockMovement[]
```

---

## 4. Menu item editor — recipe builder

**Route:** `/menu/{itemId}/edit`
**Reference:** `04-menu-editor.html`

### Purpose

Edit an existing menu item's basic fields and recipe (ingredient list with quantities).
Saving creates a new `RecipeVersion` row (Path A versioning) that becomes the active
version for orders placed after the save timestamp.

### Top bar layout

- Breadcrumb above the title: `Menu / {category} / {item name}`
- Title: item name + small `v3 draft` tag
- Right: "Show diff" (secondary), "Cancel" (secondary), "Save version" (primary)

### Body — two-column grid (form left, summary right)

#### Form column (left, ~70% width)

##### Basics section

2-column field grid:
- Row 1: Name (text) | Category (select)
- Row 2: Selling price ₹ (number) | Variant group (select, optional, with link to manage groups)
- Row 3: Display order (number) | Active toggle (switch with label "Active on menu")

##### Recipe section

Section title with subtitle: `Recipe · per 1 serving · BoM depth N` where N is the
deepest sub-recipe nesting (e.g. masala blend used in this dish). Walk recursively
via `RecipeService.computeBoMDepth(recipeVersionId)`.

Ingredients table with these columns (in this order):

| Column | Width | Content |
|--------|-------|---------|
| Drag handle | 18px | 6-dot grip icon |
| Ingredient | flex | autocomplete-searchable dropdown; `prepared` ingredients show a small purple "prep" tag inline |
| Qty | 80px | numeric input |
| Unit | 60px | dropdown — defaults to ingredient's `base_unit`, can pick from compatible units (g/kg, ml/L) |
| Notes | flex | optional text — for prep notes ("Soaked 30 min", "Birista") |
| Delete | 26px | × icon |

Below the rows: `+ Add ingredient` row (italic blue, opens an autocomplete picker for any active ingredient).

Drag-to-reorder via react-dnd or @dnd-kit/core.

#### Summary column (right, ~170px)

Four blocks stacked, each separated by a 0.5px divider:

1. **Theoretical food cost** — large green percentage + thin bar (filled to that %) +
   sub-line "₹{recipeCost} of ₹{sellingPrice}"
2. **Recipe cost** — `₹91.20` + "{n} ingredients" sub-line. Recipe cost = sum over
   ingredients of `qty × cost_per_base_unit` after unit conversion, recursively for
   prepared ingredients (see SPECIFICATION.md §4.2 for the recursive cost calc).
3. **Availability** — green "{n} servings" pill + sub-line "Limited by {ingredient name} ({qty})".
   Availability = `min over ingredients of floor(qtyOnHand / requiredQtyPerServing)`,
   recursive for prepared.
4. **Version** — current editing version + "v{n} active since {date}"

### Save flow

1. Click "Save version" → confirm dialog with summary diff (added / removed / qty-changed ingredients)
2. On confirm: `RecipeService.saveVersion(menuItemId, recipeRows)` creates a new
   `recipe_version` and updates `menu_item.active_recipe_version_id`. Orders placed
   after this point reference the new version_id (snapshot semantics).

### "Show diff" preview

Modal showing a side-by-side comparison of active version vs current draft:
- Added rows (green left bar)
- Removed rows (red left bar)
- Qty-changed rows (amber left bar with old → new arrow)

### States to handle

- **New menu item (no recipe yet)** — table starts with one empty row + the "+ Add ingredient" prompt
- **No active version yet** — "Version" block shows "Editing v1 (draft) · No active version"
- **Stock would prevent any servings** — Availability block goes red: "0 servings · Out of {ingredient}"
- **BoM cycle detected** — block save, show error: "This recipe creates a cycle: {chain}"

### Data needs

```ts
MenuService.getItem(itemId): MenuItemWithRecipe
RecipeService.computeRecipeCost(rows): number
RecipeService.computeAvailability(rows): { servings: number; bottleneck: string }
RecipeService.saveVersion(itemId, rows): RecipeVersion
RecipeService.computeDiff(activeId, draftRows): DiffResult
```

---

## 5. Invoice entry — smart manual entry

**Route:** `/invoices/new`
**Reference:** `05-invoice-entry.html`

### Purpose

Owner records a supplier invoice. The system remembers past mappings per supplier,
so the second time DairyFresh delivers "DAIRYFRESH PANEER 1KG BLOCK", the system
auto-maps it to the Paneer ingredient. Unmapped items get flagged for resolution
before commit.

### Top bar layout

- Breadcrumb: `Invoices / New invoice`
- Title: "New invoice" + amber `DRAFT` tag
- Right: "Bulk paste" (secondary), "Save draft" (secondary), "Map & commit" (primary)

### Body regions

#### Header grid (3 columns)

| Field | Type | Notes |
|-------|------|-------|
| Supplier | searchable select | `supplier_id` |
| Invoice number | text | shown as `{supplierCode}-{number}` typically |
| Date | date input (`dd/mm/yyyy`) | invoice date, not entry date |

#### Sub-row (2 columns)

| Field | Type |
|-------|------|
| Notes | text |
| Invoice PDF | file picker (drop zone), accepts `.pdf` only, shows filename + size + "uploaded" once attached. Stored in `app_data/invoices/{invoiceId}.pdf` |

#### Line items section header

- Left: "Line items" title (small)
- Right: tertiary text — "Past N mappings remembered for this supplier"

#### Line items table

Columns: Description (1.6fr) | Qty (0.7fr) | Unit (0.6fr) | Unit cost (0.8fr) | Total (0.9fr, right-aligned) | Delete (26px)

**Description cell (the smart part):**

- When typing, opens a `<Popover>` containing past mappings for this supplier:
  - Header: "From {supplier} history"
  - Each suggestion row:
    - **Name:** `{raw description} → {ingredient name}`
    - **Meta:** `last: {qty} {unit} @ ₹{price} · {date} · weighted avg ₹{wavgPrice}/{unit}`
  - Footer: "+ Map to a different ingredient" (opens ingredient picker)
- Once mapped, the cell shows the raw description on top + a green "mapped → {ingredient}" sub-line
- For unmapped/new descriptions, show an amber "needs mapping → click to assign" sub-line

The mapping table is `supplier_item_mappings(supplier_id, raw_description, ingredient_id, last_qty, last_unit, last_price, last_used_at)`.

**Total cell** = `qty × unit_cost`, computed live, rendered with `Intl.NumberFormat`.

#### Add row affordance

`+ Add line item` row at the bottom of the table (blue, italic, hover highlights).

#### Totals card (right-aligned, below table)

- Subtotal `(N items)` + sum
- "GST (tracked total only) — included" tertiary text
- Grand total (bold, top border separator)

### Bulk paste flow

Click "Bulk paste" → modal with a textarea. User pastes invoice text (tab- or comma-separated).
Parser tries to extract description, qty, unit, unit cost, and adds rows for each.
Mapping happens via the same auto-suggest. Lines that fail to parse get a row but
flagged red — user resolves manually.

### Map & commit flow

1. Validate: every row has description, qty, unit, unit cost, AND is mapped to an ingredient (no amber rows).
   If not all rows are mapped, the button is disabled + tooltip: "Map all rows to commit".
2. On commit: `InvoiceService.commit(invoiceId)`:
   - Update invoice status: `draft → committed`
   - For each line: write a `purchase` movement via `InventoryService.applyMovement`
   - Update each `supplier_item_mapping.last_*` and bump `last_used_at`
   - Recompute weighted-average cost on each affected ingredient (see SPECIFICATION.md §4.3)

### States to handle

- **Empty rows** — table shows just the "+ Add line item" affordance
- **Some rows unmapped** — "Map & commit" disabled, helper text under button: "{n} rows still need mapping"
- **All mapped** — "Map & commit" enabled, primary style
- **Already committed** (re-opening a committed invoice) — header shows green `COMMITTED` tag, table is read-only, "Map & commit" replaced with "Reverse invoice" (red, opens reversal flow that writes opposite movements)

### Data needs

```ts
SupplierItemMappingService.suggest(supplierId, partialDescription): Suggestion[]
InvoiceService.commit(invoiceId): void  // wraps the full transaction
```

---

## 6. Stock take — counting screen

**Route:** `/stock-take/{stocktakeId}/count`
**Reference:** `06-stock-take.html`

### Purpose

Periodic physical count of every ingredient. Differences between book quantity (the
system's qty_on_hand at the moment the stock take started) and counted quantity
become `adjustment` movements at commit. Order processing pauses during the take
to prevent qty drift mid-count.

### Top bar layout

- Breadcrumb: `Stock take / In progress — started {dd MMM HH:mm}`
- Title: "Counting"
- Right: "Discard" (red text outline), "Review & commit →" (primary)

### Body regions

#### Paused-poller banner (full width, below top bar)

Amber banner with pause icon:

> **Order polling paused** while stock take is in progress · auto-resumes on commit or discard
> _paused {duration}_

This is non-dismissible. Polling resume is automatic.

#### 3-step stepper

Horizontal pill stepper: Start (done, green) → Count (active, dark) → Review & commit (pending, default).
Each pill has a circle with the number or check, plus the step name. Lines connect them.

#### Progress card

3-column grid:
- Left (flex): "Counted" label, "23 of 47 ingredients" value, thin progress bar (filled %)
- Middle: "Discrepancies" label, count value (amber color if > 0)
- Right: green "Saved {n}s ago" indicator with check icon

Auto-save fires on every `onChange` of a count input (debounced 500ms). Save failures
turn the indicator red: "Save failed · retrying".

#### Filter row

Chips: All / Counted / Remaining / Discrepancies, plus a small search input on the right.

#### Counting table

Columns: Ingredient (flex) | Book (90px, right) | Counted (110px, right) | Diff (90px, right) | Status (28px)

- **Book column:** read-only, shows snapshot qty captured at stock take start. Format: `8.000 kg`
- **Counted column:** large input (36px tall) + unit suffix. Empty when not yet counted (dashed border).
- **Diff column:** computed `counted - book`, format `+0.300` / `−0.250`. Color: gray for zero, green for positive, red for negative-large, amber for negative-small (within tolerance).

Tolerance default 5% (configurable in Settings). Diff above tolerance counts as a "discrepancy".

- **Status column:** check icon (green) when counted, empty circle (gray) when not.

Tab key advances row to row. Enter on the counted input also advances.

### Data freezing

When stock take starts:
- `stock_takes` row created with `status='in_progress'`
- For every ingredient: `stock_take_lines(ingredient_id, book_qty=current_qty_on_hand, counted_qty=null)` rows are created
- `Application.stockTakeLock = stocktakeId` — prevents poller jobs from running

### Discard flow

Click "Discard" → confirm dialog: "Discard this stock take? All counted values will be lost. Stock book values will not change."
On confirm:
- Update `stock_takes.status = 'discarded'`
- Release lock, resume polling
- Navigate to `/stock-take` list

### Review & commit flow

Click "Review & commit →" → navigate to `/stock-take/{id}/review` (deferred screen, but the data flow is):

1. Show only rows with non-zero diff
2. User reviews, optionally adds a global note
3. On final commit:
   - For each non-zero diff line: write an `adjustment` movement (qty = diff, reason='recount', reference=stocktakeId)
   - `stock_takes.status = 'committed'`
   - Release lock, resume polling
   - Toast: "Stock take committed · {n} adjustments written"

### States to handle

- **No stock take in progress** — `/stock-take` lands on history list with "+ New stock take" button
- **Multiple users editing same stock take** — single-tenant so generally one user, but if a second window is opened, show "This stock take is open in another window. Continue here?" prompt
- **Save failure** — red status pill + retry button

### Data needs

```ts
StockTakeService.start(): StockTake // freezes book qty
StockTakeService.updateLine(stocktakeId, ingredientId, countedQty): void // auto-saves
StockTakeService.discard(stocktakeId): void
StockTakeService.commit(stocktakeId, note?): { adjustmentsWritten: number }
```

---

## 7. Manual order entry

**Route:** `/orders/new`
**Reference:** `07-manual-order.html`

### Purpose

Create an order by hand — used both for genuine in-person orders the owner wants to
log, and for "fire test order" demos through the mock channel adapters. Same UI,
different `source` value.

### Top bar layout

- Breadcrumb: `Orders / New manual order`
- Title: "New order"
- Right: small dropdown showing total menu item count ("25 menu items" — informational, not interactive)

### Body — two-column grid

#### Left column — menu picker (~70%)

##### Search input

Full-width, placeholder "Search dishes…", searches across `menu_item.name` and aliases.

##### Category chip row

`All`, `Biryani`, `Curry`, `Breads`, `Sides`, `Drinks` (sourced from `menu_item.category` distinct values).
Single-select. Default: All.

##### Menu grid (2 columns of cards)

Each card:
- Top-right qty badge (filled circle, dark) — only shows when item is in cart, with current cart qty
- Dish name (12px, weight 500)
- Category (10px, tertiary)
- Footer row: price (left) + availability badge (right)

Availability badge:
- Green `{n} left` when servings >= 5
- Amber `{n} left` when 1–4
- Red `Out of stock` when 0 — card opacity drops to 0.55, no longer tappable

Tap card → adds 1 to cart for that dish (if available).

#### Right column — order summary card (~230px)

Single secondary-background card containing:

1. Title "Order summary" (12px weight 500)
2. **Channel** select — defaults to "Manual entry". Other options: "Mock online (Swiggy)", "Mock offline POS"
3. **External reference** input — optional, e.g. table number or receipt number. Stored in `order.external_ref`.
4. Divider
5. **Items list** — each row: dish name + "{qty} × ₹{price}" sub-line on left; − / qty / + buttons on right (24px touch targets)
6. **Totals card** (white inset):
   - Subtotal
   - "{N} dishes · {M} items" tertiary line
   - Grand total (top border)
7. **Submit order** button — full width, 44px tall, primary style, disabled when cart is empty

### Submit flow

Click "Submit order":

1. Validate: at least one item in cart, all items still available.
2. Pick the right ingestion path based on Channel:
   - **Manual entry** → `OrderService.createManualOrder(items, externalRef)`
   - **Mock online (Swiggy)** → `MockOnlineChannelAdapter.injectOrder(items, externalRef)` (this puts an order in the queue that the polling adapter will pick up next cycle, so it goes through the same code path as a real Swiggy order)
   - **Mock offline POS** → `MockOfflineChannelAdapter.injectOrder(items, externalRef)`
3. `InventoryService.applyMovement` writes `sale` movements for each line (recursive for prepared sub-recipes — see §4.2).
4. Order goes into the live feed with `status='pending'`.
5. Toast: "Order #{externalRef} submitted" + redirect to `/orders/live`.

### States to handle

- **Cart empty** — Submit disabled, total shows ₹0, totals row reads "Add a dish to begin"
- **Item went out of stock between adding and submitting** — submit button shows red error: "Some items are no longer available · review cart". Highlights the offending row.
- **No menu items at all (new tenant)** — empty state: "Add menu items first" + button to navigate to menu management

### Data needs

```ts
MenuService.listForOrdering(): MenuItemForOrdering[] // includes live availability
OrderService.createManualOrder(items, externalRef, channel): Order
```

---

## 8. CSV importer

**Route:** `/import`
**Reference:** `08-csv-importer.html`

### Purpose

Bulk-load reference data (ingredients, suppliers, menu items, recipes) from CSV.
Always dry-runs first — nothing commits until the user reviews the diff and clicks
the green button. Idempotent on retry.

### Top bar layout

- Breadcrumb: `CSV import / Ingredients · dry run` (the second segment switches based on entity tab + dry-run vs committed state)
- Title: "CSV import"
- Right: "Download template" (secondary) + "Commit N changes" (primary green) — disabled when there are zero non-error rows

### Body regions

#### Entity tabs (4-column grid)

Each tab is a card showing:
- Icon + entity name (12px, weight 500)
- Sub-line: `{n} in DB · {m} staged` (or "in CSV" when a file is loaded for that entity)

Active tab: 1.5px blue border + light blue fill + blue text.

The tabs: **Ingredients**, **Suppliers**, **Menu items**, **Recipes**.

Each entity has its own template with documented columns. Templates are fetched from
`/templates/{entity}.csv` (bundled in app resources). They include a header row + 2–3
example rows with comments.

#### Upload zone (when no file yet)

Empty: dashed border drop zone, "Drag a CSV here, or click to pick" + "Download template" link.

#### Upload zone (file loaded)

Shows: file icon + filename + "{n} rows · {size} · uploaded {time} · idempotent on retry"
Right side: "Replace file" secondary button.

#### Summary tile row (4 colored tiles)

| Tile | Color | Counts |
|------|-------|--------|
| Will create | green | rows that will INSERT |
| Will update | blue | rows that match existing records and will modify them |
| Warnings | amber | rows that need attention but won't block (fuzzy matches) |
| Errors | red | rows that will skip (invalid data) |

#### Per-row preview

Header with title "Per-row preview · N rows" + filter chips: All / Errors / Warnings / Adds / Updates.

Table columns: Status icon (32px) | Line (70px, monospace) | Name / SKU | Action | Detail

Status icons:
- `+` green — create
- `→` blue — update
- `⚠` amber — warning
- `×` red — error

Action pills: `create` (green), `update` (blue), `skip` (gray for errors that won't apply)

Detail column shows what will change. For updates, inline diff: `low_stock 15 → **20** kg`.
For warnings, the warning reason + click-to-resolve. For errors, the validation message
with the field name.

Error rows have full-row red tint. Warning rows have full-row amber tint.

#### Footer info

Tertiary text:
- Left: "Re-running this file produces the same outcome · safe to retry after fixing errors"
- Right: pagination indicator e.g. "Showing 8 of 18 rows · scroll for the rest"

### Validation rules per entity

**Ingredients:**
- `name` required, unique within tenant
- `base_unit` required, must be one of: `g`, `ml`, `each`
- `category` required (free text, gets added if new)
- `low_stock_threshold` numeric, default 0
- `type` optional (`raw` | `prepared`), default `raw`
- Existing records matched by name; updates `low_stock_threshold`, `category`. Refuses to update `base_unit` (would invalidate historical movements).

**Suppliers:**
- `name` required, unique
- `contact_phone`, `contact_email`, `address` optional
- Match by name; update contact fields.

**Menu items:**
- `name` required, unique
- `category`, `selling_price` required
- `variant_group` optional
- Match by name; update price + category. Recipe is NOT touched (use Recipes import for that).

**Recipes:**
- Composite key: `menu_item_name`, `ingredient_name`, `qty`, `unit`
- Each row is one recipe line. Multiple rows per menu item.
- Importing replaces the active recipe entirely (creates a new `recipe_version`).
- Validates: every ingredient exists, units are compatible with ingredient base_unit, no cycles.

### Idempotency

Every import is keyed by `(entity, file_hash, tenant_id)`. Re-uploading the same file
produces the same diff and the same outcome (no double-creates, no flapping).

### States to handle

- **No file yet** — show empty drop zone, all summary tiles read "—", commit button disabled
- **Parsing** — skeleton tiles, "Validating..." in upload zone
- **All errors** — banner: "Every row has errors · fix the file and re-upload", commit button disabled
- **Mix of errors + valid rows** — commit button text reads "Commit {valid} changes (skip {errors} errors)"
- **Just-committed** — flip to a success view: green banner "Imported {n} {entity}", offer to import another entity

### Data needs

```ts
ImportService.dryRun(entity, csvBytes): DryRunResult
ImportService.commit(entity, csvBytes, dryRunId): CommitResult
```

The `dryRunId` ensures the user commits the exact diff they reviewed (not a re-parse
of a file that may have been edited between dry run and commit).

---

## Cross-reference index

| Wireframe | Primary services touched | Primary tables |
|-----------|--------------------------|----------------|
| 1. Dashboard | DashboardService | stock_movements, orders, invoices |
| 2. Live orders | OrderService, OnlineChannelAdapter, OfflineChannelAdapter | orders, order_lines |
| 3. Ingredients | IngredientService, InventoryService | ingredients, stock_movements |
| 4. Menu editor | MenuService, RecipeService | menu_items, recipe_versions, recipe_ingredients |
| 5. Invoice entry | InvoiceService, SupplierItemMappingService, InventoryService | invoices, invoice_lines, supplier_item_mappings, stock_movements |
| 6. Stock take | StockTakeService, InventoryService | stock_takes, stock_take_lines, stock_movements |
| 7. Manual order | OrderService, InventoryService | orders, order_lines, stock_movements |
| 8. CSV import | ImportService | (depends on entity) |

---

## Deferred screens — to be wireframed before their slice starts

- **Cancellation modal** (was-it-prepared prompt) — small, blocks slice 4
- **First-run wizard** (tenant setup, opening stock, supplier seed) — blocks slice 1
- **Stock take review-and-commit** — step 3 of stepper, blocks slice 8
- **Settings** (thresholds, sounds, channel adapter on/off, tolerance %) — blocks slice 9
- **Per-dish analytics drilldown** — clicked from dashboard top-dishes — non-blocking, can ship after v1
- **Mobile/tablet variant of live orders** — kitchen-pass usage — non-blocking, post-v1
