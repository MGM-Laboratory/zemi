'use client';

import type { EventCard } from '@zemi/shared';
import { Character } from '@/components/brand/character';
import { CaslHeading } from '@/components/motion/casl-heading';
import { Reveal } from '@/components/motion/reveal';
import { ZemiImage } from '@/components/public/media/zemi-image';
import { useNextEvent } from '@/components/public/shell/site-context';
import { Button } from '@/components/public/ui/button';
import { cn } from '@/lib/utils';
import { accentVars, eventLabel, whenLine } from '../lib';

/**
 * "Next Friday" call to action. Uses the layout's next event; `exclude` hides it when it is
 * the page you're already on.
 */
export function NextFriday({
  exclude,
  title = 'Catch the next one.',
  className,
  fallback,
}: {
  exclude?: string;
  title?: string;
  className?: string;
  fallback?: EventCard | null;
}) {
  const layoutNext = useNextEvent();
  const next =
    layoutNext && layoutNext.slug !== exclude
      ? layoutNext
      : fallback && fallback.slug !== exclude
        ? fallback
        : null;

  return (
    <section className={cn('container-page', className)} aria-labelledby="next-friday-title">
      <Reveal>
        <div
          className="relative isolate overflow-hidden rounded-[28px] bg-[var(--accent-tint)] p-6 sm:p-10 lg:p-14"
          style={accentVars(next?.accent ?? 'yellow')}
        >
          <div className="grid items-center gap-8 lg:grid-cols-[minmax(0,1fr)_auto]">
            <div className="flex flex-col gap-5">
              <p className="label text-ink-2">
                {next ? `Next up · ${eventLabel(next)}` : 'Every Friday, 13:15 WIB'}
              </p>
              <CaslHeading as="h2" size="m" id="next-friday-title" className="text-ink">
                {next ? next.title : title}
              </CaslHeading>
              <p className="text-body-l text-ink-2">
                {next
                  ? whenLine(next)
                  : 'The next session is being planned. Peek at the archive while you wait.'}
              </p>
              <div className="flex flex-wrap gap-3">
                {next ? (
                  <>
                    <Button href={`/events/${next.slug}#register`} size="lg" cursor="register">
                      Save my seat
                    </Button>
                    <Button
                      href={`/events/${next.slug}`}
                      variant="secondary"
                      size="lg"
                      shape="circle"
                    >
                      What&apos;s on
                    </Button>
                  </>
                ) : (
                  <Button href="/events" variant="secondary" size="lg" shape="circle">
                    All Fridays
                  </Button>
                )}
              </div>
            </div>
            {next?.cover ? (
              <div className="hidden w-[min(22vw,260px)] rotate-3 rounded-[24px] bg-[var(--accent)] p-2 shadow-3 transition-transform duration-500 hover:rotate-0 lg:block">
                <ZemiImage
                  image={next.cover}
                  aspect="4/5"
                  sizes="260px"
                  className="rounded-[18px]"
                  alt=""
                />
              </div>
            ) : (
              <div className="hidden items-end gap-2 lg:flex" aria-hidden="true">
                <Character shape="circle" mood="happy" size={96} seed={1} />
                <Character shape="triangle" mood="idle" size={72} seed={2} />
              </div>
            )}
          </div>
        </div>
      </Reveal>
    </section>
  );
}
