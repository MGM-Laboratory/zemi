'use client';

import { useRef, useState } from 'react';
import type { EventCard, ShapeName } from '@zemi/shared';
import { Character, type CharacterHandle } from '@/components/brand/character';
import { CaslHeading } from '@/components/motion/casl-heading';
import { gsap, useGSAP } from '@/components/motion/gsap';
import { Button } from '@/components/public/ui/button';
import { cn } from '@/lib/utils';
import { BeatStamp } from './beat-stamp';
import styles from './closing.module.css';
import { MQ, pinEnd } from './motion-config';
import type { StoryBeat } from './types';

/** Bottom to top: the order the colors pour in, and how high each settles (share of the screen). */
const WAVES: Array<{ shape: ShapeName; color: string; rest: number }> = [
  { shape: 'circle', color: 'var(--color-blue, #3a6dc5)', rest: 0.28 },
  { shape: 'triangle', color: 'var(--color-red, #f94141)', rest: 0.21 },
  { shape: 'square', color: 'var(--color-yellow, #f7bf33)', rest: 0.14 },
  { shape: 'arch', color: 'var(--color-green, #0f8657)', rest: 0.07 },
];

/**
 * Scale the drink so the top wave settles just under the copy: tall tablets get a taller drink,
 * phones with long copy a shorter one.
 */
function restScale(section: HTMLElement, content: HTMLElement | null): number {
  const h = section.offsetHeight || window.innerHeight;
  if (!content || !h) return 1;
  const bottom = content.offsetTop + content.offsetHeight;
  const free = (h - bottom) / h - 0.035;
  return Math.min(1.7, Math.max(0.55, free / WAVES[0]!.rest));
}

function WaveEdge({ color }: { color: string }) {
  // Two identical periods side by side so a -50% slide loops seamlessly.
  const d =
    'M0 40 C 60 10, 140 10, 200 40 S 340 70, 400 40 S 540 10, 600 40 S 740 70, 800 40 V 80 H 0 Z';
  return (
    <svg className={styles.edge} viewBox="0 0 800 80" preserveAspectRatio="none" aria-hidden="true">
      <path d={d} fill={color} />
    </svg>
  );
}

/**
 * 15:15, see you next Friday. The four colors pour up like a layered drink, each character riding
 * its own wave, then the ink floods in and hands the page to the footer. The Friday clock hits
 * 15:15 at the end of this pin, celebrates, and rewinds for next week.
 */
export function Closing({ beat, next }: { beat: StoryBeat; next: EventCard | null }) {
  const root = useRef<HTMLElement>(null);
  const riders = useRef<Array<CharacterHandle | null>>([]);
  const [flooded, setFlooded] = useState(false);
  const floodedRef = useRef(false);

  useGSAP(
    () => {
      const el = root.current;
      if (!el) return;
      const mm = gsap.matchMedia();
      mm.add(MQ, (ctx) => {
        const c = ctx.conditions as Record<string, boolean>;
        const layers = gsap.utils.toArray<HTMLElement>('[data-wave]', el);
        const content = el.querySelector<HTMLElement>('[data-closing-copy]');
        const ink = el.querySelector<HTMLElement>('[data-ink]');
        if (c.reduced) {
          const k = restScale(el, content);
          layers.forEach((l, i) => gsap.set(l, { y: 0, yPercent: (1 - WAVES[i]!.rest * k) * 100 }));
          if (ink) gsap.set(ink, { y: 0, yPercent: 100 });
          return;
        }
        const end = pinEnd(c, 1.6, 1.0);
        const setFlood = (on: boolean) => {
          if (floodedRef.current === on) return;
          floodedRef.current = on;
          setFlooded(on);
          if (on) el.setAttribute('data-nav-theme', 'dark');
          else el.removeAttribute('data-nav-theme');
          if (on) riders.current.forEach((r, i) => setTimeout(() => r?.cheer(), i * 90));
        };
        const tl = gsap.timeline({
          defaults: { ease: 'none' },
          scrollTrigger: {
            trigger: el,
            start: end ? 'top top' : 'top 60%',
            end: end ?? 'bottom 40%',
            pin: !!end,
            scrub: 0.8,
            onUpdate: (self) => setFlood(self.progress > 0.78),
          },
        });
        const k = restScale(el, content);
        layers.forEach((l, i) => {
          tl.fromTo(
            l,
            { y: 0, yPercent: 100 },
            { y: 0, yPercent: (1 - WAVES[i]!.rest * k) * 100, duration: 0.3, ease: 'power2.out' },
            i * 0.1,
          );
        });
        if (ink)
          tl.fromTo(
            ink,
            { y: 0, yPercent: 100 },
            { y: 0, yPercent: 0, duration: 0.34, ease: 'power2.inOut' },
            0.58,
          );
        tl.to({}, { duration: 0.1 });
      });
      return () => mm.revert();
    },
    { scope: root },
  );

  const nextHref = next ? `/events/${next.slug}#register` : '/events';

  return (
    <>
      <section
        ref={root}
        className={cn(styles.closing, flooded && styles.flooded)}
        data-story-time="15:05"
        aria-labelledby="closing-title"
      >
        <div className={styles.pool} aria-hidden="true">
          {WAVES.map((w, i) => (
            <div
              key={w.shape}
              className={styles.wave}
              style={{
                zIndex: i + 1,
                ['--wave' as string]: w.color,
                ['--rest' as string]: w.rest,
                ['--speed' as string]: `${7 + i * 1.7}s`,
              }}
              data-wave=""
            >
              <WaveEdge color={w.color} />
              <div className={styles.rider} style={{ left: `${14 + i * 22}%` }}>
                <Character
                  ref={(h) => void (riders.current[i] = h)}
                  shape={w.shape}
                  size="clamp(48px, 6vw, 96px)"
                  seed={i + 20}
                  mood={flooded ? 'happy' : 'idle'}
                />
              </div>
            </div>
          ))}
          <div
            className={cn(styles.wave, styles.ink)}
            style={{
              zIndex: 9,
              ['--wave' as string]: 'var(--color-surface-inverse, #0e1116)',
              ['--speed' as string]: '9s',
            }}
            data-ink=""
          >
            <WaveEdge color="var(--color-surface-inverse, #0e1116)" />
          </div>
        </div>

        <div className={cn('container-page', styles.content)} data-closing-copy="">
          <BeatStamp time={beat.time} label="see you next week" inverse={flooded} />
          <CaslHeading as="h2" id="closing-title" size="xl" reveal className={styles.title}>
            {beat.title}
          </CaslHeading>
          <p className={styles.body}>{beat.body}</p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Button
              href={nextHref}
              size="lg"
              variant={flooded ? 'paper' : 'primary'}
              cursor="register"
            >
              Save me a seat
            </Button>
            <Button
              href="/events?when=past"
              size="lg"
              variant={flooded ? 'outlinePaper' : 'secondary'}
              shape="arch"
            >
              Catch up on past Fridays
            </Button>
          </div>
        </div>
      </section>
      {/* The clock reads 15:15 when this marker reaches the bottom of the screen: the end of the pin. */}
      <div
        aria-hidden="true"
        data-story-time="15:15"
        data-story-at="end"
        className={styles.endMark}
      />
    </>
  );
}
