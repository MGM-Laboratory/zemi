'use client';

import { motion, useScroll, useSpring } from 'motion/react';
import Link from 'next/link';
import { useMemo, useRef, type CSSProperties } from 'react';
import { jakartaDateInput, jakartaTimeInput, SHAPE_ORDER, type RundownItem } from '@zemi/shared';
import { ShapeIcon } from '@/components/brand/shape-icon';
import { Reveal } from '@/components/motion/reveal';
import { stagger } from '@/components/motion/stagger';
import { Avatar } from '@/components/public/ui/avatar';
import { SectionHeader } from '@/components/public/ui/section-header';
import { useReducedMotion } from '@/lib/hooks/use-reduced-motion';
import { cn } from '@/lib/utils';
import styles from '../events.module.css';

/** Index of the rundown item happening now (by WIB wall clock on the event day), or -1. */
export function currentRundownIndex(
  items: RundownItem[],
  startsAt: string,
  now: Date | null,
): number {
  if (!now || !items.length) return -1;
  if (jakartaDateInput(now) !== jakartaDateInput(startsAt)) return -1;
  const t = jakartaTimeInput(now);
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i]!;
    const end = it.endTime ?? items[i + 1]?.time ?? null;
    if (
      t >= it.time &&
      (!end || t < end || (!it.endTime && i === items.length - 1 && t < addMinutes(it.time, 15)))
    )
      return i;
  }
  return -1;
}

function addMinutes(hhmm: string, min: number): string {
  const [h, m] = hhmm.split(':').map(Number) as [number, number];
  const total = Math.min(23 * 60 + 59, h * 60 + m + min);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

interface RundownProps {
  items: RundownItem[];
  startsAt: string;
  /** Pass the ticking clock while the event is on to get the "Now" marker. */
  now?: Date | null;
  live?: boolean;
  past?: boolean;
  className?: string;
}

/** Vertical clock timeline. Renders nothing without items (the scroll hooks need a mounted list). */
export function Rundown(props: RundownProps) {
  return props.items.length ? <RundownList {...props} /> : null;
}

function RundownList({ items, startsAt, now, live, className, past }: RundownProps) {
  const listRef = useRef<HTMLOListElement>(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: listRef, offset: ['start 75%', 'end 55%'] });
  const fill = useSpring(scrollYProgress, { stiffness: 120, damping: 28, mass: 0.4 });
  const current = useMemo(
    () => (live ? currentRundownIndex(items, startsAt, now ?? null) : -1),
    [items, startsAt, now, live],
  );

  return (
    <section className={cn('container-page', className)} aria-labelledby="rundown-title">
      <div className="grid gap-10 lg:grid-cols-12">
        <div className="lg:col-span-4">
          <div className="lg:sticky lg:top-[calc(var(--nav-h)+32px)]">
            <SectionHeader
              eyebrow="Rundown"
              eyebrowShape="square"
              id="rundown-title"
              title={past ? 'How it went' : 'How the two hours go'}
              size="m"
              description={
                past
                  ? 'Roughly. Q and A always runs long, and nobody minds.'
                  : 'Times in WIB. Q and A always runs a little long. That is the point.'
              }
            />
          </div>
        </div>
        {/* The rail lives on a wrapper: an <ol> may only hold <li> children. */}
        <div
          className="relative lg:col-span-8"
          style={{ '--rail-x': 'clamp(72px, 12vw, 120px)' } as CSSProperties}
        >
          <span className={styles.rundownRail} aria-hidden="true">
            <motion.span className={styles.rundownFill} style={{ scaleY: reduced ? 1 : fill }} />
          </span>
          <ol ref={listRef} className="relative flex flex-col gap-2">
            {items.map((it, i) => {
              const isNow = i === current;
              const done = current >= 0 && i < current;
              const shape = SHAPE_ORDER[i % SHAPE_ORDER.length]!;
              return (
                <Reveal
                  as="li"
                  key={it.id}
                  delay={stagger(i, 0.05)}
                  x={-12}
                  y={0}
                  className={cn(styles.rundownItem, 'relative grid items-start py-4')}
                  style={{ gridTemplateColumns: 'var(--rail-x) 1fr' }}
                  aria-current={isNow ? 'step' : undefined}
                >
                  <div className="pr-5 text-right sm:pr-7">
                    <time
                      className={cn(
                        'mono block text-[clamp(1.125rem,2vw,1.5rem)] font-bold leading-none',
                        done ? 'text-ink-3' : 'text-ink',
                      )}
                    >
                      {it.time}
                    </time>
                    {it.endTime ? (
                      <span className="mono mt-1 block text-[0.8125rem] text-ink-3">
                        to {it.endTime}
                      </span>
                    ) : null}
                  </div>
                  <span className={styles.rundownDot} aria-hidden="true">
                    {isNow ? <span className={styles.nowPulse} /> : null}
                    <ShapeIcon shape={shape} size={14} color={done ? '#d8d8d2' : 'brand'} />
                  </span>
                  <div
                    className={cn(
                      'ml-5 rounded-[20px] px-5 py-4 transition-colors sm:ml-8',
                      isNow ? 'bg-red-50 ring-1 ring-red/30' : 'hover:bg-surface-muted',
                    )}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <h3
                        className={cn(
                          'text-[1.1875rem] font-extrabold leading-snug',
                          done ? 'text-ink-3' : 'text-ink',
                        )}
                      >
                        {it.agenda}
                      </h3>
                      {isNow ? (
                        <span className="label inline-flex items-center gap-1.5 rounded-full bg-red-600 px-2.5 py-1 font-bold text-white">
                          <span
                            className="size-1.5 animate-pulse rounded-full bg-white"
                            aria-hidden="true"
                          />
                          Now
                        </span>
                      ) : null}
                    </div>
                    {it.note ? <p className="mt-1 text-[0.9375rem] text-ink-2">{it.note}</p> : null}
                    {it.speaker ? (
                      <Link
                        href={`/speakers/${it.speaker.slug}`}
                        className="mt-3 inline-flex items-center gap-2 rounded-full py-1 pl-1 pr-3 text-[0.9375rem] font-bold text-ink ring-1 ring-line transition-[background-color,box-shadow] hover:bg-white hover:ring-ink"
                      >
                        <Avatar name={it.speaker.fullName} image={it.speaker.avatar} size={28} />
                        {it.speaker.fullName}
                      </Link>
                    ) : null}
                  </div>
                </Reveal>
              );
            })}
          </ol>
        </div>
      </div>
    </section>
  );
}
