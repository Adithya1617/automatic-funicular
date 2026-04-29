# Laurans wireframes — handoff to Claude Code

This folder contains UI wireframes for the Laurans Food Court inventory management
system. Drop the entire folder into your project as `docs/wireframes/` and reference
it in your Claude Code build prompts.

## What's in here

| File | Purpose |
|------|---------|
| `WIREFRAMES.md` | The implementation spec — Claude Code reads this. Per-screen breakdown of components, states, behaviors, and data shape. |
| `index.html` | Browser landing page that links to all 8 wireframes. Open this first to navigate. |
| `01-dashboard.html` … `08-csv-importer.html` | One standalone HTML per screen. Open in any browser. |
| `tokens.css` | Shared design tokens (color, type, radii). Imported by every HTML file. |
| `README.md` | This file. |

## Suggested project placement

```
your-project/
├── main/
├── renderer/
├── shared/
└── docs/
    └── wireframes/   ← drop this folder here
        ├── WIREFRAMES.md
        ├── 01-dashboard.html
        └── ...
```

## How to use with Claude Code

### 1. Add the folder to context once

At the start of a Claude Code session, tell it:

> The UI is specified in `docs/wireframes/WIREFRAMES.md` with rendered references in
> `docs/wireframes/*.html`. Every renderer screen MUST match the corresponding wireframe.
> When in doubt, prefer the spec file over the HTML — the spec captures intent, the HTML
> captures one specific layout at one specific viewport.

### 2. Reference per build slice

When you start a slice, scope Claude Code to the relevant section. Examples:

> Slice 4 — implement the live orders feed.
> Spec: `docs/wireframes/WIREFRAMES.md` → "2. Live orders feed"
> Reference: `docs/wireframes/02-live-orders.html`
> Use shadcn/ui components and TanStack Query for the order list. Match the source-badge
> color scheme, the colored left status bar, and the toast + sound notification described
> in the spec. Touch targets on action buttons stay ≥40px.

> Slice 7 — implement the recipe editor.
> Spec: `docs/wireframes/WIREFRAMES.md` → "4. Menu item editor"
> Reference: `docs/wireframes/04-menu-editor.html`
> Use react-dnd for the drag handles. Recipe versioning is Path A (snapshot on save) —
> see SPECIFICATION.md §4.2. The "Show diff" button compares draft against the active
> version using the row identity from `recipe_ingredients`.

### 3. Pasting screenshots when needed

If Claude Code is going off-spec on a visual detail (spacing, alignment, hierarchy),
open the relevant HTML in your browser, take a screenshot of the area, and paste the
image directly into the Claude Code message. Claude Code accepts images and will use
them as visual reference alongside the markdown spec.

## What these wireframes are — and aren't

These are **mid-fidelity wireframes**, not pixel-perfect mockups. They lock down:

- Information architecture (what's on each screen and where)
- Component choices (table vs cards vs list, dropdown vs autocomplete)
- States to handle (empty, loading, error, success, in-progress)
- Copy and microcopy
- Touch and keyboard considerations
- Color semantics (green = good, amber = warn, red = danger, blue = info)

They are deliberately silent on:

- Exact pixel spacing — your real desktop app is 1280px+, these render at 680px
- Animation timing and motion design
- Final type ramp (use whatever your component library prefers, just keep weights to 400 / 500)
- Final brand tokens (currently neutral monochrome — swap in real brand color when chosen)
- Real icons (currently inline SVG sketches — swap for Lucide or Heroicons)

## Eight screens covered

1. **Dashboard** — landing, KPI tiles, low stock, top dishes, revenue by channel
2. **Live orders** — real-time feed with status filters, source badges, mark delivered
3. **Ingredients** — table with stock-level bars, expandable movement ledger
4. **Menu item editor** — basics + recipe builder + live food-cost summary
5. **Invoice entry** — header + smart-autocomplete line items + mapping prompt
6. **Stock take** — counting screen with paused-poller banner and book vs counted diff
7. **Manual order entry** — menu picker + cart + channel selector
8. **CSV importer** — entity tabs + dry-run summary + per-row diff with errors

## Screens not yet wireframed

Captured in WIREFRAMES.md as "deferred":

- Cancellation modal (was-it-prepared prompt)
- First-run wizard (tenant + opening stock + supplier seed)
- Stock take review-and-commit (step 3 of the stepper)
- Settings (thresholds, sounds, channel adapter toggles)
- Per-dish analytics drilldown
- Mobile/tablet variant of live orders

Ask the design author for any of these before Claude Code starts the related slice.
