'use client';

import { motion } from 'motion/react';
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { formatTimeRange, type EventDetail, type EventStreamPublic } from '@zemi/shared';
import { Character } from '@/components/brand/character';
import { ZemiMark } from '@/components/brand/zemi-mark';
import { TickingDigits } from '@/components/motion/ticking-digits';
import { ZemiPlayerLazy } from '@/components/public/player/lazy';
import { Button } from '@/components/public/ui/button';
import { LiveBadge } from '@/components/public/ui/chip';
import { useReducedMotion } from '@/lib/hooks/use-reduced-motion';
import { cn } from '@/lib/utils';
import styles from '../events.module.css';
import { accentVars, eventLabel, mapsLink } from '../lib';
import { Recordings } from './recordings';

function StageShell({
  event,
  children,
  className,
  label,
}: {
  event: EventDetail;
  children: ReactNode;
  className?: string;
  label: string;
}) {
  return (
    <section
      className={cn(
        styles.stage,
        'pb-[clamp(40px,8vh,96px)] pt-[calc(var(--nav-h)+clamp(16px,3vw,40px))]',
        className,
      )}
      data-nav-theme="dark"
      aria-label={label}
      style={accentVars(event.accent) as CSSProperties}
    >
      <span className={styles.stageSpot} aria-hidden="true" />
      <span className={styles.stageFloor} aria-hidden="true" />
      <div className="container-page">{children}</div>
    </section>
  );
}

function StageTitle({ event, badge }: { event: EventDetail; badge: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {badge}
          <span className="label text-ink-inverse/60">{eventLabel(event)}</span>
        </div>
        <h1
          className="display text-[clamp(1.75rem,4vw,3.5rem)] leading-[0.98] text-white"
          style={{ fontVariationSettings: "'CASL' 0.35, 'MONO' 0" }}
        >
          {event.title}
        </h1>
      </div>
      <p className="mono flex-none text-[0.9375rem] text-ink-inverse/60">
        {formatTimeRange(event.startsAt, event.endsAt)}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ live */

export function LiveStage({
  event,
  stream,
  onStreamEnd,
}: {
  event: EventDetail;
  stream: EventStreamPublic;
  onStreamEnd: () => void;
}) {
  return (
    <StageShell event={event} label="Livestream">
      <div className="mx-auto flex max-w-[1480px] flex-col gap-6">
        <StageTitle event={event} badge={<LiveBadge label="Live now" />} />
        <motion.div
          initial={{ opacity: 0, y: 24, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: 'spring', stiffness: 180, damping: 26 }}
          className="mx-auto w-full max-w-[calc((100svh-24px)*16/9)] overflow-hidden rounded-[24px] shadow-[0_40px_120px_-40px_rgb(0_0_0/0.8)] ring-1 ring-white/10"
          id="stream"
        >
          <ZemiPlayerLazy
            mode="live"
            eventId={event.id}
            title={event.title}
            subtitle={eventLabel(event)}
            sources={{ hls: stream.hlsUrl }}
            live={{
              ingestOnline: stream.ingestOnline,
              viewers: stream.viewers,
              startedAt: stream.liveStartedAt,
              state: stream.state,
            }}
            poster={event.cover?.src}
            posterLqip={event.cover?.lqip}
            posterColor={event.cover?.color}
            accent={event.accent}
            autoPlay
            onStreamEnd={onStreamEnd}
          />
        </motion.div>
        <p className="text-center text-[0.9375rem] text-ink-inverse/60">
          Tap a reaction to cheer on the speaker. Questions? Wave at the camera, or save them for Q
          and A.
        </p>
      </div>
    </StageShell>
  );
}

/* ------------------------------------------------------------------ waiting */

const CAST = ['circle', 'triangle', 'square', 'arch'] as const;

/** "13:14... 13:15" plus the cast warming up. Swaps to the player on its own when the stream goes live. */
export function WaitingStage({ event, preview }: { event: EventDetail; preview: boolean }) {
  const reduced = useReducedMotion();
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (reduced) return;
    const t = window.setInterval(() => setTick((n) => n + 1), 1000);
    return () => window.clearInterval(t);
  }, [reduced]);
  const s = 45 + (tick % 15);
  const clock = s >= 59 ? '13:15' : `13:14:${String(s).padStart(2, '0')}`;

  return (
    <StageShell event={event} label="Starting soon">
      <div className="mx-auto flex max-w-[1480px] flex-col gap-8">
        <StageTitle
          event={event}
          badge={
            <span className="label inline-flex h-6 items-center rounded-full bg-white/10 px-2.5 font-bold text-white">
              Starting soon
            </span>
          }
        />
        <div className="relative grid aspect-[16/10] min-h-[320px] place-items-center overflow-hidden rounded-[24px] bg-white/[0.04] ring-1 ring-white/10 sm:aspect-video">
          <div
            className="flex flex-col items-center gap-6 px-6 text-center"
            role="status"
            aria-live="polite"
          >
            <div className="flex items-end gap-[clamp(8px,2vw,20px)]" aria-hidden="true">
              {CAST.map((shape, i) => (
                <span
                  key={shape}
                  className={i % 2 ? styles.sway : styles.hop}
                  style={{ '--delay': `${i * 0.18}s` } as CSSProperties}
                >
                  <Character
                    shape={shape}
                    mood={i === 3 ? 'thinking' : 'idle'}
                    size="clamp(44px, 8vw, 96px)"
                    seed={i + 1}
                  />
                </span>
              ))}
            </div>
            <TickingDigits
              value={clock}
              className="text-[clamp(2.5rem,8vw,6rem)] font-bold text-white"
              label="Almost 13:15"
            />
            <div className="flex max-w-[36rem] flex-col gap-2">
              <p
                className="display text-[clamp(1.375rem,3vw,2.25rem)] text-white"
                style={{ fontVariationSettings: "'CASL' 0.8, 'MONO' 0" }}
              >
                {preview ? 'Mics are on. Going live any second.' : 'We are setting up the mics.'}
              </p>
              <p className="text-ink-inverse/70">
                The stream starts right here. No refresh needed, we will swap it in the moment it
                goes live.
              </p>
            </div>
          </div>
          <ZemiMark
            variant="loading"
            size={28}
            decorative
            tone="paper"
            className="absolute bottom-5 right-5 opacity-60"
          />
        </div>
      </div>
    </StageShell>
  );
}

/* ------------------------------------------------------------------ ended */

export function EndedStage({ event }: { event: EventDetail }) {
  const ready = event.recordings.length > 0;
  return (
    <StageShell event={event} label="Stream ended">
      <div className="mx-auto flex max-w-[1480px] flex-col gap-8">
        <StageTitle
          event={event}
          badge={
            <span className="label inline-flex h-6 items-center rounded-full bg-white/10 px-2.5 font-bold text-white">
              {ready ? 'Recording is up' : 'Stream ended'}
            </span>
          }
        />
        {ready ? (
          <Recordings event={event} />
        ) : (
          <div className="grid min-h-[280px] place-items-center rounded-[24px] bg-white/[0.04] px-6 py-14 text-center ring-1 ring-white/10 sm:aspect-[21/9]">
            <div className="flex flex-col items-center gap-5" role="status">
              <div className="flex items-end gap-3" aria-hidden="true">
                <Character shape="square" mood="sleepy" size={72} seed={2} />
                <Character shape="circle" mood="happy" size={56} seed={4} />
              </div>
              <p
                className="display text-[clamp(1.5rem,3.4vw,2.5rem)] text-white"
                style={{ fontVariationSettings: "'CASL' 0.8, 'MONO' 0" }}
              >
                Stream ended, the recording is on its way.
              </p>
              <p className="max-w-[34rem] text-ink-inverse/70">
                We are stitching it together. It lands on this page in a few minutes, and we will
                email everyone who signed up.
              </p>
              <ZemiMark variant="loading" size={32} decorative tone="paper" />
            </div>
          </div>
        )}
      </div>
    </StageShell>
  );
}

/* ------------------------------------------------------------------ in the room only */

export function InRoomStage({ event }: { event: EventDetail }) {
  const maps = mapsLink(event);
  return (
    <StageShell event={event} label="Happening now">
      <div className="mx-auto flex max-w-[1480px] flex-col gap-8">
        <StageTitle event={event} badge={<LiveBadge label="Happening now" />} />
        <div className="flex flex-col items-center gap-5 rounded-[24px] bg-white/[0.04] px-6 py-14 text-center ring-1 ring-white/10">
          <div className="flex items-end gap-3" aria-hidden="true">
            {CAST.map((shape, i) => (
              <span
                key={shape}
                className={styles.hop}
                style={{ '--delay': `${i * 0.2}s` } as CSSProperties}
              >
                <Character shape={shape} mood="happy" size={56} seed={i + 1} />
              </span>
            ))}
          </div>
          <p
            className="display text-[clamp(1.5rem,3.4vw,2.5rem)] text-white"
            style={{ fontVariationSettings: "'CASL' 0.8, 'MONO' 0" }}
          >
            Happening now in {event.venueFull?.name ?? 'the room'}.
          </p>
          <p className="max-w-[34rem] text-ink-inverse/70">
            This one is in the room only. Walk in, grab a coffee, find a seat.{' '}
            {event.roomNote ?? ''}
          </p>
          {maps ? (
            <Button href={maps} variant="paper" shape="triangle">
              Open in Maps
            </Button>
          ) : null}
        </div>
      </div>
    </StageShell>
  );
}
