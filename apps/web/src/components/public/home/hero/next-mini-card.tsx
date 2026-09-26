'use client';

import Link from 'next/link';
import { formatJakarta, formatTimeRange, nextFridaySession, type EventCard } from '@zemi/shared';
import { ShapeIcon } from '@/components/brand/shape-icon';
import { LiveBadge } from '@/components/public/ui/chip';
import { useEventStatus } from '@/lib/hooks/use-now';
import { cn } from '@/lib/utils';
import { Countdown } from '../countdown';
import styles from './hero.module.css';

const ACCENT_BG = {
  blue: 'bg-blue',
  red: 'bg-red',
  yellow: 'bg-yellow',
  green: 'bg-green',
} as const;

/** The hero's "next Friday" ticket: date, time WIB, room and a rolling countdown (or LIVE). */
export function NextMiniCard({
  event,
  offline,
  className,
}: {
  event: EventCard | null;
  offline?: boolean;
  className?: string;
}) {
  const status = useEventStatus(event);
  const live = status === 'ongoing';

  if (!event) {
    const { startsAt } = nextFridaySession();
    return (
      <div className={cn(styles.mini, 'p-4 sm:p-5', className)}>
        <p className="label flex items-center gap-2 text-ink-3">
          <ShapeIcon shape="square" size="0.95em" /> Next Friday
        </p>
        <p
          className="display mt-2 text-[1.35rem] leading-[1.05] text-ink"
          style={{ fontVariationSettings: "'CASL' 0.5, 'MONO' 0" }}
        >
          {offline
            ? 'The schedule is taking a nap. Fridays still happen.'
            : 'Nothing booked yet. The chairs are still here.'}
        </p>
        <p className="mono mt-3 text-[0.8125rem] text-ink-2">
          {formatJakarta(startsAt, 'date')} · 13:15 WIB
        </p>
        <Countdown
          to={startsAt.toISOString()}
          className="mono mt-3 text-[1.05rem] font-semibold text-ink"
        />
      </div>
    );
  }

  const href = `/events/${event.slug}`;
  const room = event.venue?.name ?? (event.mode === 'online' ? 'Online' : 'Room TBA');

  return (
    <div className={cn(styles.mini, live && styles.miniLive, 'group/mini', className)}>
      <span className={cn(styles.miniStripe, ACCENT_BG[event.accent])} aria-hidden="true" />
      <div className="relative p-4 pl-5 sm:p-5 sm:pl-6">
        <div className="flex items-center justify-between gap-3">
          {live ? (
            <LiveBadge label="Happening now" />
          ) : (
            <p className="label flex items-center gap-2 text-ink-3">
              <ShapeIcon
                shape="circle"
                size="0.95em"
                className="transition-transform duration-500 group-hover/mini:scale-125"
              />
              Next Friday{event.number != null ? ` · Zemi #${event.number}` : ''}
            </p>
          )}
          <span className="mono text-[0.75rem] text-ink-3">
            {event.mode === 'hybrid'
              ? 'Room + live'
              : event.mode === 'online'
                ? 'Online'
                : 'In the room'}
          </span>
        </div>
        <Link
          href={href}
          className="display mt-2.5 line-clamp-2 block text-[1.3rem] leading-[1.04] text-ink outline-none after:absolute after:inset-0 after:rounded-[inherit] after:content-[''] focus-visible:after:outline-2 focus-visible:after:outline-offset-3 focus-visible:after:outline-focus sm:text-[1.45rem]"
          style={{ fontVariationSettings: "'CASL' 0.35, 'MONO' 0" }}
          data-cursor={live ? 'play' : 'open'}
        >
          {event.title}
        </Link>
        <dl className="mono mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[0.8125rem] text-ink-2">
          <dt className="sr-only">When</dt>
          <dd className="col-span-2">
            {formatJakarta(event.startsAt, 'date')} ·{' '}
            {formatTimeRange(event.startsAt, event.endsAt)}
          </dd>
          <dt className="sr-only">Where</dt>
          <dd className="col-span-2 truncate">{room}</dd>
        </dl>
        <div className="mt-3 flex items-center justify-between gap-3 border-t border-line pt-3">
          {live ? (
            <span className="text-[0.9375rem] font-bold text-red-600">
              Pull up a chair, it is on.
            </span>
          ) : (
            <Countdown to={event.startsAt} className="mono text-[1.05rem] font-semibold text-ink" />
          )}
          <span
            className={cn(
              styles.miniArrow,
              'grid size-9 flex-none place-items-center rounded-full bg-ink text-white',
            )}
            aria-hidden="true"
          >
            <ShapeIcon shape="triangle" size={11} color="current" style={{ rotate: '90deg' }} />
          </span>
        </div>
      </div>
    </div>
  );
}
