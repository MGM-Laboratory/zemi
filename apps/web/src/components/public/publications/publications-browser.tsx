'use client';

import { LayoutGrid, List, SlidersHorizontal } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useDeferredValue, useMemo, useState, useSyncExternalStore } from 'react';
import type { PublicationCard, PublicationType } from '@zemi/shared';
import { Reveal } from '@/components/motion/reveal';
import { stagger } from '@/components/motion/stagger';
import { fold } from '@/components/public/speakers/lib';
import { SearchBox } from '@/components/public/speakers/search-box';
import { useUrlSync } from '@/components/public/speakers/use-url-sync';
import { Button } from '@/components/public/ui/button';
import { ChipButton } from '@/components/public/ui/chip';
import { Sheet } from '@/components/public/ui/dialog';
import { EmptyState } from '@/components/public/ui/empty-state';
import { Select } from '@/components/public/ui/field';
import { useReducedMotion } from '@/lib/hooks/use-reduced-motion';
import { cn } from '@/lib/utils';
import { CoverPreview } from './cover-preview';
import { hasKeyword, TYPE_PLURAL, typeLook, type PubSort } from './lib';
import { PublicationRow, PublicationTile } from './publication-row';
import styles from './publications.module.css';

export interface PublicationFilters {
  q?: string;
  type?: PublicationType;
  year?: number;
  tag?: string;
  speaker?: string;
  sort?: PubSort;
}

export interface PublicationsBrowserProps {
  pubs: PublicationCard[];
  initial: PublicationFilters;
}

type View = 'list' | 'grid';
const VIEW_KEY = 'zemi:pubs:view';
const PAGE = 30;

const SORTS: Array<{ key: PubSort; label: string }> = [
  { key: 'newest', label: 'Newest first' },
  { key: 'oldest', label: 'Oldest first' },
  { key: 'title', label: 'Title, A to Z' },
];

function readView(): View | null {
  try {
    const v = window.localStorage.getItem(VIEW_KEY);
    return v === 'grid' || v === 'list' ? v : null;
  } catch {
    return null;
  }
}

/* The list/grid choice is a tiny external store (localStorage, with an in-memory fallback for
   private mode), read with useSyncExternalStore: the server and hydration render "list", then
   the remembered choice, without a setState-in-effect. */
let memoryView: View | null = null;
const viewListeners = new Set<() => void>();
function subscribeView(cb: () => void) {
  viewListeners.add(cb);
  window.addEventListener('storage', cb);
  return () => {
    viewListeners.delete(cb);
    window.removeEventListener('storage', cb);
  };
}
const viewSnapshot = (): View => readView() ?? memoryView ?? 'list';
const viewServerSnapshot = (): View => 'list';
function storeView(v: View) {
  memoryView = v;
  try {
    window.localStorage.setItem(VIEW_KEY, v);
  } catch {
    /* private mode: fine, it just won't stick past this page */
  }
  viewListeners.forEach((l) => l());
}

/**
 * The publications index: type chips, year / keyword / speaker filters, search, sort, list or
 * grid view, grouped by year, "show more" paging and a cover that follows the cursor.
 * Filters run client-side over the full list; the URL mirrors them so links can be shared.
 */
export function PublicationsBrowser({ pubs, initial }: PublicationsBrowserProps) {
  const reduced = useReducedMotion();
  const [q, setQ] = useState(initial.q ?? '');
  const [type, setType] = useState<PublicationType | ''>(initial.type ?? '');
  const [year, setYear] = useState<number | ''>(initial.year ?? '');
  const [tag, setTag] = useState(initial.tag ?? '');
  const [speaker, setSpeaker] = useState(initial.speaker ?? '');
  const [sort, setSort] = useState<PubSort>(initial.sort ?? 'newest');
  const view = useSyncExternalStore(subscribeView, viewSnapshot, viewServerSnapshot);
  const [limit, setLimit] = useState(PAGE);
  const [hovered, setHovered] = useState<string | null>(null);
  const [sheet, setSheet] = useState(false);
  const query = useDeferredValue(q);

  const changeView = storeView;

  useUrlSync({
    q: q.trim() || null,
    type: type || null,
    year: year || null,
    tag: tag || null,
    speaker: speaker || null,
    sort: sort === 'newest' ? null : sort,
  });

  // Reset paging when the filters change.
  const filterKey = `${query}|${type}|${year}|${tag}|${speaker}|${sort}`;
  const [lastKey, setLastKey] = useState(filterKey);
  if (lastKey !== filterKey) {
    setLastKey(filterKey);
    setLimit(PAGE);
  }

  /* ---------------------------------------------------------------- options */

  const options = useMemo(() => {
    const types = new Map<PublicationType, number>();
    const years = new Map<number, number>();
    const tags = new Map<string, { label: string; n: number }>();
    const people = new Map<string, string>();
    for (const p of pubs) {
      types.set(p.type, (types.get(p.type) ?? 0) + 1);
      if (p.publishedYear) years.set(p.publishedYear, (years.get(p.publishedYear) ?? 0) + 1);
      for (const k of p.keywords) {
        const key = k.trim().toLowerCase();
        const hit = tags.get(key);
        tags.set(key, { label: hit?.label ?? k.trim(), n: (hit?.n ?? 0) + 1 });
      }
      for (const a of p.authors) if (a.speakerSlug) people.set(a.speakerSlug, a.fullName);
    }
    return {
      types: [...types.entries()].sort((a, b) => b[1] - a[1]),
      years: [...years.entries()].sort((a, b) => b[0] - a[0]),
      tags: [...tags.values()].sort((a, b) => b.n - a.n || a.label.localeCompare(b.label)),
      people: [...people.entries()].sort((a, b) => a[1].localeCompare(b[1])),
    };
  }, [pubs]);

  /* ---------------------------------------------------------------- results */

  const results = useMemo(() => {
    const words = fold(query).split(/\s+/).filter(Boolean);
    const list = pubs.filter((p) => {
      if (type && p.type !== type) return false;
      if (year && p.publishedYear !== year) return false;
      if (tag && !hasKeyword(p, tag)) return false;
      if (speaker && !p.authors.some((a) => a.speakerSlug === speaker)) return false;
      if (!words.length) return true;
      const hay = fold(
        [
          p.title,
          p.subtitle,
          p.containerTitle,
          p.doi,
          ...p.keywords,
          ...p.authors.map((a) => a.fullName),
          typeLook(p.type).label,
        ].join(' '),
      );
      return words.every((w) => hay.includes(w));
    });
    // The API order (year, month, day desc) is the tie-break: cards carry no month or day.
    const index = new Map(pubs.map((p, i) => [p.id, i]));
    const pos = (p: PublicationCard) => index.get(p.id) ?? 0;
    if (sort === 'oldest')
      list.sort((a, b) => (a.publishedYear ?? 0) - (b.publishedYear ?? 0) || pos(b) - pos(a));
    else if (sort === 'title')
      list.sort((a, b) => a.title.localeCompare(b.title, 'en', { sensitivity: 'base' }));
    else list.sort((a, b) => (b.publishedYear ?? 0) - (a.publishedYear ?? 0) || pos(a) - pos(b));
    return list;
  }, [pubs, query, type, year, tag, speaker, sort]);

  const shown = results.slice(0, limit);
  const grouped = sort !== 'title';
  const groups = useMemo(() => {
    if (!grouped) return [{ year: null as number | null, items: shown }];
    const out: Array<{ year: number | null; items: PublicationCard[] }> = [];
    for (const p of shown) {
      const last = out[out.length - 1];
      if (last && last.year === p.publishedYear) last.items.push(p);
      else out.push({ year: p.publishedYear, items: [p] });
    }
    return out;
  }, [shown, grouped]);

  const active = !!(query.trim() || type || year || tag || speaker);
  const clear = () => {
    setQ('');
    setType('');
    setYear('');
    setTag('');
    setSpeaker('');
  };
  const hoveredPub = hovered ? (pubs.find((p) => p.id === hovered) ?? null) : null;
  const tagInList = !tag || options.tags.some((t) => t.label.toLowerCase() === tag.toLowerCase());

  const extraCount = (year ? 1 : 0) + (tag ? 1 : 0) + (speaker ? 1 : 0);
  const extraFilters = (
    <>
      <label className="flex min-w-0 flex-col gap-1.5">
        <span className="label text-ink-3">Year</span>
        <Select
          value={year}
          onChange={(e) => setYear(e.target.value ? Number(e.target.value) : '')}
          className="h-12 rounded-full pl-5 text-[0.9375rem]"
        >
          <option value="">Any year</option>
          {year && !options.years.some(([y]) => y === year) ? (
            <option value={year}>{year} (0)</option>
          ) : null}
          {options.years.map(([y, n]) => (
            <option key={y} value={y}>
              {y} ({n})
            </option>
          ))}
        </Select>
      </label>
      <label className="flex min-w-0 flex-col gap-1.5">
        <span className="label text-ink-3">Keyword</span>
        <Select
          value={tag.toLowerCase()}
          onChange={(e) =>
            setTag(
              options.tags.find((t) => t.label.toLowerCase() === e.target.value)?.label ??
                e.target.value,
            )
          }
          className="h-12 rounded-full pl-5 text-[0.9375rem]"
        >
          <option value="">Any keyword</option>
          {!tagInList ? <option value={tag.toLowerCase()}>{tag}</option> : null}
          {options.tags.map((t) => (
            <option key={t.label} value={t.label.toLowerCase()}>
              {t.label} ({t.n})
            </option>
          ))}
        </Select>
      </label>
      <label className="flex min-w-0 flex-col gap-1.5">
        <span className="label text-ink-3">Speaker</span>
        <Select
          value={speaker}
          onChange={(e) => setSpeaker(e.target.value)}
          className="h-12 rounded-full pl-5 text-[0.9375rem]"
        >
          <option value="">Anyone</option>
          {speaker && !options.people.some(([s]) => s === speaker) ? (
            <option value={speaker}>{speaker}</option>
          ) : null}
          {options.people.map(([slug, name]) => (
            <option key={slug} value={slug}>
              {name}
            </option>
          ))}
        </Select>
      </label>
    </>
  );

  return (
    <div className="flex flex-col gap-6">
      {/* ---------------------------------------------------------- controls */}
      <div className="flex flex-col gap-4 rounded-[28px] border border-line bg-white/85 p-4 shadow-1 backdrop-blur-[2px] sm:p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <SearchBox
            value={q}
            onChange={setQ}
            label="Search publications"
            placeholder="Search titles, authors, keywords, DOIs"
            className="md:flex-1"
          />
          <div className="flex items-center gap-3">
            <label className="min-w-0 flex-1 md:w-52 md:flex-none">
              <span className="sr-only">Sort</span>
              <Select
                value={sort}
                onChange={(e) => setSort(e.target.value as PubSort)}
                className="h-12 rounded-full pl-5 text-[0.9375rem] font-semibold"
              >
                {SORTS.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </Select>
            </label>
            <div
              role="group"
              aria-label="Layout"
              className="flex flex-none items-center gap-1 rounded-full bg-surface-muted p-1"
            >
              {(['list', 'grid'] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={view === v}
                  aria-label={v === 'list' ? 'Show as a list' : 'Show as a grid'}
                  onClick={() => changeView(v)}
                  className={cn(
                    'relative grid size-10 place-items-center rounded-full transition-colors pointer-coarse:size-11',
                    view === v ? 'text-white' : 'text-ink-2 hover:text-ink',
                  )}
                >
                  {view === v ? (
                    <motion.span
                      layoutId="pub-view-pill"
                      className="absolute inset-0 rounded-full bg-ink"
                      transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                    />
                  ) : null}
                  {v === 'list' ? (
                    <List className="relative size-[18px]" aria-hidden="true" />
                  ) : (
                    <LayoutGrid className="relative size-[18px]" aria-hidden="true" />
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div
          role="group"
          aria-label="Type"
          className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:-mx-5 sm:px-5 lg:flex-wrap lg:overflow-visible"
        >
          <ChipButton size="md" selected={!type} onClick={() => setType('')} className="flex-none">
            Everything <span className="mono ml-1 opacity-80">{pubs.length}</span>
          </ChipButton>
          {options.types.map(([t, n]) => {
            const look = typeLook(t);
            return (
              <ChipButton
                key={t}
                size="md"
                shape={look.shape}
                selected={type === t}
                onClick={() => setType(type === t ? '' : t)}
                className="flex-none"
              >
                {TYPE_PLURAL[t]} <span className="mono ml-1 opacity-80">{n}</span>
              </ChipButton>
            );
          })}
        </div>

        <div className="hidden grid-cols-3 gap-3 sm:grid">{extraFilters}</div>
        <div className="flex items-center justify-between gap-3 sm:hidden">
          <Sheet
            open={sheet}
            onOpenChange={setSheet}
            title="More filters"
            description={`${results.length} of ${pubs.length} papers match.`}
            trigger={
              <Button
                variant="secondary"
                size="md"
                shape={false}
                icon={<SlidersHorizontal className="size-[18px]" />}
              >
                More filters
                {extraCount ? (
                  <span className="mono ml-1 grid size-6 place-items-center rounded-full bg-ink text-[0.75rem] text-white">
                    {extraCount}
                  </span>
                ) : null}
              </Button>
            }
            footer={
              <Button size="md" onClick={() => setSheet(false)} magnetic={false} className="w-full">
                Show {results.length} {results.length === 1 ? 'paper' : 'papers'}
              </Button>
            }
          >
            <div className="flex flex-col gap-4 pb-2">{extraFilters}</div>
          </Sheet>
        </div>
      </div>

      {/* ---------------------------------------------------------- count */}
      <div className="flex min-h-10 flex-wrap items-center justify-between gap-3">
        <p className="label text-ink-3" aria-live="polite">
          {active
            ? `${results.length} of ${pubs.length} papers`
            : `${pubs.length} papers, ${SORTS.find((s) => s.key === sort)?.label.toLowerCase()}`}
        </p>
        {active ? (
          <Button variant="ghost" size="sm" shape="triangle" onClick={clear}>
            Clear filters
          </Button>
        ) : null}
      </div>

      {/* ---------------------------------------------------------- results */}
      {results.length ? (
        <div className="flex flex-col gap-10">
          {groups.map((g) => (
            <section
              key={g.year ?? 'all'}
              aria-label={g.year ? `Published in ${g.year}` : 'Publications'}
              className={cn(
                grouped &&
                  'md:grid md:grid-cols-[7.5rem_minmax(0,1fr)] md:gap-8 lg:grid-cols-[10rem_minmax(0,1fr)]',
              )}
            >
              {grouped ? (
                <div className="mb-3 md:mb-0">
                  <h2
                    className={cn(
                      styles.yearHead,
                      'display text-[clamp(2.25rem,4.5vw,4.25rem)] text-ink',
                    )}
                    style={{ fontVariationSettings: "'CASL' 0.6, 'MONO' 0" }}
                  >
                    {g.year ?? 'Undated'}
                  </h2>
                </div>
              ) : null}
              {view === 'list' ? (
                <div className="flex flex-col">
                  <AnimatePresence initial={false} mode="popLayout">
                    {g.items.map((p) => (
                      <motion.div
                        key={p.id}
                        layout={reduced ? false : 'position'}
                        initial={{ opacity: 0, y: reduced ? 0 : 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, transition: { duration: 0.15 } }}
                        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                        className={cn(styles.item, 'flex flex-col')}
                      >
                        <PublicationRow
                          pub={p}
                          onPreview={setHovered}
                          titleAs={grouped ? 'h3' : 'h2'}
                          hideYear={grouped}
                        />
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              ) : (
                <ul className="grid grid-cols-1 gap-[var(--gutter)] sm:grid-cols-2 xl:grid-cols-3 min-[120rem]:grid-cols-4">
                  {g.items.map((p, i) => (
                    <Reveal
                      as="li"
                      key={p.id}
                      y={28}
                      delay={stagger(i % 3, 0.06)}
                      amount={0.1}
                      className={cn(styles.enter, 'min-w-0')}
                    >
                      <PublicationTile
                        pub={p}
                        onPreview={setHovered}
                        titleAs={grouped ? 'h3' : 'h2'}
                      />
                    </Reveal>
                  ))}
                </ul>
              )}
            </section>
          ))}
          {results.length > shown.length ? (
            <div className="flex justify-center">
              <Button
                variant="secondary"
                size="lg"
                shape="square"
                onClick={() => setLimit((n) => n + PAGE)}
              >
                Show {Math.min(PAGE, results.length - shown.length)} more
              </Button>
            </div>
          ) : null}
        </div>
      ) : (
        <EmptyState
          shape="square"
          friend="circle"
          mood="thinking"
          title="No papers match that. Yet."
          body="Try fewer filters or a shorter search. Or go write it, we'd love to read it."
          action={
            <Button variant="secondary" shape="circle" onClick={clear}>
              Clear filters
            </Button>
          }
        />
      )}

      <CoverPreview pub={hoveredPub} />
    </div>
  );
}
