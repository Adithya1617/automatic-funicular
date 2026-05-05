import type {
  InvoiceTemplate,
  ParsedHeader,
  ParsedLine,
  ParseIssue,
  TemplateParseResult,
  IngredientSuggestion,
} from './types';
import type { PdfTextOutput } from '../utils/pdfText';
import { extractPackSize } from './packSize';

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

// Hyperpure rows with wrapped descriptions span up to ~10 PDF user-space units (top
// of description, mid-row data, bottom of description). We cluster against the row's
// running min/max so a tall multi-line description still gathers into one logical row.
const Y_TOLERANCE = 5;
const CATEGORY_HEADERS = [
  'Canned & Imported Items',
  'Dairy',
  'Fruits & Vegetables',
  'Masala, Salt & Sugar',
  'Sauces & Seasoning',
  'Other Charges',
];

type Row = { yMin: number; yMax: number; items: { x: number; str: string }[] };

function groupItemsIntoRows(items: { x: number; y: number; str: string }[]): Row[] {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const rows: Row[] = [];
  for (const it of sorted) {
    const last = rows[rows.length - 1];
    // Belongs to the previous row if its y is within tolerance of either edge of
    // that row's bounding box (covers cases where a row is multi-line by ~10 units
    // top-to-bottom and the data baseline sits between description top and bottom).
    if (last && (it.y >= last.yMin - Y_TOLERANCE) && (it.y <= last.yMax + Y_TOLERANCE)) {
      last.items.push({ x: it.x, str: it.str });
      if (it.y < last.yMin) last.yMin = it.y;
      if (it.y > last.yMax) last.yMax = it.y;
    } else {
      rows.push({ yMin: it.y, yMax: it.y, items: [{ x: it.x, str: it.str }] });
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

const HSN_RE = /\b(\d{6})\s*(\d{2})\b/;
const NUM_RE = /-?\d+(?:\.\d+)?/g;

function parseLineRow(rawText: string): { description: string; invQty: number; total: number } | null {
  // Strip leading SI number.
  const cleaned = rawText.replace(/^\d{1,3}\s+/, '');
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

  // Process each page independently so footer/header items from one page never get
  // merged into a row from another page (rows on different pages can share y values).
  // Table state (inTable, stopped) persists across pages — Hyperpure invoices repeat
  // the column header on continuation pages but we only need to enter the table once,
  // and we may see the table continue through page 2 before "Other Charges" appears.
  let inTable = false;
  let stopped = false;
  let activeCategory = '';
  for (const page of text.pages) {
    if (stopped) break;
    const rows = groupItemsIntoRows(page.items);

    for (let idx = 0; idx < rows.length; idx += 1) {
      if (stopped) break;
      const r = rows[idx]!;
      const rt = rowText(r);
      if (!inTable) {
        // Table starts after the SI No. / Description header row.
        if (rt.includes('SI') && rt.includes('Description') && rt.includes('HSN')) {
          inTable = true;
        }
        continue;
      }
      // Re-encountering the column header on a continuation page is just a header.
      if (rt.includes('Description of Services') && rt.includes('HSN')) continue;
      if (rt === 'Other Charges' || rt.startsWith('Other Charges')) {
        collectCharges(rows, idx + 1, issues);
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
      if (!parsed) continue; // skip continuation/wrapped lines we can't reconstruct

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

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .split('')
    .map((char, i, arr) => {
      // Capitalize letter at position 0, or after whitespace, but NOT after opening parens
      if (i === 0) return char.toUpperCase();
      const prev = arr[i - 1]!;
      if (/\s/.test(prev) && /[a-z]/.test(char)) return char.toUpperCase();
      return char;
    })
    .join('');
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
