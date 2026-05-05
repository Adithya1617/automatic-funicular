# Invoice PDF Auto-Parse Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When the user drops a Hyperpure invoice PDF onto the existing invoice editor, the editor pre-fills the header and every line item with quantities normalised to base units; first-time descriptions need one click to map to an ingredient, then a single Map & commit writes one `purchase` movement per line through the existing `InventoryService.applyMovement` chokepoint. Subsequent invoices from the same supplier are zero-touch.

**Architecture:** One new service (`InvoiceParserService`) is a pure function: PDF buffer → parsed structure. It uses a per-supplier template registry (Hyperpure first, more later) backed by `pdfjs-dist` text extraction with column-geometry awareness. The renderer's existing `PdfAttachZone` calls parse-before-attach and lifts the parsed structure into the editor's existing form state. **No changes to `InventoryService.applyMovement`, no schema migration**, no AI / OCR / external services.

**Tech Stack:** TypeScript, Electron (main + preload + renderer), Vitest, Zod, React + react-hook-form, Tailwind, `pdfjs-dist` (new).

**Spec:** [docs/superpowers/specs/2026-05-05-invoice-pdf-autoparse-design.md](../specs/2026-05-05-invoice-pdf-autoparse-design.md)

---

## Task 1: Add `pdfjs-dist` dependency and copy sample PDF fixture

**Files:**
- Modify: `package.json`
- Create: `tests/__fixtures__/invoices/.gitkeep`
- Copy: `digital-pod-ZHPTG27-OR-0025869827.pdf` → `tests/__fixtures__/invoices/hyperpure-sample.pdf`

- [ ] **Step 1: Install pdfjs-dist (legacy build for Node)**

Run:
```bash
npm install pdfjs-dist@4.0.379 --save
```

Pin to `4.0.379` (last 4.x release that works without a worker in Node, before the 4.1 bundling change). Expected output: `added 1 package`.

- [ ] **Step 2: Verify Electron rebuild still passes**

Run:
```bash
npm run typecheck
```

Expected: PASS (no type errors). `pdfjs-dist` ships its own `.d.ts`.

- [ ] **Step 3: Copy the sample PDF into the fixture directory**

Run:
```bash
mkdir -p tests/__fixtures__/invoices
cp digital-pod-ZHPTG27-OR-0025869827.pdf tests/__fixtures__/invoices/hyperpure-sample.pdf
touch tests/__fixtures__/invoices/.gitkeep
```

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json tests/__fixtures__/invoices/
git commit -m "chore(invoices): add pdfjs-dist 4.0.379 + Hyperpure sample fixture"
```

---

## Task 2: Add GSTIN to suppliers + new repo lookup methods

The parser keys supplier resolution on GSTIN (a stable, unambiguous identifier on every B2B invoice). The current schema has no GSTIN column and the repos lack the lookup methods we need. Land them as one cohesive change.

**Files:**
- Modify: `main/db/schema.ts`
- Generate: a new migration in `main/db/migrations/`
- Modify: `main/repositories/supplierRepository.ts`
- Modify: `main/repositories/invoiceRepository.ts`
- Modify: `shared/schemas/supplier.ts`
- Modify: `main/services/SupplierService.ts`
- Modify: `renderer/features/suppliers/SupplierEditorDialog.tsx`
- Test: `tests/main/SupplierRepository.test.ts` (new)

- [ ] **Step 1: Add `gstin` to the Drizzle schema**

In `main/db/schema.ts`, modify the `suppliers` table definition (line ~55):

```ts
export const suppliers = sqliteTable(
  'suppliers',
  {
    id: text('id').primaryKey(),
    tenantId: integer('tenant_id').notNull(),
    name: text('name').notNull(),
    contactInfo: text('contact_info'),
    gstin: text('gstin'),                          // ← ADD THIS LINE
    notes: text('notes'),
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
    ...audit,
  },
  (t) => ({
    tenantNameIdx: index('idx_suppliers_tenant_name').on(t.tenantId, t.name),
    tenantGstinIdx: index('idx_suppliers_tenant_gstin').on(t.tenantId, t.gstin),  // ← ADD THIS
  }),
);
```

- [ ] **Step 2: Generate the migration**

Run:
```bash
npm run db:generate
```

Expected output: a new file in `main/db/migrations/` named like `0006_<random>.sql` containing `ALTER TABLE suppliers ADD COLUMN gstin TEXT;` and the new index. Verify it by reading the generated file.

- [ ] **Step 3: Add `findByGstin` to supplierRepository**

In `main/repositories/supplierRepository.ts`, after `findByName`:

```ts
  findByGstin(db: AppDb, tenantId: number, gstin: string): SupplierRow | undefined {
    return db
      .select()
      .from(suppliers)
      .where(and(eq(suppliers.tenantId, tenantId), eq(suppliers.gstin, gstin)))
      .get();
  },
```

- [ ] **Step 4: Add `findByNumber` to invoiceRepository**

Look at the existing `findById` in `main/repositories/invoiceRepository.ts` for the pattern. After it, add:

```ts
  findByNumber(
    db: AppDb,
    tenantId: number,
    supplierId: string,
    invoiceNumber: string,
  ): InvoiceRow | undefined {
    return db
      .select()
      .from(invoices)
      .where(
        and(
          eq(invoices.tenantId, tenantId),
          eq(invoices.supplierId, supplierId),
          eq(invoices.invoiceNumber, invoiceNumber),
        ),
      )
      .get();
  },
```

(`invoices`, `eq`, `and` should already be imported in this file; if not, add them.)

- [ ] **Step 5: Update Zod + service to thread GSTIN through**

In `shared/schemas/supplier.ts`, add `gstin: z.string().nullable().optional()` to whichever schemas already accept `name`/`contactInfo` (likely `createSupplierInputSchema` and `updateSupplierInputSchema` and the `Supplier` shape). Match the existing nullable / optional convention used for `contactInfo`.

In `main/services/SupplierService.ts`, find each call that constructs a `SupplierInsert` from `input.contactInfo` and add `gstin: input.gstin?.trim() || null` alongside it.

- [ ] **Step 6: Update the supplier editor form**

In `renderer/features/suppliers/SupplierEditorDialog.tsx`, mirror what's already there for `contactInfo`:

1. Add `gstin: string` to the local form values type (line ~24).
2. Default it to `supplier?.gstin ?? ''` in both `defaultValues` and the `reset` block (lines ~37, ~46).
3. Pass `gstin: values.gstin.trim() || null` in both create + update mutations (lines ~60-67).
4. Add a label + input next to the existing contact info field:

```tsx
<div className="flex flex-col gap-1">
  <Label htmlFor="sup-gstin">GSTIN</Label>
  <Input
    id="sup-gstin"
    placeholder="36AAACZ8867B1Z1"
    {...register('gstin', { maxLength: 15 })}
  />
</div>
```

- [ ] **Step 7: Write a small test for the new repo method**

Create `tests/main/SupplierRepository.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { supplierRepository } from '../../main/repositories/supplierRepository';

describe('supplierRepository.findByGstin', () => {
  it('exists and is callable', () => {
    expect(typeof supplierRepository.findByGstin).toBe('function');
  });
});
```

(This is a smoke test. Real DB exercise happens in the manual smoke at the end of the plan.)

- [ ] **Step 8: Typecheck + test**

Run:
```bash
npm run typecheck && npx vitest run tests/main/SupplierRepository.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add main/db/schema.ts main/db/migrations/ main/repositories/supplierRepository.ts main/repositories/invoiceRepository.ts shared/schemas/supplier.ts main/services/SupplierService.ts renderer/features/suppliers/SupplierEditorDialog.tsx tests/main/SupplierRepository.test.ts
git commit -m "feat(suppliers): GSTIN field + findByGstin/findByNumber repo lookups"
```

---

## Task 3: Pack-size regex helper with parametric tests

**Files:**
- Create: `shared/invoiceTemplates/packSize.ts`
- Test: `tests/shared/packSize.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/shared/packSize.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { extractPackSize } from '../../shared/invoiceTemplates/packSize';

describe('extractPackSize', () => {
  const cases: Array<[string, { size: number; unit: 'g' | 'ml' | 'each' } | null]> = [
    // grams
    ['Golden Crown - Mushroom Slices, 800 gm', { size: 800, unit: 'g' }],
    ['Beans Haricot, 500 gm', { size: 500, unit: 'g' }],
    ['Coriander Leaves (Kothmir), 500 gm', { size: 500, unit: 'g' }],
    ['Eastmade - Black Pepper Whole, 100 gm (Trial 1 Unit @Rs96.00/unit pre tax)', { size: 100, unit: 'g' }],
    // kg → grams
    ['Gopika - Lite Paneer, 1 Kg', { size: 1000, unit: 'g' }],
    ['Cabbage without Leaves, 1 Kg', { size: 1000, unit: 'g' }],
    ['Carrots (Big), 1 Kg', { size: 1000, unit: 'g' }],
    ['Frozen Sweet Corn, 1 Kg', { size: 1000, unit: 'g' }],
    ['Green Capsicum (Big Size), 1 Kg', { size: 1000, unit: 'g' }],
    // L → ml
    ['Rich\'s - Versatie Gold Cream, 1 L', { size: 1000, unit: 'ml' }],
    // ml as-is
    ['Some Sauce, 250 ml', { size: 250, unit: 'ml' }],
    // pcs / pack → each
    ['Banana Leaf, 5 Pcs', { size: 5, unit: 'each' }],
    ['Some Item, 12 Pack', { size: 12, unit: 'each' }],
    // decimal pack size
    ['Heavy Cream, 1.5 L', { size: 1500, unit: 'ml' }],
    // case-insensitive
    ['paneer, 1 KG', { size: 1000, unit: 'g' }],
    // no comma → no match
    ['Just A Plain Name', null],
    // comma without trailing pack info → no match
    ['Brand, Premium Quality', null],
    // trailing parens after pack info still match the pack
    ['Springburst - Aromatic Mix, 500 gm (variant)', { size: 500, unit: 'g' }],
    // takes the FIRST match if multiple
    ['Sauce, 500 ml jar of, 1 L stock', { size: 500, unit: 'ml' }],
  ];

  it.each(cases)('extracts pack size from %j', (input, expected) => {
    expect(extractPackSize(input)).toEqual(expected);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/shared/packSize.test.ts`
Expected: FAIL with "Cannot find module '../../shared/invoiceTemplates/packSize'".

- [ ] **Step 3: Implement**

Create `shared/invoiceTemplates/packSize.ts`:

```ts
export type PackSize = {
  size: number;
  unit: 'g' | 'ml' | 'each';
};

const RE = /,\s*(\d+(?:\.\d+)?)\s*(gm|kg|ml|l|pcs|pack|g)\b/i;

export function extractPackSize(description: string): PackSize | null {
  const m = RE.exec(description);
  if (!m) return null;
  const num = Number.parseFloat(m[1]!);
  if (!Number.isFinite(num) || num <= 0) return null;
  const raw = m[2]!.toLowerCase();
  switch (raw) {
    case 'gm':
    case 'g':
      return { size: num, unit: 'g' };
    case 'kg':
      return { size: num * 1000, unit: 'g' };
    case 'ml':
      return { size: num, unit: 'ml' };
    case 'l':
      return { size: num * 1000, unit: 'ml' };
    case 'pcs':
    case 'pack':
      return { size: num, unit: 'each' };
    default:
      return null;
  }
}
```

Note on regex ordering: `g` is the last alternative because longer matches (`gm`, `kg`) must win first. The `\b` boundary already handles this for most inputs but the alternation order is belt-and-suspenders.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/shared/packSize.test.ts`
Expected: PASS, all 19 cases green.

- [ ] **Step 5: Commit**

```bash
git add shared/invoiceTemplates/packSize.ts tests/shared/packSize.test.ts
git commit -m "feat(invoices): pack-size regex extractor with normalisation to base units"
```

---

## Task 4: PDF text extraction wrapper

**Files:**
- Create: `shared/utils/pdfText.ts`
- Test: `tests/shared/pdfText.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/shared/pdfText.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { extractPdfText } from '../../shared/utils/pdfText';

const SAMPLE = join(__dirname, '..', '__fixtures__', 'invoices', 'hyperpure-sample.pdf');

describe('extractPdfText', () => {
  it('returns one entry per page with text items that include str + x + y', async () => {
    const buf = readFileSync(SAMPLE);
    const out = await extractPdfText(new Uint8Array(buf));

    expect(out.pages.length).toBeGreaterThanOrEqual(1);
    const page1 = out.pages[0]!;
    expect(page1.items.length).toBeGreaterThan(20);
    for (const item of page1.items) {
      expect(typeof item.str).toBe('string');
      expect(typeof item.x).toBe('number');
      expect(typeof item.y).toBe('number');
    }
  });

  it('extracts the Hyperpure marker text from page 1', async () => {
    const buf = readFileSync(SAMPLE);
    const out = await extractPdfText(new Uint8Array(buf));
    const joined = out.pages[0]!.items.map((i) => i.str).join(' ').toLowerCase();
    expect(joined).toContain('hyperpure');
    expect(joined).toContain('zhptg27-or-0025869827');
  });

  it('returns an empty pages array on a non-PDF buffer', async () => {
    const out = await extractPdfText(new Uint8Array([1, 2, 3, 4]));
    expect(out.pages).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/shared/pdfText.test.ts`
Expected: FAIL with module-not-found.

- [ ] **Step 3: Implement**

Create `shared/utils/pdfText.ts`:

```ts
export type PdfTextItem = {
  str: string;
  x: number;
  y: number;
  width: number;
};

export type PdfTextPage = {
  items: PdfTextItem[];
};

export type PdfTextOutput = {
  pages: PdfTextPage[];
};

export async function extractPdfText(buffer: Uint8Array): Promise<PdfTextOutput> {
  // Use the legacy build so we don't depend on a separate worker file in Node/Electron main.
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  // Disable the worker entirely; we run on Node where the main thread is fine.
  (pdfjs as { GlobalWorkerOptions: { workerSrc: string } }).GlobalWorkerOptions.workerSrc = '';

  let doc;
  try {
    doc = await pdfjs.getDocument({
      data: buffer,
      isEvalSupported: false,
      disableFontFace: true,
    }).promise;
  } catch {
    return { pages: [] };
  }

  const pages: PdfTextPage[] = [];
  for (let i = 1; i <= doc.numPages; i += 1) {
    const page = await doc.getPage(i);
    const text = await page.getTextContent();
    const items: PdfTextItem[] = [];
    for (const it of text.items as Array<{ str: string; transform: number[]; width: number }>) {
      if (typeof it.str !== 'string' || it.str.length === 0) continue;
      const x = it.transform[4] ?? 0;
      const y = it.transform[5] ?? 0;
      items.push({ str: it.str, x, y, width: it.width });
    }
    pages.push({ items });
  }
  return { pages };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/shared/pdfText.test.ts`
Expected: PASS, 3 cases green.

If pdfjs-dist refuses to load due to a `DOMMatrix` reference in Node, install the polyfill via `npm install --save-dev @napi-rs/canvas` and add `import '@napi-rs/canvas';` at the top of `pdfText.ts`. Re-run the test.

- [ ] **Step 5: Commit**

```bash
git add shared/utils/pdfText.ts tests/shared/pdfText.test.ts
git commit -m "feat(invoices): pdfjs-dist text extraction wrapper with page geometry"
```

---

## Task 5: Template interface + Hyperpure detection

**Files:**
- Create: `shared/invoiceTemplates/types.ts`
- Create: `shared/invoiceTemplates/hyperpure.ts` (detect only, parse stub)
- Create: `shared/invoiceTemplates/index.ts`
- Test: `tests/shared/invoiceTemplates.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/shared/invoiceTemplates.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { extractPdfText } from '../../shared/utils/pdfText';
import { detectTemplate } from '../../shared/invoiceTemplates';

const SAMPLE = join(__dirname, '..', '__fixtures__', 'invoices', 'hyperpure-sample.pdf');

describe('detectTemplate', () => {
  it('returns the hyperpure template for the sample PDF', async () => {
    const text = await extractPdfText(new Uint8Array(readFileSync(SAMPLE)));
    const tpl = detectTemplate(text);
    expect(tpl?.id).toBe('hyperpure');
  });

  it('returns null for an empty PDF text', () => {
    expect(detectTemplate({ pages: [] })).toBeNull();
  });

  it('returns null for non-Hyperpure text', () => {
    const fake = {
      pages: [{ items: [{ str: 'Some Random Invoice', x: 0, y: 0, width: 0 }] }],
    };
    expect(detectTemplate(fake)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/shared/invoiceTemplates.test.ts`
Expected: FAIL with module-not-found.

- [ ] **Step 3: Implement types + Hyperpure detect + registry**

Create `shared/invoiceTemplates/types.ts`:

```ts
import type { PdfTextOutput } from '../utils/pdfText';

export type ParsedHeader = {
  invoiceNumber: string;
  invoiceDate: number; // unix ms
  supplierGstin: string | null;
};

export type ParsedLine = {
  rawDescription: string;
  quantity: number; // already in base unit when packSize is known; else inv qty as-is
  unit: '' | 'g' | 'ml' | 'each';
  unitCost: number; // post-tax, post-discount, per (base) unit
};

export type ParseIssue =
  | { kind: 'skipped_charge'; label: string; total: number }
  | { kind: 'unparseable_pack_size'; rawDescription: string }
  | { kind: 'unmappable_line'; rawDescription: string; reason: string };

export type TemplateParseResult = {
  header: ParsedHeader;
  lines: ParsedLine[];
  issues: ParseIssue[];
};

export interface InvoiceTemplate {
  id: string;
  detect(text: PdfTextOutput): boolean;
  parse(text: PdfTextOutput): TemplateParseResult;
}
```

Create `shared/invoiceTemplates/hyperpure.ts`:

```ts
import type { InvoiceTemplate, TemplateParseResult } from './types';
import type { PdfTextOutput } from '../utils/pdfText';

export const KNOWN_HYPERPURE_GSTINS = new Set<string>([
  '36AAACZ8867B1Z1', // HYD2
]);

const GSTIN_RE = /\b\d{2}[A-Z]{5}\d{4}[A-Z]\d[Z]\d\b/;

export const HyperpureTemplate: InvoiceTemplate = {
  id: 'hyperpure',
  detect(text: PdfTextOutput): boolean {
    if (text.pages.length === 0) return false;
    const joined = text.pages[0]!.items.map((i) => i.str).join(' ');
    if (!/hyperpure/i.test(joined)) return false;
    const m = GSTIN_RE.exec(joined);
    if (!m) return false;
    return KNOWN_HYPERPURE_GSTINS.has(m[0]);
  },
  parse(_text: PdfTextOutput): TemplateParseResult {
    throw new Error('not implemented yet');
  },
};
```

Create `shared/invoiceTemplates/index.ts`:

```ts
import { HyperpureTemplate } from './hyperpure';
import type { InvoiceTemplate } from './types';
import type { PdfTextOutput } from '../utils/pdfText';

const REGISTRY: InvoiceTemplate[] = [HyperpureTemplate];

export function detectTemplate(text: PdfTextOutput): InvoiceTemplate | null {
  for (const tpl of REGISTRY) {
    if (tpl.detect(text)) return tpl;
  }
  return null;
}

export type { InvoiceTemplate, ParsedHeader, ParsedLine, ParseIssue, TemplateParseResult } from './types';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/shared/invoiceTemplates.test.ts`
Expected: PASS, 3 cases green.

- [ ] **Step 5: Commit**

```bash
git add shared/invoiceTemplates/types.ts shared/invoiceTemplates/hyperpure.ts shared/invoiceTemplates/index.ts tests/shared/invoiceTemplates.test.ts
git commit -m "feat(invoices): template interface + Hyperpure detection by GSTIN"
```

---

## Task 6: Hyperpure header parsing

**Files:**
- Modify: `shared/invoiceTemplates/hyperpure.ts`
- Test: `tests/shared/hyperpureHeader.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/shared/hyperpureHeader.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { extractPdfText } from '../../shared/utils/pdfText';
import { HyperpureTemplate } from '../../shared/invoiceTemplates/hyperpure';

const SAMPLE = join(__dirname, '..', '__fixtures__', 'invoices', 'hyperpure-sample.pdf');

describe('Hyperpure header parsing', () => {
  it('extracts invoice number, date, and supplier GSTIN', async () => {
    const text = await extractPdfText(new Uint8Array(readFileSync(SAMPLE)));
    const result = HyperpureTemplate.parse(text);
    expect(result.header.invoiceNumber).toBe('ZHPTG27-OR-0025869827');
    expect(result.header.supplierGstin).toBe('36AAACZ8867B1Z1');
    // 28 Apr 2026 at noon local time
    const d = new Date(result.header.invoiceDate);
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(3); // April = 3
    expect(d.getDate()).toBe(28);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/shared/hyperpureHeader.test.ts`
Expected: FAIL with "not implemented yet".

- [ ] **Step 3: Implement header parsing**

Replace the body of `HyperpureTemplate.parse` in `shared/invoiceTemplates/hyperpure.ts` with header extraction; keep lines/issues empty for now:

```ts
import type { InvoiceTemplate, ParsedHeader, TemplateParseResult } from './types';
import type { PdfTextOutput } from '../utils/pdfText';

export const KNOWN_HYPERPURE_GSTINS = new Set<string>([
  '36AAACZ8867B1Z1', // HYD2
]);

const GSTIN_RE = /\b\d{2}[A-Z]{5}\d{4}[A-Z]\d[Z]\d\b/;
const ORDER_NO_RE = /Order\s*No\s*:\s*(\S+)/i;
const DATE_RE = /(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{4})/;
const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

function joinText(text: PdfTextOutput): string {
  return text.pages.map((p) => p.items.map((i) => i.str).join(' ')).join(' ');
}

function parseHeader(text: PdfTextOutput): ParsedHeader {
  const joined = joinText(text);

  const orderMatch = ORDER_NO_RE.exec(joined);
  const invoiceNumber = orderMatch?.[1] ?? '';

  const dateMatch = DATE_RE.exec(joined);
  let invoiceDate = Date.now();
  if (dateMatch) {
    const day = Number.parseInt(dateMatch[1]!, 10);
    const monthIdx = MONTHS[dateMatch[2]!.toLowerCase()] ?? 0;
    const year = Number.parseInt(dateMatch[3]!, 10);
    invoiceDate = new Date(year, monthIdx, day, 12, 0, 0).getTime();
  }

  // First GSTIN on page 1 is the supplier (Shipped From block).
  const page1 = text.pages[0]?.items.map((i) => i.str).join(' ') ?? '';
  const gstinMatch = GSTIN_RE.exec(page1);
  const supplierGstin = gstinMatch?.[0] ?? null;

  return { invoiceNumber, invoiceDate, supplierGstin };
}

export const HyperpureTemplate: InvoiceTemplate = {
  id: 'hyperpure',
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
    return { header, lines: [], issues: [] };
  },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/shared/hyperpureHeader.test.ts tests/shared/invoiceTemplates.test.ts`
Expected: both files PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/invoiceTemplates/hyperpure.ts tests/shared/hyperpureHeader.test.ts
git commit -m "feat(invoices): Hyperpure header parsing (order no, date, supplier GSTIN)"
```

---

## Task 7: Hyperpure line parsing (geometry-based row reconstruction)

**Files:**
- Modify: `shared/invoiceTemplates/hyperpure.ts`
- Test: `tests/shared/hyperpureLines.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/shared/hyperpureLines.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { extractPdfText } from '../../shared/utils/pdfText';
import { HyperpureTemplate } from '../../shared/invoiceTemplates/hyperpure';

const SAMPLE = join(__dirname, '..', '__fixtures__', 'invoices', 'hyperpure-sample.pdf');

// Oracle table: every ingredient row in the sample, computed from D4 (Total / quantity)
// and D5 (always explode pack size). Charges (delivery, COD, TCS) are not lines.
const EXPECTED = [
  // [rawDescription substring, expected quantity in base unit, unit, unitCost rounded to 4 dp]
  ['Mushroom Slices, 800 gm', 800, 'g', +(73 / 800).toFixed(4)],
  ['Lite Paneer, 1 Kg', 1000, 'g', +(291 / 1000).toFixed(4)],
  ['Professional Fat Spread, 500 gm', 1000, 'g', +(184.8 / 1000).toFixed(4)],
  ['Versatie Gold Cream, 1 L', 3000, 'ml', +(548.1 / 3000).toFixed(4)],
  ['Banana Leaf, 5 Pcs', 5, 'each', +(41 / 5).toFixed(4)],
  ['Beans Haricot, 500 gm', 3000, 'g', +(360 / 3000).toFixed(4)],
  ['Broccoli (Mix Size), 500 gm', 500, 'g', +(80 / 500).toFixed(4)],
  ['Cabbage without Leaves, 1 Kg', 1000, 'g', +(14 / 1000).toFixed(4)],
  ['Carrots (Big), 1 Kg', 4000, 'g', +(208 / 4000).toFixed(4)],
  ['Coriander Leaves (Kothmir), 500 gm', 500, 'g', +(55 / 500).toFixed(4)],
  ['Frozen Sweet Corn, 1 Kg', 1000, 'g', +(78 / 1000).toFixed(4)],
  ['Garlic Peeled (Market Grade), 500 gm', 500, 'g', +(88 / 500).toFixed(4)],
  ['Green Capsicum (Big Size), 1 Kg', 1000, 'g', +(63 / 1000).toFixed(4)],
  ['Red Capsicum (Mix Size), 500 gm', 500, 'g', +(135 / 500).toFixed(4)],
  ['Yellow Capsicum (Mix Size), 500 gm', 500, 'g', +(136 / 500).toFixed(4)],
  ['Black Pepper Whole, 100 gm', 100, 'g', +(100.8 / 100).toFixed(4)],
  ['Aromatic Mix, 500 gm', 500, 'g', +(152.25 / 500).toFixed(4)],
] as const;

describe('Hyperpure line parsing', () => {
  it('extracts the expected 17 ingredient rows from the sample', async () => {
    const text = await extractPdfText(new Uint8Array(readFileSync(SAMPLE)));
    const result = HyperpureTemplate.parse(text);

    expect(result.lines).toHaveLength(EXPECTED.length);

    for (const [descSubstring, qty, unit, unitCost] of EXPECTED) {
      const line = result.lines.find((l) => l.rawDescription.includes(descSubstring));
      expect(
        line,
        `expected to find a parsed line for "${descSubstring}"`,
      ).toBeDefined();
      expect(line!.quantity).toBeCloseTo(qty, 4);
      expect(line!.unit).toBe(unit);
      expect(+line!.unitCost.toFixed(4)).toBeCloseTo(unitCost, 4);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/shared/hyperpureLines.test.ts`
Expected: FAIL — `result.lines` is empty.

- [ ] **Step 3: Implement line extraction**

Append to `shared/invoiceTemplates/hyperpure.ts` (just before the `HyperpureTemplate` const, replacing the existing `parse` body to call this):

```ts
import { extractPackSize } from './packSize';
import type { ParsedLine, ParseIssue } from './types';

const Y_TOLERANCE = 2; // PDF user-space units; items within this y-delta belong to the same row
const CATEGORY_HEADERS = [
  'Canned & Imported Items',
  'Dairy',
  'Fruits & Vegetables',
  'Masala, Salt & Sugar',
  'Sauces & Seasoning',
  'Other Charges',
];

type Row = { y: number; items: { x: number; str: string }[] };

function groupItemsIntoRows(items: { x: number; y: number; str: string }[]): Row[] {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const rows: Row[] = [];
  for (const it of sorted) {
    const last = rows[rows.length - 1];
    if (last && Math.abs(last.y - it.y) <= Y_TOLERANCE) {
      last.items.push({ x: it.x, str: it.str });
    } else {
      rows.push({ y: it.y, items: [{ x: it.x, str: it.str }] });
    }
  }
  for (const r of rows) r.items.sort((a, b) => a.x - b.x);
  return rows;
}

function rowText(r: Row): string {
  return r.items.map((i) => i.str).join(' ').replace(/\s+/g, ' ').trim();
}

function isCategoryHeader(text: string): boolean {
  return CATEGORY_HEADERS.some((h) => text === h || text.startsWith(h));
}

// Hyperpure line shape (after column reconstruction): SI Description HSN InvQty UnitPrice UoM PreTax Discount Taxable TaxRate TotalTax Total
// Recognised via:
//   - leading SI number (pure integer, x in left margin),
//   - HSN code (8 digits, sometimes split across whitespace as "071151 00"),
//   - trailing Total (last numeric token).
const SI_RE = /^\d{1,3}$/;
const HSN_RE = /\b(\d{6})\s*(\d{2})\b/;          // captures 8-digit HSN possibly split
const NUM_RE = /-?\d+(?:\.\d+)?/g;

function parseLineRow(rowText: string): { description: string; invQty: number; total: number } | null {
  // Strip leading SI number.
  const cleaned = rowText.replace(/^\d{1,3}\s+/, '');
  const hsnMatch = HSN_RE.exec(cleaned);
  if (!hsnMatch) return null;
  const description = cleaned.slice(0, hsnMatch.index).trim().replace(/,$/, '');
  if (description.length === 0) return null;

  // After HSN: invQty unitPrice UoM preTax discount taxable taxRate totalTax total
  const afterHsn = cleaned.slice(hsnMatch.index + hsnMatch[0].length);
  const nums = afterHsn.match(NUM_RE)?.map(Number) ?? [];
  if (nums.length < 2) return null;

  const invQty = nums[0]!;
  const total = nums[nums.length - 1]!;
  if (!Number.isFinite(invQty) || invQty <= 0) return null;
  if (!Number.isFinite(total) || total < 0) return null;

  return { description, invQty, total };
}

function parseLines(text: PdfTextOutput): { lines: ParsedLine[]; issues: ParseIssue[] } {
  const lines: ParsedLine[] = [];
  const issues: ParseIssue[] = [];

  const allItems = text.pages.flatMap((p) => p.items);
  const rows = groupItemsIntoRows(allItems);

  let inTable = false;
  let stopped = false;
  for (const r of rows) {
    if (stopped) break;
    const rt = rowText(r);
    if (!inTable) {
      // Table starts after the SI No. / Description header row.
      if (rt.includes('SI') && rt.includes('Description') && rt.includes('HSN')) {
        inTable = true;
      }
      continue;
    }
    if (rt === 'Other Charges' || rt.startsWith('Other Charges')) {
      // Capture skipped charges from subsequent rows until end-of-table marker.
      collectCharges(rows, rows.indexOf(r) + 1, issues);
      stopped = true;
      break;
    }
    if (isCategoryHeader(rt)) continue;

    const parsed = parseLineRow(rt);
    if (!parsed) continue; // skip continuation/wrapped lines we can't reconstruct

    const pack = extractPackSize(parsed.description);
    if (!pack) {
      issues.push({ kind: 'unparseable_pack_size', rawDescription: parsed.description });
      lines.push({
        rawDescription: parsed.description,
        quantity: parsed.invQty,
        unit: '',
        unitCost: parsed.total / parsed.invQty,
      });
      continue;
    }

    const totalQtyBase = parsed.invQty * pack.size;
    lines.push({
      rawDescription: parsed.description,
      quantity: totalQtyBase,
      unit: pack.unit,
      unitCost: parsed.total / totalQtyBase,
    });
  }

  return { lines, issues };
}

function collectCharges(rows: Row[], startIdx: number, issues: ParseIssue[]): void {
  for (let i = startIdx; i < rows.length; i += 1) {
    const rt = rowText(rows[i]!);
    if (!rt) continue;
    if (rt.startsWith('Total ') || rt.startsWith('Amount Chargeable')) break;
    const nums = rt.match(NUM_RE)?.map(Number) ?? [];
    if (nums.length === 0) continue;
    const label = rt.split(/\s\d/)[0]!.trim();
    const total = nums[nums.length - 1]!;
    if (Number.isFinite(total) && total > 0 && label.length > 0) {
      issues.push({ kind: 'skipped_charge', label, total });
    }
  }
}
```

Then change the existing `parse` body to:

```ts
  parse(text: PdfTextOutput): TemplateParseResult {
    const header = parseHeader(text);
    const { lines, issues } = parseLines(text);
    return { header, lines, issues };
  },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/shared/hyperpureLines.test.ts`
Expected: PASS, 17 lines extracted with the expected quantities.

If the test fails on row count, log `result.lines.map(l => l.rawDescription)` and adjust `parseLineRow` — it usually means a continuation row is being mis-parsed or the SI-number stripping over-matched.

- [ ] **Step 5: Commit**

```bash
git add shared/invoiceTemplates/hyperpure.ts tests/shared/hyperpureLines.test.ts
git commit -m "feat(invoices): Hyperpure line extraction with pack-size explosion"
```

---

## Task 8: Hyperpure skipped-charges issues

**Files:**
- Test: `tests/shared/hyperpureCharges.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/shared/hyperpureCharges.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { extractPdfText } from '../../shared/utils/pdfText';
import { HyperpureTemplate } from '../../shared/invoiceTemplates/hyperpure';

const SAMPLE = join(__dirname, '..', '__fixtures__', 'invoices', 'hyperpure-sample.pdf');

describe('Hyperpure skipped charges', () => {
  it('emits skipped_charge issues for Delivery and Pay On Delivery', async () => {
    const text = await extractPdfText(new Uint8Array(readFileSync(SAMPLE)));
    const result = HyperpureTemplate.parse(text);

    const charges = result.issues.filter((i) => i.kind === 'skipped_charge');
    const labels = charges.map((c) => (c as { label: string }).label.toLowerCase());

    expect(labels.some((l) => l.includes('delivery charge'))).toBe(true);
    expect(labels.some((l) => l.includes('pay on delivery'))).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it passes (charges should already be captured by Task 6)**

Run: `npx vitest run tests/shared/hyperpureCharges.test.ts`

Expected: PASS. If it fails because the labels don't include both charges, refine `collectCharges` in `hyperpure.ts` until they do — usually the fix is to keep collecting until a `Total ` row rather than stopping early.

- [ ] **Step 3: Commit**

```bash
git add tests/shared/hyperpureCharges.test.ts shared/invoiceTemplates/hyperpure.ts
git commit -m "test(invoices): Hyperpure skipped-charge issue capture"
```

---

## Task 9: Zod schemas for parser IPC contract

**Files:**
- Create: `shared/schemas/invoiceParser.ts`
- Modify: `shared/schemas/ipc.ts`
- Test: `tests/shared/invoiceParserSchema.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/shared/invoiceParserSchema.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parseResultSchema } from '../../shared/schemas/invoiceParser';

describe('parseResultSchema', () => {
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
        { rawDescription: 'Paneer, 1 Kg', ingredientId: 'ing-1', quantity: 1000, unit: 'g', unitCost: 0.291 },
      ],
      issues: [{ kind: 'skipped_charge', label: 'Delivery Charge', total: 234.82 }],
    };
    expect(parseResultSchema.parse(input)).toEqual(input);
  });

  it('accepts a duplicate failure with existingInvoiceId', () => {
    const input = { ok: false, reason: 'duplicate', existingInvoiceId: 'inv-2' };
    expect(parseResultSchema.parse(input)).toEqual(input);
  });

  it('rejects an unknown reason', () => {
    expect(() => parseResultSchema.parse({ ok: false, reason: 'nope' })).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/shared/invoiceParserSchema.test.ts`
Expected: FAIL with module-not-found.

- [ ] **Step 3: Implement schema + IPC channel constant**

Create `shared/schemas/invoiceParser.ts`:

```ts
import { z } from 'zod';

export const parseInvoiceInputSchema = z.object({
  bytes: z.instanceof(Uint8Array),
});
export type ParseInvoiceInput = z.infer<typeof parseInvoiceInputSchema>;

export const parsedHeaderSchema = z.object({
  supplierId: z.string().nullable(),
  invoiceNumber: z.string(),
  invoiceDate: z.number(),
});

export const parsedLineSchema = z.object({
  rawDescription: z.string(),
  ingredientId: z.string().nullable(),
  quantity: z.number(),
  unit: z.string(),
  unitCost: z.number(),
});

export const parseIssueSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('unknown_supplier'), gstin: z.string().nullable() }),
  z.object({ kind: z.literal('skipped_charge'), label: z.string(), total: z.number() }),
  z.object({ kind: z.literal('unparseable_pack_size'), rawDescription: z.string() }),
  z.object({ kind: z.literal('unmappable_line'), rawDescription: z.string(), reason: z.string() }),
]);

export const parseResultSchema = z.discriminatedUnion('ok', [
  z.object({
    ok: z.literal(true),
    templateId: z.string(),
    header: parsedHeaderSchema,
    lines: z.array(parsedLineSchema),
    issues: z.array(parseIssueSchema),
  }),
  z.object({
    ok: z.literal(false),
    reason: z.enum(['unknown_supplier_format', 'duplicate', 'pdf_extraction_failed']),
    existingInvoiceId: z.string().optional(),
  }),
]);
export type ParseResult = z.infer<typeof parseResultSchema>;
```

In `shared/schemas/ipc.ts`, add a `parse` channel under `invoice`:

```ts
  invoice: {
    list: 'invoice:list',
    get: 'invoice:get',
    createDraft: 'invoice:createDraft',
    update: 'invoice:update',
    replaceLines: 'invoice:replaceLines',
    commit: 'invoice:commit',
    attachPdf: 'invoice:attachPdf',
    parse: 'invoice:parse',           // ← add this line
  },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/shared/invoiceParserSchema.test.ts`
Expected: PASS, 3 cases green.

- [ ] **Step 5: Commit**

```bash
git add shared/schemas/invoiceParser.ts shared/schemas/ipc.ts tests/shared/invoiceParserSchema.test.ts
git commit -m "feat(invoices): Zod schemas + IPC channel for invoice:parse"
```

---

## Task 10: InvoiceParserService

**Files:**
- Create: `main/services/InvoiceParserService.ts`
- Test: `tests/main/InvoiceParserService.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/main/InvoiceParserService.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { InvoiceParserService } from '../../main/services/InvoiceParserService';
import { supplierRepository } from '../../main/repositories/supplierRepository';
import { supplierItemMappingRepository } from '../../main/repositories/supplierItemMappingRepository';
import { invoiceRepository } from '../../main/repositories/invoiceRepository';
import { DEFAULT_TENANT_ID } from '@shared/constants/system';

const SAMPLE = join(__dirname, '..', '__fixtures__', 'invoices', 'hyperpure-sample.pdf');
const fakeDb = {} as never;

afterEach(() => vi.restoreAllMocks());

describe('InvoiceParserService.parse', () => {
  it('returns ok with header + 17 lines when supplier exists and no duplicate', async () => {
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
    expect(out.templateId).toBe('hyperpure');
    expect(out.header.supplierId).toBe('sup-hyperpure');
    expect(out.header.invoiceNumber).toBe('ZHPTG27-OR-0025869827');
    expect(out.lines).toHaveLength(17);
  });

  it('returns unknown_supplier_format for a non-Hyperpure buffer', async () => {
    const out = await InvoiceParserService.parse(fakeDb, DEFAULT_TENANT_ID, {
      bytes: new Uint8Array([1, 2, 3, 4]),
    });
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.reason).toBe('unknown_supplier_format');
  });

  it('returns duplicate when an invoice with the same (supplier, number) exists', async () => {
    vi.spyOn(supplierRepository, 'findByGstin').mockReturnValue({
      id: 'sup-hyperpure',
      tenantId: DEFAULT_TENANT_ID,
      name: 'Zomato Hyperpure',
      gstin: '36AAACZ8867B1Z1',
      isActive: true,
    } as never);
    vi.spyOn(invoiceRepository, 'findByNumber').mockReturnValue({
      id: 'inv-existing',
    } as never);

    const buf = new Uint8Array(readFileSync(SAMPLE));
    const out = await InvoiceParserService.parse(fakeDb, DEFAULT_TENANT_ID, { bytes: buf });

    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.reason).toBe('duplicate');
    expect(out.existingInvoiceId).toBe('inv-existing');
  });

  it('attaches ingredient_id from supplier_item_mappings when a mapping exists', async () => {
    vi.spyOn(supplierRepository, 'findByGstin').mockReturnValue({
      id: 'sup-hyperpure',
      tenantId: DEFAULT_TENANT_ID,
      gstin: '36AAACZ8867B1Z1',
      isActive: true,
    } as never);
    vi.spyOn(invoiceRepository, 'findByNumber').mockReturnValue(null as never);
    vi.spyOn(supplierItemMappingRepository, 'findByDescription').mockImplementation(
      ((_db: unknown, _t: number, _sid: string, desc: string) =>
        desc.includes('Lite Paneer') ? { ingredientId: 'ing-paneer' } : null) as never,
    );

    const buf = new Uint8Array(readFileSync(SAMPLE));
    const out = await InvoiceParserService.parse(fakeDb, DEFAULT_TENANT_ID, { bytes: buf });

    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const paneer = out.lines.find((l) => l.rawDescription.includes('Lite Paneer'));
    expect(paneer?.ingredientId).toBe('ing-paneer');
    const other = out.lines.find((l) => !l.rawDescription.includes('Lite Paneer'));
    expect(other?.ingredientId).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/main/InvoiceParserService.test.ts`
Expected: FAIL with module-not-found for `InvoiceParserService`.

- [ ] **Step 3: Implement**

Create `main/services/InvoiceParserService.ts`:

```ts
import type { DB } from '../db/client';
import { extractPdfText } from '@shared/utils/pdfText';
import { detectTemplate } from '@shared/invoiceTemplates';
import type { ParseInvoiceInput, ParseResult } from '@shared/schemas/invoiceParser';
import { supplierRepository } from '../repositories/supplierRepository';
import { supplierItemMappingRepository } from '../repositories/supplierItemMappingRepository';
import { invoiceRepository } from '../repositories/invoiceRepository';

export const InvoiceParserService = {
  async parse(db: DB, tenantId: number, input: ParseInvoiceInput): Promise<ParseResult> {
    let text;
    try {
      text = await extractPdfText(input.bytes);
    } catch {
      return { ok: false, reason: 'pdf_extraction_failed' };
    }
    if (text.pages.length === 0) {
      return { ok: false, reason: 'unknown_supplier_format' };
    }

    const template = detectTemplate(text);
    if (!template) {
      return { ok: false, reason: 'unknown_supplier_format' };
    }

    const tplResult = template.parse(text);

    // Resolve supplier by GSTIN (active only).
    let supplierId: string | null = null;
    if (tplResult.header.supplierGstin) {
      const sup = supplierRepository.findByGstin(db, tenantId, tplResult.header.supplierGstin);
      if (sup && sup.isActive) supplierId = sup.id;
    }

    // Duplicate check.
    if (supplierId && tplResult.header.invoiceNumber) {
      const existing = invoiceRepository.findByNumber(
        db,
        tenantId,
        supplierId,
        tplResult.header.invoiceNumber,
      );
      if (existing) {
        return { ok: false, reason: 'duplicate', existingInvoiceId: existing.id };
      }
    }

    // Per-line mapping resolve.
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

    return {
      ok: true,
      templateId: template.id,
      header: {
        supplierId,
        invoiceNumber: tplResult.header.invoiceNumber,
        invoiceDate: tplResult.header.invoiceDate,
      },
      lines,
      issues: [
        ...tplResult.issues,
        ...(tplResult.header.supplierGstin && !supplierId
          ? [{ kind: 'unknown_supplier' as const, gstin: tplResult.header.supplierGstin }]
          : []),
      ],
    };
  },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/main/InvoiceParserService.test.ts`
Expected: PASS, all 4 cases green.

- [ ] **Step 5: Commit**

```bash
git add main/services/InvoiceParserService.ts tests/main/InvoiceParserService.test.ts
git commit -m "feat(invoices): InvoiceParserService orchestrates parse + supplier + duplicate + mapping resolve"
```

---

## Task 11: IPC handler + register

**Files:**
- Modify: `main/ipc/handlers/invoice.ts`
- Modify: `preload/index.ts`

- [ ] **Step 1: Add handler**

In `main/ipc/handlers/invoice.ts`, add the import and handler block:

```ts
import { parseInvoiceInputSchema } from '@shared/schemas/invoiceParser';
import { InvoiceParserService } from '../../services/InvoiceParserService';
```

Add inside `registerInvoiceHandlers()`:

```ts
  ipcMain.handle(
    IPC.invoice.parse,
    makeHandler(parseInvoiceInputSchema, (input) =>
      InvoiceParserService.parse(getDb().db, DEFAULT_TENANT_ID, input),
    ),
  );
```

- [ ] **Step 2: Expose in preload**

In `preload/index.ts`, find the `invoice:` block in the contextBridge surface and add:

```ts
parseInvoice: (bytes: Uint8Array): Promise<IpcResult<ParseResult>> =>
  ipcRenderer.invoke(IPC.invoice.parse, { bytes }),
```

Also add the type import at the top:
```ts
import type { ParseResult } from '@shared/schemas/invoiceParser';
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add main/ipc/handlers/invoice.ts preload/index.ts
git commit -m "feat(invoices): wire invoice:parse IPC handler + preload bridge"
```

---

## Task 12: Renderer hook

**Files:**
- Modify: `renderer/hooks/ipc/useInvoices.ts`

- [ ] **Step 1: Add useParseInvoice hook**

In `renderer/hooks/ipc/useInvoices.ts`, add (alongside the existing hooks):

```ts
import type { ParseResult } from '@shared/schemas/invoiceParser';

export function useParseInvoice() {
  return useMutation<ParseResult, Error, Uint8Array>({
    mutationFn: async (bytes) => {
      const res = await window.api.invoice.parseInvoice(bytes);
      if (!res.ok) throw new Error(res.error.message);
      return res.data;
    },
  });
}
```

(Match the exact pattern of the existing `useAttachInvoicePdf` hook in the same file — same import style, same error handling.)

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add renderer/hooks/ipc/useInvoices.ts
git commit -m "feat(invoices): renderer hook for invoice:parse"
```

---

## Task 13: PdfAttachZone parses before attaching

**Files:**
- Modify: `renderer/features/invoices/PdfAttachZone.tsx`

- [ ] **Step 1: Add onParsed prop and parse-before-attach flow**

Open `renderer/features/invoices/PdfAttachZone.tsx`. Change the props type:

```ts
import { useParseInvoice } from '@renderer/hooks/ipc/useInvoices';
import type { ParseResult } from '@shared/schemas/invoiceParser';

type Props = {
  invoiceId: string | null;  // null when invoice not yet saved
  filePath: string | null;
  disabled?: boolean;
  onParsed?: (result: ParseResult) => void;  // called with both ok and !ok results
};
```

Modify `handleFile` to parse first, then attach (or skip attach if invoiceId is null):

```ts
const parse = useParseInvoice();

async function handleFile(file: File) {
  setError(null);
  if (!file.name.toLowerCase().endsWith('.pdf')) {
    setError('Only .pdf files are accepted.');
    return;
  }
  if (file.size > 10 * MB) {
    setError(`PDF exceeds 10 MB cap (${(file.size / MB).toFixed(1)} MB).`);
    return;
  }
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);

  // Step 1: parse (always).
  let parseResult: ParseResult;
  try {
    parseResult = await parse.mutateAsync(bytes);
  } catch (err) {
    setError(err instanceof Error ? err.message : 'Could not parse PDF');
    return;
  }
  if (props.onParsed) props.onParsed(parseResult);

  // Step 2: attach if we have an invoice id and parse didn't say "duplicate".
  if (invoiceId && !(parseResult.ok === false && parseResult.reason === 'duplicate')) {
    try {
      await attach.mutateAsync({
        id: invoiceId,
        fileName: file.name,
        bytes,
      });
      setName(file.name);
      setSize(file.size);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not attach PDF');
    }
  }
}
```

Also adjust the existing `attached = filePath !== null` rendering so that when `invoiceId` is `null`, the component still accepts a drop (renders the drop UI without the green "attached" state).

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add renderer/features/invoices/PdfAttachZone.tsx
git commit -m "feat(invoices): PdfAttachZone parses on drop and lifts result via onParsed"
```

---

## Task 14: InvoiceEditorPage — pre-fill from parse + drop zone for new invoices

**Files:**
- Modify: `renderer/pages/InvoiceEditorPage.tsx`

- [ ] **Step 1: Wire onParsed**

In `renderer/pages/InvoiceEditorPage.tsx`:

1. Replace the `<PdfAttachZone>` block (currently lines 257-267) with:

```tsx
<div className="mt-3">
  <PdfAttachZone
    invoiceId={existing?.id ?? null}
    filePath={existing?.filePath ?? null}
    disabled={isCommitted}
    onParsed={handleParsed}
  />
  {parseInfo ? (
    <div className="mt-2 rounded-md border border-border-tertiary bg-background-secondary px-3 py-2 text-[12px] text-text-secondary">
      {parseInfo}
    </div>
  ) : null}
  {duplicateInvoiceId ? (
    <div className="mt-2 rounded-md border border-border-warning bg-background-warning/30 px-3 py-2 text-[12px] text-text-warning">
      This invoice was already imported.{' '}
      <Link to={`/invoices/${duplicateInvoiceId}/edit`} className="underline">
        Open existing invoice
      </Link>
    </div>
  ) : null}
</div>
```

(Drop the `!existing` branch entirely — the drop zone is always shown now.)

2. Add state and handler near the top of the component:

```tsx
const [parseInfo, setParseInfo] = useState<string | null>(null);
const [duplicateInvoiceId, setDuplicateInvoiceId] = useState<string | null>(null);

function handleParsed(result: ParseResult) {
  setDuplicateInvoiceId(null);
  setParseInfo(null);
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
  // Pre-fill rows.
  setRows(
    result.lines.length === 0
      ? [emptyLine()]
      : result.lines.map((l) => ({
          key: nextLineKey(),
          rawDescription: l.rawDescription,
          ingredientId: l.ingredientId,
          quantity: l.quantity,
          unit: l.unit,
          unitCost: l.unitCost,
        })),
  );
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

3. Add the type import at the top:

```tsx
import type { ParseResult } from '@shared/schemas/invoiceParser';
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add renderer/pages/InvoiceEditorPage.tsx
git commit -m "feat(invoices): InvoiceEditorPage prefills from parsed PDF + duplicate banner"
```

---

## Task 15: Manual smoke test in dev

**Files:** none (manual verification + commit if any small fixes needed)

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: all tests pass (existing 119 + ~25 new = ~144 total).

- [ ] **Step 2: Start the dev server**

Run: `npm run dev`
Wait for the Electron window. Expected: app loads at the dashboard.

- [ ] **Step 3: Pre-conditions**

In the running app:
1. Go to **Suppliers** → create a supplier "Zomato Hyperpure" and put `36AAACZ8867B1Z1` (exact, uppercase) in the **GSTIN** field added by Task 2.
2. Go to **Ingredients** → create at least one matching ingredient, e.g. "Paneer" with base unit `g`. (Other lines will show as needs-review on first import; that's fine for the smoke test.)

- [ ] **Step 4: Drop the sample PDF**

1. Navigate to **Invoices** → **+ New invoice**.
2. Drag `digital-pod-ZHPTG27-OR-0025869827.pdf` onto the drop zone.
3. **Expected behaviour:**
   - Header fields auto-populate: supplier = Zomato Hyperpure, invoice # = `ZHPTG27-OR-0025869827`, date = `28/04/2026`.
   - 17 line rows appear, each with quantity in base units (e.g. Paneer row shows 1000 g @ ~₹0.291/g).
   - Lines whose descriptions don't yet have a mapping show the ingredient dropdown empty (yellow / needs-review).
   - The Paneer row (if you created that ingredient) shows the dropdown populated.
   - An info banner reads something like `16 lines need an ingredient mapping · ₹254.82 in fees not added to stock`.

- [ ] **Step 5: Map one line and commit**

1. Pick the Paneer row. Confirm the ingredient dropdown shows "Paneer".
2. Click **Save draft**, then map a few more rows just to demonstrate, then click **Map & commit**.
3. **Expected:** invoice flips to COMMITTED. Go to **Stock movements** for Paneer — a `purchase` movement of 1000 g at ₹0.291/g should appear, and Paneer's stock_quantity has increased by 1000.

- [ ] **Step 6: Drop the same PDF on a new draft to test duplicate detection**

1. Click **+ New invoice** again.
2. Drop the same PDF.
3. **Expected:** duplicate warning appears with a link "Open existing invoice" pointing at the just-committed one.

- [ ] **Step 7: If anything in steps 4-6 misbehaves, fix and commit before completing**

Common fixes:
- Dropdown not pre-selecting Paneer → check `findByDescription` lookup; rawDescription is case-sensitive in the lookup but the parsed string should match what was stored at commit time.
- Rows appearing with `unit = ''` for descriptions that should parse → tweak `extractPackSize` regex; add a failing test in `tests/shared/packSize.test.ts` for the description that broke.
- Duplicate detection not firing → ensure `invoiceRepository.findByNumber` matches on `(tenantId, supplierId, invoiceNumber)` exactly.

- [ ] **Step 8: Final commit**

```bash
git add -A
git commit -m "feat(invoices): manual smoke verified — Hyperpure PDF auto-parse end-to-end" --allow-empty
```

(Use `--allow-empty` only if no fixes were needed in step 7.)

---

## Self-review checklist

- [x] Spec coverage: every section of the design doc maps to a task.
  - §Architecture → Tasks 5, 9, 10, 11, 12, 13, 14
  - §Data flow → Tasks 10, 13, 14
  - §Hyperpure template → Tasks 5, 6, 7, 8
  - §Schema migration (gstin column on suppliers) → Task 2
  - §IPC contract → Task 9
  - §Edge cases → Task 10 (extraction failure, unknown supplier, duplicate, mapping miss); Task 14 (duplicate UX, unknown-supplier UX, attach-when-duplicate suppression)
  - §New dependency → Task 1
  - §Test strategy → fixture in Task 1; pdfText in Task 4; template detection in Task 5; header in Task 6; lines in Task 7; charges in Task 8; service in Task 10
- [x] No placeholders ("TODO", "TBD", "implement later") — all code is concrete.
- [x] Type consistency: `ParsedHeader` / `ParsedLine` / `ParseIssue` / `TemplateParseResult` / `ParseResult` are defined once (Task 4 + Task 8) and re-imported consistently in later tasks. `extractPackSize` returns `PackSize | null` consistently. `InvoiceTemplate.id` is a string used in the discriminator field of `ParseResult.templateId`.

## Future work (deferred — not in this plan)

- Bulk inbox screen for many PDFs at once with auto-commit (spec §Future work).
- Additional supplier templates (one new file under `shared/invoiceTemplates/`, no changes to `InvoiceParserService`).
- AI/LLM fallback for unknown supplier formats.
- OCR for scanned PDFs.
- Booking "Other Charges" as a separate non-stock line.
- Per-supplier cost-basis override.
