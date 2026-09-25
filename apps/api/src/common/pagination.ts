import type { Paginated, PaginationQuery } from '@zemi/shared';

/**
 * Pagination helpers. Query params come in through `paginationQuery` (or a schema that extends it):
 * `page` is 1-based, `pageSize` defaults to 20 and caps at 100.
 *
 *   const { limit, offset } = pageToLimitOffset(query);
 *   const rows = await db.select().from(t).limit(limit).offset(offset);
 *   return paginated(rows.map(toDto), total, query);
 */
export function pageToLimitOffset(q: Pick<PaginationQuery, 'page' | 'pageSize'>): { limit: number; offset: number } {
  const pageSize = Math.min(100, Math.max(1, Math.floor(q.pageSize || 20)));
  const page = Math.max(1, Math.floor(q.page || 1));
  return { limit: pageSize, offset: (page - 1) * pageSize };
}

export function paginated<T>(items: T[], total: number, q: Pick<PaginationQuery, 'page' | 'pageSize'>): Paginated<T> {
  return { items, total: Number(total) || 0, page: Math.max(1, Math.floor(q.page || 1)), pageSize: pageToLimitOffset(q).limit };
}

/** Escape `%`, `_` and `\` for use inside an ILIKE pattern: `ilike(col, `%${likeEscape(q)}%`)`. */
export function likeEscape(input: string): string {
  return input.replace(/[\\%_]/g, (m) => `\\${m}`);
}

/** `%term%` pattern for ILIKE search, or null when the search is empty. */
export function searchPattern(search: string | null | undefined): string | null {
  const s = (search ?? '').trim();
  return s ? `%${likeEscape(s)}%` : null;
}
