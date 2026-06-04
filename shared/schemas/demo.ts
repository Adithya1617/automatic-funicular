import { z } from 'zod';

export const demoSeedInputSchema = z.object({}).default({});
export type DemoSeedInput = z.infer<typeof demoSeedInputSchema>;

export const demoSeedResultSchema = z.object({
  suppliersCreated: z.number().int().nonnegative(),
  bikesCreated: z.number().int().nonnegative(),
  purchasesAdded: z.number().int().nonnegative(),
  topUpsAdded: z.number().int().nonnegative(),
  serviceEventsAdded: z.number().int().nonnegative(),
  alreadyPopulated: z.boolean(),
});
export type DemoSeedResult = z.infer<typeof demoSeedResultSchema>;

export const demoSeedBikesInputSchema = z.object({}).default({});
export type DemoSeedBikesInput = z.infer<typeof demoSeedBikesInputSchema>;

export const demoSeedBikesResultSchema = z.object({
  bikesCreated: z.number().int().nonnegative(),
  skippedNoType: z.number().int().nonnegative(),
});
export type DemoSeedBikesResult = z.infer<typeof demoSeedBikesResultSchema>;

export const demoResetInputSchema = z.object({}).default({});
export type DemoResetInput = z.infer<typeof demoResetInputSchema>;

export const demoResetResultSchema = z.object({
  tablesCleared: z.number().int().nonnegative(),
});
export type DemoResetResult = z.infer<typeof demoResetResultSchema>;
