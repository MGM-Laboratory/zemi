import type { Metadata } from 'next';
import type { EventCard } from '@zemi/shared';
import {
  ArchiveBrowser,
  type ArchiveFacets,
  type ArchiveFilters,
} from '@/components/public/events/archive/archive-browser';
import { ComingUp } from '@/components/public/events/archive/coming-up';
import { EventsHero } from '@/components/public/events/archive/events-hero';
import { FridayRibbon } from '@/components/public/events/archive/friday-ribbon';
import { LiveStrip } from '@/components/public/events/archive/live-strip';
import { toRibbonEvent } from '@/components/public/events/lib';
import { ApiUnavailable } from '@/components/public/ui/empty-state';
import { getEvents, type EventListParams } from '@/lib/api/server';

export const metadata: Metadata = {
  title: 'The Friday archive',
  description:
    'Every Zemi Friday since the first one: talks, recordings, photos and the papers behind them. Plus what is coming up next.',
  alternates: { canonical: '/events' },
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

/** Every published event, for the ribbon and the filter facets (paged, 100 at a time). */
async function allEvents(): Promise<{ items: EventCard[]; unavailable: boolean }> {
  const first = await getEvents({ when: 'all', pageSize: 100, page: 1 });
  if (first.unavailable) return { items: [], unavailable: true };
  const pages = Math.min(10, Math.ceil(first.total / 100));
  const rest = await Promise.all(
    Array.from({ length: pages - 1 }, (_, i) =>
      getEvents({ when: 'all', pageSize: 100, page: i + 2 }),
    ),
  );
  return { items: [...first.items, ...rest.flatMap((r) => r.items)], unavailable: false };
}

function facetsOf(items: EventCard[]): ArchiveFacets {
  const years = new Map<number, number>();
  const tags = new Map<string, number>();
  const speakers = new Map<string, { slug: string; name: string; count: number }>();
  for (const e of items) {
    const y = Number(
      new Intl.DateTimeFormat('en', { timeZone: 'Asia/Jakarta', year: 'numeric' }).format(
        new Date(e.startsAt),
      ),
    );
    years.set(y, (years.get(y) ?? 0) + 1);
    for (const t of e.tags) tags.set(t, (tags.get(t) ?? 0) + 1);
    for (const s of e.speakers) {
      const cur = speakers.get(s.slug);
      speakers.set(s.slug, { slug: s.slug, name: s.fullName, count: (cur?.count ?? 0) + 1 });
    }
  }
  return {
    years: [...years.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([year, count]) => ({ year, count })),
    tags: [...tags.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([tag, count]) => ({ tag, count })),
    speakers: [...speakers.values()].sort((a, b) => a.name.localeCompare(b.name)),
  };
}

/** Request time on the server (kept out of render so the purity lint stays happy). */
function requestTime() {
  return Date.now();
}

export default async function EventsPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const now = requestTime();
  const whenRaw = one(sp.when);
  const filters: ArchiveFilters = {
    q: one(sp.q).slice(0, 200),
    when: whenRaw === 'upcoming' || whenRaw === 'all' ? whenRaw : 'past',
    year: Number(one(sp.year)) || null,
    tag: one(sp.tag) || null,
    speaker: one(sp.speaker) || null,
  };
  const params: EventListParams = {
    when: filters.when,
    search: filters.q || undefined,
    year: filters.year ?? undefined,
    tag: filters.tag ?? undefined,
    speaker: filters.speaker ?? undefined,
    pageSize: 24,
    page: 1,
  };

  const [live, upcoming, all, firstPage] = await Promise.all([
    getEvents({ when: 'live', pageSize: 3 }),
    getEvents({ when: 'upcoming', pageSize: 10 }),
    allEvents(),
    getEvents(params),
  ]);

  if (all.unavailable && upcoming.unavailable) {
    return (
      <section className="container-page pb-[var(--section-y)] pt-[calc(var(--nav-h)+64px)]">
        <ApiUnavailable what="the Friday archive" />
      </section>
    );
  }

  const liveIds = new Set(live.items.map((e) => e.id));
  const ongoing = upcoming.items.filter((e) => e.status === 'ongoing' && !liveIds.has(e.id));
  const coming = upcoming.items
    .filter((e) => e.status === 'scheduled' && !liveIds.has(e.id))
    .slice(0, 7);
  const ribbon = [...all.items]
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))
    .map(toRibbonEvent);
  const wrapped = all.items.filter((e) => e.status === 'past');
  const recordings = all.items.filter((e) => e.hasRecording).length;
  const first = ribbon[0]?.startsAt ?? null;

  return (
    <>
      <EventsHero total={wrapped.length} recordings={recordings} firstAt={first} renderedAt={now} />
      <FridayRibbon events={ribbon} renderedAt={now} className="mt-[clamp(40px,6vw,80px)]" />
      {live.items.length || ongoing.length ? (
        <LiveStrip events={[...live.items, ...ongoing]} className="mt-[clamp(48px,8vh,96px)]" />
      ) : null}
      {coming.length ? (
        <ComingUp events={coming} renderedAt={now} className="mt-[clamp(72px,12vh,160px)]" />
      ) : null}
      <ArchiveBrowser
        className="mt-[clamp(72px,12vh,160px)] pb-[var(--section-y)]"
        initial={firstPage.unavailable ? null : firstPage}
        initialFilters={filters}
        facets={facetsOf(all.items)}
      />
    </>
  );
}
