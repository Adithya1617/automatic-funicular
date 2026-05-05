import { z } from 'zod';
import { idSchema } from './id';

export const supplierSchema = z.object({
  id: idSchema,
  tenantId: z.number().int(),
  name: z.string().min(1).max(120),
  contactInfo: z.string().nullable(),
  gstin: z.string().nullable(),
  notes: z.string().nullable(),
  isActive: z.boolean(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
  createdBy: z.string(),
  updatedBy: z.string(),
});
export type Supplier = z.infer<typeof supplierSchema>;

export const createSupplierInputSchema = z.object({
  name: z.string().min(1).max(120),
  contactInfo: z.string().max(500).nullable().default(null),
  gstin: z.string().max(15).nullable().default(null),
  notes: z.string().max(2000).nullable().default(null),
});
export type CreateSupplierInput = z.infer<typeof createSupplierInputSchema>;

export const updateSupplierInputSchema = z.object({
  id: idSchema,
  name: z.string().min(1).max(120).optional(),
  contactInfo: z.string().max(500).nullable().optional(),
  gstin: z.string().max(15).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  isActive: z.boolean().optional(),
});
export type UpdateSupplierInput = z.infer<typeof updateSupplierInputSchema>;

export const listSuppliersInputSchema = z.object({
  search: z.string().trim().optional(),
  includeInactive: z.boolean().default(false),
});
export type ListSuppliersInput = z.infer<typeof listSuppliersInputSchema>;

export const getSupplierInputSchema = z.object({ id: idSchema });
export type GetSupplierInput = z.infer<typeof getSupplierInputSchema>;

export const deactivateSupplierInputSchema = getSupplierInputSchema;
export type DeactivateSupplierInput = z.infer<typeof deactivateSupplierInputSchema>;
