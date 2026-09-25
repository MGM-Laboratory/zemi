import type { ContentAction, Paginated, PublicationAdmin, SpeakerAdmin, Venue } from '@zemi/shared';

/**
 * Row shapes for the content lists. The shared contract has full admin records
 * (SpeakerAdmin, PublicationAdmin) but no list-row types, so list items are typed as
 * a required core plus optional extras. Every optional field is guarded in the UI.
 */
export type SpeakerRow = Pick<SpeakerAdmin, 'id' | 'slug' | 'fullName'> &
  Partial<
    Pick<
      SpeakerAdmin,
      'nickname' | 'headline' | 'avatar' | 'defaultOrganization' | 'defaultPosition' | 'visibility' | 'talkCount' | 'permissions' | 'updatedAt' | 'createdAt' | 'email'
    >
  > & { publicationCount?: number; publications?: SpeakerAdmin['publications'] };

export type PublicationRow = Pick<PublicationAdmin, 'id' | 'slug' | 'title' | 'type'> &
  Partial<
    Pick<
      PublicationAdmin,
      | 'subtitle'
      | 'containerTitle'
      | 'publishedYear'
      | 'status'
      | 'cover'
      | 'authors'
      | 'keywords'
      | 'doi'
      | 'hasPdf'
      | 'visibility'
      | 'permissions'
      | 'updatedAt'
      | 'createdAt'
    >
  > & { eventCount?: number };

export type VenueRow = Pick<Venue, 'id' | 'name' | 'kind'> & Partial<Omit<Venue, 'id' | 'name' | 'kind'>>;

/** Lists come back as `Paginated<T>`, a bare array, or `{ items }`. Normalize to Paginated. */
export function toPaginated<T>(res: T[] | Paginated<T> | { items: T[]; total?: number } | null | undefined, page = 1, pageSize = 20): Paginated<T> {
  if (!res) return { items: [], total: 0, page, pageSize };
  if (Array.isArray(res)) return { items: res, total: res.length, page: 1, pageSize: Math.max(res.length, pageSize) };
  const items = res.items ?? [];
  const r = res as Partial<Paginated<T>>;
  return { items, total: r.total ?? items.length, page: r.page ?? page, pageSize: r.pageSize ?? pageSize };
}

/**
 * Effective actions on one record: what the live ability says (it refreshes with /auth/me),
 * plus what the API sent on the item. The server enforces either way; this only drives the UI.
 */
export function effectiveActions(
  fromApi: ContentAction[] | undefined,
  can: (action: ContentAction) => boolean,
): Set<ContentAction> {
  const out = new Set<ContentAction>(fromApi ?? []);
  for (const a of ['view', 'edit', 'publish', 'delete'] as const) if (can(a)) out.add(a);
  if (out.has('edit') || out.has('publish') || out.has('delete')) out.add('view');
  return out;
}
