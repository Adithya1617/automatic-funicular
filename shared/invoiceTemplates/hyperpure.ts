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
