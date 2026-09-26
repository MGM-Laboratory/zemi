'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Character, type CharacterHandle, type CharacterMood } from '@/components/brand/character';
import { CaslHeading } from '@/components/motion/casl-heading';
import { gsap, ScrollTrigger, useGSAP } from '@/components/motion/gsap';
import { pointer } from '@/lib/hooks/use-pointer';
import { prefersReducedMotion } from '@/lib/hooks/use-reduced-motion';
import { cn } from '@/lib/utils';
import { BeatStamp } from '../beat-stamp';
import { MQ, pinEnd } from '../motion-config';
import type { StoryScene } from '../types';
import styles from './lonely.module.css';

/** An empty stool, drawn in the dark. */
function Stool({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <svg
      viewBox="0 0 60 70"
      className={cn(styles.stool, className)}
      style={style}
      aria-hidden="true"
      focusable="false"
    >
      <ellipse cx="30" cy="12" rx="26" ry="9" fill="currentColor" />
      <rect x="4" y="12" width="52" height="6" rx="3" fill="currentColor" opacity="0.7" />
      <path
        d="M12 18 L7 68 M48 18 L53 68 M22 18 L20 68 M38 18 L40 68"
        stroke="currentColor"
        strokeWidth="3.2"
        strokeLinecap="round"
      />
      <path
        d="M10 48 H50"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
        opacity="0.8"
      />
    </svg>
  );
}

/** Q's laptop: a loss curve that refuses to converge. */
function Laptop() {
  return (
    <svg viewBox="0 0 120 80" className={styles.laptop} aria-hidden="true" focusable="false">
      <rect
        x="14"
        y="4"
        width="92"
        height="60"
        rx="6"
        fill="#1b2130"
        stroke="#39414f"
        strokeWidth="2"
      />
      <rect x="20" y="10" width="80" height="48" rx="3" fill="#0f1a2e" />
      <path
        className={styles.loss}
        d="M24 22 C34 48, 40 20, 50 40 S 64 18, 72 44 S 88 16, 96 36"
        fill="none"
        stroke="#f7bf33"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <path
        d="M24 52 H96"
        stroke="#3a6dc5"
        strokeOpacity="0.6"
        strokeWidth="1.4"
        strokeDasharray="3 4"
      />
      <path d="M4 66 H116 L110 76 H10 Z" fill="#2a303c" />
    </svg>
  );
}

const FRIENDS = [
  { shape: 'triangle', cls: 'friendA' },
  { shape: 'square', cls: 'friendB' },
  { shape: 'arch', cls: 'friendC' },
] as const;

/**
 * 13:20, research gets lonely. The only inverse section of the story: a dark room, one character
 * at a laptop, a spotlight that follows the cursor. Words light up as you scroll; then the lights
 * come on and the room was never empty.
 */
export function LonelyBeat({
  scene,
  kicker = 'Fridays aren’t.',
}: {
  scene: StoryScene;
  kicker?: string;
}) {
  const root = useRef<HTMLElement>(null);
  const qRef = useRef<HTMLDivElement>(null);
  const qChar = useRef<CharacterHandle>(null);
  const friendRefs = useRef<Array<CharacterHandle | null>>([]);
  const progress = useRef(0);
  const [mood, setMood] = useState<CharacterMood>('sleepy');
  const [lit, setLit] = useState(false);
  const words = scene.beat.body.split(/\s+/).filter(Boolean);

  useGSAP(
    () => {
      const el = root.current;
      if (!el) return;
      const mm = gsap.matchMedia();
      mm.add(MQ, (ctx) => {
        const c = ctx.conditions as Record<string, boolean>;
        const wordEls = gsap.utils.toArray<HTMLElement>('[data-word]', el);
        if (c.reduced) {
          progress.current = 1;
          el.style.setProperty('--lights', '1');
          return;
        }
        const end = pinEnd(c, 1.7, 1.0);
        const tl = gsap.timeline({
          defaults: { ease: 'none' },
          scrollTrigger: {
            trigger: el,
            start: end ? 'top top' : 'top 70%',
            end: end ?? 'bottom 30%',
            pin: !!end,
            scrub: 0.6,
            onUpdate: (self) => {
              progress.current = self.progress;
            },
          },
        });
        tl.fromTo(wordEls, { opacity: 0.14 }, { opacity: 1, stagger: 0.05, duration: 0.25 }, 0.02);
        tl.fromTo(
          '[data-kicker]',
          { yPercent: 110, opacity: 0 },
          { yPercent: 0, opacity: 1, duration: 0.12, ease: 'power3.out' },
          '>+0.04',
        );
        tl.fromTo(el, { '--lights': 0 }, { '--lights': 1, duration: 0.14 }, '<');
        tl.to({}, { duration: 0.12 });
      });
      return () => mm.revert();
    },
    { scope: root },
  );

  // Spotlight: follows the cursor on fine pointers, sweeps with the scroll on touch.
  useEffect(() => {
    const el = root.current;
    const q = qRef.current;
    if (!el || !q) return;
    const reduced = prefersReducedMotion();
    const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    const cur = { x: 0, y: 0, r: 0 };
    let raf = 0;
    let visible = false;
    let started = false;
    let lastMood: CharacterMood = 'sleepy';
    let wasLit = false;

    const frame = () => {
      raf = 0;
      if (!visible) return;
      const r = el.getBoundingClientRect();
      const qr = q.getBoundingClientRect();
      const qx = qr.left + qr.width / 2 - r.left;
      const qy = qr.top + qr.height * 0.55 - r.top;
      const p = progress.current;
      const radius = Math.max(150, Math.min(r.width, r.height) * 0.26);

      let tx: number;
      let ty: number;
      const ptr = pointer.get();
      const hasPointer =
        fine && ptr.active && ptr.type !== 'touch' && ptr.y >= r.top && ptr.y <= r.bottom;
      if (reduced) {
        tx = qx;
        ty = qy;
      } else if (hasPointer) {
        tx = ptr.x - r.left;
        ty = ptr.y - r.top;
      } else {
        // A lazy sweep across the room that lands on Q by the end of the words.
        const k = Math.min(1, p / 0.7);
        tx = r.width * (0.12 + 0.7 * k) + Math.sin(p * 9) * r.width * 0.06 * (1 - k);
        ty = r.height * (0.35 + Math.sin(p * 6) * 0.12) * (1 - k) + qy * k;
        tx = tx * (1 - k) + qx * k;
      }
      if (!started) {
        cur.x = tx;
        cur.y = ty;
        cur.r = radius;
        started = true;
      }
      const f = reduced ? 1 : 0.14;
      cur.x += (tx - cur.x) * f;
      cur.y += (ty - cur.y) * f;
      cur.r += (radius - cur.r) * 0.1;
      el.style.setProperty('--sx', `${cur.x.toFixed(1)}px`);
      el.style.setProperty('--sy', `${cur.y.toFixed(1)}px`);
      el.style.setProperty('--sr', `${cur.r.toFixed(1)}px`);

      const lights = p > 0.8;
      const d = Math.hypot(cur.x - qx, cur.y - qy);
      const next: CharacterMood =
        lights || reduced
          ? 'happy'
          : d < cur.r * 0.55
            ? 'surprised'
            : d < cur.r * 1.1
              ? 'idle'
              : 'sleepy';
      if (next !== lastMood) {
        if (next === 'surprised' && lastMood === 'sleepy') qChar.current?.squash();
        lastMood = next;
        setMood(next);
      }
      if (lights !== wasLit) {
        wasLit = lights;
        setLit(lights);
        if (lights && !reduced) {
          qChar.current?.cheer();
          friendRefs.current.forEach((h, i) => setTimeout(() => h?.cheer(), 180 + i * 110));
        }
      }
      raf = requestAnimationFrame(frame);
    };

    const io = new IntersectionObserver(([e]) => {
      visible = !!e?.isIntersecting;
      if (visible && !raf) raf = requestAnimationFrame(frame);
    });
    io.observe(el);
    const onRefresh = () => {
      started = false;
    };
    ScrollTrigger.addEventListener('refresh', onRefresh);
    return () => {
      io.disconnect();
      ScrollTrigger.removeEventListener('refresh', onRefresh);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <section
      ref={root}
      id={scene.id}
      className={cn(styles.lonely, lit && styles.isLit)}
      data-nav-theme="dark"
      data-story-time={scene.beat.time}
      aria-labelledby={`${scene.id}-title`}
    >
      {/* The room. Everything below the text layer is decorative. */}
      <div className={styles.room} aria-hidden="true">
        <div className={styles.floor} />
        <Stool className={styles.s1} />
        <Stool className={styles.s2} />
        <Stool className={styles.s3} />
        <Stool className={styles.s4} />
        <Stool className={styles.s5} />
        {FRIENDS.map((f, i) => (
          <div key={f.shape} className={cn(styles.friend, styles[f.cls])}>
            <Character
              ref={(h) => void (friendRefs.current[i] = h)}
              shape={f.shape}
              size="clamp(56px, 7vw, 116px)"
              seed={i + 3}
              mood={lit ? 'happy' : 'idle'}
            />
          </div>
        ))}
        <div ref={qRef} className={styles.q}>
          <Character
            ref={qChar}
            shape="circle"
            mood={mood}
            size="clamp(96px, 11vw, 188px)"
            seed={1}
          />
          <Laptop />
        </div>
      </div>
      <div className={styles.dark} aria-hidden="true" />
      <div className={styles.beam} aria-hidden="true" />

      <div className={cn('container-page', styles.text)}>
        <BeatStamp time={scene.beat.time} label={scene.clockLabel} inverse />
        <CaslHeading id={`${scene.id}-title`} size="l" className="mt-6 text-white">
          {scene.beat.title}
        </CaslHeading>
        <p className={styles.words}>
          {words.map((w, i) => (
            <span key={i} data-word="">
              {w}{' '}
            </span>
          ))}
        </p>
        <p className={styles.kickerWrap}>
          <span data-kicker="" className={styles.kicker}>
            {kicker}
          </span>
        </p>
      </div>
    </section>
  );
}
