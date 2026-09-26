'use client';

import { useRef, useState } from 'react';
import type { ShapeName } from '@zemi/shared';
import { Character, type CharacterHandle } from '@/components/brand/character';
import { CaslHeading } from '@/components/motion/casl-heading';
import { gsap, useGSAP } from '@/components/motion/gsap';
import { shapeConfetti } from '@/components/motion/shape-confetti';
import { cn } from '@/lib/utils';
import { BeatStamp } from '../beat-stamp';
import type { StoryScene } from '../types';
import styles from './same-table.module.css';

interface Who {
  key: string;
  role: string;
  shape: ShapeName;
  tagline: string;
  brings: string;
  asks: string;
  power: string;
}

const PEOPLE: Who[] = [
  {
    key: 'masters',
    role: 'Master’s',
    shape: 'triangle',
    tagline: 'Year one or two. Big energy.',
    brings: 'A hunch and forty open tabs.',
    asks: '“Wait, is that dataset public?”',
    power: 'Makes the demo work at 3am.',
  },
  {
    key: 'phd',
    role: 'PhD',
    shape: 'square',
    tagline: 'Knows one thing extremely well.',
    brings: 'Three years of data and one very specific plot.',
    asks: '“What is your baseline?”',
    power: 'Explains the thesis in one breath. Mostly.',
  },
  {
    key: 'undergrad',
    role: 'Undergrad',
    shape: 'circle',
    tagline: 'Here to see how research really works.',
    brings: 'Fresh eyes and zero fear.',
    asks: '“Why does it have to be that way?”',
    power: 'The question everyone else forgot to ask.',
  },
];

const REST = [-6, 1.5, 7];

/**
 * 14:00, Master's, PhD, undergrad, same table. Three cards dealt onto the table as you scroll;
 * hover or tap flips them to see who you will meet. Flip all three and Bridge cheers.
 */
export function SameTableBeat({ scene }: { scene: StoryScene }) {
  const root = useRef<HTMLElement>(null);
  const bridge = useRef<CharacterHandle>(null);
  const [flipped, setFlipped] = useState<Record<string, boolean>>({});
  const [met, setMet] = useState<Set<string>>(() => new Set());
  const all = met.size === PEOPLE.length;

  useGSAP(
    () => {
      const el = root.current;
      if (!el) return;
      const mm = gsap.matchMedia();
      mm.add(
        {
          pin: '(min-width: 900px) and (min-height: 700px) and (prefers-reduced-motion: no-preference)',
          flow: '(max-width: 899.98px) and (prefers-reduced-motion: no-preference), (max-height: 699.98px) and (prefers-reduced-motion: no-preference)',
        },
        (ctx) => {
          const c = ctx.conditions as Record<string, boolean>;
          const cards = gsap.utils.toArray<HTMLElement>('[data-deal]', el);
          if (c.pin) {
            const tl = gsap.timeline({
              scrollTrigger: {
                trigger: el,
                start: 'top top',
                end: '+=110%',
                pin: true,
                scrub: 0.7,
              },
            });
            tl.fromTo(
              cards,
              {
                xPercent: (i) => (1 - i) * 100,
                y: 160,
                rotation: (i) => [-18, 10, 24][i] ?? 0,
                opacity: 0,
              },
              {
                xPercent: 0,
                y: 0,
                rotation: 0,
                opacity: 1,
                stagger: 0.12,
                duration: 0.5,
                ease: 'back.out(1.6)',
              },
            );
            tl.to({}, { duration: 0.35 });
          } else if (c.flow) {
            gsap.fromTo(
              cards,
              { y: 90, rotation: (i) => [-10, 6, 12][i] ?? 0, opacity: 0 },
              {
                y: 0,
                rotation: 0,
                opacity: 1,
                stagger: 0.12,
                duration: 0.9,
                ease: 'back.out(1.5)',
                scrollTrigger: { trigger: cards[0], start: 'top 85%', once: true },
              },
            );
          }
        },
      );
      return () => mm.revert();
    },
    { scope: root },
  );

  const toggle = (key: string, value?: boolean) => {
    setFlipped((f) => ({ ...f, [key]: value ?? !f[key] }));
    setMet((m) => {
      if (m.has(key)) return m;
      const next = new Set(m).add(key);
      if (next.size === PEOPLE.length) {
        setTimeout(() => {
          bridge.current?.cheer();
          void shapeConfetti({
            from: document.getElementById(`${scene.id}-bridge`),
            count: 48,
            spread: 60,
            startVelocity: 26,
          });
        }, 350);
      }
      return next;
    });
  };

  return (
    <section
      ref={root}
      id={scene.id}
      className={styles.table}
      data-story-time={scene.beat.time}
      aria-labelledby={`${scene.id}-title`}
    >
      <div className={cn('container-page', styles.layout)}>
        <div className={styles.copy}>
          <BeatStamp time={scene.beat.time} label={scene.clockLabel} />
          <CaslHeading
            id={`${scene.id}-title`}
            size="m"
            reveal
            className="mt-6 max-w-[14ch] text-ink"
          >
            {scene.beat.title}
          </CaslHeading>
          <p className="text-body-l mt-6 max-w-[30rem] text-ink-2">{scene.beat.body}</p>
          <div className={styles.bridgeNote}>
            <span id={`${scene.id}-bridge`} className="flex-none">
              <Character
                ref={bridge}
                shape="arch"
                size={56}
                seed={5}
                mood={all ? 'happy' : 'idle'}
              />
            </span>
            <p className="text-[0.9375rem] leading-snug text-ink-2" aria-live="polite">
              {all ? (
                <>
                  <strong className="text-ink">You met everyone.</strong> That makes you a regular.
                  Bridge is thrilled.
                </>
              ) : (
                <>
                  Flip a card to see who you will meet.{' '}
                  <span className="text-ink-3">
                    Plus lecturers, alumni, and whoever heard there was coffee.
                  </span>
                </>
              )}
            </p>
          </div>
        </div>

        <ul className={styles.hand} aria-label="Who you meet at Zemi">
          {PEOPLE.map((p, i) => {
            const isFlipped = !!flipped[p.key];
            return (
              <li key={p.key} data-deal="">
                <div
                  className={styles.slot}
                  style={{ ['--rest' as string]: `${REST[i]}deg`, ['--i' as string]: i }}
                >
                  <button
                    type="button"
                    className={cn(styles.card, styles[p.shape], isFlipped && styles.flipped)}
                    aria-pressed={isFlipped}
                    onClick={(e) => {
                      // A mouse already flipped it on hover; clicks come from touch and the keyboard.
                      if ((e.nativeEvent as PointerEvent).pointerType === 'mouse') return;
                      toggle(p.key);
                    }}
                    onPointerEnter={(e) => {
                      if (e.pointerType === 'mouse') toggle(p.key, true);
                    }}
                    onPointerLeave={(e) => {
                      if (e.pointerType === 'mouse') setFlipped((f) => ({ ...f, [p.key]: false }));
                    }}
                  >
                    <span className={styles.inner}>
                      <span className={cn(styles.face, styles.front)}>
                        <span className="label text-ink-3">Who you meet</span>
                        <span className={styles.character} aria-hidden="true">
                          <Character
                            shape={p.shape}
                            size="100%"
                            seed={i + 7}
                            mood={isFlipped ? 'happy' : 'idle'}
                          />
                        </span>
                        <span className={styles.role}>{p.role}</span>
                        <span className="mt-1 block text-[0.9375rem] leading-snug text-ink-2">
                          {p.tagline}
                        </span>
                      </span>
                      <span className={cn(styles.face, styles.back)}>
                        <span className={styles.roleBack}>{p.role}</span>
                        <span className={styles.facts}>
                          <span className={styles.fact}>
                            <span className={styles.factKey}>Brings</span>
                            {p.brings}
                          </span>
                          <span className={styles.fact}>
                            <span className={styles.factKey}>Asks</span>
                            {p.asks}
                          </span>
                          <span className={styles.fact}>
                            <span className={styles.factKey}>Superpower</span>
                            {p.power}
                          </span>
                        </span>
                      </span>
                    </span>
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
