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
