import { eq } from 'drizzle-orm';
import type { AppDb } from '../db/client';
import { appSettings } from '../db/schema';

/**
 * Thin key/value wrapper around the `app_settings` table. Values are stored
 * as JSON strings; AppSettingsService is responsible for typed (de)serialization.
 */
export const appSettingsRepository = {
  get(db: AppDb, key: string): string | undefined {
    const row = db
      .select()
      .from(appSettings)
      .where(eq(appSettings.key, key))
      .get();
    return row?.value;
  },

  set(db: AppDb, key: string, value: string, updatedAt: number): void {
    const existing = db
      .select()
      .from(appSettings)
      .where(eq(appSettings.key, key))
      .get();
    if (existing) {
      db.update(appSettings)
        .set({ value, updatedAt })
        .where(eq(appSettings.key, key))
        .run();
    } else {
      db.insert(appSettings).values({ key, value, updatedAt }).run();
    }
  },
};
