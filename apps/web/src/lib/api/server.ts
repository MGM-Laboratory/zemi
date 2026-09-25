/**
 * Server-side data access for the public site. Import ONLY from Server Components,
 * Route Handlers, generateMetadata and Server Actions: it talks to API_INTERNAL_URL
 * (the private network address), which the browser can't reach.
 *
 * Every helper is resilient: when the API is down or slow it logs a warning and resolves to
 * null / an empty page / `{ kind: 'unavailable' }`, so pages can render a friendly state
 * instead of a 500.
 */
import { notFound, permanentRedirect } from 'next/navigation';
import {
  SITE_SETTING_SCHEMAS,
  type EventCard,
  type EventDetail,
  type Paginated,
  type PublicationCard,
  type PublicationDetail,
  type PublicSite,
  type SpeakerPublic,
  type SpeakerRef,
  type Ticket,
} from '@zemi/shared';
import { cacheTags } from './tags';

const API_BASE = (process.env.API_INTERNAL_URL ?? 'http://localhost:4400').replace(/\/+$/, '');
const DEFAULT_REVALIDATE = 30;
const TIMEOUT_MS = 4000;

type QueryValue = string | number | boolean | null | undefined;
export type QueryParams = Record<string, QueryValue>;

export interface FetchOptions {
  /** Cache tags (see cacheTags). */
  tags?: string[];
  /** Seconds. Defaults to 30. Ignored with `noStore`. */
  revalidate?: number;
  /** Never cache (tickets, anything personal). */
  noStore?: boolean;
  timeoutMs?: number;
}

export type ApiResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; reason: 'not-found' | 'unavailable' };

/** Result of a by-slug lookup. `redirect` means the slug changed; `unavailable` means the API is down. */
export type Lookup<T> =
  | { kind: 'found'; data: T }
  | { kind: 'redirect'; slug: string }
  | { kind: 'missing' }
  | { kind: 'unavailable' };

export type PageResult<T> = Paginated<T> & { unavailable?: boolean };

/* ------------------------------------------------------------------ core */

const lastWarned = new Map<string, number>();
function warn(path: string, detail: string) {
  const now = Date.now();
  if ((lastWarned.get(path) ?? 0) > now - 30_000) return;
  lastWarned.set(path, now);
  // console.warn on purpose: in dev, server console.error is replayed as a browser console error.
  console.warn(`[zemi api] GET ${path} failed: ${detail}. Rendering the fallback.`);
}

export function buildQuery(params?: QueryParams): string {
  if (!params) return '';
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    qs.set(k, String(v));
  }
  const s = qs.toString();
  return s ? `?${s}` : '';
}

/** Low-level GET against `/api/v1${path}`. Never throws. */
export async function apiGet<T>(path: string, opts: FetchOptions = {}): Promise<ApiResult<T>> {
  const url = `${API_BASE}/api/v1${path}`;
  const init: RequestInit & { next?: { revalidate?: number; tags?: string[] } } = {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(opts.timeoutMs ?? TIMEOUT_MS),
  };
  if (opts.noStore) init.cache = 'no-store';
  else init.next = { revalidate: opts.revalidate ?? DEFAULT_REVALIDATE, tags: opts.tags ?? [] };

  try {
    const res = await fetch(url, init);
    if (res.status === 404) return { ok: false, status: 404, reason: 'not-found' };
    if (!res.ok) {
      warn(path, `HTTP ${res.status}`);
      return { ok: false, status: res.status, reason: 'unavailable' };
    }
    const data = (await res.json()) as T;
    return { ok: true, status: res.status, data };
  } catch (e) {
    const detail = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    warn(path, detail);
    return { ok: false, status: 0, reason: 'unavailable' };
  }
}

function toLookup<T>(r: ApiResult<T | { redirect: string }>): Lookup<T> {
  if (!r.ok) return r.reason === 'not-found' ? { kind: 'missing' } : { kind: 'unavailable' };
  const data = r.data as T & { redirect?: unknown };
  if (data && typeof data === 'object' && typeof data.redirect === 'string') {
    return { kind: 'redirect', slug: data.redirect };
  }
  if (data == null) return { kind: 'missing' };
  return { kind: 'found', data: data as T };
}

function emptyPage<T>(params?: QueryParams): PageResult<T> {
  return {
    items: [],
    total: 0,
    page: Number(params?.page ?? 1) || 1,
    pageSize: Number(params?.pageSize ?? 24) || 24,
    unavailable: true,
  };
}

/**
 * Turn a Lookup into data for a page:
 * - redirect -> permanentRedirect(`${basePath}/${slug}`) (308)
 * - missing -> notFound()
 * - found -> the data
 * - unavailable -> null (render a friendly "we can't reach the schedule" state)
 *
 * @example const event = unwrapLookup(await getEvent(slug), '/events');
 */
export function unwrapLookup<T>(lookup: Lookup<T>, basePath: string): T | null {
  switch (lookup.kind) {
    case 'redirect':
      permanentRedirect(`${basePath}/${encodeURIComponent(lookup.slug)}`);
    // permanentRedirect and notFound throw, so these cases never fall through.
    case 'missing':
      notFound();
    case 'found':
      return lookup.data;
    default:
      return null;
  }
}

/* ------------------------------------------------------------------ site */

/** Default site payload built from the shared schema defaults. Used when the API is unreachable. */
export function siteDefaults(): PublicSite {
  const { notifyEmails: _omit, ...contact } = SITE_SETTING_SCHEMAS.contact.parse({});
  void _omit;
  return {
    settings: {
      general: SITE_SETTING_SCHEMAS.general.parse({}),
      seo: SITE_SETTING_SCHEMAS.seo.parse({}),
      home: SITE_SETTING_SCHEMAS.home.parse({}),
      about: SITE_SETTING_SCHEMAS.about.parse({}),
      contact,
    },
    faqs: [],
    team: [],
    stats: {
      sessions: 0,
      talks: 0,
      speakers: 0,
      seatsFilled: 0,
      publications: 0,
      hoursOfTalk: 0,
      firstEventAt: null,
    },
    ogImage: null,
  };
}

/** GET /public/site. null when the API is down. */
export async function getSite(): Promise<PublicSite | null> {
  const r = await apiGet<PublicSite>('/public/site', { tags: [cacheTags.site] });
  return r.ok ? r.data : null;
}

/** GET /public/site, falling back to schema defaults so the shell always has copy. */
export async function getSiteOrDefaults(): Promise<PublicSite & { isFallback: boolean }> {
  const site = await getSite();
  return site ? { ...site, isFallback: false } : { ...siteDefaults(), isFallback: true };
}

/* ------------------------------------------------------------------ events */

export interface EventListParams extends QueryParams {
  when?: 'upcoming' | 'past' | 'live' | 'all';
  search?: string;
  tag?: string;
  speaker?: string;
  year?: number;
  page?: number;
  pageSize?: number;
}

/** GET /public/events. Empty page (with `unavailable: true`) when the API is down. */
export async function getEvents(params: EventListParams = {}): Promise<PageResult<EventCard>> {
  const r = await apiGet<Paginated<EventCard>>(`/public/events${buildQuery(params)}`, {
    tags: [cacheTags.events],
  });
  return r.ok ? r.data : emptyPage(params);
}

/** GET /public/events/next: the next upcoming (or live) event, or null. */
export async function getNextEvent(): Promise<EventCard | null> {
  const r = await apiGet<EventCard | null>('/public/events/next', { tags: [cacheTags.events] });
  return r.ok ? (r.data ?? null) : null;
}

/**
 * GET /public/events/:slug. Handles `{ redirect }` for renamed slugs.
 * Tagged `events` because the id isn't known before the fetch: the API must revalidate the
 * collection tag on item edits too.
 */
export async function getEvent(slug: string): Promise<Lookup<EventDetail>> {
  const r = await apiGet<EventDetail | { redirect: string }>(`/public/events/${encodeURIComponent(slug)}`, {
    tags: [cacheTags.events],
  });
  return toLookup<EventDetail>(r);
}

/* ------------------------------------------------------------------ speakers */

export type SpeakerListItem = SpeakerRef & { talkCount?: number };

export interface SpeakerListParams extends QueryParams {
  search?: string;
  page?: number;
  pageSize?: number;
}

export async function getSpeakers(params: SpeakerListParams = {}): Promise<PageResult<SpeakerListItem>> {
  const r = await apiGet<Paginated<SpeakerListItem>>(`/public/speakers${buildQuery(params)}`, {
    tags: [cacheTags.speakers],
  });
  return r.ok ? r.data : emptyPage(params);
}

export async function getSpeaker(slug: string): Promise<Lookup<SpeakerPublic>> {
  const r = await apiGet<SpeakerPublic | { redirect: string }>(`/public/speakers/${encodeURIComponent(slug)}`, {
    tags: [cacheTags.speakers],
  });
  return toLookup<SpeakerPublic>(r);
}

/* ------------------------------------------------------------------ publications */

export interface PublicationListParams extends QueryParams {
  search?: string;
  type?: string;
  year?: number;
  tag?: string;
  speaker?: string;
  sort?: 'recent' | 'year' | 'title';
  page?: number;
  pageSize?: number;
}

export async function getPublications(params: PublicationListParams = {}): Promise<PageResult<PublicationCard>> {
  const r = await apiGet<Paginated<PublicationCard>>(`/public/publications${buildQuery(params)}`, {
    tags: [cacheTags.publications],
  });
  return r.ok ? r.data : emptyPage(params);
}

export async function getPublication(slug: string): Promise<Lookup<PublicationDetail>> {
  const r = await apiGet<PublicationDetail | { redirect: string }>(
    `/public/publications/${encodeURIComponent(slug)}`,
    { tags: [cacheTags.publications] },
  );
  return toLookup<PublicationDetail>(r);
}

/* ------------------------------------------------------------------ tickets */

/** GET /public/tickets/:token. Never cached (personal data, check-in state changes). */
export async function getTicket(token: string): Promise<Lookup<Ticket>> {
  const r = await apiGet<Ticket>(`/public/tickets/${encodeURIComponent(token)}`, { noStore: true });
  return toLookup<Ticket>(r);
}

/** Absolute URL on the public API origin (media, HLS, SSE, .ics). Server-side twin of publicApiUrl. */
export function publicApiUrlServer(path: string): string {
  const base = (process.env.NEXT_PUBLIC_API_PUBLIC_URL ?? API_BASE).replace(/\/+$/, '');
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}
