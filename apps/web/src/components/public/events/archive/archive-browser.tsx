'use client';

import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';
import { Search, X } from 'lucide-react';
import { motion } from 'motion/react';
import { parseAsInteger, parseAsString, parseAsStringLiteral, useQueryStates } from 'nuqs';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { EventCard, Paginated } from '@zemi/shared';
import { ZemiMark } from '@/components/brand/zemi-mark';
import { Reveal } from '@/components/motion/reveal';
import { stagger } from '@/components/motion/stagger';
import { Button } from '@/components/public/ui/button';
import { ChipButton } from '@/components/public/ui/chip';
import { EmptyState } from '@/components/public/ui/empty-state';
import { Select } from '@/components/public/ui/field';
import { SectionHeader } from '@/components/public/ui/section-header';
import { apiRequest } from '@/lib/api/client';
import { cn } from '@/lib/utils';
import styles from '../events.module.css';
import { ArchiveCard } from './archive-card';

export const WHEN_OPTIONS = ['past', 'upcoming', 'all'] as const;
export type ArchiveWhen = (typeof WHEN_OPTIONS)[number];

export interface ArchiveFilters {
  q: string;
  when: ArchiveWhen;
  year: number | null;
  tag: string | null;
  speaker: string | null;
}

export interface ArchiveFacets {
  years: Array<{ year: number; count: number }>;
  tags: Array<{ tag: string; count: number }>;
  speakers: Array<{ slug: string; name: string; count: number }>;
}

const WHEN_LABEL: Record<ArchiveWhen, string> = {
  past: 'Wrapped',
  upcoming: 'Coming up',
  all: 'Everything',
};
const PAGE_SIZE = 24;

const parsers = {
  q: parseAsString.withDefault(''),
  when: parseAsStringLiteral(WHEN_OPTIONS).withDefault('past'),
  year: parseAsInteger,
  tag: parseAsString,
  speaker: parseAsString,
};

function sameFilters(a: ArchiveFilters, b: ArchiveFilters) {
  return (
    a.q === b.q &&
    a.when === b.when &&
    a.year === b.year &&
    a.tag === b.tag &&
    a.speaker === b.speaker
  );
}

function fetchPage(
  f: ArchiveFilters,
  page: number,
  signal?: AbortSignal,
): Promise<Paginated<EventCard>> {
  const qs = new URLSearchParams({ when: f.when, page: String(page), pageSize: String(PAGE_SIZE) });
  if (f.q) qs.set('search', f.q);
  if (f.year) qs.set('year', String(f.year));
  if (f.tag) qs.set('tag', f.tag);
  if (f.speaker) qs.set('speaker', f.speaker);
  return apiRequest<Paginated<EventCard>>('GET', `/public/events?${qs.toString()}`, undefined, {
    signal,
  });
}

/** The archive grid with filters (search, when, year, tag, speaker) synced to the URL. */
export function ArchiveBrowser({
  initial,
  initialFilters,
  facets,
  className,
}: {
  initial: Paginated<EventCard> | null;
  initialFilters: ArchiveFilters;
  facets: ArchiveFacets;
  className?: string;
}) {
  const [state, setState] = useQueryStates(parsers, {
    shallow: true,
    history: 'replace',
    clearOnDefault: true,
    scroll: false,
  });
  const filters: ArchiveFilters = useMemo(
    () => ({
      q: state.q.trim(),
      when: state.when,
      year: state.year,
      tag: state.tag,
      speaker: state.speaker,
    }),
    [state.q, state.when, state.year, state.tag, state.speaker],
  );

  // Search input: instant locally, debounced into the URL (and the query).
  const [text, setText] = useState(state.q);
  const lastUrlQ = useRef(state.q);
  useEffect(() => {
    if (state.q !== lastUrlQ.current) {
      lastUrlQ.current = state.q;
      setText(state.q);
    }
  }, [state.q]);
  useEffect(() => {
    if (text === state.q) return;
    const t = window.setTimeout(() => {
      lastUrlQ.current = text;
      void setState({ q: text || null });
    }, 320);
    return () => window.clearTimeout(t);
  }, [text, state.q, setState]);

  const query = useInfiniteQuery({
    queryKey: ['public-events', filters],
    queryFn: ({ pageParam, signal }) => fetchPage(filters, pageParam, signal),
    initialPageParam: 1,
    getNextPageParam: (last) =>
      last.page * last.pageSize < last.total ? last.page + 1 : undefined,
    initialData:
      initial && sameFilters(filters, initialFilters)
        ? { pages: [initial], pageParams: [1] }
        : undefined,
    placeholderData: keepPreviousData,
  });

  const items = useMemo(() => {
    const seen = new Set<string>();
    return (query.data?.pages ?? [])
      .flatMap((p) => p.items)
      .filter((e) => (seen.has(e.id) ? false : (seen.add(e.id), true)));
  }, [query.data]);
  const total = query.data?.pages[0]?.total ?? 0;
  const busy = query.isFetching && !query.isFetchingNextPage;

  // "More" button, then infinite scroll once someone asked for more.
  const [auto, setAuto] = useState(false);
  const sentinel = useRef<HTMLDivElement>(null);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = query;
  useEffect(() => {
    if (!auto || !hasNextPage) return;
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e?.isIntersecting && !isFetchingNextPage) void fetchNextPage();
      },
      { rootMargin: '600px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [auto, hasNextPage, isFetchingNextPage, fetchNextPage]);

  const active =
    filters.q || filters.year || filters.tag || filters.speaker || filters.when !== 'past';
  const clearAll = () => {
    setText('');
    lastUrlQ.current = '';
    void setState({ q: null, when: null, year: null, tag: null, speaker: null });
  };

  const searchId = useId();
  const topTags = facets.tags.slice(0, 10);
  const speakerName = facets.speakers.find((s) => s.slug === filters.speaker)?.name;

  return (
    <section
      className={cn('container-page', className)}
      aria-labelledby="archive-title"
      id="archive"
    >
      <SectionHeader
        eyebrow="The archive"
        eyebrowShape="square"
        id="archive-title"
        title="Every cover, every Friday"
        size="m"
        description="Filter by topic, speaker or year. Covers with a Watch badge have the full recording."
      />

      <div
        className="mt-10 flex flex-col gap-5 rounded-[28px] border border-line bg-surface-muted/60 p-4 sm:p-6"
        role="search"
        aria-label="Filter Fridays"
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
          <label htmlFor={searchId} className="relative block flex-1">
            <span className="sr-only">Search Fridays</span>
            <Search
              className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-ink-3"
              aria-hidden="true"
            />
            <input
              id={searchId}
              type="search"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  lastUrlQ.current = text;
                  void setState({ q: text || null });
                }
              }}
              placeholder="Search talks, people, topics, or #42"
              className="h-14 w-full rounded-full border border-line-strong bg-white pl-12 pr-12 [&::-webkit-search-cancel-button]:appearance-none text-[1.0625rem] text-ink placeholder:text-ink-4 focus-visible:border-blue focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue/15"
              autoComplete="off"
              enterKeyHint="search"
            />
            {text ? (
              <button
                type="button"
                onClick={() => {
                  setText('');
                  lastUrlQ.current = '';
                  void setState({ q: null });
                }}
                className="absolute right-3 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-full text-ink-3 transition-colors hover:bg-surface-muted hover:text-ink"
                aria-label="Clear search"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            ) : null}
          </label>
          <div
            role="group"
            aria-label="Which Fridays"
            className="flex rounded-full border border-line-strong bg-white p-1"
          >
            {WHEN_OPTIONS.map((w) => {
              const on = filters.when === w;
              return (
                <button
                  key={w}
                  type="button"
                  aria-pressed={on}
                  onClick={() => void setState({ when: w === 'past' ? null : w })}
                  className={cn(
                    'relative h-11 flex-1 whitespace-nowrap rounded-full px-3 text-[0.9375rem] font-bold transition-colors sm:px-5',
                    on ? 'text-white' : 'text-ink-2 hover:text-ink',
                  )}
                >
                  {on ? (
                    <motion.span
                      layoutId="when-pill"
                      className="absolute inset-0 rounded-full bg-ink"
                      transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                    />
                  ) : null}
                  <span className="relative">{WHEN_LABEL[w]}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)] lg:items-center">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Year">
            <ChipButton selected={!filters.year} onClick={() => void setState({ year: null })}>
              Any year
            </ChipButton>
            {facets.years.map((y) => (
              <ChipButton
                key={y.year}
                selected={filters.year === y.year}
                onClick={() => void setState({ year: filters.year === y.year ? null : y.year })}
                mono
              >
                {y.year}
              </ChipButton>
            ))}
          </div>
          <label className="block">
            <span className="sr-only">Topic</span>
            <Select
              value={filters.tag ?? ''}
              onChange={(e) => void setState({ tag: e.target.value || null })}
              className="h-12 rounded-full"
            >
              <option value="">Any topic</option>
              {facets.tags.map((t) => (
                <option key={t.tag} value={t.tag}>
                  {t.tag} ({t.count})
                </option>
              ))}
            </Select>
          </label>
          <label className="block">
            <span className="sr-only">Speaker</span>
            <Select
              value={filters.speaker ?? ''}
              onChange={(e) => void setState({ speaker: e.target.value || null })}
              className="h-12 rounded-full"
            >
              <option value="">Anyone speaking</option>
              {facets.speakers.map((s) => (
                <option key={s.slug} value={s.slug}>
                  {s.name}
                </option>
              ))}
            </Select>
          </label>
        </div>

        <div
          className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 no-scrollbar sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0"
          data-lenis-prevent=""
          role="group"
          aria-label="Popular topics"
        >
          {topTags.map((t) => (
            <ChipButton
              key={t.tag}
              size="md"
              tone="outline"
              // 36px chips, 44px to a thumb (the hit area reaches into the row gap).
              className="relative before:absolute before:inset-x-0 before:-inset-y-1"
              selected={filters.tag === t.tag}
              onClick={() => void setState({ tag: filters.tag === t.tag ? null : t.tag })}
            >
              #{t.tag}
            </ChipButton>
          ))}
        </div>
      </div>

      <div className="mt-6 flex min-h-10 flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-ink-2" aria-live="polite">
          {busy ? <ZemiMark variant="loading" size={18} decorative /> : null}
          <span>
            <span className="font-bold text-ink">{total}</span> {total === 1 ? 'Friday' : 'Fridays'}
            {filters.tag ? ` about #${filters.tag}` : ''}
            {speakerName ? ` with ${speakerName}` : ''}
            {filters.year ? ` in ${filters.year}` : ''}
            {filters.q ? ` matching "${filters.q}"` : ''}
          </span>
        </p>
        {active ? (
          <Button
            variant="ghost"
            size="sm"
            shape={false}
            onClick={clearAll}
            icon={<X className="size-full" />}
          >
            Clear filters
          </Button>
        ) : null}
      </div>

      {query.isError && !items.length ? (
        <EmptyState
          className="mt-8"
          shape="square"
          mood="sleepy"
          title="The archive tripped over its own shoelaces."
          body="We couldn't load those Fridays. Give it another go?"
          action={
            <Button variant="secondary" shape="circle" onClick={() => void query.refetch()}>
              Try again
            </Button>
          }
        />
      ) : !items.length && !busy ? (
        <EmptyState
          className="mt-8"
          shape="circle"
          mood="thinking"
          friend="triangle"
          size="lg"
          title="No Fridays match that."
          body="Q looked under every chair. Try fewer filters, or a different word?"
          action={
            active ? (
              <Button variant="secondary" shape="circle" onClick={clearAll}>
                Clear filters
              </Button>
            ) : null
          }
        />
      ) : (
        <ul
          className={cn(
            styles.grid,
            'mt-8 pb-[clamp(24px,5vw,80px)] transition-opacity duration-300',
            busy && 'opacity-50',
          )}
          aria-busy={busy || undefined}
        >
          {items.map((e, i) => (
            <Reveal as="li" key={e.id} delay={stagger(i % 4, 0.07)} y={36}>
              <ArchiveCard e={e} priority={i < 2} />
            </Reveal>
          ))}
        </ul>
      )}

      <div ref={sentinel} aria-hidden="true" />
      {hasNextPage ? (
        <div className="mt-10 flex justify-center">
          <Button
            variant="secondary"
            size="lg"
            shape="square"
            loading={isFetchingNextPage}
            onClick={() => {
              setAuto(true);
              void fetchNextPage();
            }}
          >
            {isFetchingNextPage
              ? 'Digging up more'
              : `More Fridays (${Math.max(0, total - items.length)} to go)`}
          </Button>
        </div>
      ) : items.length > PAGE_SIZE ? (
        <p className="mt-10 text-center text-ink-3">
          That is every one of them. The first Friday was a small room and a lot of nerves.
        </p>
      ) : null}
    </section>
  );
}
