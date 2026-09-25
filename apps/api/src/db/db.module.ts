import { Global, Inject, Injectable, Logger, Module, type OnApplicationShutdown } from '@nestjs/common';
import type { Sql } from 'postgres';
import { AppConfig } from '../config/app-config.js';
import { createDb, createSqlClient, DB, PG } from './client.js';

@Injectable()
class DbLifecycle implements OnApplicationShutdown {
  private readonly logger = new Logger('Database');
  constructor(@Inject(PG) private readonly sql: Sql) {}

  async onApplicationShutdown(): Promise<void> {
    try {
      await this.sql.end({ timeout: 5 });
    } catch (err) {
      this.logger.warn(`Closing the pool failed: ${(err as Error).message}`);
    }
  }
}

/**
 * Global database module. Inject the typed Drizzle instance anywhere:
 *
 *   constructor(@Inject(DB) private readonly db: Db) {}
 *
 * Migrations run in `main.ts` before Nest boots (see `runMigrations`), so every provider sees an
 * up-to-date schema.
 */
@Global()
@Module({
  providers: [
    {
      provide: PG,
      inject: [AppConfig],
      useFactory: (config: AppConfig) =>
        createSqlClient({ url: config.env.DATABASE_URL, max: config.env.DATABASE_POOL_MAX }),
    },
    { provide: DB, inject: [PG], useFactory: (sql: Sql) => createDb(sql) },
    DbLifecycle,
  ],
  exports: [DB, PG],
})
export class DbModule {}
