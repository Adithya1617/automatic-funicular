import { z } from 'zod';

export const CSV_IMPORT_KINDS = ['parts', 'suppliers', 'bikes', 'service_templates'] as const;
export type CsvImportKind = (typeof CSV_IMPORT_KINDS)[number];

export const csvImportIssueSchema = z.object({
  lineNumber: z.number().int(),
  field: z.string().nullable(),
  message: z.string(),
});
export type CsvImportIssue = z.infer<typeof csvImportIssueSchema>;

export const csvImportSummarySchema = z.object({
  totalRows: z.number().int().nonnegative(),
  toCreate: z.number().int().nonnegative(),
  toUpdate: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
});
export type CsvImportSummary = z.infer<typeof csvImportSummarySchema>;

export const csvImportResultSchema = z.object({
  kind: z.enum(CSV_IMPORT_KINDS),
  dryRun: z.boolean(),
  committed: z.boolean(),
  summary: csvImportSummarySchema,
  issues: z.array(csvImportIssueSchema),
});
export type CsvImportResult = z.infer<typeof csvImportResultSchema>;

export const csvImportInputSchema = z.object({
  kind: z.enum(CSV_IMPORT_KINDS),
  /** Raw CSV text. UI converts the uploaded file to text before sending. */
  content: z.string().min(1),
  dryRun: z.boolean().default(true),
});
export type CsvImportInput = z.infer<typeof csvImportInputSchema>;

export const csvTemplateInputSchema = z.object({
  kind: z.enum(CSV_IMPORT_KINDS),
});
export type CsvTemplateInput = z.infer<typeof csvTemplateInputSchema>;

export const csvTemplateResponseSchema = z.object({
  kind: z.enum(CSV_IMPORT_KINDS),
  filename: z.string(),
  content: z.string(),
});
export type CsvTemplateResponse = z.infer<typeof csvTemplateResponseSchema>;
