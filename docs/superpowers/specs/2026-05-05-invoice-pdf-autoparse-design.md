# Invoice PDF auto-parse on drop

**Status:** approved (brainstorming complete 2026-05-05)
**Owner:** Adithya
**Related:** slice 6 (invoice flow), CLAUDE.md locked decisions §3.1, §3.4, §3.5

## Goal

When the user drops a supplier invoice PDF onto the existing invoice editor's
PDF zone, the editor pre-fills the header and every line item from the parsed
PDF. After mapping any never-seen-before line descriptions to ingredients
once, a single click commits the invoice and writes `purchase` movements
through the existing chokepoint. Subsequent invoices from the same supplier
require no manual data entry — drop, glance, commit.

## Non-goals

- Generic "any-supplier" PDF parsing (deferred — see Future work).
- AI / LLM / OCR (deferred — see Future work).
- Auto-creation of unknown ingredients (rejected during brainstorming —
  see "Decisions" §D2).
- Auto-commit without a click (rejected for v1 — see "Decisions" §D3;
  inbox / bulk auto-commit is captured under Future work).
- Reverse-invoice flow on already-committed invoices (separate v1.1 item
  already in CLAUDE.md deferred work).

## Decisions (from brainstorming)

| # | Decision | Chosen | Rejected |
|---|---|---|---|
| D1 | Supplier scope | Known set, one code template per supplier; Hyperpure ships first | Hyperpure-only; any-supplier via AI; local LLM |
| D2 | Unknown ingredients | Never auto-create; line stays unmapped until a human picks an ingredient once; mapping is remembered for next time | Auto-create from description; quarantine queue |
| D3 | UX | Drop on existing `PdfAttachZone`; pre-fill existing editor; reuse existing Save draft → Map & commit chain | Separate inbox screen; hybrid |
| D4 | Cost basis | `Total ÷ Inv. Qty` from PDF (post-tax, post-discount) | Taxable Amount; per-supplier setting |
| D5 | Pack size | Always extract `, <num> <unit>` from end of description and explode to base units; lines that fail extraction become unmapped rows | Store as `each` packs; explode-or-fallback |
| D6 | "Other Charges" rows (delivery, COD fee, TCS) | Skip silently; surface as one info-line "₹X in fees not added to stock" under the totals card | Book as separate movement; require user to file under a supplier expense |
| D7 | Duplicate detection | If a `(supplier_id, invoice_number)` invoice already exists, refuse the parse and link to the existing invoice | Allow duplicate; warn-only |

## Architecture

One new service, one new shared module, one schema migration. No changes to
`InventoryService.applyMovement`, no changes to the cost / movement
chokepoint. The parser is a pure function over a PDF buffer; nothing it
does writes to the database. Stock changes only at commit time, via the
existing slice 6 path.

```
shared/
  schemas/
    invoiceParser.ts          NEW  Zod: ParsedInvoice, ParsedLine, ParseIssue,
                                   ParseResult (discriminated union ok/err)
  utils/
    pdfText.ts                NEW  Thin wrapper over pdfjs-dist;
                                   PDF buffer → { pages: { items: TextItem[] }[] }
                                   where TextItem carries { str, x, y, width }
  invoiceTemplates/
    types.ts                  NEW  interface InvoiceTemplate {
                                     id: string
                                     detect(pdf): boolean
                                     parse(pdf): { header, lines, issues }
                                   }
    hyperpure.ts              NEW  Hyperpure template (see §"Hyperpure template")
    index.ts                  NEW  Registry: detect(pdf) → InvoiceTemplate | null

main/
  services/
    InvoiceParserService.ts   NEW  parse(pdfBuffer) → ParseResult
                                   (text extract → template detect → apply
                                    → resolve supplier by GSTIN → resolve
                                    each line via supplier_item_mappings →
                                    duplicate check → return)
  ipc/
    invoiceParserHandlers.ts  NEW  invoices:parse 3-line passthrough using
                                   makeHandler(schema, fn)

renderer/
  features/invoices/
    PdfAttachZone.tsx         MOD  On drop, calls invoices:parse first.
                                   On ok: lifts header + lines to parent via
                                          new onParsed callback, then attaches.
                                   On err(unknown_supplier_format / ocr_needed):
                                          attaches PDF only, leaves form blank
                                          (current behaviour).
                                   On err(duplicate): shows existing invoice
                                          link, does NOT attach.
  pages/
    InvoiceEditorPage.tsx     MOD  Accepts onParsed payload, replaces local
                                   header + rows state, sets a "from PDF"
                                   banner. If editor is non-empty when a PDF
                                   is dropped, confirms before replacing.

No schema migration. The existing supplier_item_mappings table is
sufficient — pack size is re-extracted from the description by regex
on every parse, which works on 100% of real Hyperpure rows. The
mapping table keeps its existing role: remembering ingredient_id and
last quantity/unit/cost defaults per (supplier, raw_description).
```

## Data flow on PDF drop

1. User drops PDF on `PdfAttachZone`. File buffer (`ArrayBuffer`) is sent
   over IPC to `invoices:parse`.
2. `InvoiceParserService.parse(buffer)` runs:
   1. **Text extraction:** `pdfText.extract(buffer)` returns
      `{ pages: { items: TextItem[] }[] }` via `pdfjs-dist` in the main
      process. If extraction throws or returns zero text items across
      all pages → `{ ok: false, reason: 'unknown_supplier_format' }`
      (assumed to be a scanned/image PDF; OCR is out of scope for v1).
   2. **Template detection:** `templates.detect(extracted)` walks the
      registry and returns the first matching `InvoiceTemplate` or `null`.
      Detection runs against the joined plain text of page 1.
      If `null` → `{ ok: false, reason: 'unknown_supplier_format' }`.
   3. **Template parse:** `template.parse(extracted)` returns
      `{ header, lines, issues }` (template-specific logic; see
      §"Hyperpure template" for the only one shipping in this slice).
   4. **Supplier resolve:** look up suppliers by GSTIN (case-insensitive,
      whitespace-stripped). On hit, attach `supplier_id` to the header.
      On miss, push `{ kind: 'unknown_supplier', gstin }` into issues
      and leave `supplier_id = null`.
   5. **Duplicate check:** if `supplier_id` and `invoice_number` are both
      set, query `invoices` for `(supplier_id, invoice_number)`. If a
      committed or draft invoice exists →
      `{ ok: false, reason: 'duplicate', existingInvoiceId }`.
      Return immediately; nothing is attached.
   6. **Per-line mapping resolve:** for each parsed line, look up
      `supplier_item_mappings(supplier_id, raw_description)`. On hit:
      attach `ingredient_id`. Pack size is always re-extracted from the
      description regex (no separate cache) — this is correct for
      Hyperpure where the pack size is part of the description string.
   7. **Quantity normalisation:** `quantity_in_base_unit = inv_qty ×
      pack_size`; `unit_cost = total_post_tax / quantity_in_base_unit`
      (D4: Total column from the PDF). After the normalisation table in
      §"Hyperpure template", `pack_unit` is already one of `g` / `ml` /
      `each` (the system base units per locked decision §3.4), so the
      line emitted to the editor is *already in base units* — no
      `unitConverter` call needed at commit time for parsed lines.
      Hand-entered lines still go through the converter as today.
   8. **Return** `{ ok: true, header, lines, issues }`.
3. Renderer `PdfAttachZone` calls `props.onParsed(parsedInvoice)`. The
   editor page replaces its `header` and `rows` state. Lines with
   `ingredient_id` set render as normal mapped rows; lines without
   render as today's "needs review" rows with the dropdown empty
   (existing `InvoiceLineRow` styling — no new component needed).
4. Issues array drives a small banner above the totals card:
   `2 lines need an ingredient mapping`,
   `₹254.82 in fees not added to stock (Delivery: ₹234.82, COD: ₹20)`.
5. User maps any unmapped rows (often zero on second invoice onward),
   clicks **Map & commit**. Existing `InvoiceService.commit` runs
   unchanged: writes one `purchase` per line via
   `InventoryService.applyMovement`, and the existing supplier-mapping
   upsert at commit time records the (supplier, raw_description) →
   ingredient mapping for next invoice.

## Hyperpure template

One file, ~150 lines, no runtime deps beyond `pdfjs-dist`.

**Detection.** `text` (lowercased, joined items of page 1) contains
`"hyperpure"` AND any GSTIN matching `/\b\d{2}[A-Z]{5}\d{4}[A-Z]\d[Z]\d\b/`
that resolves to Hyperpure's known issuer (`36AAACZ8867B1Z1` for HYD2).
A constant array `KNOWN_HYPERPURE_GSTINS` lets us add other Hyperpure
warehouses without code changes.

**Header extraction.**
- Invoice number: `Order No:\s*(\S+)` from page-1 text (your sample:
  `ZHPTG27-OR-0025869827`).
- Invoice date: line immediately after `Invoice Date`, parsed as
  `dd MMM yyyy` (`28 Apr 2026` → unix ms at noon local time, mirroring
  the existing `inputValueToUnixMs` convention).
- Supplier GSTIN: the first GSTIN matched on page 1 in the
  "Shipped From" block (we anchor on `Shipped From` then look for the
  next GSTIN within ~10 lines).

**Line extraction.** The Hyperpure table has fixed column order:
`SI No. | Description | HSN | Inv Qty | Unit Price | UoM | Pre Tax | Discount | Taxable | Tax Rate | Total Tax | Total`.
PDF.js text items carry x-coordinates; we determine each column's x-range
from the header row, then bucket every subsequent text item into a column
by x. Rows are grouped by y-coordinate (with a small tolerance for
description wraps). We walk in order, breaking on category headers
(`Canned & Imported Items`, `Dairy`, `Fruits & Vegetables`,
`Masala, Salt & Sugar`, `Sauces & Seasoning`) and stopping at
`Other Charges`. This is more reliable than pure regex on multi-line
descriptions.

**Pack-size extraction.**
`/,\s*(\d+(?:\.\d+)?)\s*(gm|g|kg|ml|l|pcs|pack)\b/i` applied to the
description, taking the **first** match. (`count` is intentionally not
in the alternation — it appears only as a UoM-column value in Hyperpure
PDFs, never as a pack-size suffix in the description.) Normalisation
collapses straight to system base units:
| Matched | `pack_size` (after normalise) | `pack_unit` |
|---|---|---|
| `gm`, `g` | as-is | `g` |
| `kg` | × 1000 | `g` |
| `ml` | as-is | `ml` |
| `l` | × 1000 | `ml` |
| `pcs`, `pack` | as-is | `each` |

If no match: `pack_size` is null, line is emitted with `quantity = inv_qty`
and `unit = ''`; the row will render as needs-review and the user picks a
unit at map time. (The remembered mapping from a prior invoice can
still rescue this case if the description matches.)

**Quantity + cost.** `quantity_in_pack_unit = inv_qty × pack_size`,
`unit_cost = total / quantity_in_pack_unit`, where `total` is the **Total**
column (D4: post-tax, post-discount).

**Skipped lines.** Rows under `Other Charges` (Delivery Charge,
Pay On Delivery Charge, TCS) are not stock movements and not invoice
lines in our schema. They produce
`{ kind: 'skipped_charge', label, total }` issues. Default behaviour:
silent skip with the info banner described above.

**Issues vs failures.** Issues are non-fatal and ride along on a
successful parse. The only ways `parse` returns `ok: false` are:
`unknown_supplier_format`, `duplicate`, and (theoretically)
`pdf_extraction_failed` if pdfjs-dist throws.

## Schema migration

One small additive migration: add a nullable `gstin TEXT` column to the
`suppliers` table. Required so the parser can resolve the supplier by
the GSTIN extracted from the PDF. Existing rows survive (column is
nullable); the supplier editor form gains a single GSTIN input.

The `supplier_item_mappings` table is **not** touched — pack size is
re-extracted from the description regex on every parse, and the
existing `defaultQuantity` / `defaultUnit` / `lastUnitCost` columns
continue to mean "what the user committed last time" (autofill
defaults in the popover), unchanged.

Two new repository methods are added (no schema impact):
- `supplierRepository.findByGstin(db, tenantId, gstin)`
- `invoiceRepository.findByNumber(db, tenantId, supplierId, invoiceNumber)`

## IPC contract

```ts
// shared/schemas/invoiceParser.ts
export const parseInvoiceInput = z.object({
  pdf: z.instanceof(ArrayBuffer),
});

export const parsedLineSchema = z.object({
  rawDescription: z.string(),
  ingredientId: z.string().nullable(),
  quantity: z.number(),
  unit: z.string(),         // pack_unit or '' if unknown
  unitCost: z.number(),
});

export const parseIssueSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('unknown_supplier'), gstin: z.string() }),
  z.object({ kind: z.literal('skipped_charge'), label: z.string(), total: z.number() }),
  z.object({ kind: z.literal('unparseable_pack_size'), rawDescription: z.string() }),
  z.object({ kind: z.literal('unmappable_line'), rawDescription: z.string() }),
]);

export const parseResultSchema = z.discriminatedUnion('ok', [
  z.object({
    ok: z.literal(true),
    templateId: z.string(),
    header: z.object({
      supplierId: z.string().nullable(),
      invoiceNumber: z.string(),
      invoiceDate: z.number(),  // unix ms
    }),
    lines: z.array(parsedLineSchema),
    issues: z.array(parseIssueSchema),
  }),
  z.object({
    ok: z.literal(false),
    reason: z.enum([
      'unknown_supplier_format',
      'duplicate',
      'pdf_extraction_failed',
    ]),
    existingInvoiceId: z.string().optional(),  // only for duplicate
  }),
]);
```

IPC channel: `invoices:parse`. Handler is the standard 3-line
`makeHandler(parseInvoiceInput, (input) => invoiceParserService.parse(input.pdf))`.

## Edge cases & failure modes

| Case | Behaviour |
|---|---|
| Scanned/image PDF (no text) | `unknown_supplier_format`, fall back to manual entry. PDF still attaches. |
| Encrypted/password PDF | pdfjs throws → caught, `pdf_extraction_failed`, fall back to manual. |
| Template matches, header parse misses invoice_number or date | Issues emitted; whatever was parsed is returned. Editor leaves the missing field blank for user to fill. Header validation in editor still gates Save draft. |
| Row's pack size unparseable | Issue emitted; row goes through with `quantity = inv_qty`, `unit = ''`. Renders as needs-review. |
| Mapping exists but the ingredient was soft-deleted | Treat as mapping miss; row renders as needs-review. |
| Supplier GSTIN matches a soft-deleted supplier | Treat as `unknown_supplier`; user picks an active supplier. |
| Multi-page PDFs | `pdfText.extract` returns all pages; template walks the joined item list. Sample is 2 pages and works fine. |
| Same PDF dropped twice on the same draft | Confirm replace dialog (existing UX courtesy). Mapping memory makes the second parse identical. |
| User dropped wrong PDF (different supplier than draft's selected supplier) | Parser still detects template; if parsed `supplier_id` differs from draft's, show a confirm dialog before replacing. |
| `inv_qty = 0` or negative | Issue `unmappable_line`; row skipped. |
| Concurrent draft with a different invoice number for the same `(supplier_id, invoice_number)` | Duplicate check fires; user gets the link to the existing invoice. |

Reconciliation on boot is unaffected — parser writes nothing to stock.

## New dependency

| Package | Why | Size | Native? |
|---|---|---|---|
| `pdfjs-dist` (MIT) | PDF text + geometry extraction in main process. Used only by `shared/utils/pdfText.ts`. | ~3 MB | Pure JS (no `electron-rebuild` cost). |

No AI SDK, no OCR engine, no external service. Stays offline. Approved
during brainstorming.

## Test strategy

`InvoiceParserService` is pure (buffer in, structure out, only reads from
the suppliers + supplier_item_mappings + invoices repos). Tests mock the
three repos and feed in fixture PDF buffers.

Fixtures live under `__fixtures__/invoices/`:
- `hyperpure-ZHPTG27-OR-0025869827.pdf` — the user-supplied sample.
- `hyperpure-edge-cases.pdf` — hand-crafted: one row with no parseable
  pack size, one row with `kg` unit, one row with `Pcs`, one
  `Other Charges` block, a duplicate description.

Test surface:
- `pdfText.extract` smoke test (buffer → non-empty pages).
- `hyperpure.detect` returns true for sample, false for an unrelated
  PDF (a non-Hyperpure fixture or a blank one).
- `hyperpure.parse` extracts header (invoice number, date, supplier
  GSTIN) from sample.
- For each row in the sample, verify `(rawDescription, quantity, unit,
  unitCost)` match the values computed from D4 + D5 (table in
  brainstorming Q5 is the oracle).
- Pack-size regex: parametric test over a corpus of ~20 description
  strings (covers `gm`, `g`, `kg`, `ml`, `L`, `Pcs`, `Pack`, `Count`,
  multiple commas, trailing parens, leading "Brand -" prefix).
- Skipped-charge issues emitted for Delivery, COD, TCS rows.
- Duplicate detection: when invoices repo mock returns an existing
  invoice for `(supplier_id, invoice_number)`, parser returns
  `ok: false, reason: 'duplicate', existingInvoiceId`.
- Supplier mapping cache: when a mapping exists with `pack_size = 800,
  pack_unit = 'g'`, the parsed line uses that, not the description
  regex.
- Unknown supplier (no GSTIN match): `unknown_supplier` issue, header
  `supplier_id` null.

Renderer wiring (`PdfAttachZone` + `InvoiceEditorPage`) gets a couple of
React Testing Library tests: drop fires `invoices:parse`, on `ok` the
editor's header and rows reflect the parsed payload, on `duplicate` the
linkout renders.

DB-touching repo tests are mocked per the existing convention (CLAUDE.md
"Dev quirks" — better-sqlite3 ABI). Migration `0011` is exercised by the
existing migration runner test if one exists; otherwise added.

## Future work (explicitly out of scope for this slice)

- Bulk inbox screen for many PDFs at once with auto-commit when every
  line is mapped (brainstorming Q3 option B). The parser is the same
  module, so the inbox is purely additive UI later.
- Additional supplier templates. Each is a new file under
  `shared/invoiceTemplates/` registered in `index.ts`. No changes to
  `InvoiceParserService`.
- AI/LLM fallback for unknown supplier formats. Same module boundary —
  registry returns a "vision" template that calls an external API.
- OCR for scanned PDFs.
- Booking "Other Charges" as a separate non-stock expense line on the
  invoice (would need a new `invoice_charges` table; not in v1 schema).
- Per-supplier cost-basis override (D4 alternative C).
