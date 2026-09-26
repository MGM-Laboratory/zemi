'use client';

import { lazy, useRef } from 'react';
import type { EventCard, SiteSettings } from '@zemi/shared';
import { Character } from '@/components/brand/character';
import { useSiteReady } from '@/components/brand/site-loader';
import { CaslHeading } from '@/components/motion/casl-heading';
import { gsap, ScrollTrigger, useGSAP } from '@/components/motion/gsap';
import { HighlightSwipe } from '@/components/motion/highlight-swipe';
import { useLenis } from '@/components/motion/smooth-scroll';
import { Button } from '@/components/public/ui/button';
import { Eyebrow } from '@/components/public/ui/section-header';
import { SceneCanvas } from '@/components/three/scene-canvas';
import { cn } from '@/lib/utils';
import { BeatStamp } from '../beat-stamp';
import { MQ } from '../motion-config';
import type { StoryBeat } from '../types';
import styles from './hero.module.css';
import { NextMiniCard } from './next-mini-card';

const HeroScene = lazy(() => import('./hero-scene'));

export interface HeroProps {
  home: SiteSettings['home'];
  doors: StoryBeat;
  next: EventCard | null;
  /** Where "What happens here?" scrolls to. */
  storyId: string;
  /** The API is down: the mini card says so instead of "nothing booked". */
  offline?: boolean;
}

/** Split into sentences so the last one can get the highlighter. */
function sentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+/).filter(Boolean);
}

/**
 * 13:15, doors open. Full-viewport clay scene, the giant title, the next Friday ticket.
 */
export function Hero({ home, doors, next, storyId, offline }: HeroProps) {
  const root = useRef<HTMLElement>(null);
  const scroll = useRef({ p: 0 });
  const ready = useSiteReady();
  const lenis = useLenis();

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add({ long: MQ.long, short: MQ.short, flow: MQ.flow }, (ctx) => {
        const c = ctx.conditions as Record<string, boolean>;
        if (!c.long && !c.short && !c.flow) return;
        const trigger: ScrollTrigger.Vars = {
          trigger: root.current,
          start: 'top top',
          end: 'bottom top',
          scrub: true,
          onUpdate: (self) => {
            scroll.current.p = self.progress;
          },
        };
        // Laptops: the hero fits the screen, so the copy drifts up and fades as it leaves.
        // Phones and tablets: the copy is taller than the screen and still being read, keep it solid.
        if (c.long)
          gsap.to('[data-hero-parallax]', {
            yPercent: -18,
            opacity: 0.2,
            ease: 'none',
            scrollTrigger: trigger,
          });
        else ScrollTrigger.create(trigger);
      });
      return () => mm.revert();
    },
    { scope: root },
  );

  const goStory = () => {
    const el = document.getElementById(storyId);
    if (!el) return;
    if (lenis) lenis.scrollTo(el, { offset: 0, duration: 1.4 });
    else el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    // Move focus with the scroll so keyboard users land in the story too.
    el.querySelector<HTMLElement>('h2')?.setAttribute('tabindex', '-1');
    el.querySelector<HTMLElement>('h2')?.focus({ preventScroll: true });
  };

  const body = sentences(home.heroBody);
  const lead = body.slice(0, -1).join(' ');
  const last = body[body.length - 1] ?? '';
  const registerHref = next ? `/events/${next.slug}#register` : '/events';

  return (
    <section
      ref={root}
      className={styles.hero}
      aria-labelledby="home-hero-title"
      data-story-time="13:15"
      data-story-label="doors open"
    >
      <SceneCanvas
        className={styles.scene}
        camera={{ position: [0, 0.2, 16], fov: 28 }}
        studio={{ shadows: false }}
        dpr={[1, 1.75]}
        rootMargin="100% 0px"
        label="Q, Hunch, Block and Bridge, four clay shapes, float around and watch your cursor."
        fallback={
          <div className={styles.fallback} aria-hidden="true">
            <Character shape="circle" size="clamp(64px, 9vw, 150px)" seed={0} />
            <Character shape="triangle" size="clamp(64px, 9vw, 150px)" seed={1} />
            <Character shape="square" size="clamp(64px, 9vw, 150px)" seed={2} mood="thinking" />
            <Character shape="arch" size="clamp(64px, 9vw, 150px)" seed={3} />
          </div>
        }
      >
        <HeroScene scroll={scroll} ready={ready} />
      </SceneCanvas>

      <div className={cn('container-page', styles.content)} data-hero-parallax="">
        <div className={styles.main}>
          <Eyebrow shape="square" className="mb-5">
            {home.heroEyebrow}
          </Eyebrow>
          <CaslHeading
            as="h1"
            id="home-hero-title"
            size="xl"
            reveal={{ play: ready, stagger: 0.07 }}
            className={styles.title}
          >
            {home.heroTitle}
          </CaslHeading>
          <p className={cn('text-body-l max-w-[36rem] text-ink-2', styles.body)}>
            {lead ? `${lead} ` : null}
            <HighlightSwipe delay={900}>{last}</HighlightSwipe>
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Button href={registerHref} size="lg" cursor="register" className={styles.cta}>
              {home.heroPrimaryCta}
            </Button>
            <Button
              onClick={goStory}
              size="lg"
              variant="secondary"
              shape="arch"
              className={styles.cta}
              aria-controls={storyId}
            >
              {home.heroSecondaryCta}
            </Button>
          </div>
        </div>
        <aside className={styles.side} aria-label="The next Friday">
          <div className={styles.doors}>
            <BeatStamp time={doors.time} label="doors open" />
            <p className="text-[0.9375rem] leading-[1.5] text-ink-2">
              <strong className="font-bold text-ink">{doors.title}</strong> {doors.body}
            </p>
          </div>
          <NextMiniCard event={next} offline={offline} className={styles.miniSlot} />
        </aside>
      </div>

      <button
        type="button"
        className={cn(styles.cue, 'hidden lg:flex')}
        onClick={goStory}
        data-hero-parallax=""
      >
        <span className={styles.cueMouse} aria-hidden="true">
          <span />
        </span>
        <span className="label">Scroll to sit down</span>
      </button>
    </section>
  );
}
