'use client';

import type { CSSProperties, ReactNode, Ref } from 'react';
import { formatJakarta, type EventDetail, type EventStatus } from '@zemi/shared';
import { Character } from '@/components/brand/character';
import { ShapeIcon } from '@/components/brand/shape-icon';
import { useSiteReady } from '@/components/brand/site-loader';
import { CaslHeading } from '@/components/motion/casl-heading';
import { useNextEvent } from '@/components/public/shell/site-context';
import { Button } from '@/components/public/ui/button';
import { Chip, StatusBadge } from '@/components/public/ui/chip';
import { ShaderBackdrop } from '@/components/three/shader-backdrop';
import { useNow } from '@/lib/hooks/use-now';
import { cn } from '@/lib/utils';
import { CoverFrame } from '../cover-frame';
import styles from '../events.module.css';
import {
  ACCENT_FRIEND,
  ACCENT_HEX,
  ACCENT_SHAPE,
  ACCENT_TINT,
  accentVars,
  chipToneFix,
  eventLabel,
  relativeDay,
} from '../lib';
import { CalendarButton, ShareButton } from './actions';
import { Countdown } from './countdown';
import { EventFacts } from './facts';

export interface RegisterState {
  canRegister: boolean;
  spotsLeft: number | null;
  reason: string | null;
  onRegister: () => void;
  registered?: boolean;
}

function SeatsLine({ event, spotsLeft }: { event: EventDetail; spotsLeft: number | null }) {
  const count = event.registrationCount;
  if (spotsLeft != null && spotsLeft <= 10 && spotsLeft > 0)
    return (
      <p className="flex items-center gap-2 text-[0.9375rem] font-bold text-ink">
        <ShapeIcon shape="triangle" size="0.9em" />
        Only {spotsLeft} {spotsLeft === 1 ? 'seat' : 'seats'} left. Go go go.
      </p>
    );
  if (spotsLeft != null && spotsLeft > 0)
    return (
      <p className="text-[0.9375rem] text-ink-3">
        <span className="font-bold text-ink">{spotsLeft} seats left</span>
        {count ? `, ${count} people are coming` : ''}.
      </p>
    );
  if (count)
    return (
      <p className="text-[0.9375rem] text-ink-3">{count} people are coming. Room for one more?</p>
    );
  return <p className="text-[0.9375rem] text-ink-3">Free, and it takes 20 seconds.</p>;
}

/** Register button + seats line (or why sign ups are closed). */
export function RegisterCta({
  event,
  reg,
  ctaRef,
  size = 'lg',
  tone = 'light',
  happening = false,
}: {
  event: EventDetail;
  reg: RegisterState;
  /** The hero CTA (the sticky bar shows when it scrolls away). */
  ctaRef?: Ref<HTMLDivElement>;
  size?: 'md' | 'lg';
  tone?: 'light' | 'dark';
  /** The event is on right now (copy says "up top" instead of the start time). */
  happening?: boolean;
}) {
  if (!reg.canRegister) {
    return (
      <div
        ref={ctaRef}
        className={cn(
          'flex flex-col gap-2 rounded-[20px] p-4',
          tone === 'dark' ? 'bg-white/5' : 'bg-surface-muted',
        )}
      >
        <p className={cn('font-bold', tone === 'dark' ? 'text-white' : 'text-ink')}>
          {reg.reason ?? 'Sign ups are closed for this one.'}
        </p>
        {event.mode !== 'offline' ? (
          <p
            className={cn(
              'text-[0.9375rem]',
              tone === 'dark' ? 'text-ink-inverse/70' : 'text-ink-3',
            )}
          >
            {happening
              ? 'The livestream is right up top. No sign up needed to watch.'
              : `The livestream plays right here at ${formatJakarta(event.startsAt, 'time')} WIB. No sign up needed to watch.`}
          </p>
        ) : null}
      </div>
    );
  }
  return (
    <div ref={ctaRef} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <Button size={size} onClick={reg.onRegister} cursor="register" aria-haspopup="dialog">
          {reg.registered ? 'Show my seat' : 'Save my seat'}
        </Button>
      </div>
      <SeatsLine event={event} spotsLeft={reg.spotsLeft} />
    </div>
  );
}

function HeroChips({ event, status }: { event: EventDetail; status: EventStatus }) {
  const now = useNow(60_000);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <StatusBadge status={status} size="md" />
      <Chip tone="outline" size="md" mono>
        {eventLabel(event)}
      </Chip>
      {status === 'scheduled' && now ? (
        <Chip tone={event.accent} size="md" shape className={chipToneFix(event.accent)}>
          {relativeDay(event.startsAt, now)}
        </Chip>
      ) : null}
    </div>
  );
}

function Backdrop({ event }: { event: EventDetail }) {
  const a = ACCENT_HEX[event.accent];
  return (
    <>
      <ShaderBackdrop
        className="absolute inset-0 -z-20 size-full"
        colors={[
          a,
          ACCENT_TINT[event.accent],
          '#ffffff',
          event.accent === 'yellow' ? '#3a6dc5' : '#f7bf33',
        ]}
        intensity={0.28}
        grain={0.035}
      />
      <span
        className="absolute inset-x-0 bottom-0 -z-10 h-40 bg-gradient-to-b from-transparent to-white"
        aria-hidden="true"
      />
    </>
  );
}

/* ------------------------------------------------------------------ scheduled */

export function ScheduledHero({
  event,
  status,
  renderedAt,
  reg,
  ctaRef,
}: {
  event: EventDetail;
  status: EventStatus;
  renderedAt: number;
  reg: RegisterState;
  ctaRef?: Ref<HTMLDivElement>;
}) {
  const ready = useSiteReady();
  return (
    <section
      className="relative isolate overflow-clip pb-[clamp(56px,10vh,120px)] pt-[calc(var(--nav-h)+clamp(20px,5vw,64px))]"
      style={accentVars(event.accent) as CSSProperties}
      aria-labelledby="event-title"
    >
      <Backdrop event={event} />
      <div className="container-page grid gap-x-[clamp(28px,5vw,96px)] gap-y-8 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] md:items-center">
        <div className="flex flex-col gap-5 md:col-start-2 md:row-start-1">
          <HeroChips event={event} status={status} />
          <CaslHeading
            as="h1"
            id="event-title"
            size="l"
            reveal={{ play: ready }}
            className={cn('text-ink', event.title.length > 34 && 'text-[clamp(2.25rem,5vw,5rem)]')}
          >
            {event.title}
          </CaslHeading>
          {event.summary ? (
            <p className="max-w-[40rem] text-body-l text-ink-2">{event.summary}</p>
          ) : null}
        </div>

        <div className="md:col-start-2 md:row-start-2">
          {/* Phones: the button comes before the cover, so it is on screen without scrolling. */}
          <RegisterCta event={event} reg={reg} ctaRef={ctaRef} />
        </div>

        <div className="mx-auto w-[min(78vw,440px)] md:col-start-1 md:row-span-3 md:row-start-1 md:w-full md:max-w-[min(540px,calc((100svh-150px)*0.78))] md:sticky md:top-[calc(var(--nav-h)+24px)] md:self-start">
          {/* Not <Reveal>: its SSR opacity:0 kept the LCP cover hidden until hydration. */}
          <div className={styles.heroCoverIn}>
            <CoverFrame
              cover={event.cover}
              accent={event.accent}
              sizes="(min-width: 1024px) 36vw, 78vw"
              priority
              distort
              rest={-2.5}
              alt={event.cover?.alt ?? ''}
            >
              <span className={cn(styles.stamp, 'mono text-[0.875rem] font-bold')}>
                <ShapeIcon shape={ACCENT_SHAPE[event.accent]} size="0.9em" />
                {event.number != null ? `#${event.number}` : 'Zemi'}
              </span>
              <span className={styles.sticker} aria-hidden="true">
                <Character
                  shape={ACCENT_SHAPE[ACCENT_FRIEND[event.accent]]}
                  mood="happy"
                  size="clamp(52px, 7vw, 84px)"
                  seed={event.number ?? 3}
                />
              </span>
            </CoverFrame>
          </div>
        </div>

        <div className="flex flex-col gap-9 md:col-start-2 md:row-start-3 md:-mt-4">
          <div className="flex flex-wrap gap-2">
            <CalendarButton eventId={event.id} size="md" />
            <ShareButton
              title={event.title}
              text={event.summary ?? undefined}
              path={`/events/${event.slug}`}
            />
          </div>
          <EventFacts event={event} columns />
          {status === 'scheduled' ? (
            <Countdown
              startsAt={event.startsAt}
              renderedAt={renderedAt}
              className="max-w-[40rem]"
            />
          ) : null}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ ongoing info bar */

export function OngoingInfo({
  event,
  reg,
  ctaRef,
}: {
  event: EventDetail;
  reg: RegisterState;
  ctaRef?: Ref<HTMLDivElement>;
}) {
  return (
    <section
      className="container-page"
      aria-label="About this Friday"
      style={accentVars(event.accent) as CSSProperties}
    >
      <div className="grid grid-cols-1 gap-8 rounded-[28px] border border-line bg-white p-6 sm:p-9 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <div className="flex flex-col gap-4">
          <p className="label text-ink-3">
            Happening now · {formatJakarta(event.startsAt, 'date')}
          </p>
          {event.summary ? <p className="text-body-l text-ink">{event.summary}</p> : null}
          <EventFacts event={event} compact />
        </div>
        <div className="flex flex-col justify-between gap-6">
          {reg.canRegister ? (
            <div className="flex flex-col gap-3">
              <p
                className="display text-title text-ink"
                style={{ fontVariationSettings: "'CASL' 0.7, 'MONO' 0" }}
              >
                Coming over in person?
              </p>
              <p className="text-ink-2">
                There is still room. Save a seat and walk in, we will scan you at the door.
              </p>
              <RegisterCta event={event} reg={reg} size="md" ctaRef={ctaRef} />
            </div>
          ) : (
            <RegisterCta event={event} reg={reg} size="md" ctaRef={ctaRef} happening />
          )}
          <div className="flex flex-wrap gap-2">
            <ShareButton title={event.title} path={`/events/${event.slug}`} variant="secondary" />
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ past */

export function PastHeader({
  event,
  children,
  hasMedia,
}: {
  event: EventDetail;
  children?: ReactNode;
  hasMedia: boolean;
}) {
  const ready = useSiteReady();
  return (
    <section
      className={cn(
        styles.stage,
        'pb-[clamp(48px,9vh,112px)] pt-[calc(var(--nav-h)+clamp(24px,5vw,64px))]',
      )}
      data-nav-theme="dark"
      aria-labelledby="event-title"
      style={accentVars(event.accent) as CSSProperties}
    >
      <span className={styles.stageSpot} aria-hidden="true" />
      <div className="container-page flex flex-col gap-10">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div className="flex flex-col gap-5">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status="past" size="md" />
              <span className="label text-ink-inverse/60">
                {eventLabel(event)} · {formatJakarta(event.startsAt, 'date')}
              </span>
            </div>
            <p
              className="display text-[clamp(1.25rem,2.4vw,2rem)] text-yellow"
              style={{ fontVariationSettings: "'CASL' 1, 'MONO' 0", fontWeight: 800 }}
            >
              {hasMedia ? "You missed it, but here's everything." : "That's a wrap."}
            </p>
            <CaslHeading
              as="h1"
              id="event-title"
              size="m"
              reveal={{ play: ready }}
              className="max-w-[22ch] text-[clamp(2.25rem,5.2vw,4.75rem)] text-white"
            >
              {event.title}
            </CaslHeading>
            {event.summary ? (
              <p className="max-w-[44rem] text-body-l text-ink-inverse/75">{event.summary}</p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2 lg:justify-end">
            <ShareButton
              title={event.title}
              path={`/events/${event.slug}`}
              variant="outlinePaper"
            />
            {event.media.length ? (
              <Button href="#photos" variant="outlinePaper" shape="arch" data-transition="off">
                Photos
              </Button>
            ) : null}
          </div>
        </div>
        {children}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ cancelled */

export function CancelledHero({ event }: { event: EventDetail }) {
  const upcoming = useNextEvent();
  const next = upcoming && upcoming.slug !== event.slug ? upcoming : null;
  return (
    <section
      className="relative isolate overflow-clip pb-[clamp(56px,10vh,120px)] pt-[calc(var(--nav-h)+clamp(24px,5vw,72px))]"
      aria-labelledby="event-title"
      style={accentVars(event.accent) as CSSProperties}
    >
      <div className="container-page grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-center">
        <div className="flex min-w-0 flex-col gap-6">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status="cancelled" size="md" />
            <span className="label text-ink-3">
              {eventLabel(event)} · {formatJakarta(event.startsAt, 'date')}
            </span>
          </div>
          <h1
            id="event-title"
            className="display text-display-m text-ink"
            style={{ fontVariationSettings: "'CASL' 0.3, 'MONO' 0" }}
          >
            <span className="line-through decoration-red/70 decoration-[0.08em]">
              {event.title}
            </span>
          </h1>
          <div
            className="flex flex-col gap-3 rounded-[24px] border border-red/30 bg-red-50 p-5 sm:p-7"
            role="note"
          >
            <p
              className="display text-title text-ink"
              style={{ fontVariationSettings: "'CASL' 0.8, 'MONO' 0" }}
            >
              This Friday got cancelled. Sorry about that.
            </p>
            <p className="text-body-l text-ink-2">
              {event.cancelReason ??
                'Something came up and we had to call it off. Nobody is in trouble, promise.'}
            </p>
            <p className="text-[0.9375rem] text-ink-2">
              If you had a seat, it is released. Nothing else to do.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            {next ? (
              // No magnet: its inline-block wrapper sizes to the text, so a long title ran off phones.
              <Button
                href={`/events/${next.slug}`}
                size="lg"
                magnetic={false}
                className="max-w-full [&>span]:min-w-0 [&>span]:truncate"
                title={`Next Friday: ${next.title}`}
              >
                Next Friday: {next.title}
              </Button>
            ) : null}
            <Button href="/events" variant="secondary" size="lg" shape="circle">
              All Fridays
            </Button>
          </div>
        </div>
        <div className="flex items-end justify-center gap-3" aria-hidden="true">
          <Character shape="square" mood="sleepy" size="clamp(96px, 16vw, 180px)" seed={1} />
          <Character shape="circle" mood="sleepy" size="clamp(64px, 10vw, 120px)" seed={4} />
        </div>
      </div>
    </section>
  );
}
