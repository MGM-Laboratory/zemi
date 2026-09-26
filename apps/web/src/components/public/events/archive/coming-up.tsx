'use client';

import Link from 'next/link';
import type { EventCard } from '@zemi/shared';
import { ShapeIcon } from '@/components/brand/shape-icon';
import { Reveal } from '@/components/motion/reveal';
import { stagger } from '@/components/motion/stagger';
import { AvatarStack } from '@/components/public/ui/avatar';
import { Button } from '@/components/public/ui/button';
import { Chip } from '@/components/public/ui/chip';
import { SectionHeader } from '@/components/public/ui/section-header';
import { useNow } from '@/lib/hooks/use-now';
import { cn } from '@/lib/utils';
import { CoverFrame } from '../cover-frame';
import { ACCENT_SHAPE, accentVars, eventLabel, relativeDay, whenLine } from '../lib';

function seats(e: EventCard): string | null {
  if (e.capacity == null || e.registrationCount == null)
    return e.registrationCount ? `${e.registrationCount} coming` : null;
  const left = Math.max(0, e.capacity - e.registrationCount);
  if (left === 0) return 'Full, livestream only';
  if (left <= 10) return `Only ${left} seats left`;
  return `${left} seats left`;
}

function UpcomingCard({
  e,
  featured,
  renderedAt,
  index,
}: {
  e: EventCard;
  featured: boolean;
  renderedAt: number;
  index: number;
}) {
  const now = useNow(60_000);
  const rel = relativeDay(e.startsAt, now ?? new Date(renderedAt));
  const seat = seats(e);
  const titleId = `up-${e.id}`;
  return (
    <Reveal as="li" delay={stagger(index, 0.08)} className={cn(featured && 'md:col-span-2')}>
      <article
        className={cn(
          'group relative flex h-full flex-col gap-6 rounded-[28px] border border-line bg-white p-4 transition-[border-color,box-shadow,transform] duration-300 hover:border-[var(--accent)] hover:shadow-3 sm:p-6',
          featured
            ? 'sm:flex-row sm:items-stretch'
            : 'max-md:flex-row max-md:items-start max-md:gap-4',
        )}
        style={accentVars(e.accent)}
        aria-labelledby={titleId}
      >
        <Link
          href={`/events/${e.slug}`}
          tabIndex={-1}
          aria-hidden="true"
          className={cn(
            'relative z-10 block flex-none',
            featured
              ? 'w-[min(62vw,260px)] sm:w-[clamp(200px,24vw,320px)]'
              : 'w-[88px] md:w-[min(50vw,180px)]',
          )}
        >
          <CoverFrame
            cover={e.cover}
            accent={e.accent}
            sizes={featured ? '(min-width: 640px) 320px, 62vw' : '(min-width: 768px) 180px, 88px'}
            rest={index % 2 ? 2 : -2}
            maxTilt={12}
            alt=""
          />
        </Link>
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Chip tone={e.accent} shape>
              {rel}
            </Chip>
            <span className="mono text-[0.8125rem] text-ink-3">{eventLabel(e)}</span>
          </div>
          <h3
            id={titleId}
            className={cn(
              'display leading-[1] text-ink',
              featured
                ? 'text-[clamp(1.5rem,2.4vw,2.375rem)]'
                : 'text-[clamp(1.375rem,2vw,1.75rem)]',
            )}
            style={{ fontVariationSettings: "'CASL' 0.3, 'MONO' 0" }}
          >
            <Link
              href={`/events/${e.slug}`}
              className="outline-none after:absolute after:inset-0 after:rounded-[28px] focus-visible:after:outline-2 focus-visible:after:outline-offset-3 focus-visible:after:outline-focus focus-visible:after:outline-solid"
            >
              {e.title}
            </Link>
          </h3>
          {featured && e.summary ? <p className="text-ink-2">{e.summary}</p> : null}
          <p className="mono text-[0.875rem] text-ink-2">{whenLine(e)}</p>
          {e.venue ? (
            <p className="flex items-center gap-2 text-[0.9375rem] text-ink-3">
              <ShapeIcon shape="square" size="0.8em" />
              {e.venue.name}
              {e.mode === 'hybrid'
                ? ' + livestream'
                : e.mode === 'online'
                  ? ''
                  : ', in the room only'}
            </p>
          ) : null}
          <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-2">
            <div className="flex items-center gap-2">
              {e.speakers.length ? (
                <AvatarStack
                  people={e.speakers.map((s) => ({ name: s.fullName, image: s.avatar }))}
                  size={30}
                  max={3}
                />
              ) : null}
              {seat ? <span className="text-[0.875rem] font-bold text-ink">{seat}</span> : null}
            </div>
            {featured ? (
              <span className="relative z-20">
                <Button href={`/events/${e.slug}#register`} size="md" cursor="register">
                  Save my seat
                </Button>
              </span>
            ) : (
              <ShapeIcon
                shape={ACCENT_SHAPE[e.accent]}
                size={22}
                className="transition-transform duration-500 group-hover:rotate-[200deg] group-hover:scale-110"
              />
            )}
          </div>
        </div>
      </article>
    </Reveal>
  );
}

/** Coming up: the next Friday big, the ones after it smaller. */
export function ComingUp({
  events,
  renderedAt,
  className,
}: {
  events: EventCard[];
  renderedAt: number;
  className?: string;
}) {
  return (
    <section className={cn('container-page', className)} aria-labelledby="coming-up-title">
      <SectionHeader
        eyebrow="Coming up"
        eyebrowShape="circle"
        id="coming-up-title"
        title="Next on the calendar"
        size="m"
        description="Seats are free. Coffee is free. The questions cost nothing either."
      />
      <ul className="mt-10 grid grid-cols-1 gap-[var(--gutter)] md:grid-cols-2 xl:grid-cols-4">
        {events.map((e, i) => (
          <UpcomingCard key={e.id} e={e} featured={i === 0} renderedAt={renderedAt} index={i} />
        ))}
      </ul>
    </section>
  );
}
