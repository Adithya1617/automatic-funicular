# Invoice import fast-path — design

**Status:** Draft for review
**Author:** generated 2026-05-05
**Related:** [`2026-05-05-invoice-pdf-autoparse-design.md`](./2026-05-05-invoice-pdf-autoparse-design.md), plan [`2026-05-05-invoice-pdf-autoparse.md`](../plans/2026-05-05-invoice-pdf-autoparse.md)

---

## Goal

A first-time user can take a Hyperpure PDF from "I just installed the app" to "stock movements committed" without leaving the invoice editor, without opening another page, and without pre-creating any supplier or ingredient by hand. The current flow forces 17+ context switches (set up supplier, set up each ingredient, return to editor, map each row); this design collapses that to a single inline path: drop PDF → confirm supplier → for each row, accept the suggested ingredient or one click to create it → commit.

Locked from prior conversation:
- All auto-creation is **confirmed**, not silent. The user always sees the suggested name + base unit before the row commits to anything.
- Units come from the existing pack-size parser (`g` / `ml` / `each`). No new unit logic.
- **Bulk "auto-create + map all unmapped"** is **out of scope** for this spec. Build the per-row path first; add bulk later if the per-row UX still feels slow.

## What changes (in one paragraph)

Three new affordances inside the existing invoice editor: (1) a **supplier-prompt banner** that appears when the parser sees a GSTIN that doesn't match any supplier, with one click to create the supplier from the parsed Hyperpure metadata; (2) the existing **mapping popover** gains a "Create new ingredient" item that opens the existing `NewIngredientDialog` pre-filled with a cleaned name, base unit, and category from the parsed line; (3) each invoice template gains a `suggestIngredientName(rawDescription)` hook so per-supplier name cleanup lives next to the parser that knows the format. No schema migration. No changes to `InventoryService.applyMovement`. No changes to the IPC contract (the renderer already has every hook it needs to call ingredient/supplier create).

## Architecture

### Template-side: name + category suggestion

Add to `shared/invoiceTemplates/types.ts`:

```ts
export type IngredientSuggestion = {
  name: string;          // cleaned-up name, e.g. "Lite Paneer"
  baseUnit: 'g' | 'ml' | 'each';
  category: string;      // e.g. "Dairy" — empty string if unknown
};

export interface InvoiceTemplate {
  id: string;
  defaultSupplierName: string;                                 // ← new (e.g. "Zomato Hyperpure")
  detect(text: PdfTextOutput): boolean;
  parse(text: PdfTextOutput): TemplateParseResult;
  suggestIngredient(line: ParsedLine): IngredientSuggestion;   // ← new
}
```

The renderer reads `defaultSupplierName` from the matched template (looked up by `parseResult.templateId` via a small `getTemplateById` accessor on the registry) when rendering the supplier-prompt banner.

Also extend `ParsedLine` so the template can pass through the on-PDF category section it found the line under (Hyperpure groups items under "Dairy", "Fruits & Vegetables", etc. — currently we drop these):

```ts
export type ParsedLine = {
  rawDescription: string;
  quantity: number;
  unit: '' | 'g' | 'ml' | 'each';
  unitCost: number;
  categoryHint: string;  // ← new; '' when no header was active
};
```

### Hyperpure cleanup rules

`shared/invoiceTemplates/hyperpure.ts` implements `suggestIngredient`:

```
"Gopika - Lite Paneer, 1 Kg"            → name "Lite Paneer", baseUnit "g", category from hint
"Coriander Leaves (Kothmir), 500 gm"    → name "Coriander Leaves", baseUnit "g"
"Eastmade - Black Pepper Whole, 100 gm" → name "Black Pepper Whole", baseUnit "g"
"Banana Leaf, 5 Pcs"                    → name "Banana Leaf", baseUnit "each"
```

Rules, applied in order to `rawDescription`:
1. Strip everything from the first `,` onwards (drops pack info).
2. If the remainder contains ` - ` (space-hyphen-space), drop the prefix up to and including ` - ` (drops brand).
3. Strip a trailing parenthesised qualifier if it's purely descriptive (`(Big)`, `(Mix Size)`, `(Kothmir)`); keep the rest. Heuristic: drop only when the parens appear at the end *and* its content is < 30 chars.
4. Trim, collapse whitespace, title-case the first letter of each word.

These are best-effort, not exhaustive. The user always sees the result before saving.

### Renderer-side: where the new buttons live

**Supplier-prompt banner** lives in `InvoiceEditorPage`, just above the existing duplicate banner. It renders only when `parseResult.ok === true` and the result includes an `unknown_supplier` issue. Already-emitted issue kind from `InvoiceParserService`; we just consume it.

```
┌─────────────────────────────────────────────────────────────────────┐
│  This PDF is from a supplier we don't recognise yet.                │
│  Detected GSTIN: 36AAACZ8867B1Z1                                    │
│  Suggested name: Zomato Hyperpure                                   │
│  [Create supplier and re-parse] [Pick existing supplier]            │
└─────────────────────────────────────────────────────────────────────┘
```

Clicking **Create supplier and re-parse**:
1. Opens `SupplierEditorDialog` pre-filled with `{ name: template.defaultSupplierName, gstin: "<detected>" }`.
2. On dialog success, the editor re-runs the parse against the same bytes. `InvoiceEditorPage` keeps the last dropped `Uint8Array` in a new `lastDroppedBytes` state (set whenever `PdfAttachZone.onParsed` fires, cleared on commit/discard). The supplier resolves on the second pass and the editor pre-fills as normal.

**Create-new-ingredient option** in the popover lives directly under the "Past mappings" section, before the "Map to ingredient" dropdown. It only appears when no past mapping matches and we have a `suggestIngredient` result for the line:

```
Past mappings
  (none)

→ Create new ingredient: Lite Paneer (g, Dairy)        ← new
  Map to existing ingredient: [▼ pick…]
```

Clicking the create option opens `NewIngredientDialog` pre-filled with the suggestion. On dialog success, the editor maps the row to the newly-created ingredient by id (the dialog's existing `useCreateIngredient` mutation returns the new row).

### Renderer-side: NewIngredientDialog reuse

`NewIngredientDialog` already exists for the Ingredients page. It accepts only `{ open, onOpenChange }` today. We extend it with two optional props:

```ts
type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: Partial<FormValues>;          // pre-fill name, baseUnit, category, type
  onCreated?: (ingredient: Ingredient) => void;  // fires after successful create
};
```

The Ingredients page keeps its current call site; the popover passes `initial` and `onCreated`. Same dialog, two entry points — no duplicate UI.

### Fuzzy-match existing ingredients

Inside the popover, before suggesting "create new", rank existing ingredients by match against the suggestion name. Cheap and deterministic:

1. **Exact (case-insensitive) match on name** → top of "Map to existing"
2. **Token overlap ≥ 50%** (split both on whitespace, lowercase, intersect over union) → "looks like" section above the full dropdown
3. **Substring containment** (suggestion contained in existing or vice versa) → "looks like" section

Show up to 3 candidates as one-click chips. If a chip is clicked, the row maps to that existing ingredient and a `supplier_item_mappings` row is upserted on the next save (existing behaviour — no change). If none look right, the user clicks "Create new" or picks from the full dropdown. No LLM, no fuzzy library — just a 30-line ranker in `shared/invoiceTemplates/match.ts`.

## Data flow (per dropped PDF)

```
Drop PDF
   │
   ▼
parse(bytes) ─────► ParseResult
   │
   ├─ ok === false, reason === 'unknown_supplier_format'
   │     → "PDF format not recognised — fill manually" banner (existing)
   │
   ├─ ok === false, reason === 'duplicate'
   │     → duplicate banner (existing)
   │
   └─ ok === true
         │
         ├─ if issues includes unknown_supplier
         │     → render Supplier-prompt banner
         │     → user clicks Create → SupplierEditorDialog → onCreated → re-parse same bytes
         │
         ├─ pre-fill header (existing)
         ├─ pre-fill rows (existing)
         │
         └─ for each row with ingredientId === null:
              compute suggestion = template.suggestIngredient(parsedLine)
              compute match candidates = rankExisting(suggestion.name, allIngredients)
              render popover with [candidates] + [Create new: {suggestion}] + [full dropdown]
              user picks one → row maps
```

The existing `InvoiceParserService.parse` does not change. The renderer drives the whole UX from the existing `ParseResult`.

## Edge cases

- **Suggestion is empty after cleanup** (e.g. comma at position 0 in some weird description): the create-new option still appears but the dialog opens with `name=''` so the user must type one. Don't try to be clever — fail open to manual entry.
- **User edits the name before saving the new ingredient**: the dialog uses the user's edited name. The popover then maps to the returned ingredient by id, so the displayed name on the row matches what they typed, not the suggestion.
- **Category hint is empty**: dialog opens with category blank; user must fill it (existing required-field behaviour). Don't guess "Other".
- **Duplicate ingredient name**: the existing `useCreateIngredient` mutation surfaces the server error in the dialog's `serverError` state. User can either rename or close-and-pick-existing. No new handling.
- **Re-parse after supplier create fails** (e.g. GSTIN already taken — race): show the supplier dialog's error inline, do not navigate anyway. Editor stays as-is.
- **User dismisses the supplier prompt without creating**: banner gets a "Dismiss" link that hides the banner for the rest of the session. Header supplier field stays empty; user can pick manually. We don't persist the dismiss across sessions — next time they drop the same PDF, the prompt comes back, which is fine.
- **Token-overlap match confused by short tokens**: the ranker drops tokens of length ≤ 2 (so "1 Kg" stops causing false matches between unrelated rows). Tested via cases below.

## Test strategy

New unit tests:
- `tests/shared/hyperpureSuggest.test.ts` — every line in the sample PDF goes through `HyperpureTemplate.suggestIngredient` and the test asserts the cleaned name and base unit. Oracle table, 17 rows.
- `tests/shared/ingredientMatch.test.ts` — table tests for the ranker: exact match, token overlap, substring, no match, short-token rejection.

Existing tests are unaffected because:
- `ParsedLine` gains `categoryHint` but existing tests don't read it.
- `InvoiceTemplate.suggestIngredient` is additive on the interface.

Manual smoke (replaces step-heavy Task 15 in the prior plan):
1. Fresh user, no suppliers, no ingredients.
2. Drop the Hyperpure sample. Click "Create supplier and re-parse" → confirm dialog → editor pre-fills.
3. Click the first row → popover shows "Create new ingredient: Mushroom Slices (g, Canned & Imported Items)" → click → dialog pre-filled → confirm → row maps.
4. Repeat for 2-3 more rows, then **Map & commit**. Confirm `purchase` movements landed.
5. Drop the same PDF on a new draft → duplicate banner (existing).
6. Drop a different (hypothetical) Hyperpure PDF for the same supplier → at least the previously-mapped rows auto-map (existing `supplier_item_mappings` behaviour).

## What we're explicitly not building

- **Bulk "auto-create + map all unmapped" button.** Deferred. Build the per-row path first and see if it's fast enough.
- **AI / LLM name cleanup.** Regex rules per template are sufficient for the supplier formats we support today. Revisit only when a template's rules become unwieldy.
- **Fuzzy match across suppliers.** Mapping is per-supplier (`supplier_item_mappings.supplier_id`); we keep it that way to avoid cross-contamination.
- **Onboarding tour / first-run wizard.** The supplier-prompt banner is the onboarding for the invoice flow. Anything bigger is over-engineering for the current user count.
- **Supplier-prompt at a global level** (e.g. on the Ingredients page when an unknown supplier appears elsewhere). The prompt lives only in the invoice editor where the parsed metadata exists.

## Future work (not in this spec)

- Bulk "auto-create + map all unmapped" button (decide after this ships based on real usage).
- More supplier templates: each ships its own `suggestIngredient` cleanup rules. The `InvoiceTemplate` interface in this spec is intentionally additive.
- Reverse-invoice flow remains as-is in the prior spec.

## Out-of-scope acceptance

This spec must be fulfilled without:
- Schema migrations (`gstin`, `supplier_item_mappings`, etc. already shipped).
- Changes to `InventoryService.applyMovement`.
- Changes to the IPC contract (no new channels).
- Changes to `InvoiceParserService` business logic — only consumer code in the renderer.
