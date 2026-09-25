import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres, { type Sql } from 'postgres';
import * as schema from './schema.js';

export { schema };

/** Drizzle database typed with the full schema (relational queries available via `db.query`). */
export type Db = PostgresJsDatabase<typeof schema>;

/** A transaction handle. Anything that accepts `DbOrTx` works both inside and outside a transaction. */
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
export type DbOrTx = Db | Tx;

/** Injection token for the Drizzle instance: `@Inject(DB) private readonly db: Db`. */
export const DB = Symbol('DB');
/** Injection token for the raw postgres-js client (rarely needed; prefer DB). */
export const PG = Symbol('PG');

export interface DbClientOptions {
  url: string;
  max?: number;
  applicationName?: string;
}

export function createSqlClient(opts: DbClientOptions): Sql {
  return postgres(opts.url, {
    max: opts.max ?? 10,
    idle_timeout: 30,
    connect_timeout: 10,
    // Timestamps come back as Date; timestamptz is stored as UTC.
    connection: { application_name: opts.applicationName ?? 'zemi-api' },
    onnotice: () => undefined,
  });
}

export function createDb(client: Sql): Db {
  return drizzle({ client, schema });
}
