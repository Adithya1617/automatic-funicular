import { z } from 'zod';
import { idSchema } from './id';

export const INVOICE_STATUSES = ['draft', 'committed'] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const invoiceLineSchema = z.object({
  id: idSchema,
  invoiceId: idSchema,
  rawDescription: z.string().min(1).max(500),
  ingredientId: idSchema.nullable(),
  quantity: z.number().positive(),
  unit: z.string().min(1),
  unitCost: z.number().nonnegative(),
  totalCost: z.number().nonnegative(),
  displayOrder: z.number().int(),
});
export type InvoiceLine = z.infer<typeof invoiceLineSchema>;

export const invoiceSchema = z.object({
  id: idSchema,
  tenantId: z.number().int(),
  supplierId: idSchema,
  invoiceNumber: z.string().min(1).max(120),
  invoiceDate: z.number().int(),
  totalAmount: z.number().nonnegative(),
  filePath: z.string().nullable(),
  status: z.enum(INVOICE_STATUSES),
  notes: z.string().nullable(),
  committedAt: z.number().int().nullable(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
  createdBy: z.string(),
  updatedBy: z.string(),
});
export type Invoice = z.infer<typeof invoiceSchema>;

export const invoiceWithLinesSchema = invoiceSchema.extend({
  lines: z.array(invoiceLineSchema),
});
export type InvoiceWithLines = z.infer<typeof invoiceWithLinesSchema>;

export const lineDraftSchema = z.object({
  rawDescription: z.string().min(1).max(500),
  ingredientId: idSchema.nullable(),
  quantity: z.number().positive(),
  unit: z.string().min(1),
  unitCost: z.number().nonnegative(),
  displayOrder: z.number().int().default(0),
});
export type LineDraft = z.infer<typeof lineDraftSchema>;

export const createInvoiceDraftInputSchema = z.object({
  supplierId: idSchema,
  invoiceNumber: z.string().min(1).max(120),
  invoiceDate: z.number().int(),
  notes: z.string().max(500).nullable().default(null),
  lines: z.array(lineDraftSchema).default([]),
});
export type CreateInvoiceDraftInput = z.infer<typeof createInvoiceDraftInputSchema>;

export const updateInvoiceInputSchema = z.object({
  id: idSchema,
  supplierId: idSchema.optional(),
  invoiceNumber: z.string().min(1).max(120).optional(),
  invoiceDate: z.number().int().optional(),
  notes: z.string().max(500).nullable().optional(),
});
export type UpdateInvoiceInput = z.infer<typeof updateInvoiceInputSchema>;

export const replaceInvoiceLinesInputSchema = z.object({
  id: idSchema,
  lines: z.array(lineDraftSchema),
});
export type ReplaceInvoiceLinesInput = z.infer<typeof replaceInvoiceLinesInputSchema>;

export const commitInvoiceInputSchema = z.object({
  id: idSchema,
});
export type CommitInvoiceInput = z.infer<typeof commitInvoiceInputSchema>;

export const listInvoicesInputSchema = z.object({
  status: z.enum(INVOICE_STATUSES).optional(),
  supplierId: idSchema.optional(),
  search: z.string().trim().optional(),
  limit: z.number().int().min(1).max(500).default(200),
});
export type ListInvoicesInput = z.infer<typeof listInvoicesInputSchema>;

export const getInvoiceInputSchema = z.object({ id: idSchema });
export type GetInvoiceInput = z.infer<typeof getInvoiceInputSchema>;

export const attachPdfInputSchema = z.object({
  id: idSchema,
  fileName: z.string().min(1),
  /** Bytes ride over IPC as a Uint8Array (length-bounded server-side). */
  bytes: z.instanceof(Uint8Array),
});
export type AttachPdfInput = z.infer<typeof attachPdfInputSchema>;
