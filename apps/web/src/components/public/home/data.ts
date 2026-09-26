/**
 * Server-side loader for the home page. Import only from Server Components.
 * Every fetch is resilient (the helpers never throw), so the page always renders.
 */
import type { EventCard } from '@zemi/shared';
import { availableModels } from '@/components/three/models-server';
import {
  getEvent,
  getEvents,
  getNextEvent,
  getPublications,
  getSiteOrDefaults,
  getSpeakers,
} from '@/lib/api/server';
import { planStory } from './story-plan';
import type { HomeData, HomeSpeaker } from './types';

export async function loadHome(): Promise<HomeData> {
  const [site, nextEvent, upcoming, past, speakers, publications] = await Promise.all([
    getSiteOrDefaults(),
    getNextEvent(),
    getEvents({ when: 'upcoming', pageSize: 50 }),
    getEvents({ when: 'past', pageSize: 12 }),
    getSpeakers({ pageSize: 40, sort: 'recent' }),
    // Default sort is year, month, day desc: the newest papers first.
    getPublications({ pageSize: 8 }),
  ]);

  // `/events/next` returns null both for "nothing booked" and "request failed": if it failed but the
  // upcoming list (soonest first) loaded, the hero still shows the right Friday.
  const next: EventCard | null =
    nextEvent ?? upcoming.items.find((e) => e.status !== 'cancelled') ?? null;

  const home = site.settings.home;
  const featuredId = home.featuredEventId ?? null;

  // The admin's featured event wins while it is still upcoming (or live). A live event always wins.
  let featured: EventCard | null = next;
  if (featuredId && next?.status !== 'ongoing') {
    const hit = upcoming.items.find(
      (e) => e.id === featuredId && e.status !== 'cancelled' && e.status !== 'past',
    );
    if (hit) featured = hit;
  }

  let featuredDetail: HomeData['featuredDetail'] = null;
  if (featured) {
    const lookup = await getEvent(featured.slug);
    if (lookup.kind === 'found') {
      const d = lookup.data;
      featuredDetail = {
        registration: d.registration,
        speakersFull: d.speakersFull,
        roomNote: d.roomNote,
        venueFull: d.venueFull,
        mode: d.mode,
      };
    }
  }

  const { doors, scenes, closing } = planStory(home.beats);

  // Faces first: speakers with a photo make the marquee, the rest keep their initials on a shape.
  const people: HomeSpeaker[] = speakers.items
    .map((s) => ({
      id: s.id,
      slug: s.slug,
      fullName: s.fullName,
      nickname: s.nickname,
      avatar: s.avatar,
      defaultOrganization: s.defaultOrganization,
      talkCount: s.talkCount ?? 0,
    }))
    .sort((a, b) => Number(!!b.avatar) - Number(!!a.avatar));

  // Test rows sometimes share a title: keep one card per title.
  const seen = new Set<string>();
  const pubs = publications.items.filter((p) => {
    const key = p.title.trim().toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return {
    home,
    general: { siteName: site.settings.general.siteName, labName: site.settings.general.labName },
    stats: site.stats,
    offline: site.isFallback,
    scheduleOffline: site.isFallback || !!upcoming.unavailable,
    archiveOffline: site.isFallback || !!past.unavailable,
    doors,
    scenes,
    closing,
    next,
    featured,
    featuredDetail,
    past: past.items,
    pastTotal: past.total,
    speakers: people,
    speakersTotal: speakers.total,
    publications: pubs.slice(0, 4),
    publicationsTotal: publications.total,
    models: availableModels(),
  };
}
