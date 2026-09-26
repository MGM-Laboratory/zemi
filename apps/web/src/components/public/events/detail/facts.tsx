import { CalendarDays, Clock3, MapPin, Radio } from 'lucide-react';
import type { ReactNode } from 'react';
import { formatJakarta, formatTimeRange, type EventDetail } from '@zemi/shared';
import { Chip } from '@/components/public/ui/chip';
import { cn } from '@/lib/utils';
import { mapsLink, venueLine } from '../lib';

function Row({
  icon,
  children,
  className,
}: {
  icon: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <li className={cn('flex items-start gap-3', className)}>
      <span
        className="mt-0.5 grid size-9 flex-none place-items-center rounded-full bg-[var(--accent-tint)] text-[var(--accent-text)]"
        aria-hidden="true"
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">{children}</div>
    </li>
  );
}

/** Date, time (WIB), room with a maps link, and how you can join. */
export function EventFacts({
  event,
  className,
  tone = 'light',
  compact,
  columns,
}: {
  event: EventDetail;
  className?: string;
  tone?: 'light' | 'dark';
  compact?: boolean;
  /** Two columns on wide screens. */
  columns?: boolean;
}) {
  const maps = mapsLink(event);
  const venue = venueLine(event);
  const dark = tone === 'dark';
  const sub = dark ? 'text-ink-inverse/70' : 'text-ink-3';
  const main = dark ? 'text-ink-inverse' : 'text-ink';
  return (
    <ul className={cn('grid gap-x-8 gap-y-5', columns && 'xl:grid-cols-2', className)}>
      <Row icon={<CalendarDays className="size-[18px]" />}>
        <p className={cn('font-bold', main)}>
          <time dateTime={event.startsAt}>{formatJakarta(event.startsAt, 'date-long')}</time>
        </p>
        {!compact ? (
          <p className={cn('text-[0.9375rem]', sub)}>Every Friday, rain or shine. Mostly shine.</p>
        ) : null}
      </Row>
      <Row icon={<Clock3 className="size-[18px]" />}>
        <p className={cn('mono font-semibold', main)}>
          {formatTimeRange(event.startsAt, event.endsAt)}
        </p>
        {!compact ? (
          <p className={cn('text-[0.9375rem]', sub)}>Jakarta time. We start on time, mostly.</p>
        ) : null}
      </Row>
      {event.mode !== 'online' && venue ? (
        <Row icon={<MapPin className="size-[18px]" />}>
          <p className={cn('font-bold', main)}>{venue}</p>
          {event.roomNote ? <p className={cn('text-[0.9375rem]', sub)}>{event.roomNote}</p> : null}
          {maps ? (
            <a
              href={maps}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                'mt-1 inline-flex items-center gap-1 text-[0.9375rem] font-bold underline decoration-[0.08em] underline-offset-[0.2em] hover:decoration-[0.14em]',
                dark ? 'text-white decoration-white/40' : 'text-blue-600 decoration-blue/35',
              )}
              data-cursor="open"
            >
              Open in Maps<span className="sr-only"> (opens in a new tab)</span>
            </a>
          ) : null}
        </Row>
      ) : null}
      <Row icon={<Radio className="size-[18px]" />}>
        <div className="flex flex-wrap gap-2">
          {event.mode !== 'online' ? (
            <Chip tone={dark ? 'ink' : 'outline'} shape="square">
              In the room
            </Chip>
          ) : null}
          {event.mode !== 'offline' ? (
            <Chip tone={dark ? 'ink' : 'outline'} shape="circle">
              Livestream here
            </Chip>
          ) : null}
          <Chip tone={dark ? 'ink' : 'outline'} shape="arch">
            Free
          </Chip>
        </div>
        {event.mode !== 'offline' && event.onlineNote && !compact ? (
          <p className={cn('mt-2 text-[0.9375rem]', sub)}>{event.onlineNote}</p>
        ) : null}
      </Row>
    </ul>
  );
}
