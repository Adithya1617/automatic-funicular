import { z } from 'zod';
import { idSchema } from './id';

// -- Bike types -------------------------------------------------------------
export const bikeTypeSchema = z.object({
  id: idSchema,
  tenantId: z.number().int(),
  name: z.string().min(1).max(80),
  engineCc: z.number().int().positive(),
  displayOrder: z.number().int(),
  isActive: z.boolean(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
  createdBy: z.string(),
  updatedBy: z.string(),
});
export type BikeType = z.infer<typeof bikeTypeSchema>;

export const listBikeTypesInputSchema = z.object({
  includeInactive: z.boolean().default(false),
});
export type ListBikeTypesInput = z.infer<typeof listBikeTypesInputSchema>;

// -- Bikes ------------------------------------------------------------------
export const bikeSchema = z.object({
  id: idSchema,
  tenantId: z.number().int(),
  bikeNumber: z.string().min(1).max(40),
  bikeTypeId: idSchema,
  licensePlate: z.string().nullable(),
  odometerKm: z.number().nullable(),
  notes: z.string().nullable(),
  isActive: z.boolean(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
  createdBy: z.string(),
  updatedBy: z.string(),
});
export type Bike = z.infer<typeof bikeSchema>;

export const createBikeInputSchema = z.object({
  bikeNumber: z.string().trim().min(1).max(40),
  bikeTypeId: idSchema,
  licensePlate: z.string().trim().max(40).nullable().default(null),
  odometerKm: z.number().nonnegative().nullable().default(null),
  notes: z.string().max(2000).nullable().default(null),
});
export type CreateBikeInput = z.infer<typeof createBikeInputSchema>;

export const updateBikeInputSchema = z.object({
  id: idSchema,
  bikeNumber: z.string().trim().min(1).max(40).optional(),
  bikeTypeId: idSchema.optional(),
  licensePlate: z.string().trim().max(40).nullable().optional(),
  odometerKm: z.number().nonnegative().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  isActive: z.boolean().optional(),
});
export type UpdateBikeInput = z.infer<typeof updateBikeInputSchema>;

export const listBikesInputSchema = z.object({
  search: z.string().trim().optional(),
  bikeTypeId: idSchema.optional(),
  includeInactive: z.boolean().default(false),
});
export type ListBikesInput = z.infer<typeof listBikesInputSchema>;

export const getBikeInputSchema = z.object({ id: idSchema });
export type GetBikeInput = z.infer<typeof getBikeInputSchema>;

export const deactivateBikeInputSchema = getBikeInputSchema;
export type DeactivateBikeInput = z.infer<typeof deactivateBikeInputSchema>;
