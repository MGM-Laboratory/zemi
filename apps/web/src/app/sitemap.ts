import type { MetadataRoute } from 'next';
import type { EventCard, Paginated, PublicationCard, SpeakerCard } from '@zemi/shared';
import { apiGet, buildQuery } from '@/lib/api/server';
import { cacheTags } from '@/lib/api/tags';

const SITE = (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3300').replace(/\/+$/, '');
const PAGE_SIZE = 100; // the API maximum
const MAX_PAGES = 50; // 5,000 items per collection is plenty for a weekly seminar

export const revalidate = 3600;

/** Every page of a public list. Stops quietly (with what it has) if the API is down. */
async function all<T>(path: string, tag: string): Promise<T[]> {
  const out: T[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const r = await apiGet<Paginated<T>>(`${path}${buildQuery({ page, pageSize: PAGE_SIZE })}`, {
      tags: [tag],
      revalidate,
    });
    if (!r.ok) break;
    out.push(...r.data.items);
    if (r.data.items.length < PAGE_SIZE || out.length >= r.data.total) break;
  }
  return out;
}

const url = (path: string) => `${SITE}${path}`;

/**
 * sitemap.xml: the public pages plus every published event, speaker and publication.
 * Tickets, admin, the styleguide and API routes stay out (robots.ts disallows them too).
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const [events, speakers, publications] = await Promise.all([
    // Cancelled Fridays keep their page (it says so), so they stay listed.
    all<EventCard>('/public/events', cacheTags.events),
    all<SpeakerCard>('/public/speakers', cacheTags.speakers),
    all<PublicationCard>('/public/publications', cacheTags.publications),
  ]);

  const pages: MetadataRoute.Sitemap = [
    { url: url('/'), lastModified: now, changeFrequency: 'weekly', priority: 1 },
    { url: url('/events'), lastModified: now, changeFrequency: 'weekly', priority: 0.9 },
    { url: url('/speakers'), changeFrequency: 'weekly', priority: 0.7 },
    { url: url('/publications'), changeFrequency: 'weekly', priority: 0.7 },
    { url: url('/about'), changeFrequency: 'monthly', priority: 0.6 },
    { url: url('/contact'), changeFrequency: 'yearly', priority: 0.4 },
  ];

  const eventPages: MetadataRoute.Sitemap = events.map((e) => {
    const upcoming = e.status === 'scheduled' || e.status === 'ongoing';
    return {
      url: url(`/events/${encodeURIComponent(e.slug)}`),
      // A wrapped Friday changes once more (recording, photos) and then settles.
      lastModified: upcoming ? now : new Date(e.endsAt),
      changeFrequency: upcoming ? 'daily' : 'monthly',
      priority: upcoming ? 0.9 : 0.6,
    };
  });

  const speakerPages: MetadataRoute.Sitemap = speakers.map((s) => ({
    url: url(`/speakers/${encodeURIComponent(s.slug)}`),
    ...(s.latestTalkAt ? { lastModified: new Date(s.latestTalkAt) } : null),
    changeFrequency: 'monthly',
    priority: 0.5,
  }));

  const publicationPages: MetadataRoute.Sitemap = publications.map((p) => ({
    url: url(`/publications/${encodeURIComponent(p.slug)}`),
    changeFrequency: 'yearly',
    priority: 0.5,
  }));

  return [...pages, ...eventPages, ...speakerPages, ...publicationPages];
}
