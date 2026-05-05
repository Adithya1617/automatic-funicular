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
