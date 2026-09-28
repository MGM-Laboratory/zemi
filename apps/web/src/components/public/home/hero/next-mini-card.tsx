'use client';

import Link from 'next/link';
import { formatJakarta, formatTimeRange, nextFridaySession, type EventCard } from '@zemi/shared';
import { ShapeIcon } from '@/components/brand/shape-icon';
import { Avatar } from '@/components/public/ui/avatar';
import { LiveBadge, StatusBadge } from '@/components/public/ui/chip';
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

/**
 * The hero's Friday ticket, enlarged to own the right side of the hero. Shows the next Friday
 * (or the live one), and falls back to the most recent past Friday when nothing is booked.
 */
export function NextMiniCard({
  event,
  lastFriday,
  offline,
  className,
}: {
  event: EventCard | null;
  lastFriday: EventCard | null;
  offline?: boolean;
  className?: string;
}) {
  const shown = event ?? lastFriday;
  const status = useEventStatus(shown);
  const live = status === 'ongoing';

  if (!shown) {
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

  const past = !event && lastFriday != null;
  const href = `/events/${shown.slug}`;
  const room = shown.venue?.name ?? (shown.mode === 'online' ? 'Online' : 'Room TBA');
  const speakers = shown.speakers ?? [];

  return (
    <div className={cn(styles.mini, live && styles.miniLive, 'group/mini', className)}>
      <span className={cn(styles.miniStripe, ACCENT_BG[shown.accent])} aria-hidden="true" />
      <div className="relative flex h-full flex-col p-5 pl-6 sm:p-6 sm:pl-7">
        <div className="flex items-center justify-between gap-3">
          {live ? (
            <LiveBadge label="Happening now" />
          ) : past ? (
            <StatusBadge status="past" size="md" />
          ) : (
            <p className="label flex items-center gap-2 text-ink-3">
              <ShapeIcon
                shape="circle"
                size="0.95em"
                className="transition-transform duration-500 group-hover/mini:scale-125"
              />
              Next Friday{shown.number != null ? ` · Zemi #${shown.number}` : ''}
            </p>
          )}
          <span className="mono text-[0.75rem] text-ink-3">
            {shown.mode === 'hybrid'
              ? 'Room + live'
              : shown.mode === 'online'
                ? 'Online'
                : 'In the room'}
          </span>
        </div>

        <Link
          href={href}
          className="display mt-3 line-clamp-3 block text-[1.75rem] leading-[1.04] text-ink outline-none after:absolute after:inset-0 after:rounded-[inherit] after:content-[''] focus-visible:after:outline-2 focus-visible:after:outline-offset-3 focus-visible:after:outline-focus lg:text-[2rem]"
          style={{ fontVariationSettings: "'CASL' 0.35, 'MONO' 0" }}
          data-cursor={live ? 'play' : 'open'}
        >
          {shown.title}
        </Link>

        {speakers.length ? (
          <ul className={cn(styles.miniSpeakers, 'mt-4')} aria-label="Speakers">
            {speakers.slice(0, 3).map((s) => (
              <li key={s.id}>
                <Link href={`/speakers/${s.slug}`} className={styles.miniSpeaker}>
                  <Avatar name={s.fullName} image={s.avatar} size={34} />
                  <span className="truncate">{s.fullName}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : null}

        <dl className="mono mt-4 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[0.8125rem] text-ink-2">
          <dt className="sr-only">When</dt>
          <dd className="col-span-2">
            {formatJakarta(shown.startsAt, 'date')} ·{' '}
            {formatTimeRange(shown.startsAt, shown.endsAt)}
          </dd>
          <dt className="sr-only">Where</dt>
          <dd className="col-span-2 truncate">{room}</dd>
        </dl>

        <div className="mt-auto border-t border-line pt-4">
          <div className="flex items-end justify-between gap-3">
            {live ? (
              <span className="text-[0.9375rem] font-bold text-red-600">
                Pull up a chair, it is on.
              </span>
            ) : past ? (
              <span className="text-[0.9375rem] font-bold text-ink">
                {shown.hasRecording ? 'Watch the recording.' : 'See what you missed.'}
              </span>
            ) : (
              <Countdown
                to={shown.startsAt}
                variant="cells"
                seconds={false}
                className="flex-1"
              />
            )}
            <span
              className={cn(
                styles.miniArrow,
                'grid size-10 flex-none place-items-center rounded-full bg-ink text-white',
              )}
              aria-hidden="true"
            >
              <ShapeIcon shape="triangle" size={12} color="current" style={{ rotate: '90deg' }} />
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
