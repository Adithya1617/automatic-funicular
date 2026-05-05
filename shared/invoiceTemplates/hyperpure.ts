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
