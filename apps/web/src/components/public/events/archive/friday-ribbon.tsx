'use client';

import { AnimatePresence, motion } from 'motion/react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
} from 'react';
import {
  EVENT_STATUS_LABEL,
  formatJakarta,
  fromJakartaInput,
  jakartaDateInput,
} from '@zemi/shared';
import { ShapeIcon } from '@/components/brand/shape-icon';
import { useReducedMotion } from '@/lib/hooks/use-reduced-motion';
import { cn } from '@/lib/utils';
import styles from '../events.module.css';
import { ACCENT_HEX, ACCENT_SHAPE, eventLabel, type RibbonEvent } from '../lib';

interface Slot {
  date: string;
  t: number;
  event: RibbonEvent | null;
}

const WEEK = 7 * 86_400_000;

function buildSlots(events: RibbonEvent[], now: number): Slot[] {
  if (!events.length) return [];
  const byDate = new Map<string, RibbonEvent>();
  for (const e of events) {
    const d = jakartaDateInput(e.startsAt);
    if (!byDate.has(d)) byDate.set(d, e);
  }
  const firstDate = jakartaDateInput(events[0]!.startsAt);
  const lastEvent = Date.parse(events[events.length - 1]!.startsAt);
  const end = Math.max(lastEvent, now + 3 * WEEK);
  const dates = new Set<string>(byDate.keys());
  // Every Friday from the first session on (the empty ones are the breaks).
  let t = fromJakartaInput(firstDate, '13:15').getTime();
  const firstWeekday = new Date(t + 7 * 3600_000).getUTCDay();
  t += ((5 - firstWeekday + 7) % 7) * 86_400_000;
  for (; t <= end; t += WEEK) dates.add(jakartaDateInput(t));
  return [...dates].sort().map((date) => ({
    date,
    t: fromJakartaInput(date, '13:15').getTime(),
    event: byDate.get(date) ?? null,
  }));
}

function slotText(s: Slot): string {
  const when = formatJakarta(s.t, 'date');
  if (!s.event) return `${when}: no session that Friday`;
  const e = s.event;
  return `${eventLabel(e)}, ${e.title}, ${when}, ${EVENT_STATUS_LABEL[e.status]}${e.hasRecording && e.status === 'past' ? ', recording available' : ''}`;
}

/**
 * Every Friday since the first one, as a ribbon of tick marks. Hover or drag to scrub (a preview
 * card follows), click or Enter to open. Keyboard: it's a slider (arrows jump between sessions).
 */
export function FridayRibbon({
  events,
  renderedAt,
  className,
}: {
  events: RibbonEvent[];
  renderedAt: number;
  className?: string;
}) {
  const router = useRouter();
  const reduced = useReducedMotion();
  const slots = useMemo(() => buildSlots(events, renderedAt), [events, renderedAt]);
  const n = slots.length;
  const trackRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<number | null>(null);
  const [touchPinned, setTouchPinned] = useState(false);
  const raf = useRef(0);
  const pending = useRef<number | null>(null);

  const withEvents = useMemo(
    () => slots.map((s, i) => (s.event ? i : -1)).filter((i) => i >= 0),
    [slots],
  );
  const todayIdx = useMemo(() => {
    const i = slots.findIndex((s) => s.t > renderedAt - 12 * 3600_000);
    return i < 0 ? n - 1 : i;
  }, [slots, renderedAt, n]);
  const lastWrapped = useMemo(() => {
    for (let i = todayIdx; i >= 0; i--) if (slots[i]?.event) return i;
    return withEvents[0] ?? 0;
  }, [slots, todayIdx, withEvents]);

  const idxFromX = useCallback(
    (clientX: number) => {
      const r = trackRef.current?.getBoundingClientRect();
      if (!r || n < 2) return 0;
      const p = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
      return Math.round(p * (n - 1));
    },
    [n],
  );

  const schedule = (i: number) => {
    pending.current = i;
    if (raf.current) return;
    raf.current = requestAnimationFrame(() => {
      raf.current = 0;
      setActive(pending.current);
    });
  };

  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'mouse' && !touchPinned && e.buttons === 0) return;
    schedule(idxFromX(e.clientX));
  };
  const lastPointer = useRef<string>('mouse');
  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    lastPointer.current = e.pointerType;
    if (e.pointerType !== 'mouse') {
      setTouchPinned(true);
      schedule(idxFromX(e.clientX));
    }
  };
  const onLeave = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse') setActive(null);
  };
  const onClick = (e: MouseEvent<HTMLDivElement>) => {
    // Mouse: click opens the session under the playhead. Touch: the preview card has a link.
    if (lastPointer.current !== 'mouse' || e.detail === 0) return;
    const s = slots[idxFromX(e.clientX)];
    if (s?.event) router.push(`/events/${s.event.slug}`);
  };

  const stepTo = (from: number, dir: 1 | -1) => {
    if (dir > 0) return withEvents.find((i) => i > from) ?? from;
    return [...withEvents].reverse().find((i) => i < from) ?? from;
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const cur = active ?? lastWrapped;
    let next: number | null = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next = stepTo(cur, 1);
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next = stepTo(cur, -1);
    else if (e.key === 'PageUp') next = Math.min(n - 1, cur + 10);
    else if (e.key === 'PageDown') next = Math.max(0, cur - 10);
    else if (e.key === 'Home') next = withEvents[0] ?? 0;
    else if (e.key === 'End') next = withEvents[withEvents.length - 1] ?? n - 1;
    else if (e.key === 'Enter' || e.key === ' ') {
      const s = slots[cur];
      if (s?.event) {
        e.preventDefault();
        router.push(`/events/${s.event.slug}`);
      }
      return;
    } else if (e.key === 'Escape') {
      setActive(null);
      return;
    }
    if (next != null) {
      e.preventDefault();
      setActive(next);
    }
  };

  if (n < 2) return null;

  const sigma = Math.max(1.6, n / 45);
  const shown = active ?? null;
  const cur = shown != null ? slots[shown] : null;
  const pct = (i: number) => (i / (n - 1)) * 100;

  // Year labels at the first Friday of each year; quarter months in between on wide screens.
  const labels: Array<{ i: number; text: string; year: boolean }> = [];
  let lastYear = '';
  let lastMonth = '';
  slots.forEach((s, i) => {
    const y = s.date.slice(0, 4);
    const m = s.date.slice(5, 7);
    const prevLabel = labels[labels.length - 1];
    if (y !== lastYear) {
      // A year always wins over a month label sitting right next to it.
      if (prevLabel && !prevLabel.year && i - prevLabel.i < 5) labels.pop();
      labels.push({ i, text: y, year: true });
    } else if (
      m !== lastMonth &&
      ['04', '07', '10'].includes(m) &&
      (!prevLabel || i - prevLabel.i >= 5)
    )
      labels.push({ i, text: formatJakarta(s.t, 'date-short').split(' ')[1] ?? m, year: false });
    lastYear = y;
    lastMonth = m;
  });

  return (
    <section className={cn('container-page', className)} aria-label="Every Friday, on a ribbon">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <p className="label text-ink-3">
          <span className="hidden sm:inline">
            Hover or drag to scrub every Friday. Click one to open it.
          </span>
          <span className="sm:hidden">Drag along the ribbon. Tap to peek.</span>
        </p>
        <ul className="label flex flex-wrap gap-x-4 gap-y-1 text-ink-3" aria-label="Legend">
          <li className="inline-flex items-center gap-1.5">
            <span className="inline-block h-3 w-[3px] rounded bg-blue" aria-hidden="true" /> Session
          </li>
          <li className="inline-flex items-center gap-1.5">
            <span className="inline-block size-2 rounded-full bg-ink" aria-hidden="true" />{' '}
            Recording
          </li>
          <li className="inline-flex items-center gap-1.5">
            <span
              className="inline-block h-1.5 w-[3px] rounded bg-line-strong"
              aria-hidden="true"
            />{' '}
            Break
          </li>
        </ul>
      </div>

      <div
        ref={trackRef}
        className={cn(styles.ribbon, 'h-[clamp(128px,15vw,188px)]')}
        role="slider"
        tabIndex={0}
        aria-label="Fridays timeline"
        aria-valuemin={0}
        aria-valuemax={n - 1}
        aria-valuenow={shown ?? lastWrapped}
        aria-valuetext={slotText(slots[shown ?? lastWrapped]!)}
        aria-describedby="ribbon-help"
        onPointerMove={onMove}
        onPointerDown={onDown}
        onPointerLeave={onLeave}
        onClick={onClick}
        onKeyDown={onKey}
        onFocus={() => setActive((a) => a ?? lastWrapped)}
        onBlur={(e) => {
          // Tapping the preview's link moves focus inside the ribbon: keep the preview open.
          if (e.relatedTarget instanceof Node && e.currentTarget.contains(e.relatedTarget)) return;
          setActive(null);
          setTouchPinned(false);
        }}
        data-cursor={cur?.event ? 'open' : undefined}
      >
        <span id="ribbon-help" className="sr-only">
          Arrow keys jump between sessions, Enter opens the one you are on.
        </span>
        {/* baseline */}
        <span className="absolute inset-x-0 bottom-[27px] h-px bg-line" aria-hidden="true" />

        {slots.map((s, i) => {
          const e = s.event;
          const d = shown == null ? 99 : Math.abs(i - shown);
          const boost = shown == null ? 0 : Math.exp(-(d * d) / (2 * sigma * sigma));
          const base = !e
            ? 0.1
            : e.status === 'cancelled'
              ? 0.16
              : e.status === 'scheduled' || e.status === 'ongoing'
                ? 0.5
                : e.hasRecording
                  ? 0.44
                  : 0.34;
          const h = Math.min(1, base * (1 + boost * 1.25) + (i === shown ? 0.06 : 0));
          const color = !e
            ? 'var(--color-line-strong)'
            : e.status === 'cancelled'
              ? 'var(--color-red)'
              : ACCENT_HEX[e.accent];
          const style: CSSProperties = {
            left: `${pct(i)}%`,
            height: `calc((100% - 34px) * ${h.toFixed(3)})`,
            width: `clamp(2px, calc(100% / ${n} * 0.5), 9px)`,
            background: color,
            opacity: e && e.status === 'past' && !e.hasRecording ? 0.7 : 1,
            animationDelay: reduced ? undefined : `${Math.min(i * 8, 900)}ms`,
          };
          return (
            <span
              key={s.date}
              className={cn(styles.tick, !reduced && styles.tickIn)}
              style={style}
              aria-hidden="true"
            >
              {e?.hasRecording && e.status === 'past' ? (
                <span className="absolute -top-2 left-1/2 size-[clamp(4px,0.5vw,7px)] -translate-x-1/2 rounded-full bg-ink" />
              ) : null}
              {e && (e.status === 'scheduled' || e.status === 'ongoing') ? (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <ShapeIcon shape={ACCENT_SHAPE[e.accent]} size={8} />
                </span>
              ) : null}
              {e?.isLive ? (
                <span className="absolute -top-3 left-1/2 size-2 -translate-x-1/2 animate-ping rounded-full bg-red" />
              ) : null}
            </span>
          );
        })}

        {/* today */}
        <span
          className="absolute bottom-[27px] top-2 w-px -translate-x-1/2 border-l border-dashed border-ink/30"
          style={{ left: `${pct(todayIdx)}%` }}
          aria-hidden="true"
        >
          <span
            className={cn(
              'label absolute -top-1 whitespace-nowrap text-[0.625rem] text-ink-3',
              pct(todayIdx) > 88 ? 'right-1.5' : 'left-1.5',
            )}
          >
            Today
          </span>
        </span>

        {/* year / month labels */}
        {labels.map((l) => (
          <span
            key={`${l.text}-${l.i}`}
            className={cn(
              'label absolute bottom-0 whitespace-nowrap',
              // Two year labels close together on a phone: keep the later one.
              l.year &&
                labels.some((o) => o.year && o.i > l.i && o.i - l.i < n * 0.16) &&
                'max-sm:hidden',
              l.i === 0 ? '' : pct(l.i) > 96 ? '-translate-x-full' : '-translate-x-1/2',
              l.year ? 'font-bold text-ink' : 'hidden text-ink-3 md:block',
            )}
            style={{ left: `${pct(l.i)}%` }}
            aria-hidden="true"
          >
            {l.text}
          </span>
        ))}

        {/* playhead + preview */}
        <AnimatePresence>
          {cur && shown != null ? (
            <>
              <motion.span
                key="playhead"
                className={styles.playhead}
                style={{ left: `${pct(shown)}%` }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                aria-hidden="true"
              />
              <motion.div
                key="preview"
                className={styles.preview}
                style={{
                  left: `clamp(0px, calc(${pct(shown)}% - clamp(100px, 11vw, 140px)), calc(100% - clamp(200px, 22vw, 280px)))`,
                  // Touch: the pinned card is tappable (its "Open this Friday" link).
                  pointerEvents: touchPinned ? 'auto' : undefined,
                }}
                // A tap on the card must not scrub the ribbon to whatever sits under the finger.
                onPointerDown={(ev) => ev.stopPropagation()}
                onPointerMove={(ev) => ev.stopPropagation()}
                initial={reduced ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={reduced ? { opacity: 0 } : { opacity: 0, y: 6, scale: 0.98 }}
                transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                aria-hidden={!touchPinned}
              >
                <div className="flex gap-3 rounded-[18px] border border-line bg-white p-2.5 shadow-3">
                  {cur.event ? (
                    <>
                      <span
                        className="relative block w-[56px] flex-none overflow-hidden rounded-[10px] sm:w-[64px]"
                        style={{
                          aspectRatio: '4 / 5',
                          background: cur.event.color ?? ACCENT_HEX[cur.event.accent],
                          boxShadow: `0 0 0 3px ${ACCENT_HEX[cur.event.accent]}`,
                        }}
                      >
                        {cur.event.cover ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={cur.event.cover}
                            alt=""
                            className="absolute inset-0 size-full object-cover"
                            decoding="async"
                          />
                        ) : null}
                      </span>
                      <span className="flex min-w-0 flex-col justify-center gap-1">
                        <span className="mono text-[0.75rem] text-ink-3">
                          {eventLabel(cur.event)} · {formatJakarta(cur.t, 'date-short')}{' '}
                          {cur.date.slice(0, 4)}
                        </span>
                        <span className="line-clamp-2 text-[0.9375rem] font-bold leading-snug text-ink">
                          {cur.event.title}
                        </span>
                        <span className="label text-[0.625rem] text-ink-3">
                          {cur.event.isLive ? 'Live now' : EVENT_STATUS_LABEL[cur.event.status]}
                          {cur.event.hasRecording && cur.event.status === 'past' ? ' · Watch' : ''}
                        </span>
                        {touchPinned ? (
                          <Link
                            href={`/events/${cur.event.slug}`}
                            className="mt-1 text-[0.875rem] font-bold text-blue-600 underline underline-offset-2"
                            tabIndex={-1}
                          >
                            Open this Friday
                          </Link>
                        ) : null}
                      </span>
                    </>
                  ) : (
                    <span className="flex flex-col gap-1 px-1 py-1">
                      <span className="mono text-[0.75rem] text-ink-3">
                        {formatJakarta(cur.t, 'date')}
                      </span>
                      <span className="text-[0.9375rem] font-bold text-ink">
                        {cur.t > renderedAt ? 'Not planned yet.' : 'No session. A break Friday.'}
                      </span>
                    </span>
                  )}
                </div>
              </motion.div>
            </>
          ) : null}
        </AnimatePresence>
      </div>
    </section>
  );
}
