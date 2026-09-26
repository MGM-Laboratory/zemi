'use client';

import { MapPin, MonitorPlay } from 'lucide-react';
import { formatJakarta, type EventDetail } from '@zemi/shared';
import { Character } from '@/components/brand/character';
import { Reveal } from '@/components/motion/reveal';
import { Button } from '@/components/public/ui/button';
import { Card } from '@/components/public/ui/card';
import { Eyebrow } from '@/components/public/ui/section-header';
import { cn } from '@/lib/utils';
import { mapsLink } from '../lib';

const KIND_LABEL: Record<string, string> = {
  classroom: 'Classroom',
  theater: 'Theater',
  lab: 'Lab',
  hall: 'Hall',
  online: 'Online',
  other: 'Room',
};

/** Where it happens: the room card with a maps button, plus how to join online. */
export function VenueCard({ event, className }: { event: EventDetail; className?: string }) {
  const v = event.venueFull;
  const maps = mapsLink(event);
  const inRoom = event.mode !== 'online' && (v || event.roomNote);
  const online = event.mode !== 'offline';
  if (!inRoom && !online) return null;

  return (
    <section className={cn('container-page', className)} aria-labelledby="venue-title">
      <h2 id="venue-title" className="sr-only">
        Getting there
      </h2>
      <div
        className={cn(
          'grid grid-cols-1 gap-[var(--gutter)]',
          inRoom && online && 'lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]',
        )}
      >
        {inRoom ? (
          <Reveal>
            <Card tinted accent={event.accent} className="h-full" maxTilt={3}>
              <div className="relative flex h-full flex-col gap-5 p-6 sm:p-9">
                {/* ink-2 on the accent tint: ink-3 is 4:1 on red-50. */}
                <Eyebrow shape="square" className="text-ink-2">
                  In the room
                </Eyebrow>
                <div className="flex flex-col gap-2">
                  <p
                    className="display text-[clamp(1.75rem,3.4vw,3rem)] text-ink"
                    style={{ fontVariationSettings: "'CASL' 0.4, 'MONO' 0" }}
                  >
                    {v?.name ?? 'On campus'}
                  </p>
                  <p className="text-ink-2">
                    {[
                      v ? KIND_LABEL[v.kind] : null,
                      v?.building,
                      v?.floor ? `Floor ${v.floor}` : null,
                      v?.capacity ? `${v.capacity} seats` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>
                {event.roomNote ? (
                  <p className="max-w-[36rem] text-body-l text-ink">{event.roomNote}</p>
                ) : null}
                {v?.address ? (
                  <p className="flex max-w-[36rem] items-start gap-2 text-[0.9375rem] text-ink-2">
                    <MapPin className="mt-0.5 size-4 flex-none" aria-hidden="true" />
                    {v.address}
                  </p>
                ) : null}
                {maps ? (
                  <div className="mt-auto pt-2">
                    <Button href={maps} variant="primary" shape="triangle" cursor="open">
                      Open in Maps
                    </Button>
                  </div>
                ) : null}
                <div
                  className="pointer-events-none absolute bottom-5 right-6 hidden sm:block"
                  aria-hidden="true"
                >
                  <Character shape="square" mood="happy" size={72} seed={7} />
                </div>
              </div>
            </Card>
          </Reveal>
        ) : null}
        {online ? (
          <Reveal delay={0.08}>
            <Card className="h-full bg-surface-inverse text-ink-inverse" maxTilt={3}>
              <div className="flex h-full flex-col gap-5 p-6 sm:p-9">
                <Eyebrow shape="circle" inverse>
                  Online
                </Eyebrow>
                <p
                  className="display text-[clamp(1.75rem,3.4vw,3rem)] text-white"
                  style={{ fontVariationSettings: "'CASL' 0.4, 'MONO' 0" }}
                >
                  Livestream, right here.
                </p>
                <p className="text-ink-inverse/75">
                  {event.onlineNote ??
                    `The stream plays on this page at ${formatJakarta(event.startsAt, 'time')} WIB. No app, no link hunting.`}
                </p>
                <p className="mt-auto flex items-center gap-2 text-[0.9375rem] text-ink-inverse/60">
                  <MonitorPlay className="size-4" aria-hidden="true" />
                  Missed it? The recording lands here afterwards.
                </p>
              </div>
            </Card>
          </Reveal>
        ) : null}
      </div>
    </section>
  );
}
