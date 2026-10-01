import type { QueryClient, QueryKey } from '@tanstack/react-query';

/**
 * React Query key factory for the admin. Every admin key starts with 'admin', so
 * `invalidateAdmin(qc)` refreshes everything and logout can drop the whole tree.
 *
 * Shape per resource:
 *   adminKeys.events.all               ['admin','events']
 *   adminKeys.events.lists()           ['admin','events','list']
 *   adminKeys.events.list(params)      ['admin','events','list', params]
 *   adminKeys.events.detail(id)        ['admin','events','detail', id]
 *   adminKeys.events.part(id, 'registrations', params)
 *                                      ['admin','events','detail', id, 'registrations', params]
 *
 * Invalidating `detail(id)` also refreshes every `part(id, ...)` under it (prefix match).
 */

export const ADMIN_RESOURCES = [
  'events',
  'speakers',
  'publications',
  'venues',
  'assets',
  'registrations',
  'recordings',
  'site',
  'bumpers',
  'faqs',
  'team',
  'inbox',
  'audience',
  'audit',
  'admins',
  'sessions',
  'system',
] as const;
export type AdminResource = (typeof ADMIN_RESOURCES)[number];

type Params = Record<string, unknown> | undefined;

function resourceKeys<R extends AdminResource>(resource: R) {
  const all = ['admin', resource] as const;
  return {
    all,
    lists: () => [...all, 'list'] as const,
    list: (params?: Params) => [...all, 'list', params ?? {}] as const,
    details: () => [...all, 'detail'] as const,
    detail: (id: string) => [...all, 'detail', id] as const,
    part: (id: string, part: string, params?: Params) =>
      (params === undefined ? [...all, 'detail', id, part] : [...all, 'detail', id, part, params]) as readonly unknown[],
    lookup: (q: string) => [...all, 'lookup', q] as const,
  };
}

export const adminKeys = {
  all: ['admin'] as const,
  me: () => ['admin', 'me'] as const,
  overview: () => ['admin', 'overview'] as const,
  inboxUnread: () => ['admin', 'inbox', 'unread'] as const,
  search: (q: string) => ['admin', 'search', q] as const,
  events: resourceKeys('events'),
  speakers: resourceKeys('speakers'),
  publications: resourceKeys('publications'),
  venues: resourceKeys('venues'),
  assets: resourceKeys('assets'),
  registrations: resourceKeys('registrations'),
  recordings: resourceKeys('recordings'),
  site: resourceKeys('site'),
  bumpers: resourceKeys('bumpers'),
  faqs: resourceKeys('faqs'),
  team: resourceKeys('team'),
  inbox: resourceKeys('inbox'),
  audience: resourceKeys('audience'),
  audit: resourceKeys('audit'),
  admins: resourceKeys('admins'),
  sessions: resourceKeys('sessions'),
  system: resourceKeys('system'),
} as const;

/** Refresh one resource type (lists, details, lookups). Pass an id to refresh only that detail plus all lists. */
export function invalidateResource(qc: QueryClient, resource: AdminResource, id?: string) {
  const keys = adminKeys[resource];
  if (id) {
    return Promise.all([
      qc.invalidateQueries({ queryKey: keys.detail(id) }),
      qc.invalidateQueries({ queryKey: keys.lists() }),
      qc.invalidateQueries({ queryKey: [...keys.all, 'lookup'] }),
      qc.invalidateQueries({ queryKey: adminKeys.overview() }),
    ]);
  }
  return Promise.all([
    qc.invalidateQueries({ queryKey: keys.all }),
    qc.invalidateQueries({ queryKey: adminKeys.overview() }),
  ]);
}

/** Refresh a list of exact keys (prefix matching). */
export function invalidateKeys(qc: QueryClient, keys: readonly QueryKey[]) {
  return Promise.all(keys.map((queryKey) => qc.invalidateQueries({ queryKey })));
}

/**
 * Mark every admin query stale without refetching anything now. Queries refetch the next time
 * they mount or the window regains focus, so related screens never show pre-mutation data.
 */
export function markAdminStale(qc: QueryClient) {
  return qc.invalidateQueries({ queryKey: adminKeys.all, refetchType: 'none' });
}

/**
 * An image changed in place (re-crop, alt text, delete). Events, speakers and publications embed
 * their images with a revision in the URL, so refetch them along with the media library.
 */
export function refreshAssetUsers(qc: QueryClient) {
  return invalidateKeys(qc, [
    adminKeys.assets.all,
    adminKeys.events.all,
    adminKeys.speakers.all,
    adminKeys.publications.all,
    adminKeys.overview(),
  ]);
}

/** Refresh everything admin. */
export function invalidateAdmin(qc: QueryClient) {
  return qc.invalidateQueries({ queryKey: adminKeys.all });
}

/** Drop all admin data from memory (logout). */
export function clearAdmin(qc: QueryClient) {
  qc.removeQueries({ queryKey: adminKeys.all });
}
