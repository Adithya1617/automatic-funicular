# Invoice Import Fast-Path Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse the first-time invoice-import flow from "set up supplier separately, set up each ingredient separately, then map" into a single inline path: drop PDF → confirm-create supplier in one click → confirm-create each missing ingredient in one click each → commit.

**Architecture:** All new behaviour lives in the renderer plus a small additive surface on `InvoiceTemplate` (`defaultSupplierName` property and a `suggestIngredient(line)` method). No changes to `InvoiceParserService`, no IPC additions, no schema migration. The existing `unknown_supplier` issue emitted by the parser drives a new banner in `InvoiceEditorPage` that opens `SupplierEditorDialog` pre-filled and re-parses the same bytes. The existing `DescriptionMappingPopover` gains a "Create new ingredient" affordance that opens `NewIngredientDialog` pre-filled with template-cleaned name + base unit + category.

**Tech Stack:** TypeScript, React, react-hook-form (already in use), Vitest. No new dependencies.

**Spec:** [docs/superpowers/specs/2026-05-05-invoice-import-fast-path-design.md](../specs/2026-05-05-invoice-import-fast-path-design.md)

---

## Task 1: Carry `categoryHint` through `ParsedLine`

The Hyperpure parser already sees on-PDF section headers ("Dairy", "Fruits & Vegetables", etc.) but discards them. We need to thread the active header onto each line so auto-create can pre-fill the ingredient category.

**Files:**
- Modify: `shared/invoiceTemplates/types.ts`
- Modify: `shared/invoiceTemplates/hyperpure.ts`
- Modify: `tests/shared/hyperpureLines.test.ts` (extend the oracle with category assertions)

- [ ] **Step 1: Extend the failing test**

In `tests/shared/hyperpureLines.test.ts`, after the existing oracle table, add a category column to a few rows and a new assertion block. Append at the end of the existing `describe('Hyperpure line parsing', ...)`:

```ts
it('attaches the active category header as categoryHint on each line', async () => {
  const text = await extractPdfText(new Uint8Array(readFileSync(SAMPLE)));
  const result = HyperpureTemplate.parse(text);
  const byDesc = (s: string) => result.lines.find((l) => l.rawDescription.includes(s));

  expect(byDesc('Mushroom Slices')?.categoryHint).toBe('Canned & Imported Items');
  expect(byDesc('Lite Paneer')?.categoryHint).toBe('Dairy');
  expect(byDesc('Beans Haricot')?.categoryHint).toBe('Fruits & Vegetables');
  expect(byDesc('Black Pepper Whole')?.categoryHint).toBe('Masala, Salt & Sugar');
  expect(byDesc('Aromatic Mix')?.categoryHint).toBe('Sauces & Seasoning');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/shared/hyperpureLines.test.ts`
Expected: FAIL — `categoryHint` is `undefined` on the parsed lines.

- [ ] **Step 3: Add `categoryHint` to `ParsedLine`**

In `shared/invoiceTemplates/types.ts`, modify the `ParsedLine` type:

```ts
export type ParsedLine = {
  rawDescription: string;
  quantity: number;
  unit: '' | 'g' | 'ml' | 'each';
  unitCost: number;
  categoryHint: string;  // '' when no header is active for this line
};
```

- [ ] **Step 4: Track the active category in `parseLines`**

In `shared/invoiceTemplates/hyperpure.ts`, modify `parseLines` to track the most recent category header and stamp it onto every line. Find this block (around the `for (const r of rows)` loop) and apply:

```ts
function parseLines(text: PdfTextOutput): { lines: ParsedLine[]; issues: ParseIssue[] } {
  const lines: ParsedLine[] = [];
  const issues: ParseIssue[] = [];

  const allItems = text.pages.flatMap((p) => p.items);
  const rows = groupItemsIntoRows(allItems);

  let inTable = false;
  let stopped = false;
  let activeCategory = '';
  for (const r of rows) {
    if (stopped) break;
    const rt = rowText(r);
    if (!inTable) {
      if (rt.includes('SI') && rt.includes('Description') && rt.includes('HSN')) {
        inTable = true;
      }
      continue;
    }
    if (rt === 'Other Charges' || rt.startsWith('Other Charges')) {
      collectCharges(rows, rows.indexOf(r) + 1, issues);
      stopped = true;
      break;
    }
    if (isCategoryHeader(rt)) {
      // Find the matching header in CATEGORY_HEADERS and remember it; use the
      // canonical form, not whatever fragment appeared on the page.
      const matched = CATEGORY_HEADERS.find((h) => rt === h || rt.startsWith(h));
      activeCategory = matched ?? rt;
      continue;
    }

    const parsed = parseLineRow(rt);
    if (!parsed) continue;

    const pack = extractPackSize(parsed.description);
    if (!pack) {
      issues.push({ kind: 'unparseable_pack_size', rawDescription: parsed.description });
      lines.push({
        rawDescription: parsed.description,
        quantity: parsed.invQty,
        unit: '',
        unitCost: parsed.total / parsed.invQty,
        categoryHint: activeCategory,
      });
      continue;
    }

    const totalQtyBase = parsed.invQty * pack.size;
    lines.push({
      rawDescription: parsed.description,
      quantity: totalQtyBase,
      unit: pack.unit,
      unitCost: parsed.total / totalQtyBase,
      categoryHint: activeCategory,
    });
  }

  return { lines, issues };
}
```

(Note: `CATEGORY_HEADERS` already excludes `'Other Charges'` from being treated as an ingredient category in this loop because the `Other Charges` check happens *before* `isCategoryHeader`. Keep that order.)

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/shared/hyperpureLines.test.ts`
Expected: PASS — all 17-line oracle assertions plus the new categoryHint cases green.

- [ ] **Step 6: Commit**

```bash
git add shared/invoiceTemplates/types.ts shared/invoiceTemplates/hyperpure.ts tests/shared/hyperpureLines.test.ts
git commit -m "feat(invoices): carry parsed category through ParsedLine.categoryHint"
```

---

## Task 2: Carry `categoryHint` through the IPC schema

The wire-format `ParsedLine` in `shared/schemas/invoiceParser.ts` doesn't yet include `categoryHint`, so the renderer can't get the parsed category onto the create-ingredient dialog. Extend the schema and `InvoiceParserService` to propagate it.

**Files:**
- Modify: `shared/schemas/invoiceParser.ts`
- Modify: `main/services/InvoiceParserService.ts`
- Modify: `tests/shared/invoiceParserSchema.test.ts`
- Modify: `tests/main/InvoiceParserService.test.ts`

- [ ] **Step 1: Update the schema test**

In `tests/shared/invoiceParserSchema.test.ts`, modify the existing "accepts a successful parse" case so the line includes `categoryHint`:

```ts
it('accepts a successful parse', () => {
  const input = {
    ok: true,
    templateId: 'hyperpure',
    header: {
      supplierId: 'sup-1',
      invoiceNumber: 'ZHPTG27',
      invoiceDate: 1714291200000,
    },
    lines: [
      { rawDescription: 'Paneer, 1 Kg', ingredientId: 'ing-1', quantity: 1000, unit: 'g', unitCost: 0.291, categoryHint: 'Dairy' },
    ],
    issues: [{ kind: 'skipped_charge', label: 'Delivery Charge', total: 234.82 }],
  };
  expect(parseResultSchema.parse(input)).toEqual(input);
});
```

Also add a new case asserting `categoryHint` is required:

```ts
it('rejects a line missing categoryHint', () => {
  const input = {
    ok: true,
    templateId: 'hyperpure',
    header: { supplierId: null, invoiceNumber: 'X', invoiceDate: 0 },
    lines: [
      { rawDescription: 'X', ingredientId: null, quantity: 1, unit: 'g', unitCost: 1 },
    ],
    issues: [],
  };
  expect(() => parseResultSchema.parse(input)).toThrow();
});
```

- [ ] **Step 2: Run test to verify both new expectations fail**

Run: `npx vitest run tests/shared/invoiceParserSchema.test.ts`
Expected: the modified case still passes (Zod ignores extra fields by default), and the new "rejects a line missing categoryHint" fails.

- [ ] **Step 3: Add `categoryHint` to `parsedLineSchema`**

In `shared/schemas/invoiceParser.ts`, modify `parsedLineSchema`:

```ts
export const parsedLineSchema = z.object({
  rawDescription: z.string(),
  ingredientId: z.string().nullable(),
  quantity: z.number(),
  unit: z.string(),
  unitCost: z.number(),
  categoryHint: z.string(),
});
```

- [ ] **Step 4: Update the schema test passes**

Run: `npx vitest run tests/shared/invoiceParserSchema.test.ts`
Expected: PASS — both the modified case and the new case green.

- [ ] **Step 5: Update the InvoiceParserService test fixtures**

In `tests/main/InvoiceParserService.test.ts`, the test imports the service and asserts `out.lines.length === 17` plus checks individual fields like `ingredientId` and `rawDescription`. The service maps each `ParsedLine` from the template through. We need to ensure the renderer-facing lines now include `categoryHint`. There is no test that explicitly asserts `categoryHint`, so the existing tests should still pass — but add a new case to assert propagation:

```ts
it('propagates categoryHint from the template through to renderer-facing lines', async () => {
  vi.spyOn(supplierRepository, 'findByGstin').mockReturnValue({
    id: 'sup-hyperpure',
    tenantId: DEFAULT_TENANT_ID,
    name: 'Zomato Hyperpure',
    gstin: '36AAACZ8867B1Z1',
    isActive: true,
  } as never);
  vi.spyOn(invoiceRepository, 'findByNumber').mockReturnValue(null as never);
  vi.spyOn(supplierItemMappingRepository, 'findByDescription').mockReturnValue(null as never);

  const buf = new Uint8Array(readFileSync(SAMPLE));
  const out = await InvoiceParserService.parse(fakeDb, DEFAULT_TENANT_ID, { bytes: buf });

  expect(out.ok).toBe(true);
  if (!out.ok) return;
  const paneer = out.lines.find((l) => l.rawDescription.includes('Lite Paneer'));
  expect(paneer?.categoryHint).toBe('Dairy');
  const carrot = out.lines.find((l) => l.rawDescription.includes('Carrots (Big)'));
  expect(carrot?.categoryHint).toBe('Fruits & Vegetables');
});
```

- [ ] **Step 6: Run that test to confirm it fails**

Run: `npx vitest run tests/main/InvoiceParserService.test.ts`
Expected: FAIL — service-side mapping currently strips `categoryHint`.

- [ ] **Step 7: Update `InvoiceParserService` to propagate `categoryHint`**

In `main/services/InvoiceParserService.ts`, find the `lines` mapping inside the success-path return:

```ts
const lines = tplResult.lines.map((line) => {
  let ingredientId: string | null = null;
  if (supplierId) {
    const mapping = supplierItemMappingRepository.findByDescription(
      db,
      tenantId,
      supplierId,
      line.rawDescription,
    );
    if (mapping) ingredientId = mapping.ingredientId;
  }
  return { ...line, ingredientId };
});
```

`...line` already spreads `categoryHint` because `tplResult.lines` is `ParsedLine[]` (which now includes `categoryHint` via Task 1). The only thing to verify is that the return type matches the schema. No code change should be needed; if typescript complains, ensure the wire-format response shape includes `categoryHint`.

- [ ] **Step 8: Run both updated tests**

Run: `npx vitest run tests/shared/invoiceParserSchema.test.ts tests/main/InvoiceParserService.test.ts`
Expected: PASS — all green.

- [ ] **Step 9: Commit**

```bash
git add shared/schemas/invoiceParser.ts main/services/InvoiceParserService.ts tests/shared/invoiceParserSchema.test.ts tests/main/InvoiceParserService.test.ts
git commit -m "feat(invoices): propagate ParsedLine.categoryHint over IPC"
```

---

## Task 3: `suggestIngredient` hook on `InvoiceTemplate` + Hyperpure cleanup rules

**Files:**
- Modify: `shared/invoiceTemplates/types.ts`
- Modify: `shared/invoiceTemplates/hyperpure.ts`
- Test: `tests/shared/hyperpureSuggest.test.ts` (new)

- [ ] **Step 1: Write failing test**

Create `tests/shared/hyperpureSuggest.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { HyperpureTemplate } from '../../shared/invoiceTemplates/hyperpure';
import type { ParsedLine } from '../../shared/invoiceTemplates/types';

function line(
  rawDescription: string,
  unit: '' | 'g' | 'ml' | 'each',
  categoryHint = '',
): ParsedLine {
  return { rawDescription, quantity: 0, unit, unitCost: 0, categoryHint };
}

describe('HyperpureTemplate.suggestIngredient', () => {
  const cases: Array<[string, '' | 'g' | 'ml' | 'each', string, { name: string; baseUnit: 'g' | 'ml' | 'each'; category: string }]> = [
    // brand prefix stripped, pack tail stripped
    ['Gopika - Lite Paneer, 1 Kg', 'g', 'Dairy', { name: 'Lite Paneer', baseUnit: 'g', category: 'Dairy' }],
    ['Golden Crown - Mushroom Slices, 800 gm', 'g', 'Canned & Imported Items', { name: 'Mushroom Slices', baseUnit: 'g', category: 'Canned & Imported Items' }],
    ['Eastmade - Black Pepper Whole, 100 gm', 'g', 'Masala, Salt & Sugar', { name: 'Black Pepper Whole', baseUnit: 'g', category: 'Masala, Salt & Sugar' }],
    ["Rich's - Versatie Gold Cream, 1 L", 'ml', 'Dairy', { name: 'Versatie Gold Cream', baseUnit: 'ml', category: 'Dairy' }],
    // no brand prefix, trailing parens dropped (descriptive qualifier)
    ['Coriander Leaves (Kothmir), 500 gm', 'g', 'Fruits & Vegetables', { name: 'Coriander Leaves', baseUnit: 'g', category: 'Fruits & Vegetables' }],
    ['Carrots (Big), 1 Kg', 'g', 'Fruits & Vegetables', { name: 'Carrots', baseUnit: 'g', category: 'Fruits & Vegetables' }],
    ['Green Capsicum (Big Size), 1 Kg', 'g', 'Fruits & Vegetables', { name: 'Green Capsicum', baseUnit: 'g', category: 'Fruits & Vegetables' }],
    // each / pcs path
    ['Banana Leaf, 5 Pcs', 'each', 'Fruits & Vegetables', { name: 'Banana Leaf', baseUnit: 'each', category: 'Fruits & Vegetables' }],
    // brand with trailing parens
    ['Nutralite - Professional Fat Spread, 500 gm', 'g', 'Dairy', { name: 'Professional Fat Spread', baseUnit: 'g', category: 'Dairy' }],
    // empty category propagates
    ['Beans Haricot, 500 gm', 'g', '', { name: 'Beans Haricot', baseUnit: 'g', category: '' }],
    // no comma → uses entire description
    ['Some Plain Item', 'g', 'Misc', { name: 'Some Plain Item', baseUnit: 'g', category: 'Misc' }],
    // double-space / weird whitespace collapses
    ['  Foo  -  Bar  Item ,  100 gm', 'g', '', { name: 'Bar Item', baseUnit: 'g', category: '' }],
  ];

  it.each(cases)('cleans %j (%s)', (raw, unit, cat, expected) => {
    const out = HyperpureTemplate.suggestIngredient(line(raw, unit, cat));
    expect(out).toEqual(expected);
  });

  it('falls back to baseUnit "each" if the parsed line has unit=""', () => {
    const out = HyperpureTemplate.suggestIngredient(line('Mystery Item, x foo', '', ''));
    expect(out.baseUnit).toBe('each');
  });

  it('drops a trailing parens block only when its content is < 30 chars', () => {
    // long parenthetical kept
    const long = HyperpureTemplate.suggestIngredient(
      line('Some Item (this is a very long descriptive parenthetical block here), 1 Kg', 'g', ''),
    );
    expect(long.name).toBe(
      'Some Item (this Is A Very Long Descriptive Parenthetical Block Here)',
    );
    // short parenthetical dropped
    const short = HyperpureTemplate.suggestIngredient(line('Some Item (Big), 1 Kg', 'g', ''));
    expect(short.name).toBe('Some Item');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/shared/hyperpureSuggest.test.ts`
Expected: FAIL — `HyperpureTemplate.suggestIngredient is not a function`.

- [ ] **Step 3: Add the new interface members**

In `shared/invoiceTemplates/types.ts`, append the new types and extend `InvoiceTemplate`:

```ts
export type IngredientSuggestion = {
  name: string;
  baseUnit: 'g' | 'ml' | 'each';
  category: string;
};

export interface InvoiceTemplate {
  id: string;
  defaultSupplierName: string;
  detect(text: PdfTextOutput): boolean;
  parse(text: PdfTextOutput): TemplateParseResult;
  suggestIngredient(line: ParsedLine): IngredientSuggestion;
}
```

- [ ] **Step 4: Implement Hyperpure cleanup**

In `shared/invoiceTemplates/hyperpure.ts`, add this helper near the bottom, before `HyperpureTemplate`:

```ts
import type { IngredientSuggestion } from './types';

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b([a-z])/g, (_m, c) => c.toUpperCase());
}

function suggestIngredient(line: ParsedLine): IngredientSuggestion {
  // Step 1: strip everything from the first comma onwards.
  const commaIdx = line.rawDescription.indexOf(',');
  let working = (commaIdx >= 0 ? line.rawDescription.slice(0, commaIdx) : line.rawDescription).trim();

  // Step 2: drop brand prefix when " - " (space-hyphen-space) is present.
  const dashIdx = working.indexOf(' - ');
  if (dashIdx >= 0) {
    working = working.slice(dashIdx + 3).trim();
  }

  // Step 3: drop a trailing parenthesised qualifier if its inner text is < 30 chars.
  const parenMatch = /\(([^)]*)\)\s*$/.exec(working);
  if (parenMatch && parenMatch[1]!.length < 30) {
    working = working.slice(0, parenMatch.index).trim();
  }

  // Step 4: collapse whitespace and title-case.
  working = working.replace(/\s+/g, ' ').trim();
  const name = working.length > 0 ? titleCase(working) : '';

  // Base unit fallback: parsed lines whose pack-size couldn't be detected come through
  // with unit="". Default such cases to 'each' — the user can change it in the dialog.
  const baseUnit: 'g' | 'ml' | 'each' = line.unit === '' ? 'each' : line.unit;

  return { name, baseUnit, category: line.categoryHint };
}
```

Update `HyperpureTemplate` to expose `defaultSupplierName` and `suggestIngredient`:

```ts
export const HyperpureTemplate: InvoiceTemplate = {
  id: 'hyperpure',
  defaultSupplierName: 'Zomato Hyperpure',
  detect(text: PdfTextOutput): boolean {
    if (text.pages.length === 0) return false;
    const joined = text.pages[0]!.items.map((i) => i.str).join(' ');
    if (!/hyperpure/i.test(joined)) return false;
    const m = GSTIN_RE.exec(joined);
    if (!m) return false;
    return KNOWN_HYPERPURE_GSTINS.has(m[0]);
  },
  parse(text: PdfTextOutput): TemplateParseResult {
    const header = parseHeader(text);
    const { lines, issues } = parseLines(text);
    return { header, lines, issues };
  },
  suggestIngredient,
};
```

(`ParsedLine` is already imported via `./types`; if not, add it.)

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/shared/hyperpureSuggest.test.ts`
Expected: PASS — all 13 cases green.

- [ ] **Step 6: Run the full template test files to verify nothing else broke**

Run: `npx vitest run tests/shared/hyperpureLines.test.ts tests/shared/hyperpureHeader.test.ts tests/shared/hyperpureCharges.test.ts tests/shared/invoiceTemplates.test.ts`
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add shared/invoiceTemplates/types.ts shared/invoiceTemplates/hyperpure.ts tests/shared/hyperpureSuggest.test.ts
git commit -m "feat(invoices): InvoiceTemplate.suggestIngredient + Hyperpure cleanup rules"
```

---

## Task 4: `getTemplateById` accessor on the registry

The renderer needs to look up a template's `defaultSupplierName` from a `parseResult.templateId` string. Today the registry only exposes `detectTemplate(text)`.

**Files:**
- Modify: `shared/invoiceTemplates/index.ts`
- Test: `tests/shared/invoiceTemplates.test.ts` (extend)

- [ ] **Step 1: Extend the test**

Append to `tests/shared/invoiceTemplates.test.ts` inside the existing `describe('detectTemplate', ...)` block, or in a new sibling describe:

```ts
import { getTemplateById } from '../../shared/invoiceTemplates';

describe('getTemplateById', () => {
  it('returns the hyperpure template by id', () => {
    const tpl = getTemplateById('hyperpure');
    expect(tpl?.id).toBe('hyperpure');
    expect(tpl?.defaultSupplierName).toBe('Zomato Hyperpure');
  });

  it('returns null for an unknown id', () => {
    expect(getTemplateById('nope')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/shared/invoiceTemplates.test.ts`
Expected: FAIL — `getTemplateById is not exported`.

- [ ] **Step 3: Add the accessor**

In `shared/invoiceTemplates/index.ts`, append:

```ts
export function getTemplateById(id: string): InvoiceTemplate | null {
  return REGISTRY.find((t) => t.id === id) ?? null;
}
```

(`REGISTRY` is already declared in this file.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/shared/invoiceTemplates.test.ts`
Expected: PASS — both new cases plus the existing `detectTemplate` cases green.

- [ ] **Step 5: Commit**

```bash
git add shared/invoiceTemplates/index.ts tests/shared/invoiceTemplates.test.ts
git commit -m "feat(invoices): getTemplateById accessor on template registry"
```

---

## Task 5: Existing-ingredient ranker (fuzzy match)

Cheap, deterministic ranker: given a suggested name and a list of ingredients, return up to 3 most-likely existing matches.

**Files:**
- Create: `shared/invoiceTemplates/match.ts`
- Test: `tests/shared/ingredientMatch.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/shared/ingredientMatch.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { rankIngredientMatches } from '../../shared/invoiceTemplates/match';

type Ing = { id: string; name: string; isActive: boolean };

const ingredients: Ing[] = [
  { id: 'i-paneer', name: 'Paneer', isActive: true },
  { id: 'i-paneer-lite', name: 'Lite Paneer', isActive: true },
  { id: 'i-coriander', name: 'Coriander Leaves', isActive: true },
  { id: 'i-carrot', name: 'Carrots', isActive: true },
  { id: 'i-cream', name: 'Whipping Cream', isActive: true },
  { id: 'i-banana-deact', name: 'Banana Leaf', isActive: false },
  { id: 'i-pepper', name: 'Black Pepper Whole', isActive: true },
];

describe('rankIngredientMatches', () => {
  it('returns the exact-match (case-insensitive) on top', () => {
    const out = rankIngredientMatches('paneer', ingredients);
    expect(out[0]?.id).toBe('i-paneer');
  });

  it('ranks substring matches above unrelated ingredients', () => {
    const out = rankIngredientMatches('Lite Paneer', ingredients);
    expect(out.map((m) => m.id)).toEqual(
      expect.arrayContaining(['i-paneer-lite', 'i-paneer']),
    );
    expect(out[0]?.id).toBe('i-paneer-lite');
  });

  it('returns at most 3 matches', () => {
    const out = rankIngredientMatches('paneer', ingredients);
    expect(out.length).toBeLessThanOrEqual(3);
  });

  it('uses token overlap >= 50%', () => {
    const out = rankIngredientMatches('Coriander', ingredients);
    expect(out.some((m) => m.id === 'i-coriander')).toBe(true);
  });

  it('drops short tokens (length <= 2) before computing overlap', () => {
    // "Big" and "1 Kg" should not produce false matches against "Paneer"
    const out = rankIngredientMatches('Carrots Big 1 Kg', ingredients);
    expect(out[0]?.id).toBe('i-carrot');
    expect(out.some((m) => m.id === 'i-paneer')).toBe(false);
  });

  it('skips inactive ingredients', () => {
    const out = rankIngredientMatches('Banana Leaf', ingredients);
    expect(out.every((m) => m.id !== 'i-banana-deact')).toBe(true);
  });

  it('returns [] when nothing scores above the threshold', () => {
    const out = rankIngredientMatches('Quinoa', ingredients);
    expect(out).toEqual([]);
  });

  it('is case-insensitive on both sides', () => {
    const out = rankIngredientMatches('BLACK PEPPER WHOLE', ingredients);
    expect(out[0]?.id).toBe('i-pepper');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/shared/ingredientMatch.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the ranker**

Create `shared/invoiceTemplates/match.ts`:

```ts
export type RankableIngredient = {
  id: string;
  name: string;
  isActive: boolean;
};

const TOKEN_MIN_LEN = 3;
const OVERLAP_THRESHOLD = 0.5;
const MAX_RESULTS = 3;

function tokenise(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .split(/\s+/)
      .map((t) => t.replace(/[^\w]/g, ''))
      .filter((t) => t.length >= TOKEN_MIN_LEN),
  );
}

function tokenOverlap(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersect = 0;
  for (const t of a) if (b.has(t)) intersect += 1;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : intersect / union;
}

type Scored = { ingredient: RankableIngredient; score: number };

export function rankIngredientMatches<T extends RankableIngredient>(
  query: string,
  ingredients: readonly T[],
): T[] {
  const q = query.trim().toLowerCase();
  if (q.length === 0) return [];
  const qTokens = tokenise(q);

  const scored: Array<{ ing: T; score: number }> = [];
  for (const ing of ingredients) {
    if (!ing.isActive) continue;
    const name = ing.name.toLowerCase();

    let score = 0;
    if (name === q) {
      score = 1.0;
    } else if (name.includes(q) || q.includes(name)) {
      // Substring containment → strong signal but below exact match.
      score = 0.85;
    } else {
      const overlap = tokenOverlap(qTokens, tokenise(name));
      if (overlap >= OVERLAP_THRESHOLD) score = overlap;
    }
    if (score > 0) scored.push({ ing, score });
  }

  scored.sort((a, b) => b.score - a.score || a.ing.name.localeCompare(b.ing.name));
  return scored.slice(0, MAX_RESULTS).map((s) => s.ing);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/shared/ingredientMatch.test.ts`
Expected: PASS, all 8 cases green.

- [ ] **Step 5: Commit**

```bash
git add shared/invoiceTemplates/match.ts tests/shared/ingredientMatch.test.ts
git commit -m "feat(invoices): deterministic ingredient match ranker (exact / substring / token overlap)"
```

---

## Task 6: `NewIngredientDialog` accepts pre-fill + onCreated

**Files:**
- Modify: `renderer/features/ingredients/NewIngredientDialog.tsx`
- Modify: `renderer/pages/IngredientsPage.tsx` (no behaviour change — just verify props still satisfy)

- [ ] **Step 1: Extend props**

In `renderer/features/ingredients/NewIngredientDialog.tsx`, change the `Props` and add `useEffect` to re-seed defaults when `initial` changes:

```tsx
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import type { Ingredient } from '@shared/schemas/ingredient';
// ...other imports unchanged

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: {
    name?: string;
    category?: string;
    baseUnit?: BaseUnit;
    type?: IngredientType;
  };
  onCreated?: (ingredient: Ingredient) => void;
};

export function NewIngredientDialog({ open, onOpenChange, initial, onCreated }: Props) {
  const create = useCreateIngredient();
  const [serverError, setServerError] = useState<string | null>(null);
  const { register, handleSubmit, reset, watch, setValue, formState } = useForm<FormValues>({
    defaultValues: {
      name: initial?.name ?? '',
      category: initial?.category ?? '',
      type: initial?.type ?? 'raw',
      baseUnit: initial?.baseUnit ?? 'g',
      lowStockThreshold: 0,
      densityGPerMl: '',
    },
  });

  useEffect(() => {
    if (open) {
      reset({
        name: initial?.name ?? '',
        category: initial?.category ?? '',
        type: initial?.type ?? 'raw',
        baseUnit: initial?.baseUnit ?? 'g',
        lowStockThreshold: 0,
        densityGPerMl: '',
      });
      setServerError(null);
    }
  }, [open, initial?.name, initial?.category, initial?.baseUnit, initial?.type, reset]);

  // ...rest unchanged
```

- [ ] **Step 2: Fire `onCreated` after a successful save**

In the same file, modify `onSubmit` to capture and forward the created row:

```tsx
const onSubmit = handleSubmit(async (values) => {
  setServerError(null);
  try {
    const densityNum = values.densityGPerMl.trim() === '' ? null : Number(values.densityGPerMl);
    const created = await create.mutateAsync({
      name: values.name.trim(),
      category: values.category.trim(),
      type: values.type,
      baseUnit: values.baseUnit,
      lowStockThreshold: Number(values.lowStockThreshold) || 0,
      densityGPerMl: densityNum != null && Number.isFinite(densityNum) && densityNum > 0 ? densityNum : null,
    });
    if (onCreated) onCreated(created);
    reset();
    onOpenChange(false);
  } catch (err) {
    setServerError(err instanceof Error ? err.message : 'Could not save ingredient');
  }
});
```

- [ ] **Step 3: Verify the existing call site still compiles**

The Ingredients page should call `<NewIngredientDialog open={...} onOpenChange={...} />` as before — both new props are optional, so no change is needed there.

- [ ] **Step 4: Typecheck**

Run: `env -u ELECTRON_RUN_AS_NODE npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add renderer/features/ingredients/NewIngredientDialog.tsx
git commit -m "feat(ingredients): NewIngredientDialog accepts initial values + onCreated callback"
```

---

## Task 7: `DescriptionMappingPopover` shows fuzzy chips + "Create new ingredient"

**Files:**
- Modify: `renderer/features/invoices/DescriptionMappingPopover.tsx`

- [ ] **Step 1: Extend props + render the new sections**

Replace the contents of `renderer/features/invoices/DescriptionMappingPopover.tsx` with:

```tsx
import type { Ingredient } from '@shared/schemas/ingredient';
import type { SupplierItemMapping } from '@shared/schemas/supplierItemMapping';
import type { IngredientSuggestion } from '@shared/invoiceTemplates/types';
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from '@renderer/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@renderer/components/ui/select';
import { Button } from '@renderer/components/ui/button';
import { useSupplierItemSuggestions } from '@renderer/hooks/ipc/useSupplierItemMapping';
import { rankIngredientMatches } from '@shared/invoiceTemplates/match';
import { formatINR } from '@shared/utils/currency';
import { formatDateDMY } from '@shared/utils/date';

export type AppliedSuggestion = {
  ingredientId: string;
  defaultQuantity: number;
  defaultUnit: string;
  lastUnitCost: number;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  anchor: React.ReactNode;
  supplierId: string | null;
  partial: string;
  ingredients: Ingredient[];
  selectedIngredientId: string | null;
  /** Suggested name+unit+category derived from the parsed line. Null when no template suggestion is available. */
  suggestion: IngredientSuggestion | null;
  onApplySuggestion: (suggestion: AppliedSuggestion) => void;
  onPickIngredient: (ingredientId: string) => void;
  onCreateNew: (suggestion: IngredientSuggestion) => void;
};

export function DescriptionMappingPopover({
  open,
  onOpenChange,
  anchor,
  supplierId,
  partial,
  ingredients,
  selectedIngredientId,
  suggestion,
  onApplySuggestion,
  onPickIngredient,
  onCreateNew,
}: Props) {
  const { data: suggestions = [] } = useSupplierItemSuggestions(
    supplierId ? { supplierId, partial, limit: 8 } : null,
  );
  const ingredientById = new Map(ingredients.map((i) => [i.id, i]));

  // Fuzzy-match candidates from the suggestion (when no past mapping rules the row).
  const fuzzyCandidates = suggestion
    ? rankIngredientMatches(suggestion.name, ingredients)
    : [];

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverAnchor asChild>{anchor}</PopoverAnchor>
      <PopoverContent
        className="w-[420px] max-w-none"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {!supplierId ? (
          <div className="px-2 py-2 text-[11px] text-text-tertiary">
            Pick a supplier first to see history.
          </div>
        ) : suggestions.length === 0 ? (
          <div className="px-2 py-2 text-[11px] text-text-tertiary">
            No mappings yet for this supplier.
          </div>
        ) : (
          <>
            <div className="px-2 pb-1 pt-1 text-[10px] uppercase tracking-wider text-text-tertiary">
              Past mappings
            </div>
            <div className="flex flex-col">
              {suggestions.map((s: SupplierItemMapping) => {
                const ing = ingredientById.get(s.ingredientId);
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() =>
                      onApplySuggestion({
                        ingredientId: s.ingredientId,
                        defaultQuantity: s.defaultQuantity,
                        defaultUnit: s.defaultUnit,
                        lastUnitCost: s.lastUnitCost,
                      })
                    }
                    className="flex flex-col gap-0.5 rounded-md px-2 py-1.5 text-left hover:bg-background-tertiary"
                  >
                    <span className="text-[12px] text-text-primary">
                      {s.rawDescription}
                      <span className="ml-1 text-text-tertiary">→</span>{' '}
                      <span className="font-medium">{ing?.name ?? s.ingredientId}</span>
                    </span>
                    <span className="text-[10px] text-text-tertiary">
                      last: {s.defaultQuantity} {s.defaultUnit} @ {formatINR(s.lastUnitCost)}
                      /{s.defaultUnit} · {formatDateDMY(s.lastUsedAt)}
                    </span>
                  </button>
                );
              })}
            </div>
          </>
        )}

        {fuzzyCandidates.length > 0 ? (
          <div className="mt-1 border-t border-border-tertiary px-2 pt-2">
            <div className="text-[10px] uppercase tracking-wider text-text-tertiary">
              Looks like
            </div>
            <div className="mt-1 flex flex-wrap gap-1">
              {fuzzyCandidates.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => onPickIngredient(c.id)}
                  className="rounded-md border border-border-tertiary bg-background-secondary px-2 py-1 text-[11px] text-text-primary hover:bg-background-tertiary"
                >
                  {c.name}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {suggestion ? (
          <div className="mt-1 border-t border-border-tertiary px-2 pt-2">
            <Button
              type="button"
              variant="primary"
              size="sm"
              className="w-full"
              onClick={() => onCreateNew(suggestion)}
            >
              + Create new ingredient: {suggestion.name || '(name this)'}
              {suggestion.baseUnit ? ` (${suggestion.baseUnit}` : ''}
              {suggestion.category ? `, ${suggestion.category})` : suggestion.baseUnit ? ')' : ''}
            </Button>
          </div>
        ) : null}

        <div className="mt-1 border-t border-border-tertiary px-2 pt-2">
          <div className="text-[10px] uppercase tracking-wider text-text-tertiary">
            Map to existing ingredient
          </div>
          <div className="mt-1">
            <Select
              value={selectedIngredientId ?? undefined}
              onValueChange={(v) => onPickIngredient(v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Pick ingredient" />
              </SelectTrigger>
              <SelectContent>
                {ingredients
                  .filter((i) => i.isActive)
                  .map((ing) => (
                    <SelectItem key={ing.id} value={ing.id}>
                      {ing.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `env -u ELECTRON_RUN_AS_NODE npm run typecheck`
Expected: FAIL — `InvoiceLineRow` doesn't pass the new `suggestion` and `onCreateNew` props yet. That's fine; Task 8 fixes it. Move on.

- [ ] **Step 3: Commit**

```bash
git add renderer/features/invoices/DescriptionMappingPopover.tsx
git commit -m "feat(invoices): popover shows fuzzy match chips + create-new-ingredient button"
```

---

## Task 8: `InvoiceLineRow` threads suggestion + onCreateNew

**Files:**
- Modify: `renderer/features/invoices/InvoiceLineRow.tsx`

- [ ] **Step 1: Update props + pass through to popover**

In `renderer/features/invoices/InvoiceLineRow.tsx`, modify the `Props` and the `<DescriptionMappingPopover>` call. Replace the file with:

```tsx
import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import type { Ingredient } from '@shared/schemas/ingredient';
import type { IngredientSuggestion } from '@shared/invoiceTemplates/types';
import { Button } from '@renderer/components/ui/button';
import { Input } from '@renderer/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@renderer/components/ui/select';
import { TableCell, TableRow } from '@renderer/components/ui/table';
import { unitsCompatibleWithBase } from '@shared/constants/unitConversions';
import { formatINR } from '@shared/utils/currency';
import { DescriptionMappingPopover } from './DescriptionMappingPopover';

export type LineDraftRow = {
  key: string;
  rawDescription: string;
  ingredientId: string | null;
  quantity: number;
  unit: string;
  unitCost: number;
};

type Props = {
  draft: LineDraftRow;
  ingredients: Ingredient[];
  supplierId: string | null;
  /** Per-row template suggestion. Null when this row didn't come from a parsed PDF. */
  suggestion: IngredientSuggestion | null;
  disabled?: boolean;
  onChange: (next: LineDraftRow) => void;
  onRemove: () => void;
  onCreateNew: (suggestion: IngredientSuggestion) => void;
};

export function InvoiceLineRow({
  draft,
  ingredients,
  supplierId,
  suggestion,
  disabled,
  onChange,
  onRemove,
  onCreateNew,
}: Props) {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const child = draft.ingredientId
    ? ingredients.find((i) => i.id === draft.ingredientId)
    : null;
  const compatibleUnits = child
    ? unitsCompatibleWithBase(child.baseUnit)
    : ['g', 'kg', 'ml', 'L', 'each'];
  const total = draft.quantity * draft.unitCost;

  return (
    <TableRow>
      <TableCell className="w-[36%] align-top">
        <DescriptionMappingPopover
          open={popoverOpen && !disabled}
          onOpenChange={setPopoverOpen}
          supplierId={supplierId}
          partial={draft.rawDescription}
          ingredients={ingredients}
          selectedIngredientId={draft.ingredientId}
          suggestion={suggestion}
          onApplySuggestion={(s) => {
            onChange({
              ...draft,
              ingredientId: s.ingredientId,
              quantity: draft.quantity || s.defaultQuantity,
              unit: draft.unit || s.defaultUnit,
              unitCost: draft.unitCost || s.lastUnitCost,
            });
            setPopoverOpen(false);
          }}
          onPickIngredient={(id) => {
            const picked = ingredients.find((i) => i.id === id);
            onChange({
              ...draft,
              ingredientId: id,
              unit: draft.unit || picked?.baseUnit || draft.unit,
            });
            setPopoverOpen(false);
          }}
          onCreateNew={(s) => {
            setPopoverOpen(false);
            onCreateNew(s);
          }}
          anchor={
            <Input
              placeholder="e.g. DAIRYFRESH PANEER 1KG"
              value={draft.rawDescription}
              onChange={(e) =>
                onChange({ ...draft, rawDescription: e.target.value })
              }
              onFocus={() => setPopoverOpen(true)}
              onClick={() => setPopoverOpen(true)}
              disabled={disabled}
              maxLength={500}
            />
          }
        />
        <div className="mt-1 text-[10px]">
          {child ? (
            <span className="text-text-success">
              mapped → <span className="font-medium">{child.name}</span>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setPopoverOpen(true)}
              disabled={disabled}
              className="text-text-warning underline-offset-2 hover:underline disabled:cursor-not-allowed disabled:opacity-50"
            >
              needs mapping → click to assign
            </button>
          )}
        </div>
      </TableCell>
      <TableCell className="w-[90px] align-top">
        <Input
          type="number"
          step="any"
          min={0}
          value={Number.isFinite(draft.quantity) ? draft.quantity : ''}
          onChange={(e) =>
            onChange({ ...draft, quantity: Number(e.target.value) })
          }
          disabled={disabled}
        />
      </TableCell>
      <TableCell className="w-[80px] align-top">
        <Select
          value={draft.unit || undefined}
          onValueChange={(v) => onChange({ ...draft, unit: v })}
          disabled={disabled || !child}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {compatibleUnits.map((u) => (
              <SelectItem key={u} value={u}>
                {u}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell className="w-[110px] align-top">
        <Input
          type="number"
          step="any"
          min={0}
          value={Number.isFinite(draft.unitCost) ? draft.unitCost : ''}
          onChange={(e) =>
            onChange({ ...draft, unitCost: Number(e.target.value) })
          }
          disabled={disabled}
        />
      </TableCell>
      <TableCell className="w-[110px] text-right align-top tabular-nums">
        {formatINR(total)}
      </TableCell>
      <TableCell className="w-[44px] text-right align-top">
        {!disabled ? (
          <Button type="button" variant="ghost" size="sm" onClick={onRemove} aria-label="Remove row">
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        ) : null}
      </TableCell>
    </TableRow>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `env -u ELECTRON_RUN_AS_NODE npm run typecheck`
Expected: FAIL — `InvoiceEditorPage` doesn't pass the new `suggestion` and `onCreateNew` props yet. Task 9 fixes it.

- [ ] **Step 3: Commit**

```bash
git add renderer/features/invoices/InvoiceLineRow.tsx
git commit -m "feat(invoices): InvoiceLineRow threads suggestion + onCreateNew to popover"
```

---

## Task 9: `InvoiceEditorPage` — supplier-prompt banner + create-ingredient flow + re-parse

This is the big integration task. Pull all the pieces together: track the dropped bytes for re-parse, render the supplier banner, render the create-new-ingredient dialog, compute per-row suggestions, and wire `onCreateNew` callbacks.

**Files:**
- Modify: `renderer/pages/InvoiceEditorPage.tsx`

- [ ] **Step 1: Add new state, dialogs, and the supplier-prompt banner**

Open `renderer/pages/InvoiceEditorPage.tsx`. Add the imports near the top of the existing import block:

```tsx
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Plus } from 'lucide-react';
import type { LineDraft } from '@shared/schemas/invoice';
import type { ParseResult } from '@shared/schemas/invoiceParser';
import type { IngredientSuggestion } from '@shared/invoiceTemplates/types';
import type { Ingredient } from '@shared/schemas/ingredient';
import { getTemplateById } from '@shared/invoiceTemplates';
import { Badge } from '@renderer/components/ui/badge';
import { Button } from '@renderer/components/ui/button';
import { Table, TableBody, TableHead, TableHeader, TableRow } from '@renderer/components/ui/table';
import { useIngredients } from '@renderer/hooks/ipc/useIngredients';
import { useSuppliers } from '@renderer/hooks/ipc/useSuppliers';
import {
  useCommitInvoice,
  useCreateInvoiceDraft,
  useInvoice,
  useParseInvoice,
  useReplaceInvoiceLines,
  useUpdateInvoice,
} from '@renderer/hooks/ipc/useInvoices';
import { InvoiceHeaderForm, type InvoiceHeaderValues } from '@renderer/features/invoices/InvoiceHeaderForm';
import { PdfAttachZone } from '@renderer/features/invoices/PdfAttachZone';
import { InvoiceLineRow, type LineDraftRow } from '@renderer/features/invoices/InvoiceLineRow';
import { InvoiceTotalsCard } from '@renderer/features/invoices/InvoiceTotalsCard';
import { SupplierEditorDialog } from '@renderer/features/suppliers/SupplierEditorDialog';
import { NewIngredientDialog } from '@renderer/features/ingredients/NewIngredientDialog';
```

Add new state inside the `InvoiceEditorPage` function, alongside the existing state (after `const [duplicateInvoiceId, setDuplicateInvoiceId] = useState<string | null>(null);`):

```tsx
const [lastDroppedBytes, setLastDroppedBytes] = useState<Uint8Array | null>(null);
const [unknownSupplier, setUnknownSupplier] = useState<{ gstin: string; templateId: string } | null>(null);
const [supplierDialogOpen, setSupplierDialogOpen] = useState(false);
const [createIngredientFor, setCreateIngredientFor] = useState<{
  rowIndex: number;
  initial: { name: string; baseUnit: 'g' | 'ml' | 'each'; category: string };
} | null>(null);
const [perRowSuggestions, setPerRowSuggestions] = useState<Record<string, IngredientSuggestion>>({});

const parseInvoice = useParseInvoice();
```

- [ ] **Step 2: Replace `handleParsed` to capture suggestions, bytes, and unknown supplier**

Replace the existing `handleParsed` function with:

```tsx
function handleParsed(result: ParseResult, bytes?: Uint8Array) {
  setDuplicateInvoiceId(null);
  setParseInfo(null);
  if (bytes) setLastDroppedBytes(bytes);
  setUnknownSupplier(null);

  if (!result.ok) {
    if (result.reason === 'duplicate') {
      setDuplicateInvoiceId(result.existingInvoiceId ?? null);
      return;
    }
    if (result.reason === 'unknown_supplier_format') {
      setParseInfo('PDF format not recognised — fill the invoice manually.');
      return;
    }
    setParseInfo('Could not extract data from this PDF.');
    return;
  }

  // Pre-fill header.
  setHeader({
    supplierId: result.header.supplierId ?? '',
    invoiceNumber: result.header.invoiceNumber,
    invoiceDateInput: dateToInputValue(result.header.invoiceDate),
    notes: '',
  });

  // Compute per-row suggestions from the matched template.
  const tpl = getTemplateById(result.templateId);
  const rowKeys = result.lines.map(() => nextLineKey());
  const suggestionsByKey: Record<string, IngredientSuggestion> = {};
  const newRows: LineDraftRow[] =
    result.lines.length === 0
      ? [emptyLine()]
      : result.lines.map((l, i) => {
          const key = rowKeys[i]!;
          if (tpl) {
            suggestionsByKey[key] = tpl.suggestIngredient({
              rawDescription: l.rawDescription,
              quantity: l.quantity,
              unit: (l.unit === 'g' || l.unit === 'ml' || l.unit === 'each' ? l.unit : '') as
                | ''
                | 'g'
                | 'ml'
                | 'each',
              unitCost: l.unitCost,
              categoryHint: l.categoryHint,
            });
          }
          return {
            key,
            rawDescription: l.rawDescription,
            ingredientId: l.ingredientId,
            quantity: l.quantity,
            unit: l.unit,
            unitCost: l.unitCost,
          };
        });
  setRows(newRows);
  setPerRowSuggestions(suggestionsByKey);

  // Detect unknown_supplier issue from the parser.
  const unknownIssue = result.issues.find(
    (i) => i.kind === 'unknown_supplier',
  ) as { kind: 'unknown_supplier'; gstin: string | null } | undefined;
  if (unknownIssue && unknownIssue.gstin) {
    setUnknownSupplier({ gstin: unknownIssue.gstin, templateId: result.templateId });
  }

  // Build a one-line summary of issues.
  const skipped = result.issues
    .filter((i) => i.kind === 'skipped_charge')
    .reduce((sum, i) => sum + (i as { total: number }).total, 0);
  const unmapped = result.lines.filter((l) => l.ingredientId === null).length;
  const parts: string[] = [];
  if (unmapped > 0) parts.push(`${unmapped} line${unmapped === 1 ? '' : 's'} need an ingredient mapping`);
  if (skipped > 0) parts.push(`₹${skipped.toFixed(2)} in fees not added to stock`);
  if (parts.length > 0) setParseInfo(parts.join(' · '));
}
```

(Task 2 ensured `categoryHint` is on the wire format, so `l.categoryHint` is a string the suggestion call can use directly.)

- [ ] **Step 3: Add the re-parse helper and supplier-banner handlers**

Right after `handleParsed`, add:

```tsx
async function reParseLastBytes() {
  if (!lastDroppedBytes) return;
  try {
    const result = await parseInvoice.mutateAsync(lastDroppedBytes);
    handleParsed(result);
  } catch (err) {
    setParseInfo(err instanceof Error ? err.message : 'Could not re-parse PDF');
  }
}

function handleIngredientCreated(rowIndex: number, ingredient: Ingredient) {
  setCreateIngredientFor(null);
  setRows((prev) =>
    prev.map((r, i) =>
      i === rowIndex
        ? { ...r, ingredientId: ingredient.id, unit: r.unit || ingredient.baseUnit }
        : r,
    ),
  );
}
```

- [ ] **Step 4: Render the supplier-prompt banner above the existing duplicate banner**

Find the JSX block that renders `parseInfo` and `duplicateInvoiceId` (around line 312-324). Insert a new block immediately above the `parseInfo` div (still inside the `<div className="mt-3">`):

```tsx
{unknownSupplier ? (
  <div className="mt-2 rounded-md border border-border-tertiary bg-background-secondary px-3 py-2 text-[12px] text-text-secondary">
    <div className="mb-1 font-medium text-text-primary">
      This PDF is from a supplier we don't recognise yet.
    </div>
    <div className="mb-2">
      Detected GSTIN: <span className="font-mono">{unknownSupplier.gstin}</span>
      {(() => {
        const tpl = getTemplateById(unknownSupplier.templateId);
        return tpl ? (
          <>
            {' · '}Suggested name: <span className="font-medium">{tpl.defaultSupplierName}</span>
          </>
        ) : null;
      })()}
    </div>
    <div className="flex gap-2">
      <Button
        type="button"
        variant="primary"
        size="sm"
        onClick={() => setSupplierDialogOpen(true)}
      >
        Create supplier and re-parse
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setUnknownSupplier(null)}
      >
        Dismiss
      </Button>
    </div>
  </div>
) : null}
```

- [ ] **Step 5: Update the `<PdfAttachZone>` `onParsed` prop to forward bytes**

Change the existing `onParsed={handleParsed}` to one that captures bytes too. Replace:

```tsx
<PdfAttachZone
  invoiceId={existing?.id ?? null}
  filePath={existing?.filePath ?? null}
  disabled={isCommitted}
  onParsed={handleParsed}
/>
```

with:

```tsx
<PdfAttachZone
  invoiceId={existing?.id ?? null}
  filePath={existing?.filePath ?? null}
  disabled={isCommitted}
  onParsed={(result, bytes) => handleParsed(result, bytes)}
/>
```

(Task 10 updates `PdfAttachZone` to actually pass bytes; until then this still compiles because the second arg is optional.)

- [ ] **Step 6: Update each `<InvoiceLineRow>` to pass `suggestion` and `onCreateNew`**

Find the `rows.map` block in the line-items section (around line 344). Change:

```tsx
<InvoiceLineRow
  key={row.key}
  draft={row}
  ingredients={ingredients}
  supplierId={header.supplierId || null}
  disabled={isCommitted}
  onChange={(next) =>
    setRows((prev) => prev.map((r, i) => (i === idx ? next : r)))
  }
  onRemove={() => /* unchanged */}
/>
```

to:

```tsx
<InvoiceLineRow
  key={row.key}
  draft={row}
  ingredients={ingredients}
  supplierId={header.supplierId || null}
  suggestion={perRowSuggestions[row.key] ?? null}
  disabled={isCommitted}
  onChange={(next) =>
    setRows((prev) => prev.map((r, i) => (i === idx ? next : r)))
  }
  onRemove={() => /* unchanged */}
  onCreateNew={(s) =>
    setCreateIngredientFor({
      rowIndex: idx,
      initial: { name: s.name, baseUnit: s.baseUnit, category: s.category },
    })
  }
/>
```

- [ ] **Step 7: Render the two dialogs at the bottom of the component's JSX**

Just before the component's outermost `</div>` closing tag, add:

```tsx
<SupplierEditorDialog
  open={supplierDialogOpen}
  onOpenChange={(o) => {
    setSupplierDialogOpen(o);
    if (!o) {
      // Dialog closed. If the user actually created/saved, the mutation success
      // would have already invalidated the suppliers query. Re-parse from the
      // last dropped bytes so the editor picks up the new supplier id.
      // Note: react-query's onSuccess fires before the dialog closes (the dialog
      // closes in onSuccess of the mutation), so we trigger re-parse on close.
      if (unknownSupplier) {
        void reParseLastBytes();
      }
    }
  }}
  supplier={null}
  initialName={unknownSupplier ? (getTemplateById(unknownSupplier.templateId)?.defaultSupplierName ?? '') : ''}
  initialGstin={unknownSupplier?.gstin ?? ''}
/>

<NewIngredientDialog
  open={createIngredientFor !== null}
  onOpenChange={(o) => {
    if (!o) setCreateIngredientFor(null);
  }}
  initial={
    createIngredientFor
      ? {
          name: createIngredientFor.initial.name,
          baseUnit: createIngredientFor.initial.baseUnit,
          category: createIngredientFor.initial.category,
        }
      : undefined
  }
  onCreated={(ing) => {
    if (createIngredientFor) handleIngredientCreated(createIngredientFor.rowIndex, ing);
  }}
/>
```

(Note: `SupplierEditorDialog` doesn't currently accept `initialName` / `initialGstin` props. Task 11 adds them. Until then this won't typecheck — that's expected; we'll fix it in Task 11.)

- [ ] **Step 8: Run typecheck**

Run: `env -u ELECTRON_RUN_AS_NODE npm run typecheck`
Expected: FAIL — `SupplierEditorDialog` rejects `initialName` / `initialGstin`, and `PdfAttachZone.onParsed` doesn't yet pass bytes. Tasks 10 + 11 close these. Don't fix here.

- [ ] **Step 9: Commit**

```bash
git add renderer/pages/InvoiceEditorPage.tsx
git commit -m "feat(invoices): editor wires supplier banner + create-ingredient flow + re-parse"
```

---

## Task 10: `PdfAttachZone.onParsed` forwards bytes

**Files:**
- Modify: `renderer/features/invoices/PdfAttachZone.tsx`

- [ ] **Step 1: Update the `onParsed` callback type and call site**

Open `renderer/features/invoices/PdfAttachZone.tsx`. Change the `Props` type:

```ts
type Props = {
  invoiceId: string | null;
  filePath: string | null;
  disabled?: boolean;
  onParsed?: (result: ParseResult, bytes: Uint8Array) => void;
};
```

In `handleFile`, change the `onParsed` invocation. Find this line:

```ts
if (props.onParsed) props.onParsed(parseResult);
```

Replace with:

```ts
if (props.onParsed) props.onParsed(parseResult, bytes);
```

- [ ] **Step 2: Typecheck**

Run: `env -u ELECTRON_RUN_AS_NODE npm run typecheck`
Expected: still FAIL on `SupplierEditorDialog` (Task 11 fixes), but the `PdfAttachZone`/`InvoiceEditorPage` mismatch should now be gone.

- [ ] **Step 3: Commit**

```bash
git add renderer/features/invoices/PdfAttachZone.tsx
git commit -m "feat(invoices): PdfAttachZone forwards parsed bytes via onParsed"
```

---

## Task 11: `SupplierEditorDialog` accepts pre-fill props

**Files:**
- Modify: `renderer/features/suppliers/SupplierEditorDialog.tsx`

- [ ] **Step 1: Add `initialName` + `initialGstin` props and merge into defaults**

Open `renderer/features/suppliers/SupplierEditorDialog.tsx`. Change the `Props` type and the `defaultValues` / `useEffect` reset to honour the new props when no `supplier` is provided (i.e. create mode):

```tsx
type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  supplier: Supplier | null;
  /** Pre-fill values for create mode. Ignored when `supplier` is non-null (edit). */
  initialName?: string;
  initialGstin?: string;
};

export function SupplierEditorDialog({
  open,
  onOpenChange,
  supplier,
  initialName,
  initialGstin,
}: Props) {
  const create = useCreateSupplier();
  const update = useUpdateSupplier();
  const [serverError, setServerError] = useState<string | null>(null);
  const isEdit = !!supplier;

  const { register, handleSubmit, reset, formState } = useForm<FormValues>({
    defaultValues: {
      name: supplier?.name ?? initialName ?? '',
      contactInfo: supplier?.contactInfo ?? '',
      gstin: supplier?.gstin ?? initialGstin ?? '',
      notes: supplier?.notes ?? '',
    },
  });

  useEffect(() => {
    if (open) {
      reset({
        name: supplier?.name ?? initialName ?? '',
        contactInfo: supplier?.contactInfo ?? '',
        gstin: supplier?.gstin ?? initialGstin ?? '',
        notes: supplier?.notes ?? '',
      });
      setServerError(null);
    }
  }, [open, supplier, initialName, initialGstin, reset]);

  // ...rest of component unchanged
```

- [ ] **Step 2: Typecheck**

Run: `env -u ELECTRON_RUN_AS_NODE npm run typecheck`
Expected: PASS — the editor's call site from Task 9 now satisfies `SupplierEditorDialog`.

- [ ] **Step 3: Run the full test suite to make sure nothing regressed**

Run: `env -u ELECTRON_RUN_AS_NODE npm test`
Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add renderer/features/suppliers/SupplierEditorDialog.tsx
git commit -m "feat(suppliers): SupplierEditorDialog accepts initialName + initialGstin pre-fill props"
```

---

## Task 12: Manual smoke test in dev (fresh user)

**Files:** none (manual verification + commit if any small fixes needed).

This replaces the per-row mapping smoke from the prior plan with the fast-path flow.

- [ ] **Step 1: Reset to a clean state (optional)**

If you want a true first-run test:
```bash
rm -rf ~/.config/Laurans\ Inventory/
```

- [ ] **Step 2: Run the test suite**

Run: `env -u ELECTRON_RUN_AS_NODE npm test`
Expected: all green.

- [ ] **Step 3: Start the dev server**

Run: `env -u ELECTRON_RUN_AS_NODE npm run dev`
Wait for the Electron window. Expected: app loads at the dashboard.

- [ ] **Step 4: Drop the sample PDF (no setup)**

1. Sidebar → **Invoices** → **+ New invoice**
2. Drag `digital-pod-ZHPTG27-OR-0025869827.pdf` onto the drop zone
3. **Expected:**
   - The supplier-prompt banner appears at the top: "This PDF is from a supplier we don't recognise yet. Detected GSTIN: 36AAACZ8867B1Z1 · Suggested name: Zomato Hyperpure" with a primary button "Create supplier and re-parse"
   - Header fields and rows populate as before, but `supplierId` is empty (the supplier doesn't exist yet)
   - 17 rows show with quantities in base units

- [ ] **Step 5: Click "Create supplier and re-parse"**

1. The `SupplierEditorDialog` opens with `name = "Zomato Hyperpure"` and `gstin = "36AAACZ8867B1Z1"` pre-filled
2. Click **Create supplier**
3. **Expected:** dialog closes, the editor automatically re-parses the same bytes, the supplier-prompt banner disappears, and the header's supplier dropdown now shows "Zomato Hyperpure"

- [ ] **Step 6: Map a row by creating a new ingredient**

1. Click any row's description input (or its "needs mapping → click to assign" link)
2. The popover opens. With no past mappings yet, you should see a primary button: "+ Create new ingredient: Lite Paneer (g, Dairy)" (or whatever cleaned name corresponds to the row you clicked)
3. Click the button
4. The `NewIngredientDialog` opens with name, base unit, and category pre-filled
5. Click **Create ingredient**
6. **Expected:** dialog closes, the row's description label flips from "needs mapping" to "mapped → Lite Paneer"

- [ ] **Step 7: Map a second row using fuzzy match**

1. Click another row whose suggestion overlaps with the ingredient you just created (e.g. if you created "Lite Paneer" and the row is "Gopika - Lite Paneer, 1 Kg", the popover should now show "Lite Paneer" as a chip under "Looks like…"). Or skip if no overlap exists.
2. Click the chip.
3. **Expected:** row maps to the existing ingredient; popover closes.

- [ ] **Step 8: Map all remaining rows + commit**

1. Use the create-new flow for any rows that need new ingredients.
2. **Save draft** → confirm the invoice persists in DRAFT.
3. **Map & commit** once all rows are mapped.
4. **Expected:** invoice flips to COMMITTED. Visit Ingredients → the new ingredient → Movements → see a `purchase` movement with the parsed quantity and unit cost.

- [ ] **Step 9: Test duplicate detection**

1. Click **+ New invoice** again.
2. Drop the same PDF.
3. **Expected:** duplicate banner appears with a link to the just-committed invoice.

- [ ] **Step 10: If anything in steps 4-9 misbehaves, fix and commit before completing**

Common fixes you may need:
- Suggestion button text wrong → check `HyperpureTemplate.suggestIngredient`; add a failing test in `tests/shared/hyperpureSuggest.test.ts` for the description that broke.
- Re-parse not firing after supplier create → the `onOpenChange` handler in Task 9 step 7 calls `reParseLastBytes` only when the dialog closes *and* `unknownSupplier` is set. If the user creates the supplier *and* the dialog auto-closes on success, `unknownSupplier` is still set at that moment so re-parse fires. If you find this stops firing, log `unknownSupplier` and `lastDroppedBytes` in `onOpenChange`.
- Fuzzy chip showing irrelevant matches → tighten `OVERLAP_THRESHOLD` in `shared/invoiceTemplates/match.ts` and add a failing test in `tests/shared/ingredientMatch.test.ts`.

- [ ] **Step 11: Final commit**

```bash
git add -A
git commit -m "feat(invoices): manual smoke verified — fast-path import end-to-end" --allow-empty
```

(`--allow-empty` only if no fixes were needed in step 10.)

---

## Self-review checklist

- [x] Spec coverage: every section of the design doc maps to a task.
  - §Architecture / Template-side → Tasks 1, 3, 4
  - §Architecture / IPC propagation of categoryHint → Task 2
  - §Architecture / Renderer-side → Tasks 6, 7, 8, 9, 10, 11
  - §Architecture / NewIngredientDialog reuse → Task 6
  - §Architecture / Fuzzy-match → Task 5 (impl) + Task 7 (consumer)
  - §Data flow → Task 9 (handleParsed + reParseLastBytes + handleIngredientCreated)
  - §Edge cases → Tasks 3 (empty suggestion → 'each' fallback), 5 (short-token rejection, inactive skip), 9 (dismiss banner; user-edited names map by id; re-parse fires on close)
  - §Test strategy → fixtures already exist; new unit tests in Tasks 1, 2, 3, 4, 5
- [x] No placeholders ("TODO", "TBD", "implement later") — all code is concrete.
- [x] Type consistency:
  - `IngredientSuggestion` is defined once in `shared/invoiceTemplates/types.ts` (Task 3) and re-imported consistently in Tasks 7, 8, 9.
  - `InvoiceTemplate` interface gains `defaultSupplierName: string` (Task 3) and `suggestIngredient(line: ParsedLine): IngredientSuggestion` (Task 3); both are used in Task 9 via `getTemplateById` (Task 4).
  - `ParsedLine.categoryHint` is added in `shared/invoiceTemplates/types.ts` (Task 1), threaded through `parsedLineSchema` (Task 2), and consumed in Task 9.
  - `LineDraftRow.key` (existing) is used as the index key for `perRowSuggestions` in Task 9 — same `string` key throughout.
  - `RankableIngredient` (Task 5) is structurally compatible with `Ingredient` (Task 7 passes the full ingredient list through unchanged).
- [x] Dependency ordering: every task either typechecks at the end (1, 2, 3, 4, 5, 6, 10, 11, 12) or its FAIL in earlier tasks is explicitly closed by a later task before any test/smoke step runs (7 closed by 8, 8 closed by 9, 9 closed by 10 + 11).

## Future work (not in this plan)

- Bulk "auto-create + map all unmapped" button — see spec.
- More supplier templates — each ships its own `suggestIngredient` rules; no further changes to consumer code.
