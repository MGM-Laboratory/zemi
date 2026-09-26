'use client';

import { AnimatePresence, motion } from 'motion/react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import type { EventDetail, EventStatus, RegisterResult } from '@zemi/shared';
import { ZemiMark } from '@/components/brand/zemi-mark';
import { Reveal } from '@/components/motion/reveal';
import { SectionHeader } from '@/components/public/ui/section-header';
import { useLiveEvent } from '@/lib/hooks/use-live-event';
import { useEventStatus, useNow } from '@/lib/hooks/use-now';
import { cn } from '@/lib/utils';
import { RegisterSheet } from '../../register/register-sheet';
import { CoverFrame } from '../cover-frame';
import { accentVars, recordingPending, streamWentLiveThisFriday } from '../lib';
import { EventFacts } from './facts';
import { Gallery } from './gallery';
import { CancelledHero, OngoingInfo, PastHeader, ScheduledHero, type RegisterState } from './hero';
import { NextFriday } from './next-friday';
import { PrevNext } from './prev-next';
import { PublicationsSection } from './publications-section';
import { Recordings } from './recordings';
import { Rundown } from './rundown';
import { SpeakersSection } from './speakers-section';
import { EndedStage, InRoomStage, LiveStage, WaitingStage } from './stage';
import { EventStats } from './stats';
import { StickyCta } from './sticky-cta';
import { VenueCard } from './venue-card';

const HOUR = 3_600_000;

function About({ event, description }: { event: EventDetail; description: ReactNode }) {
  if (!description && !event.tags.length) return null;
  return (
    <section className="container-page" aria-labelledby="about-title">
      <div className="grid gap-10 lg:grid-cols-12">
        <div className="lg:col-span-4">
          <div className="flex flex-col gap-6 lg:sticky lg:top-[calc(var(--nav-h)+32px)]">
            <SectionHeader
              eyebrow="The plan"
              eyebrowShape="triangle"
              id="about-title"
              title="The details"
              size="m"
            />
            {event.tags.length ? (
              <ul className="flex flex-wrap gap-2" aria-label="Topics">
                {event.tags.map((t) => (
                  <li key={t}>
                    <Link
                      href={`/events?tag=${encodeURIComponent(t)}`}
                      className="inline-flex h-9 items-center gap-1.5 rounded-full border border-line-strong bg-white px-3.5 text-[0.9375rem] font-semibold text-ink-2 transition-[border-color,transform,color] duration-200 hover:border-ink hover:text-ink active:scale-[0.96]"
                    >
                      <span aria-hidden="true" className="text-ink-4">
                        #
                      </span>
                      {t}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
        {description ? (
          <Reveal className="min-w-0 lg:col-span-8" y={20}>
            {description}
          </Reveal>
        ) : null}
      </div>
    </section>
  );
}

function PendingRecording() {
  return (
    <div
      className="grid min-h-[260px] place-items-center rounded-[24px] bg-white/[0.04] px-6 py-12 text-center ring-1 ring-white/10"
      role="status"
    >
      <div className="flex flex-col items-center gap-4">
        <ZemiMark variant="loading" size={40} decorative tone="paper" />
        <p
          className="display text-[clamp(1.375rem,3vw,2.25rem)] text-white"
          style={{ fontVariationSettings: "'CASL' 0.8, 'MONO' 0" }}
        >
          Stream ended, the recording is on its way.
        </p>
        <p className="max-w-[34rem] text-ink-inverse/70">
          It shows up right here in a few minutes. This page checks on its own.
        </p>
      </div>
    </div>
  );
}

function NoRecording({ event }: { event: EventDetail }) {
  return (
    <div className="grid items-center gap-8 md:grid-cols-[minmax(0,300px)_minmax(0,1fr)] lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
      <div className="mx-auto w-[min(70vw,300px)] md:w-full">
        <CoverFrame
          cover={event.cover}
          accent={event.accent}
          sizes="(min-width: 768px) 360px, 70vw"
          rest={-2}
          priority
        />
      </div>
      <div className="flex flex-col gap-6">
        <p className="max-w-[36rem] text-body-l text-ink-inverse/80">
          {event.mode === 'offline'
            ? 'This one was in the room only, so there is no recording. The notes below are the next best thing.'
            : 'No recording for this one, the mics were feeling shy. The rundown and the people are all below.'}
        </p>
        <EventFacts event={event} tone="dark" compact />
      </div>
    </div>
  );
}

export interface EventExperienceProps {
  event: EventDetail;
  /** Server time of the render, so the countdown hydrates without a mismatch. */
  renderedAt: number;
  /** Server-rendered description (BlocksRenderer). */
  description: ReactNode;
}

/**
 * The event page. Status is recomputed on the client (ticking clock + live SSE), so it flips
 * from Coming up to Happening now to Wrapped without a reload, and the stage swaps itself.
 */
export function EventExperience({ event, renderedAt, description }: EventExperienceProps) {
  const router = useRouter();
  const clock = useNow(30_000);
  const t = clock?.getTime() ?? renderedAt;
  const start = Date.parse(event.startsAt);
  const end = Date.parse(event.endsAt);
  const nearOn = t > start - 3 * HOUR && t < end + 3 * HOUR;
  const streamBusy = event.stream.state === 'live' || event.stream.state === 'preview';

  const live = useLiveEvent(event.id, {
    enabled: event.status !== 'cancelled' && (nearOn || streamBusy),
    initial: { stream: event.stream, status: event.status },
  });
  const stream = live.stream ?? event.stream;
  const status: EventStatus = useEventStatus(event, stream.state) ?? event.status;
  const minuteClock = useNow(15_000, status === 'ongoing');

  // Refetch server data when the status flips (registration window, recordings, counts).
  const prevStatus = useRef(status);
  useEffect(() => {
    if (prevStatus.current !== status) {
      prevStatus.current = status;
      router.refresh();
    }
  }, [status, router]);

  const pending =
    status !== 'scheduled' &&
    status !== 'cancelled' &&
    recordingPending(event, stream.state, stream.liveStartedAt, clock);
  useEffect(() => {
    if (!pending) return;
    const id = window.setInterval(() => router.refresh(), 45_000);
    return () => window.clearInterval(id);
  }, [pending, router]);

  const onStreamEnd = useCallback(() => {
    window.setTimeout(() => router.refresh(), 1500);
  }, [router]);

  // The live stage unmounts on the same SSE message that ends the stream, so the player may never
  // call onStreamEnd: refresh from here too whenever the stream state changes.
  const prevStream = useRef(stream.state);
  useEffect(() => {
    if (prevStream.current === stream.state) return;
    prevStream.current = stream.state;
    const t = window.setTimeout(() => router.refresh(), 1500);
    return () => window.clearTimeout(t);
  }, [stream.state, router]);

  /* ---------------------------------------------------------------- registration */
  const [spotsLeft, setSpotsLeft] = useState(event.registration.spotsLeft);
  // Fresh server data (router.refresh) resets the local seat count.
  const [serverSpots, setServerSpots] = useState(event.registration.spotsLeft);
  if (serverSpots !== event.registration.spotsLeft) {
    setServerSpots(event.registration.spotsLeft);
    setSpotsLeft(event.registration.spotsLeft);
  }
  const [registered, setRegistered] = useState<RegisterResult | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const ctaRef = useRef<HTMLDivElement>(null);

  const timeOpen = status === 'scheduled' || status === 'ongoing';
  const canRegister = event.registration.open && timeOpen && (spotsLeft == null || spotsLeft > 0);
  const reason = canRegister
    ? null
    : !timeOpen && status === 'past'
      ? "This one's a wrap, so sign ups are closed."
      : spotsLeft === 0 && event.registration.open
        ? event.mode === 'offline'
          ? 'Every seat is taken. Catch the next Friday?'
          : 'Every seat is taken, but the livestream has room for everyone.'
        : event.registration.reason;

  const setSheet = useCallback((open: boolean) => {
    setSheetOpen(open);
    try {
      const url = new URL(window.location.href);
      if (open) url.hash = 'register';
      else if (url.hash === '#register') url.hash = '';
      window.history.replaceState(window.history.state, '', url.toString());
    } catch {
      /* ignore */
    }
  }, []);

  // #register deep link (from emails, the home page and "Save my seat" links elsewhere).
  useEffect(() => {
    const sync = () => {
      if (window.location.hash === '#register') setSheetOpen(true);
    };
    sync();
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, []);

  const onRegistered = (r: RegisterResult) => {
    setRegistered(r);
    if (!r.existing) setSpotsLeft((s) => (s == null ? s : Math.max(0, s - 1)));
  };

  const reg: RegisterState = {
    canRegister: canRegister || !!registered,
    spotsLeft,
    reason,
    onRegister: () =>
      registered ? router.push(`/tickets/${registered.ticket.token}`) : setSheet(true),
    registered: !!registered,
  };

  /* ---------------------------------------------------------------- stage */
  let stage: ReactNode = null;
  if (status === 'ongoing') {
    if (stream.state === 'live')
      stage = <LiveStage event={event} stream={stream} onStreamEnd={onStreamEnd} />;
    // A stale `ended` from a rehearsal days before must not greet people with "Stream ended".
    else if (stream.state === 'ended' && streamWentLiveThisFriday(event, stream.liveStartedAt))
      stage = <EndedStage event={event} />;
    else if (event.mode === 'offline') stage = <InRoomStage event={event} />;
    else stage = <WaitingStage event={event} preview={stream.state === 'preview'} />;
  }
  const stageKey = status === 'ongoing' ? `ongoing-${stream.state}` : status;

  const sections =
    'flex flex-col gap-[clamp(72px,12vh,160px)] pb-[var(--section-y)] pt-[clamp(56px,9vh,120px)]';
  const hasMedia = event.recordings.length > 0 || event.media.length > 0;

  return (
    <div style={accentVars(event.accent) as CSSProperties} data-event-status={status}>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={stageKey}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.35 }}
        >
          {status === 'scheduled' ? (
            <ScheduledHero
              event={event}
              status={status}
              renderedAt={renderedAt}
              reg={reg}
              ctaRef={ctaRef}
            />
          ) : status === 'ongoing' ? (
            stage
          ) : status === 'past' ? (
            <PastHeader event={event} hasMedia={hasMedia}>
              {event.recordings.length ? (
                <Recordings event={event} />
              ) : pending ? (
                <PendingRecording />
              ) : (
                <NoRecording event={event} />
              )}
            </PastHeader>
          ) : (
            <CancelledHero event={event} />
          )}
        </motion.div>
      </AnimatePresence>

      {status === 'scheduled' ? (
        <div className={cn(sections, 'pt-0')}>
          <SpeakersSection speakers={event.speakersFull} />
          <About event={event} description={description} />
          <Rundown items={event.rundown} startsAt={event.startsAt} />
          <PublicationsSection publications={event.publications} />
          <VenueCard event={event} />
          <PrevNext prev={event.prev} next={event.next} />
        </div>
      ) : status === 'ongoing' ? (
        <div className={sections}>
          <OngoingInfo event={event} reg={reg} ctaRef={ctaRef} />
          <Rundown items={event.rundown} startsAt={event.startsAt} now={minuteClock} live />
          <SpeakersSection speakers={event.speakersFull} />
          <About event={event} description={description} />
          <PublicationsSection publications={event.publications} />
          <VenueCard event={event} />
          <PrevNext prev={event.prev} next={event.next} />
        </div>
      ) : status === 'past' ? (
        <div className={sections}>
          <Gallery media={event.media} />
          <EventStats event={event} />
          <SpeakersSection speakers={event.speakersFull} past title="Who talked" />
          <Rundown items={event.rundown} startsAt={event.startsAt} past />
          <About event={event} description={description} />
          <PublicationsSection publications={event.publications} />
          <NextFriday exclude={event.slug} />
          <PrevNext prev={event.prev} next={event.next} />
        </div>
      ) : (
        <div className={cn(sections, 'pt-0')}>
          <SpeakersSection
            speakers={event.speakersFull}
            title="Who was going to talk"
            eyebrow="On hold"
            description="The talks are not lost. Their pages show it when one lands on a new Friday."
          />
          <NextFriday exclude={event.slug} />
          <PrevNext prev={event.prev} next={event.next} />
        </div>
      )}

      {canRegister && !registered ? (
        <StickyCta
          // Remount on a status flip: the CTA it watches moves from the hero to the ongoing card.
          key={status}
          target={ctaRef}
          onRegister={() => setSheet(true)}
          label="Save my seat"
          sub={
            spotsLeft != null && spotsLeft <= 20
              ? `${spotsLeft} seats left`
              : status === 'ongoing'
                ? 'Happening now'
                : 'Free. 20 seconds.'
          }
          hidden={sheetOpen}
        />
      ) : null}

      <RegisterSheet
        event={event}
        open={sheetOpen}
        onOpenChange={setSheet}
        canRegister={canRegister}
        closedReason={reason}
        spotsLeft={spotsLeft}
        onRegistered={onRegistered}
      />
      <span className="sr-only" aria-live="polite">
        {status === 'ongoing' && stream.state === 'live' ? 'The livestream is on.' : ''}
      </span>
    </div>
  );
}
