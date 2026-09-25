'use client';

import Link from 'next/link';
import { formatJakarta, type EventCard } from '@zemi/shared';
import { ShapeIcon } from '@/components/brand/shape-icon';
import { useEventStatus } from '@/lib/hooks/use-now';
import { cn } from '@/lib/utils';
import styles from './shell.module.css';

export interface NextEventPillProps {
  event: EventCard | null;
  /** 'dark' when the nav sits over an inverse section. */
  theme?: 'light' | 'dark';
  compact?: boolean;
  className?: string;
  onNavigate?: () => void;
}

/**
 * "Next Friday" pill for the nav: date of the next event, or a pulsing LIVE badge while it runs.
 * Falls back to "Fridays 13:15" when nothing is scheduled (or the API is down).
 */
export function NextEventPill({ event, theme = 'light', compact, className, onNavigate }: NextEventPillProps) {
  const status = useEventStatus(event);
  const live = status === 'ongoing';
  const dark = theme === 'dark';

  const base = cn(
    styles.pill,
    'group/pill inline-flex h-11 items-center gap-2.5 rounded-full pl-2 pr-4 text-[0.9375rem] font-bold transition-[background-color,color,box-shadow,transform] duration-300 active:scale-[0.96]',
    className,
  );

  if (!event) {
    return (
      <Link
        href="/events"
        onClick={onNavigate}
        className={cn(base, dark ? 'bg-white/10 text-white hover:bg-white/20' : 'bg-surface-muted text-ink hover:bg-line')}
      >
        <span className={cn('grid size-7 place-items-center rounded-full', dark ? 'bg-white/15' : 'bg-white')}>
          <ShapeIcon shape="square" size={12} />
        </span>
        <span className="mono text-[0.8125rem]">{compact ? 'Fri 13:15' : 'Fridays 13:15'}</span>
      </Link>
    );
  }

  const href = `/events/${event.slug}`;

  if (live) {
    return (
      <Link
        href={href}
        onClick={onNavigate}
        className={cn(base, 'bg-red-600 text-white hover:bg-[#b82424]')}
        aria-label={`Happening now: ${event.title}. Watch live.`}
        data-cursor="play"
      >
        <span className="relative grid size-7 place-items-center rounded-full bg-white/20">
          <span className={styles.livePulse} aria-hidden="true" />
        </span>
        <span className="label font-bold tracking-[0.12em]">Live</span>
        {!compact ? <span className="hidden sm:inline">Watch now</span> : null}
      </Link>
    );
  }

  const date = formatJakarta(event.startsAt, 'date-short');
  const weekday = formatJakarta(event.startsAt, 'weekday').slice(0, 3);
  const time = formatJakarta(event.startsAt, 'time');

  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={cn(base, dark ? 'bg-white text-ink hover:bg-ink-inverse' : 'bg-ink text-white hover:bg-[#1c2230]')}
      aria-label={`Next Friday: ${event.title}, ${weekday} ${date} at ${time} WIB`}
    >
      <span className={cn('grid size-7 place-items-center rounded-full', dark ? 'bg-ink/[0.06]' : 'bg-white/12')}>
        <ShapeIcon shape="circle" size={12} className="transition-transform duration-500 group-hover/pill:scale-125" />
      </span>
      {!compact ? <span className="label hidden font-normal opacity-70 xl:inline">Next</span> : null}
      <span className="mono whitespace-nowrap text-[0.8125rem]">
        {weekday} {date}
        {!compact ? <span className="hidden opacity-60 md:inline">, {time}</span> : null}
      </span>
    </Link>
  );
}
