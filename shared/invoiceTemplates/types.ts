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
  categoryHint: string; // '' when no header is active for this line
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
