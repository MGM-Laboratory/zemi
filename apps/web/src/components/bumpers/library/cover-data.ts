'use client';

import { useQuery } from '@tanstack/react-query';
import { sanitizeLinkList, type BumperData, type BumperResolveInput, type BumperSiteData, type BumperSlide, type PublicSite } from '@zemi/shared';
import { useMemo } from 'react';
import { SITE_URL } from '@/lib/admin/paths';
import { bumperKeys, bumpersApi, mergeData } from '../api';

/**
 * Display data for slides rendered outside a show (library cards, starter kit previews). List rows
 * carry the cover slide but no bundle, so the records the covers point at are fetched in one
 * `resolve` call per page, and the site block comes from the public site settings.
 */

function shortOf(web: string): string {
  try {
    const u = new URL(web);
    return `${u.host}${u.pathname.replace(/\/+$/, '')}`;
  } catch {
    return web.replace(/^https?:\/\//, '');
  }
}

/** The site block from nothing but the site address (used until the settings load, or if they fail). */
export function fallbackSite(): BumperSiteData {
  const short = shortOf(SITE_URL);
  return {
    name: 'Zemi',
    tagline: null,
    labName: null,
    webUrl: SITE_URL,
    shortUrl: short,
    qnaUrl: `${SITE_URL}/q`,
    qnaShort: `${short}/q`,
    socials: [],
    email: null,
    stats: { sessions: 0, talks: 0, speakers: 0, hoursOfTalk: 0 },
  };
}

/** Same mapping the API uses for show bundles (`BumpersDataService.siteData`). */
function siteFromPublic(pub: PublicSite): BumperSiteData {
  const short = shortOf(SITE_URL);
  const g = pub.settings.general;
  const contact = pub.settings.contact;
  return {
    name: g.siteName || 'Zemi',
    tagline: g.tagline || null,
    labName: g.labName || null,
    webUrl: SITE_URL,
    shortUrl: short,
    qnaUrl: `${SITE_URL}/q`,
    qnaShort: `${short}/q`,
    socials: sanitizeLinkList(contact.socials),
    email: contact.email && contact.email.includes('@') ? contact.email : null,
    stats: { sessions: pub.stats.sessions, talks: pub.stats.talks, speakers: pub.stats.speakers, hoursOfTalk: pub.stats.hoursOfTalk },
  };
}

export function emptyData(site: BumperSiteData = fallbackSite()): BumperData {
  return { events: {}, speakers: {}, publications: {}, team: {}, threads: {}, images: {}, site, nextEventId: null, generatedAt: new Date(0).toISOString() };
}

async function fetchSite(signal: AbortSignal): Promise<BumperSiteData> {
  const res = await fetch('/api/v1/public/site', { signal, headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`Site settings failed (${res.status})`);
  return siteFromPublic((await res.json()) as PublicSite);
}

/** The site block for slides (name, address, Q and A link, socials, stats). Falls back quietly. */
export function useBumperSite(): BumperSiteData {
  const q = useQuery({ queryKey: [...bumperKeys.all, 'site'], queryFn: ({ signal }) => fetchSite(signal), staleTime: 10 * 60_000, retry: 1 });
  return useMemo(() => q.data ?? fallbackSite(), [q.data]);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Every record id a set of slides points at, plus the given event ids. */
export function resolveInputFor(slides: readonly BumperSlide[], eventIds: ReadonlyArray<string | null | undefined>): BumperResolveInput {
  const sets = { eventIds: new Set<string>(), speakerIds: new Set<string>(), publicationIds: new Set<string>(), teamMemberIds: new Set<string>(), threadIds: new Set<string>(), assetIds: new Set<string>() };
  const add = (set: Set<string>, id: unknown) => {
    if (typeof id === 'string' && UUID.test(id)) set.add(id.toLowerCase());
  };
  eventIds.forEach((id) => add(sets.eventIds, id));
  for (const s of slides) {
    const r = s.refs;
    add(sets.eventIds, r.eventId);
    add(sets.speakerIds, r.speakerId);
    (r.speakerIds ?? []).forEach((id) => add(sets.speakerIds, id));
    add(sets.teamMemberIds, r.teamMemberId);
    (r.teamMemberIds ?? []).forEach((id) => add(sets.teamMemberIds, id));
    add(sets.publicationIds, r.publicationId);
    (r.threadIds ?? []).forEach((id) => add(sets.threadIds, id));
    add(sets.assetIds, r.assetId);
    (r.assetIds ?? []).forEach((id) => add(sets.assetIds, id));
    add(sets.assetIds, s.style.backgroundAssetId);
    s.items.forEach((it) => add(sets.assetIds, it.assetId));
    s.extras.forEach((el) => add(sets.assetIds, el.props.assetId));
  }
  const sorted = (set: Set<string>) => [...set].sort();
  return {
    eventIds: sorted(sets.eventIds).slice(0, 50),
    speakerIds: sorted(sets.speakerIds).slice(0, 100),
    publicationIds: sorted(sets.publicationIds).slice(0, 100),
    teamMemberIds: sorted(sets.teamMemberIds).slice(0, 100),
    threadIds: sorted(sets.threadIds).slice(0, 50),
    assetIds: sorted(sets.assetIds).slice(0, 100),
  };
}

const isEmptyInput = (i: BumperResolveInput) => Object.values(i).every((list) => list.length === 0);

/**
 * One data bundle for a set of slides (library page covers, a starter kit preview). Renders with
 * an empty bundle while it loads: templates are built to tolerate missing records.
 */
export function useSlidesData(slides: readonly BumperSlide[], eventIds: ReadonlyArray<string | null | undefined>): { data: BumperData; loading: boolean } {
  const site = useBumperSite();
  const input = useMemo(() => resolveInputFor(slides, eventIds), [slides, eventIds]);
  const empty = isEmptyInput(input);
  const q = useQuery({
    queryKey: [...bumperKeys.all, 'resolve', input],
    queryFn: () => bumpersApi.resolve(input),
    enabled: !empty,
    staleTime: 60_000,
  });
  const data = useMemo(() => {
    const base = emptyData(site);
    return q.data ? mergeData(base, q.data) : base;
  }, [site, q.data]);
  return { data, loading: !empty && q.isPending };
}
