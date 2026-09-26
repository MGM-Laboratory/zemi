'use client';

import Link from 'next/link';
import { useRef } from 'react';
import { formatJakarta, formatTimeRange, type EventCard } from '@zemi/shared';
import { ShapeIcon } from '@/components/brand/shape-icon';
import { CaslHeading } from '@/components/motion/casl-heading';
import { gsap, useGSAP } from '@/components/motion/gsap';
import { ZemiImage } from '@/components/public/media/zemi-image';
import { Avatar } from '@/components/public/ui/avatar';
import { Button } from '@/components/public/ui/button';
import { StatusBadge } from '@/components/public/ui/chip';
import { ApiUnavailable, EmptyState } from '@/components/public/ui/empty-state';
import { Eyebrow } from '@/components/public/ui/section-header';
import { DistortImage } from '@/components/three/distort-image';
import { eventUrls } from '@/lib/api/client';
import { useEventStatus } from '@/lib/hooks/use-now';
import { cn } from '@/lib/utils';
import { Countdown } from './countdown';
import type { HomeData } from './types';
import styles from './up-next.module.css';

const MODE_LABEL = {
  hybrid: 'In the room and on the livestream',
  offline: 'In the room only',
  online: 'Livestream only',
} as const;

function Sticker({ event }: { event: EventCard }) {
  const text = `ZEMI ${event.number != null ? `#${event.number} ` : ''}· FRIDAY ${formatJakarta(event.startsAt, 'time')} · SAVE A SEAT · `;
  return (
    <span className={styles.sticker} aria-hidden="true">
      <svg viewBox="0 0 120 120">
        <defs>
          <path id="zemi-sticker-path" d="M60 60 m-44 0 a44 44 0 1 1 88 0 a44 44 0 1 1 -88 0" />
        </defs>
        <circle cx="60" cy="60" r="58" fill="#fff" />
        <text className={styles.stickerText}>
          <textPath href="#zemi-sticker-path" textLength="276">
            {text}
          </textPath>
        </text>
      </svg>
      <ShapeIcon shape="circle" size="34%" className={styles.stickerShape} />
    </span>
  );
}

function speakerLine(s: {
  role: string;
  organization: string | null;
  talkTitle?: string | null;
}): string {
  return s.talkTitle || s.organization || (s.role !== 'speaker' ? s.role : 'Speaker');
}

export interface UpNextProps {
  data: Pick<HomeData, 'featured' | 'featuredDetail' | 'next' | 'offline'>;
}

/**
 * "Up next": the featured Friday as a big 4:5 cover card (tilt, liquid hover, a spinning sticker),
 * speakers, when and where, spots left, countdown, register and add to calendar.
 */
export function UpNext({ data }: UpNextProps) {
  const { featured, featuredDetail, next, offline } = data;
  const root = useRef<HTMLElement>(null);
  const cover = useRef<HTMLDivElement>(null);
  const status = useEventStatus(featured);
  const live = status === 'ongoing';

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        if (cover.current) {
          gsap.fromTo(
            cover.current,
            { clipPath: 'inset(14% 10% 14% 10% round 32px)', scale: 1.06 },
            {
              clipPath: 'inset(0% 0% 0% 0% round 24px)',
              scale: 1,
              ease: 'none',
              scrollTrigger: {
                trigger: cover.current,
                start: 'top 95%',
                end: 'top 35%',
                scrub: 0.6,
              },
            },
          );
        }
        if (!root.current?.querySelector('[data-up-in]')) return;
        gsap.fromTo(
          '[data-up-in]',
          { y: 36, opacity: 0 },
          {
            y: 0,
            opacity: 1,
            stagger: 0.07,
            duration: 0.9,
            ease: 'expo.out',
            scrollTrigger: { trigger: root.current, start: 'top 60%', once: true },
          },
        );
      });
      return () => mm.revert();
    },
    { scope: root },
  );

  if (!featured) {
    return (
      <section
        id="up-next"
        ref={root}
        className={cn(styles.upNext, 'container-page')}
        aria-labelledby="up-next-title"
      >
        <Eyebrow shape="circle">Up next</Eyebrow>
        <h2 id="up-next-title" className="sr-only">
          Up next
        </h2>
        {offline ? (
          <ApiUnavailable what="the next Friday" className="py-20" />
        ) : (
          <EmptyState
            className="py-20"
            size="lg"
            shape="square"
            mood="sleepy"
            friend="circle"
            title="Nothing on the calendar yet."
            body="Fridays still happen at 13:15 WIB. The next one lands here first, usually a week or two ahead."
            action={
              <Button href="/events" variant="secondary" shape="circle">
                See past Fridays
              </Button>
            }
          />
        )}
      </section>
    );
  }

  const isNext = !next || next.id === featured.id;
  const reg = featuredDetail?.registration ?? null;
  const spotsLeft = reg?.spotsLeft ?? null;
  const capacity = featured.capacity ?? featuredDetail?.venueFull?.capacity ?? null;
  const taken =
    capacity != null && spotsLeft != null
      ? Math.max(0, capacity - spotsLeft)
      : featured.registrationCount;
  const fill = capacity && taken != null ? Math.min(1, taken / capacity) : null;
  const regOpen = reg ? reg.open : true;
  const speakers = featuredDetail?.speakersFull?.length
    ? featuredDetail.speakersFull
    : featured.speakers;
  const href = `/events/${featured.slug}`;
  const room = [featuredDetail?.venueFull?.name ?? featured.venue?.name, featuredDetail?.roomNote]
    .filter(Boolean)
    .join(', ');

  return (
    <section id="up-next" ref={root} className={styles.upNext} aria-labelledby="up-next-title">
      <div className="container-page">
        <div className={styles.head} data-up-in="">
          <Eyebrow shape={isNext ? 'circle' : 'triangle'}>
            {live ? 'Happening now' : isNext ? 'Up next' : 'Circle this one'}
            {featured.number != null ? ` · Zemi #${featured.number}` : ''}
          </Eyebrow>
          {!isNext && next ? (
            <Link href={`/events/${next.slug}`} className={styles.butFirst}>
              But first: {formatJakarta(next.startsAt, 'date-short')}, {next.title}
              <ShapeIcon shape="triangle" size="0.7em" style={{ rotate: '90deg' }} />
            </Link>
          ) : null}
        </div>

        <div className={styles.grid}>
          <div className={styles.coverCol}>
            <div className={cn(styles.cover, styles[`accent_${featured.accent}`])}>
              <div ref={cover} className={styles.clip}>
                <DistortImage className="size-full" strength={26}>
                  <Link
                    href={href}
                    className={styles.coverLink}
                    data-cursor={live ? 'play' : 'open'}
                    tabIndex={-1}
                    aria-hidden="true"
                  >
                    <ZemiImage
                      image={featured.cover}
                      aspect="4/5"
                      sizes="(min-width: 1024px) 40vw, 92vw"
                      className="size-full"
                      placeholderShape="square"
                      alt=""
                    />
                  </Link>
                </DistortImage>
              </div>
              <Sticker event={featured} />
              {live ? (
                <StatusBadge status="ongoing" size="md" className={styles.coverBadge} />
              ) : null}
            </div>
          </div>

          <div className={styles.info}>
            <p className={styles.date} data-up-in="">
              <time dateTime={featured.startsAt}>
                {formatJakarta(featured.startsAt, 'date-long')}
              </time>
            </p>
            <CaslHeading as="h2" id="up-next-title" size="l" className="mt-3 text-ink">
              <Link href={href} className={styles.titleLink}>
                {featured.title}
              </Link>
            </CaslHeading>
            {featured.summary ? (
              <p className="text-body-l mt-5 max-w-[38rem] text-ink-2" data-up-in="">
                {featured.summary}
              </p>
            ) : null}

            {speakers.length ? (
              <ul className={styles.speakers} data-up-in="" aria-label="Speakers">
                {speakers.slice(0, 4).map((s) => (
                  <li key={s.id}>
                    <Link href={`/speakers/${s.slug}`} className={styles.speaker}>
                      <Avatar name={s.fullName} image={s.avatar} size={52} />
                      <span className="min-w-0">
                        <span className="block truncate font-bold text-ink">{s.fullName}</span>
                        <span className="block truncate text-[0.875rem] text-ink-3">
                          {speakerLine(s)}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : null}

            <dl className={styles.facts} data-up-in="">
              <div>
                <dt className="label text-ink-3">When</dt>
                <dd className="mono mt-1.5 text-ink">
                  {formatTimeRange(featured.startsAt, featured.endsAt)}
                </dd>
              </div>
              <div>
                <dt className="label text-ink-3">Where</dt>
                <dd className="mt-1.5 text-ink">
                  {room || (featured.mode === 'online' ? 'Online' : 'Room coming soon')}
                </dd>
              </div>
              <div>
                <dt className="label text-ink-3">How</dt>
                <dd className="mt-1.5 text-ink">{MODE_LABEL[featured.mode] ?? 'Hybrid'}</dd>
              </div>
            </dl>

            {fill != null && regOpen && !live ? (
              <div className={styles.spots} data-up-in="">
                <div className="flex items-baseline justify-between gap-4">
                  <p className="font-bold text-ink">
                    {spotsLeft != null
                      ? spotsLeft > 0
                        ? `${spotsLeft.toLocaleString('en-US')} seats left`
                        : 'Full house'
                      : `${taken} saved`}
                  </p>
                  <p className="mono text-[0.8125rem] text-ink-3">
                    {taken?.toLocaleString('en-US')} of {capacity?.toLocaleString('en-US')} taken
                  </p>
                </div>
                <div
                  className={styles.bar}
                  role="img"
                  aria-label={`${Math.round(fill * 100)}% of seats taken`}
                >
                  <span style={{ width: `${Math.max(3, fill * 100)}%` }} />
                </div>
              </div>
            ) : null}

            <div className="mt-8" data-up-in="">
              {live ? (
                <p className="text-body-l font-bold text-red-600">
                  It started at {formatJakarta(featured.startsAt, 'time')} WIB. The door is open.
                </p>
              ) : (
                <Countdown to={featured.startsAt} variant="cells" />
              )}
            </div>

            <div className="mt-8 flex flex-wrap gap-3" data-up-in="">
              {live ? (
                <Button href={href} size="lg" variant="danger" cursor="play" shape="triangle">
                  Watch live
                </Button>
              ) : regOpen ? (
                <Button href={`${href}#register`} size="lg" cursor="register">
                  Save my seat
                </Button>
              ) : (
                <Button href={href} size="lg" variant="secondary" shape="circle">
                  See the details
                </Button>
              )}
              <Button
                href={eventUrls(featured.id).calendar}
                external={false}
                download
                size="lg"
                variant="secondary"
                shape="square"
              >
                Add to calendar
              </Button>
            </div>
            {!regOpen && reg?.reason && !live ? (
              <p className="mt-3 text-[0.9375rem] text-ink-3">{reg.reason}</p>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
