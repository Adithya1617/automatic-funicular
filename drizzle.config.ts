import type { Config } from 'drizzle-kit';

export default {
  schema: './main/db/schema.ts',
  out: './main/db/migrations',
  dialect: 'sqlite',
} satisfies Config;
