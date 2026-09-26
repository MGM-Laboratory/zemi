'use client';

import { Play } from 'lucide-react';
import Link from 'next/link';
import { EVENT_STATUS_LABEL, formatJakarta, type EventCard } from '@zemi/shared';
import { ShapeIcon } from '@/components/brand/shape-icon';
import { StatusBadge } from '@/components/public/ui/chip';
import { cn } from '@/lib/utils';
import { CoverFrame } from '../cover-frame';
import styles from '../events.module.css';
import { ACCENT_SHAPE, accentVars, seeded } from '../lib';

/** One 4:5 cover in the archive: accent frame, tilt + depth, status and Watch badges. */
export function ArchiveCard({ e, priority }: { e: EventCard; priority?: boolean }) {
  const titleId = `arc-${e.id}`;
  const metaId = `arc-m-${e.id}`;
  const rest = (seeded(e.id) - 0.5) * 4;
  const speakers = e.speakers.map((s) => s.nickname ?? s.fullName.split(' ')[0]).slice(0, 3);
  return (
    <Link
      href={`/events/${e.slug}`}
      className={cn(
        styles.card,
        'group block rounded-[24px] outline-none focus-visible:outline-2 focus-visible:outline-offset-8 focus-visible:outline-focus',
      )}
      style={accentVars(e.accent)}
      aria-labelledby={`${titleId} ${metaId}`}
      data-cursor={e.hasRecording ? 'play' : 'open'}
    >
      <CoverFrame
        cover={e.cover}
        accent={e.accent}
        sizes="(min-width: 2200px) 18vw, (min-width: 1280px) 23vw, (min-width: 820px) 31vw, 46vw"
        rest={rest}
        priority={priority}
        maxTilt={11}
        alt=""
      >
        <span className="absolute left-3 top-3 flex flex-wrap gap-1.5 sm:left-4 sm:top-4">
          {e.status !== 'past' ? (
            <StatusBadge
              status={e.isLive ? 'ongoing' : e.status}
              label={e.isLive ? 'Live now' : undefined}
            />
          ) : null}
          {e.hasRecording && e.status === 'past' ? (
            <span className="inline-flex h-7 items-center gap-1.5 rounded-full bg-white px-2.5 text-[0.8125rem] font-bold text-ink shadow-2">
              <Play className="size-3 fill-current" aria-hidden="true" />
              Watch
            </span>
          ) : null}
        </span>
        <span className={cn(styles.stamp, 'mono text-[0.75rem] font-bold sm:text-[0.8125rem]')}>
          {e.number != null ? `#${e.number}` : 'Zemi'}
        </span>
        <span className={cn(styles.sticker, 'hidden sm:block')} aria-hidden="true">
          <ShapeIcon
            shape={ACCENT_SHAPE[e.accent]}
            size="clamp(28px, 2.6vw, 40px)"
            color="#fff"
            style={{ filter: 'drop-shadow(0 6px 10px rgb(14 17 22 / 0.3))' }}
          />
        </span>
      </CoverFrame>
      <div className="mt-4 flex flex-col gap-1.5 px-1">
        <p id={metaId} className="mono text-[0.75rem] text-ink-3 sm:text-[0.8125rem]">
          <span className="sr-only">, </span>
          {formatJakarta(e.startsAt, 'date')}
          {e.status === 'cancelled' ? ' · Cancelled' : ''}
          {/* The badges on the cover are not part of the link's name, so say them here. */}
          <span className="sr-only">
            {e.isLive
              ? ', live now'
              : e.status === 'scheduled' || e.status === 'ongoing'
                ? `, ${EVENT_STATUS_LABEL[e.status].toLowerCase()}`
                : ''}
            {e.hasRecording && e.status === 'past' ? ', recording available' : ''}
          </span>
        </p>
        <h3
          id={titleId}
          className={cn(
            styles.cardTitle,
            'display text-[clamp(1.0625rem,1.6vw,1.5rem)] leading-[1.05] text-ink',
            e.status === 'cancelled' && 'line-through decoration-red/60',
          )}
          style={{ fontVariationSettings: "'CASL' 0.25, 'MONO' 0", fontWeight: 850 }}
        >
          {e.title}
        </h3>
        {speakers.length ? (
          <p className="truncate text-[0.875rem] text-ink-3">with {speakers.join(', ')}</p>
        ) : null}
      </div>
    </Link>
  );
}
