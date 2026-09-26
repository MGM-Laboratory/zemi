'use client';

import Link from 'next/link';
import type { EventCard } from '@zemi/shared';
import { Character } from '@/components/brand/character';
import { Marquee } from '@/components/motion/marquee';
import { ZemiImage } from '@/components/public/media/zemi-image';
import { Button } from '@/components/public/ui/button';
import { LiveBadge } from '@/components/public/ui/chip';
import { cn } from '@/lib/utils';
import { accentVars, eventLabel, whenLine } from '../lib';

/** LIVE NOW hero strip: whatever is on air (or in the room) right now. */
export function LiveStrip({ events, className }: { events: EventCard[]; className?: string }) {
  const e = events[0];
  if (!e) return null;
  const streaming = e.isLive;
  return (
    <section
      className={cn(
        'relative isolate overflow-hidden bg-surface-inverse py-[clamp(28px,5vw,56px)] text-ink-inverse',
        className,
      )}
      data-nav-theme="dark"
      aria-labelledby="live-strip-title"
      style={accentVars(e.accent)}
    >
      <div
        className="pointer-events-none absolute inset-x-0 top-1/2 -z-10 -translate-y-1/2 opacity-[0.07]"
        aria-hidden="true"
      >
        <Marquee speed={40} reactToScroll gap="3rem">
          <span className="display whitespace-nowrap text-[clamp(5rem,14vw,12rem)] text-white">
            LIVE NOW · HAPPENING NOW ·
          </span>
        </Marquee>
      </div>
      <div className="container-page grid items-center gap-6 md:grid-cols-[auto_minmax(0,1fr)_auto]">
        <Link
          href={`/events/${e.slug}`}
          className="hidden w-[112px] rotate-[-4deg] rounded-[18px] bg-[var(--accent)] p-1.5 transition-transform duration-500 hover:rotate-0 md:block"
          tabIndex={-1}
          aria-hidden="true"
        >
          <ZemiImage image={e.cover} aspect="4/5" sizes="112px" className="rounded-[13px]" alt="" />
        </Link>
        <div className="flex min-w-0 flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <LiveBadge label={streaming ? 'Live now' : 'Happening now'} />
            <span className="label text-ink-inverse/60">
              {eventLabel(e)} · {whenLine(e)}
            </span>
          </div>
          <h2
            id="live-strip-title"
            className="display text-[clamp(1.75rem,4vw,3.25rem)] leading-[0.98] text-white"
            style={{ fontVariationSettings: "'CASL' 0.5, 'MONO' 0" }}
          >
            {e.title}
          </h2>
          <p className="text-ink-inverse/70">
            {streaming
              ? 'The stream is on right now. Pull up a chair, virtually.'
              : `Happening in ${e.venue?.name ?? 'the room'} right now. Pop in, or follow along on the page.`}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <span className="hidden sm:block" aria-hidden="true">
            <Character shape="circle" mood="surprised" size={64} seed={2} />
          </span>
          <Button
            href={`/events/${e.slug}`}
            variant="paper"
            size="lg"
            cursor="play"
            shape="triangle"
          >
            {streaming ? 'Watch now' : 'Take me there'}
          </Button>
        </div>
      </div>
      {events.length > 1 ? (
        <div className="container-page mt-4">
          <p className="text-[0.9375rem] text-ink-inverse/60">
            Also on:{' '}
            {events.slice(1).map((x, i) => (
              <span key={x.id}>
                {i ? ', ' : ''}
                <Link
                  href={`/events/${x.slug}`}
                  className="font-bold text-white underline underline-offset-2"
                >
                  {x.title}
                </Link>
              </span>
            ))}
          </p>
        </div>
      ) : null}
    </section>
  );
}
