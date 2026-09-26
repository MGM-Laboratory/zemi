'use client';

import { AnimatePresence, LayoutGroup, motion } from 'motion/react';
import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import type { SpeakerCard as SpeakerCardData } from '@zemi/shared';
import { ZemiMark } from '@/components/brand/zemi-mark';
import { Reveal } from '@/components/motion/reveal';
import { stagger } from '@/components/motion/stagger';
import { Button } from '@/components/public/ui/button';
import { ChipButton } from '@/components/public/ui/chip';
import { EmptyState } from '@/components/public/ui/empty-state';
import { useReducedMotion } from '@/lib/hooks/use-reduced-motion';
import { fold, hashString, isLabOrg } from './lib';
import { SearchBox } from './search-box';
import { SpeakerCard } from './speaker-card';
import styles from './speakers.module.css';
import { useUrlSync } from './use-url-sync';

export type SpeakerSort = 'talks' | 'recent' | 'name';
export type SpeakerFrom = 'all' | 'lab' | 'guests';

const SORTS: Array<{ key: SpeakerSort; label: string }> = [
  { key: 'talks', label: 'Most talks' },
  { key: 'recent', label: 'Newest' },
  { key: 'name', label: 'A to Z' },
];

const FROMS: Array<{ key: SpeakerFrom; label: string }> = [
  { key: 'all', label: 'Everyone' },
  { key: 'lab', label: 'From the lab' },
  { key: 'guests', label: 'Visitors' },
];

export interface SpeakersDirectoryProps {
  speakers: SpeakerCardData[];
  initial: { q?: string; sort?: SpeakerSort; from?: SpeakerFrom };
  renderedAt: number;
}

const byName = (a: SpeakerCardData, b: SpeakerCardData) =>
  a.fullName.localeCompare(b.fullName, 'en', { sensitivity: 'base' });
const time = (s: string | null) => (s ? new Date(s).getTime() : -Infinity);

function sortSpeakers(list: SpeakerCardData[], sort: SpeakerSort): SpeakerCardData[] {
  const out = [...list];
  if (sort === 'name') out.sort(byName);
  else if (sort === 'recent')
    out.sort((a, b) => time(b.latestTalkAt) - time(a.latestTalkAt) || byName(a, b));
  else
    out.sort(
      (a, b) =>
        b.talkCount - a.talkCount || time(b.latestTalkAt) - time(a.latestTalkAt) || byName(a, b),
    );
  return out;
}

/**
 * The speakers grid: search, "where from" filter, sort, and a shuffle button that re-deals the
 * cards with a FLIP animation (motion layout). Everything runs client-side over the full list.
 */
export function SpeakersDirectory({ speakers, initial, renderedAt }: SpeakersDirectoryProps) {
  const reduced = useReducedMotion();
  const [q, setQ] = useState(initial.q ?? '');
  const [sort, setSort] = useState<SpeakerSort | 'shuffle'>(initial.sort ?? 'talks');
  const [from, setFrom] = useState<SpeakerFrom>(initial.from ?? 'all');
  const [deal, setDeal] = useState(0);
  const [entered, setEntered] = useState(false);
  const query = useDeferredValue(q);

  // Cards that mount after the first paint (filters, shuffle) pop in; the first batch reveals on scroll.
  useEffect(() => setEntered(true), []);

  useUrlSync({
    q: q.trim() || null,
    sort: sort === 'talks' || sort === 'shuffle' ? null : sort,
    from: from === 'all' ? null : from,
  });

  const counts = useMemo(() => {
    const lab = speakers.filter((s) => isLabOrg(s.defaultOrganization)).length;
    return { all: speakers.length, lab, guests: speakers.length - lab };
  }, [speakers]);

  const visible = useMemo(() => {
    const needle = fold(query);
    const words = needle.split(/\s+/).filter(Boolean);
    const filtered = speakers.filter((s) => {
      if (from === 'lab' && !isLabOrg(s.defaultOrganization)) return false;
      if (from === 'guests' && isLabOrg(s.defaultOrganization)) return false;
      if (!words.length) return true;
      const hay = fold(
        `${s.fullName} ${s.nickname ?? ''} ${s.headline ?? ''} ${s.defaultOrganization ?? ''} ${s.defaultPosition ?? ''}`,
      );
      return words.every((w) => hay.includes(w));
    });
    if (sort === 'shuffle') {
      return [...filtered].sort(
        (a, b) => hashString(`${a.slug}:${deal}`) - hashString(`${b.slug}:${deal}`),
      );
    }
    return sortSpeakers(filtered, sort);
  }, [speakers, query, from, sort, deal]);

  const shuffle = () => {
    setDeal((d) => d + 1);
    setSort('shuffle');
  };

  const clear = () => {
    setQ('');
    setFrom('all');
  };

  const layout = reduced ? false : true;

  return (
    <div className="flex flex-col gap-8 md:gap-10">
      <div className="flex flex-col gap-4 lg:flex-row lg:flex-wrap lg:items-center lg:justify-between">
        <SearchBox
          value={q}
          onChange={setQ}
          label="Search speakers"
          placeholder="Search a name, a topic, a campus"
          className="w-full lg:max-w-[26rem]"
        />
        <div className="no-scrollbar -mx-[var(--page-margin)] flex items-center gap-2 overflow-x-auto px-[var(--page-margin)] py-1 lg:mx-0 lg:flex-wrap lg:gap-x-6 lg:gap-y-3 lg:overflow-visible lg:px-0">
          <div role="group" aria-label="Where they're from" className="flex flex-none gap-2">
            {FROMS.map((f) => (
              <ChipButton
                key={f.key}
                size="md"
                selected={from === f.key}
                onClick={() => setFrom(f.key)}
              >
                {f.label} <span className="mono ml-1 opacity-80">{counts[f.key]}</span>
              </ChipButton>
            ))}
          </div>
          <span className="mx-1 h-6 w-px flex-none bg-line-strong lg:hidden" aria-hidden="true" />
          <div role="group" aria-label="Sort" className="flex flex-none gap-2">
            {SORTS.map((s) => (
              <ChipButton
                key={s.key}
                size="md"
                tone="neutral"
                selected={sort === s.key}
                onClick={() => setSort(s.key)}
              >
                {s.label}
              </ChipButton>
            ))}
          </div>
          <Button
            variant="secondary"
            size="md"
            shape={false}
            onClick={shuffle}
            className="flex-none"
            icon={<ZemiMark variant="shuffle" trigger={deal} size="1.2em" decorative />}
            aria-label="Shuffle the grid"
          >
            Shuffle
          </Button>
        </div>
      </div>

      <p className="label text-ink-3" aria-live="polite">
        {visible.length === speakers.length
          ? `${speakers.length} people, ${sort === 'shuffle' ? 'freshly shuffled' : SORTS.find((s) => s.key === sort)?.label.toLowerCase()}`
          : `${visible.length} of ${speakers.length} people`}
      </p>

      {visible.length ? (
        <LayoutGroup>
          <motion.ul
            className="grid grid-cols-2 gap-x-[var(--gutter)] gap-y-10 sm:grid-cols-3 sm:gap-y-12 lg:grid-cols-4 xl:grid-cols-5 min-[120rem]:grid-cols-6"
            aria-label="Speakers"
          >
            <AnimatePresence mode="popLayout">
              {visible.map((s, i) => (
                <motion.li
                  key={s.slug}
                  layout={layout}
                  className="min-w-0"
                  initial={entered ? { opacity: 0, scale: reduced ? 1 : 0.88 } : false}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: reduced ? 1 : 0.85, transition: { duration: 0.2 } }}
                  transition={{
                    layout: {
                      type: 'spring',
                      stiffness: 300,
                      damping: 30,
                      delay: Math.min(i, 24) * 0.012,
                    },
                    default: { type: 'spring', stiffness: 260, damping: 24 },
                  }}
                >
                  <Reveal
                    y={40}
                    scale={0.94}
                    delay={stagger(i % 6, 0.07)}
                    amount={0.15}
                    className={styles.enter}
                  >
                    <SpeakerCard speaker={s} deal={deal} renderedAt={renderedAt} priority={i < 4} />
                  </Reveal>
                </motion.li>
              ))}
            </AnimatePresence>
          </motion.ul>
        </LayoutGroup>
      ) : (
        <EmptyState
          shape="circle"
          friend="triangle"
          mood="thinking"
          title="Nobody by that name. Yet."
          body="Try a shorter search, or switch back to Everyone. Maybe they're the next one at the front."
          action={
            <Button variant="secondary" shape="circle" onClick={clear}>
              Show everyone
            </Button>
          }
        />
      )}
    </div>
  );
}
