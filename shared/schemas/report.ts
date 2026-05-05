import { z } from 'zod';
import { dateRangeSchema } from './dashboard';

export const REPORT_KINDS = ['movements', 'cogs', 'spending'] as const;
export type ReportKind = (typeof REPORT_KINDS)[number];

export const exportReportInputSchema = z.object({
  kind: z.enum(REPORT_KINDS),
  range: dateRangeSchema,
});
export type ExportReportInput = z.infer<typeof exportReportInputSchema>;

export const exportReportResponseSchema = z.object({
  filename: z.string(),
  /** UTF-8 CSV content. Renderer wraps in a Blob for download. */
  content: z.string(),
});
export type ExportReportResponse = z.infer<typeof exportReportResponseSchema>;
