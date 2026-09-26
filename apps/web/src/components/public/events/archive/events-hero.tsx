'use client';

import { formatJakarta } from '@zemi/shared';
import { Character } from '@/components/brand/character';
import { useSiteReady } from '@/components/brand/site-loader';
import { CaslHeading } from '@/components/motion/casl-heading';
import { CountUp } from '@/components/motion/count-up';
import { Eyebrow } from '@/components/public/ui/section-header';

export function EventsHero({
  total,
  recordings,
  firstAt,
}: {
  total: number;
  recordings: number;
  firstAt: string | null;
  renderedAt: number;
}) {
  const ready = useSiteReady();
  return (
    <section
      className="relative isolate overflow-clip pt-[calc(var(--nav-h)+clamp(28px,6vw,88px))]"
      aria-labelledby="events-title"
    >
      <div className="container-page grid items-end gap-8 lg:grid-cols-[minmax(0,1fr)_auto]">
        <div className="flex flex-col gap-6">
          <Eyebrow shape="circle">Every Friday · 13:15 to 15:15 WIB</Eyebrow>
          <CaslHeading
            as="h1"
            id="events-title"
            size="xl"
            reveal={{ play: ready }}
            className="text-ink"
          >
            The Friday archive
          </CaslHeading>
          <p className="max-w-[46rem] text-body-l text-ink-2">
            <span className="font-bold text-ink">
              <CountUp value={total} /> Fridays
            </span>{' '}
            wrapped{firstAt ? ` since ${formatJakarta(firstAt, 'month-year')}` : ''},{' '}
            <span className="font-bold text-ink">
              <CountUp value={recordings} /> recordings
            </span>{' '}
            to catch up on, and zero perfect slides. Scrub the ribbon, or dig through the covers
            below.
          </p>
        </div>
        <div className="hidden items-end gap-2 pb-2 lg:flex" aria-hidden="true">
          <Character shape="triangle" mood="thinking" size={88} seed={3} />
          <Character shape="square" mood="idle" size={112} seed={5} />
          <Character shape="circle" mood="happy" size={76} seed={7} />
        </div>
      </div>
    </section>
  );
}
