/**
 * TEMPORARY home. The home teammate replaces this with the 13:15 to 15:15 scroll story.
 * It only exists so `/` renders on top of the public foundation.
 */
import { formatJakarta, formatTimeRange, SHAPE_ORDER } from '@zemi/shared';
import { Character } from '@/components/brand/character';
import { CaslHeading } from '@/components/motion/casl-heading';
import { HighlightSwipe } from '@/components/motion/highlight-swipe';
import { Marquee } from '@/components/motion/marquee';
import { Reveal } from '@/components/motion/reveal';
import { ZemiImage } from '@/components/public/media/zemi-image';
import { Button } from '@/components/public/ui/button';
import { Card, CardLink } from '@/components/public/ui/card';
import { StatusBadge } from '@/components/public/ui/chip';
import { ApiUnavailable } from '@/components/public/ui/empty-state';
import { Eyebrow, SectionHeader } from '@/components/public/ui/section-header';
import { getNextEvent, getSiteOrDefaults } from '@/lib/api/server';

const TOPICS = ['Machine learning', 'Robotics', 'Networks', 'HCI', 'Bioinformatics', 'Security', 'Data viz', 'Education'];

export default async function HomePage() {
  const [site, next] = await Promise.all([getSiteOrDefaults(), getNextEvent()]);
  const home = site.settings.home;

  return (
    <>
      <section className="container-page relative flex min-h-[100svh] flex-col justify-end pb-[clamp(48px,10vh,120px)] pt-[calc(var(--nav-h)+48px)]">
        <div className="pointer-events-none absolute right-[var(--page-margin)] top-[calc(var(--nav-h)+4vh)] hidden gap-3 md:flex" aria-hidden="true">
          {SHAPE_ORDER.map((s, i) => (
            <Character key={s} shape={s} size="clamp(56px, 7vw, 120px)" seed={i} mood={i === 2 ? 'thinking' : 'idle'} />
          ))}
        </div>
        <Eyebrow shape="square">{home.heroEyebrow}</Eyebrow>
        <CaslHeading as="h1" size="xl" reveal className="mt-5 max-w-[14ch]">
          {home.heroTitle}
        </CaslHeading>
        <div className="mt-8 flex flex-col gap-8 md:flex-row md:items-end md:justify-between">
          <p className="text-body-l max-w-[36rem] text-ink-2">
            {home.heroBody.split('.')[0]}. <HighlightSwipe>Same table.</HighlightSwipe>
          </p>
          <div className="flex flex-wrap gap-3">
            <Button href={next ? `/events/${next.slug}` : '/events'} size="lg" cursor="register">
              {home.heroPrimaryCta}
            </Button>
            <Button href="/about" size="lg" variant="secondary" shape="arch">
              {home.heroSecondaryCta}
            </Button>
          </div>
        </div>
      </section>

      <section className="border-y border-line py-6" aria-label="Topics people bring">
        <Marquee label="Topics people bring" gap="2.5rem">
          {TOPICS.map((t, i) => (
            <span key={t} className="display flex items-center gap-10 text-[clamp(1.75rem,4vw,3.25rem)] text-ink">
              {t}
              <Character shape={SHAPE_ORDER[i % 4]!} size={36} track={false} interactive={false} seed={i} />
            </span>
          ))}
        </Marquee>
      </section>

      <section className="container-page py-[var(--section-y)]">
        <SectionHeader
          eyebrow="Coming up"
          title={next ? 'This Friday' : 'Next Friday'}
          action={<Button href="/events" variant="secondary" shape="circle">All Fridays</Button>}
        />
        <div className="mt-12">
          {next ? (
            <Reveal>
              <Card accent={next.accent} className="grid gap-6 p-4 sm:grid-cols-[minmax(0,220px)_1fr] sm:p-5">
                <ZemiImage image={next.cover} aspect="4/5" sizes="(min-width: 640px) 220px, 100vw" className="rounded-[20px]" />
                <div className="flex flex-col justify-center gap-3 p-2">
                  <StatusBadge status={next.status} />
                  <CardLink href={`/events/${next.slug}`} className="display text-title">
                    {next.title}
                  </CardLink>
                  <p className="mono text-ink-3">
                    {formatJakarta(next.startsAt, 'date')} · {formatTimeRange(next.startsAt, next.endsAt)}
                  </p>
                  {next.summary ? <p className="text-ink-2">{next.summary}</p> : null}
                </div>
              </Card>
            </Reveal>
          ) : site.isFallback ? (
            <ApiUnavailable what="the next Friday" />
          ) : (
            <p className="text-body-l text-ink-2">Nothing on the calendar yet. Fridays still happen at 13:15, so check back soon.</p>
          )}
        </div>
      </section>

      <section data-nav-theme="dark" className="bg-surface-inverse py-[var(--section-y)] text-ink-inverse">
        <div className="container-page grid gap-10 md:grid-cols-2 md:items-end">
          <CaslHeading size="l" className="text-white">
            Research is lonely. Fridays aren&apos;t.
          </CaslHeading>
          <p className="text-body-l max-w-[34rem] text-ink-inverse/75">
            Nobody expects slides to be perfect. Bring the messy version, we&apos;ll bring coffee and questions.
          </p>
        </div>
      </section>
    </>
  );
}
