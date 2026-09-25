import { existsSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Logger } from '@nestjs/common';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

/**
 * apps/api/drizzle. Resolved from this file, so it is the same folder from `src/db/migrate.ts`
 * (dev, vitest) and `dist/db/migrate.js` (prod, Docker runs from the repo root).
 */
export const MIGRATIONS_DIR = fileURLToPath(new URL('../../drizzle/', import.meta.url));

/** Apply pending Drizzle migrations using a dedicated single connection. */
export async function runMigrations(databaseUrl: string, folder = MIGRATIONS_DIR): Promise<void> {
  const logger = new Logger('Migrations');
  if (!existsSync(folder)) throw new Error(`Migrations folder not found: ${folder}`);
  const sql = postgres(databaseUrl, { max: 1, onnotice: () => undefined, connection: { application_name: 'zemi-migrate' } });
  const started = Date.now();
  try {
    await migrate(drizzle({ client: sql }), { migrationsFolder: folder });
    logger.log(`Database is up to date (${Date.now() - started}ms)`);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

// `pnpm db:migrate` runs this file directly.
const same = (a: string, b: string) => {
  try {
    return realpathSync(a) === realpathSync(b);
  } catch {
    return resolve(a) === resolve(b);
  }
};
const isMain = !!process.argv[1] && same(fileURLToPath(import.meta.url), process.argv[1]);
if (isMain) {
  const { loadConfig } = await import('../config/app-config.js');
  const url = process.env.DATABASE_URL ?? loadConfig().env.DATABASE_URL;
  runMigrations(url)
    .then(() => process.exit(0))
    .catch((err: unknown) => {
      console.error(err);
      process.exit(1);
    });
}
