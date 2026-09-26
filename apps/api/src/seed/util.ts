import { fromJakartaInput, jakartaDateInput } from '@zemi/shared';
import type { PgTable } from 'drizzle-orm/pg-core';
import type { Db } from '../db/client.js';

const DAY = 86_400_000;

/** `YYYY-MM-DD` + n days (Jakarta calendar dates, no time zone games). */
export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d) + n * DAY);
  return t.toISOString().slice(0, 10);
}

/** Instant for a Jakarta date and `HH:mm` (optionally plus seconds). */
export function wib(date: string, hhmm: string, plusSeconds = 0): Date {
  return new Date(fromJakartaInput(date, hhmm).getTime() + plusSeconds * 1000);
}

export const minutes = (n: number) => n * 60_000;
export const days = (n: number) => n * DAY;

export function jakartaDate(d: Date): string {
  return jakartaDateInput(d);
}

export function clampDate(d: Date, min: Date, max: Date): Date {
  return new Date(Math.min(Math.max(d.getTime(), min.getTime()), max.getTime()));
}

/** Insert many rows in chunks (postgres-js caps a statement at ~65k parameters). */
export async function insertChunked<T extends PgTable>(db: Db, table: T, rows: Array<T['$inferInsert']>, size = 500): Promise<void> {
  for (let i = 0; i < rows.length; i += size) {
    await db.insert(table).values(rows.slice(i, i + size) as never);
  }
}

/** "a PhD candidate", "an associate professor", "a UX researcher". */
export function withArticle(position: string): string {
  const lower = /^(PhD|Master|UX)/.test(position) ? position : position.charAt(0).toLowerCase() + position.slice(1);
  const an = /^[aeio]/i.test(lower) || /^undergrad/i.test(lower);
  return `${an ? 'an' : 'a'} ${lower}`;
}

export function words(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** Guard for the house rule: no en or em dashes in anything user-facing. */
export function assertNoDashes(label: string, value: unknown): void {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  if (/[\u2013\u2014]/.test(text)) throw new Error(`Seed copy for ${label} contains an en or em dash`);
}
