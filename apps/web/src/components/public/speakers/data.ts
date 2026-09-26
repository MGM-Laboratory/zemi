/**
 * Server-only fetchers for the people and papers pages. Built on the foundation's `apiGet`
 * (cached 30s, tagged, never throws). Import from Server Components only.
 */
import type { Paginated, PublicationCard, SpeakerCard } from '@zemi/shared';
import { apiGet, buildQuery, type QueryParams } from '@/lib/api/server';
import { cacheTags } from '@/lib/api/tags';

const PAGE = 100;
const MAX_PAGES = 10;

async function all<T>(
  path: string,
  params: QueryParams,
  tag: string,
): Promise<{ items: T[]; unavailable: boolean }> {
  const items: T[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const r = await apiGet<Paginated<T>>(
      `${path}${buildQuery({ ...params, page, pageSize: PAGE })}`,
      { tags: [tag] },
    );
    if (!r.ok) return { items, unavailable: page === 1 };
    items.push(...r.data.items);
    if (items.length >= r.data.total || r.data.items.length < PAGE) break;
  }
  return { items, unavailable: false };
}

/** Every published speaker (SpeakerCard: talkCount + latestTalkAt), API order = most talks first. */
export function getAllSpeakers() {
  return all<SpeakerCard>('/public/speakers', { sort: 'talks' }, cacheTags.speakers);
}

/** Every published publication, API default order (year, month, day desc, then title). */
export function getAllPublications(params: QueryParams = {}) {
  return all<PublicationCard>(
    '/public/publications',
    { sort: 'year', ...params },
    cacheTags.publications,
  );
}
