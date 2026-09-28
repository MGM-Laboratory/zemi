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

/** Who waves goodbye once the ink is in, left to right. */
const GOODBYE: ShapeName[] = ['circle', 'triangle', 'square', 'arch'];

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
 * The closing, see you next Friday. The four colors pour up like a layered drink, each character
 * riding its own wave, then the ink floods in and hands the page to the footer.
 *
 * - The heading and body blend with `difference`, so they stay readable while the ink passes
 *   behind them. The buttons and the stamp switch to their paper versions the moment the ink
 *   reaches them, not at a global threshold.
 * - The ink layer is marked `data-nav-theme="dark"`: the nav flips exactly when the ink reaches it.
 * - Once flooded, the four friends pop up at the bottom and wave (tap them).
 */
export function Closing({ beat, next, n }: { beat: StoryBeat; next: EventCard | null; n?: number }) {
  const root = useRef<HTMLElement>(null);
  const riders = useRef<Array<CharacterHandle | null>>([]);
  const friends = useRef<Array<CharacterHandle | null>>([]);
  const [flooded, setFlooded] = useState(false);
  const [inked, setInked] = useState({ stamp: false, actions: false });
  const floodedRef = useRef(false);
  const inkedRef = useRef({ stamp: false, actions: false });

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
        const stamp = el.querySelector<HTMLElement>('[data-closing-stamp]');
        const actions = el.querySelector<HTMLElement>('[data-closing-actions]');
        if (c.reduced) {
          const k = restScale(el, content);
          layers.forEach((l, i) => gsap.set(l, { y: 0, yPercent: (1 - WAVES[i]!.rest * k) * 100 }));
          if (ink) gsap.set(ink, { y: 0, yPercent: 100 });
          return;
        }
        const end = pinEnd(c, 1.6, 1.0);
        const goodbye = el.querySelector<HTMLElement>('[data-goodbye]');
        const setFlood = (on: boolean) => {
          if (floodedRef.current === on) return;
          floodedRef.current = on;
          setFlooded(on);
          // Once the waves are gone the copy settles into the middle of the dark screen, so tall
          // screens don't end on a big empty band between the buttons and the friends.
          if (content) {
            const free =
              el.offsetHeight - (content.offsetTop + content.offsetHeight) - (goodbye?.offsetHeight ?? 0);
            content.style.setProperty('--settle', on ? `${Math.max(0, Math.round(free * 0.42))}px` : '0px');
          }
          if (on) riders.current.forEach((r, i) => setTimeout(() => r?.cheer(), i * 90));
          if (on) friends.current.forEach((f, i) => setTimeout(() => f?.cheer(), 520 + i * 110));
        };
        // Flip each control when the ink's flat top passes its middle.
        const syncInk = () => {
          if (!ink) return;
          const top = ink.getBoundingClientRect().top;
          const covers = (node: HTMLElement | null) => {
            if (!node) return false;
            const r = node.getBoundingClientRect();
            return top < r.top + r.height * 0.5;
          };
          const next = { stamp: covers(stamp), actions: covers(actions) };
          const prev = inkedRef.current;
          if (next.stamp !== prev.stamp || next.actions !== prev.actions) {
            inkedRef.current = next;
            setInked(next);
          }
        };
        const tl = gsap.timeline({
          defaults: { ease: 'none' },
          scrollTrigger: {
            trigger: el,
            start: end ? 'top top' : 'top 60%',
            end: end ?? 'bottom 40%',
            pin: !!end,
            scrub: 0.8,
            onUpdate: (self) => setFlood(self.progress > 0.9),
          },
          onUpdate: syncInk,
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
    <section
      ref={root}
      className={cn(styles.closing, flooded && styles.flooded)}
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
          // The nav flips to paper tone exactly when this layer reaches it (see use-nav-theme).
          data-nav-theme="dark"
        >
          <WaveEdge color="var(--color-surface-inverse, #0e1116)" />
        </div>
      </div>

      {/* The story's last section. */}
      <div
        className={cn('container-page', styles.content)}
        data-closing-copy=""
      >
        <div data-closing-stamp="">
          <BeatStamp n={n} label="see you next week" inverse={inked.stamp} />
        </div>
        <CaslHeading as="h2" id="closing-title" size="xl" reveal className={styles.title}>
          {beat.title}
        </CaslHeading>
        <p className={styles.body}>{beat.body}</p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3" data-closing-actions="">
          <Button
            href={nextHref}
            size="lg"
            variant={inked.actions ? 'paper' : 'primary'}
            cursor="register"
          >
            Save me a seat
          </Button>
          <Button
            href="/events?when=past"
            size="lg"
            variant={inked.actions ? 'outlinePaper' : 'secondary'}
            shape="arch"
          >
            Catch up on past Fridays
          </Button>
        </div>
      </div>

      {/* Decorative: the four friends pop up and wave once the ink is in. Poke them. */}
      <ul className={styles.goodbye} aria-hidden="true" data-on={flooded ? 'true' : 'false'} data-goodbye="">
        {GOODBYE.map((shape, i) => (
          <li key={shape} className={styles.friend} style={{ ['--i' as string]: i }}>
            <Character
              ref={(h) => void (friends.current[i] = h)}
              shape={shape}
              size="clamp(56px, 7vw, 150px)"
              seed={i + 40}
              mood={flooded ? 'happy' : 'sleepy'}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
