/**
 * Cache tags shared by the fetch helpers and /api/revalidate (SPEC section 7).
 * The API calls POST /api/revalidate { secret, tags } after every admin mutation.
 */
export const cacheTags = {
  site: 'site',
  events: 'events',
  event: (id: string) => `event:${id}`,
  speakers: 'speakers',
  speaker: (id: string) => `speaker:${id}`,
  publications: 'publications',
  publication: (id: string) => `publication:${id}`,
} as const;

/** Tag names we accept on the revalidate endpoint. */
export const CACHE_TAG_PATTERN = /^(site|events|speakers|publications|(event|speaker|publication):[A-Za-z0-9_-]{1,96})$/;
