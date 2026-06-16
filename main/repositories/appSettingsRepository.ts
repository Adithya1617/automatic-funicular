import { eq } from 'drizzle-orm';
import type { AppDb } from '../db/client';
import { appSettings } from '../db/schema';

/**
 * Thin key/value wrapper around the `app_settings` table. Values are stored
 * as JSON strings; AppSettingsService is responsible for typed (de)serialization.
 */
export const appSettingsRepository = {
  async get(db: AppDb, key: string): Promise<string | undefined> {
    const rows = await db.select().from(appSettings).where(eq(appSettings.key, key));
    return rows[0]?.value;
  },

  async set(db: AppDb, key: string, value: string, updatedAt: number): Promise<void> {
    const rows = await db.select().from(appSettings).where(eq(appSettings.key, key));
    if (rows[0]) {
      await db
        .update(appSettings)
        .set({ value, updatedAt })
        .where(eq(appSettings.key, key));
    } else {
      await db.insert(appSettings).values({ key, value, updatedAt });
    }
  },
};
