import { z } from 'zod';
import { idSchema } from './id';

export const serviceTemplateSchema = z.object({
  id: idSchema,
  tenantId: z.number().int(),
  name: z.string().min(1).max(120),
  bikeTypeId: idSchema,
  displayOrder: z.number().int(),
  isActive: z.boolean(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
  createdBy: z.string(),
  updatedBy: z.string(),
});
export type ServiceTemplate = z.infer<typeof serviceTemplateSchema>;

export const createServiceTemplateInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  bikeTypeId: idSchema,
  displayOrder: z.number().int().default(0),
});
export type CreateServiceTemplateInput = z.infer<typeof createServiceTemplateInputSchema>;

export const updateServiceTemplateInputSchema = z.object({
  id: idSchema,
  name: z.string().trim().min(1).max(120).optional(),
  bikeTypeId: idSchema.optional(),
  displayOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});
export type UpdateServiceTemplateInput = z.infer<typeof updateServiceTemplateInputSchema>;

export const listServiceTemplatesInputSchema = z.object({
  search: z.string().trim().optional(),
  bikeTypeId: idSchema.optional(),
  includeInactive: z.boolean().default(false),
});
export type ListServiceTemplatesInput = z.infer<typeof listServiceTemplatesInputSchema>;

export const getServiceTemplateInputSchema = z.object({ id: idSchema });
export type GetServiceTemplateInput = z.infer<typeof getServiceTemplateInputSchema>;

export const deactivateServiceTemplateInputSchema = getServiceTemplateInputSchema;
export type DeactivateServiceTemplateInput = z.infer<typeof deactivateServiceTemplateInputSchema>;
