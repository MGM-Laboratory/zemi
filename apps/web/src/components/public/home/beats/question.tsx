'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import type { ShapeName } from '@zemi/shared';
import { Character, type CharacterHandle, type CharacterMood } from '@/components/brand/character';
import { CaslHeading } from '@/components/motion/casl-heading';
import { gsap, useGSAP } from '@/components/motion/gsap';
import { shapeConfetti } from '@/components/motion/shape-confetti';
import { Button } from '@/components/public/ui/button';
import { prefersReducedMotion } from '@/lib/hooks/use-reduced-motion';
import { cn } from '@/lib/utils';
import { BeatStamp } from '../beat-stamp';
import type { StoryScene } from '../types';
import styles from './question.module.css';

const AUDIENCE: Array<{ shape: ShapeName; row: 0 | 1; x: number; size: number }> = [
  { shape: 'circle', row: 0, x: 0.1, size: 1 },
  { shape: 'square', row: 0, x: 0.36, size: 0.94 },
  { shape: 'arch', row: 0, x: 0.62, size: 0.98 },
  { shape: 'circle', row: 0, x: 0.86, size: 0.9 },
  { shape: 'triangle', row: 1, x: 0.22, size: 0.8 },
  { shape: 'arch', row: 1, x: 0.48, size: 0.78 },
  { shape: 'square', row: 1, x: 0.74, size: 0.82 },
];

const REACTIONS = [
  'Ooh. Good one.',
  'The speaker laughs and opens a new notebook.',
  'That is going in the thesis.',
  'Everyone writes that down.',
  'Somebody say “future work”.',
  'Okay, now we are cooking.',
];

interface Body {
  x: number;
  y: number;
  vx: number;
  vy: number;
  drag: boolean;
  held: number;
  idle: number;
  homeX: number;
  homeY: number;
  scale: number;
}

/**
 * 14:30, someone asks the question. A little lecture room: drag the "?" bubble and throw it at
 * the speaker (or press the button). Every hit gets a laugh, a new notebook and a round of claps.
 */
export function QuestionBeat({ scene }: { scene: StoryScene }) {
  const root = useRef<HTMLElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const bubble = useRef<HTMLDivElement>(null);
  const speakerBox = useRef<HTMLDivElement>(null);
  const speaker = useRef<CharacterHandle>(null);
  const seats = useRef<Array<HTMLDivElement | null>>([]);
  const people = useRef<Array<CharacterHandle | null>>([]);
  const body = useRef<Body>({
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    drag: false,
    held: 0,
    idle: 0,
    homeX: 0,
    homeY: 0,
    scale: 1,
  });
  const cooldown = useRef(0);
  /** The button promised a question: it counts even if the lob misses. */
  const promised = useRef(false);
  const asker = useRef(0);
  const [count, setCount] = useState(0);
  const [mood, setMood] = useState<CharacterMood>('idle');
  const [line, setLine] = useState<string | null>(null);
  const [grabbed, setGrabbed] = useState(false);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        gsap.fromTo(
          '[data-q-seat]',
          { y: 60, opacity: 0 },
          {
            y: 0,
            opacity: 1,
            stagger: 0.06,
            duration: 0.8,
            ease: 'back.out(1.7)',
            scrollTrigger: { trigger: stage.current, start: 'top 80%', once: true },
          },
        );
      });
      return () => mm.revert();
    },
    { scope: root },
  );

  /** Put the bubble above the current asker. */
  const home = useCallback(() => {
    const st = stage.current;
    const seat = seats.current[asker.current];
    if (!st || !seat) return;
    const sr = st.getBoundingClientRect();
    const r = seat.getBoundingClientRect();
    const b = body.current;
    const size = bubble.current?.offsetWidth ?? 80;
    b.homeX = r.left - sr.left + r.width / 2 + size * 0.2;
    // Float above the whole audience, over the asker.
    b.homeY = Math.max(
      size * 0.6,
      r.top - sr.top - size * (AUDIENCE[asker.current]?.row ? 0.55 : 1.45),
    );
  }, []);

  const hit = useCallback(() => {
    const b = body.current;
    const now = performance.now();
    if (now < cooldown.current) return;
    cooldown.current = now + 900;
    promised.current = false;
    speaker.current?.squash();
    setMood('surprised');
    setCount((c) => c + 1);
    setLine(REACTIONS[Math.floor(Math.random() * REACTIONS.length)]!);
    setTimeout(() => setMood('happy'), 420);
    setTimeout(() => setMood('idle'), 2400);
    people.current.forEach((p, i) => setTimeout(() => p?.cheer(), 120 + i * 60));
    void shapeConfetti({
      from: speakerBox.current,
      count: 36,
      spread: 70,
      startVelocity: 22,
      scalar: 1,
    });
    // Someone else gets the next question.
    asker.current =
      (asker.current + 1 + Math.floor(Math.random() * (AUDIENCE.length - 1))) % AUDIENCE.length;
    home();
    b.x = b.homeX;
    b.y = b.homeY + 30;
    b.vx = 0;
    b.vy = 0;
    b.scale = 0;
  }, [home]);

  /** Where the speaker is, in stage coordinates. */
  const target = useCallback(() => {
    const st = stage.current;
    const sp = speakerBox.current;
    if (!st || !sp) return null;
    const sr = st.getBoundingClientRect();
    const r = sp.getBoundingClientRect();
    return { x: r.left - sr.left + r.width / 2, y: r.top - sr.top + r.height * 0.4 };
  }, []);

  /** A lob that lands on (tx, ty) in about T seconds (gravity 520, a little extra for the drag). */
  const lob = useCallback((tx: number, ty: number, T: number) => {
    const b = body.current;
    b.vx = ((tx - b.x) / T) * 1.12;
    b.vy = ((ty - b.y - 0.5 * 520 * T * T) / T) * 1.06;
    b.idle = 0;
  }, []);

  const throwAtSpeaker = useCallback(() => {
    const st = stage.current?.getBoundingClientRect();
    const onScreen = !!st && st.bottom > 0 && st.top < window.innerHeight;
    const t = target();
    // Reduced motion, or the stage is scrolled away (phones stack it under the button): just count it.
    if (prefersReducedMotion() || !onScreen || !t) {
      hit();
      return;
    }
    promised.current = true;
    lob(t.x, t.y, 0.6);
  }, [hit, lob, target]);

  // Physics loop (only while on screen).
  useEffect(() => {
    const st = stage.current;
    const el = bubble.current;
    if (!st || !el) return;
    const reduced = prefersReducedMotion();
    let raf = 0;
    let last = performance.now();
    let visible = false;
    home();
    const b = body.current;
    b.x = b.homeX;
    b.y = b.homeY;

    const frame = (t: number) => {
      raf = 0;
      if (!visible) return;
      const dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      const w = st.clientWidth;
      const h = st.clientHeight;
      const R = el.offsetWidth / 2;
      if (!b.drag && !reduced) {
        const speed = Math.hypot(b.vx, b.vy);
        if (speed > 12) {
          b.idle = 0;
          b.vy += 520 * dt; // a little gravity so throws arc
          b.vx *= Math.pow(0.992, dt * 60);
          b.vy *= Math.pow(0.992, dt * 60);
          b.x += b.vx * dt;
          b.y += b.vy * dt;
          if (b.x < R) {
            b.x = R;
            b.vx = Math.abs(b.vx) * 0.72;
          }
          if (b.x > w - R) {
            b.x = w - R;
            b.vx = -Math.abs(b.vx) * 0.72;
          }
          if (b.y < R) {
            b.y = R;
            b.vy = Math.abs(b.vy) * 0.72;
          }
          if (b.y > h - R) {
            b.y = h - R;
            b.vy = -Math.abs(b.vy) * 0.55;
            b.vx *= 0.86;
          }
        } else {
          // A button throw that bounced off somewhere still asks the question.
          if (promised.current) hit();
          // Float home, bobbing, when nobody is throwing it.
          b.idle += dt;
          const k = b.idle > 0.8 ? 1 - Math.pow(0.9, dt * 60) : 0;
          b.x += (b.homeX - b.x) * k;
          b.y += (b.homeY + Math.sin(t / 420) * 6 - b.y) * k;
          b.vx = 0;
          b.vy = 0;
        }
        // Did it land on the speaker?
        const sp = speakerBox.current?.getBoundingClientRect();
        const sr = st.getBoundingClientRect();
        if (sp && speed > 60) {
          const cx = Math.max(sp.left - sr.left, Math.min(b.x, sp.right - sr.left));
          const cy = Math.max(sp.top - sr.top, Math.min(b.y, sp.bottom - sr.top));
          if (Math.hypot(b.x - cx, b.y - cy) < R * 0.9) hit();
        }
      } else if (reduced && !b.drag) {
        b.x = b.homeX;
        b.y = b.homeY;
      }
      b.scale += (1 - b.scale) * (reduced ? 1 : 0.14);
      const tilt = Math.max(-24, Math.min(24, b.vx * 0.02));
      el.style.transform = `translate3d(${(b.x - R).toFixed(1)}px, ${(b.y - R).toFixed(1)}px, 0) rotate(${tilt.toFixed(1)}deg) scale(${(b.drag ? 1.12 : b.scale).toFixed(3)})`;
      raf = requestAnimationFrame(frame);
    };

    const io = new IntersectionObserver(([e]) => {
      visible = !!e?.isIntersecting;
      if (visible && !raf) {
        last = performance.now();
        home();
        raf = requestAnimationFrame(frame);
      }
    });
    io.observe(st);
    const ro = new ResizeObserver(() => home());
    ro.observe(st);
    return () => {
      io.disconnect();
      ro.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, [home]);

  // Drag and throw.
  const track = useRef({ x: 0, y: 0, t: 0, id: -1 });
  const onDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const st = stage.current;
    if (!st) return;
    e.preventDefault();
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
    const sr = st.getBoundingClientRect();
    const b = body.current;
    b.drag = true;
    b.vx = 0;
    b.vy = 0;
    track.current = {
      x: e.clientX - sr.left,
      y: e.clientY - sr.top,
      t: performance.now(),
      id: e.pointerId,
    };
    setGrabbed(true);
  };
  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const b = body.current;
    const st = stage.current;
    if (!b.drag || !st || e.pointerId !== track.current.id) return;
    const sr = st.getBoundingClientRect();
    const x = e.clientX - sr.left;
    const y = e.clientY - sr.top;
    const now = performance.now();
    const dt = Math.max(1, now - track.current.t) / 1000;
    b.vx = b.vx * 0.5 + ((x - track.current.x) / dt) * 0.5;
    b.vy = b.vy * 0.5 + ((y - track.current.y) / dt) * 0.5;
    b.x = Math.max(0, Math.min(st.clientWidth, x));
    b.y = Math.max(0, Math.min(st.clientHeight, y));
    track.current = { x, y, t: now, id: e.pointerId };
  };
  const onUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const b = body.current;
    if (!b.drag) return;
    b.drag = false;
    b.idle = 0;
    const max = 2600;
    const sp = Math.hypot(b.vx, b.vy);
    if (sp > max) {
      b.vx = (b.vx / sp) * max;
      b.vy = (b.vy / sp) * max;
    }
    if (performance.now() - track.current.t > 120) {
      b.vx = 0;
      b.vy = 0;
    }
    // Aim assist: a throw roughly toward the speaker becomes a lob that lands. Throwing is the fun part.
    const t = target();
    const speed = Math.hypot(b.vx, b.vy);
    if (t && speed > 220) {
      const dx = t.x - b.x;
      const dy = t.y - b.y;
      const d = Math.hypot(dx, dy) || 1;
      const cos = (b.vx * dx + b.vy * dy) / (speed * d);
      if (cos > 0.7) lob(t.x, t.y, Math.min(0.8, Math.max(0.3, d / speed)));
    }
    (e.currentTarget as HTMLDivElement).releasePointerCapture?.(e.pointerId);
    setGrabbed(false);
  };

  return (
    <section
      ref={root}
      id={scene.id}
      className={styles.question}
      aria-labelledby={`${scene.id}-title`}
    >
      <div className={cn('container-page', styles.layout)}>
        <div className={styles.copy}>
          <BeatStamp n={scene.n} label={scene.label} />
          <CaslHeading
            id={`${scene.id}-title`}
            size="l"
            reveal
            className="mt-6 max-w-[12ch] text-ink"
          >
            {scene.beat.title}
          </CaslHeading>
          <p className="text-body-l mt-6 max-w-[30rem] text-ink-2">{scene.beat.body}</p>
        </div>

        <div ref={stage} className={styles.stage} aria-hidden="true">
          <div className={styles.screen}>
            <span className={styles.screenTitle} />
            <svg viewBox="0 0 120 60" className={styles.screenChart}>
              <path
                d="M6 52 L30 40 L52 44 L74 22 L96 28 L114 8"
                fill="none"
                stroke="#3a6dc5"
                strokeWidth="4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle cx="114" cy="8" r="5" fill="#f94141" />
            </svg>
            <span className={styles.screenNote}>results (so far)</span>
          </div>
          <div ref={speakerBox} className={styles.speaker}>
            <Character ref={speaker} shape="triangle" mood={mood} size="100%" seed={9} />
            <div className={styles.lectern} />
            <div key={count} className={cn(styles.notebook, count > 0 && styles.notebookOn)}>
              <span>+1 idea</span>
            </div>
          </div>
          <div className={styles.rows}>
            {AUDIENCE.map((a, i) => (
              <div
                key={i}
                ref={(el) => void (seats.current[i] = el)}
                className={cn(styles.seat, a.row ? styles.back : styles.front)}
                style={{ left: `${a.x * 100}%`, ['--s' as string]: a.size }}
                data-q-seat=""
              >
                <Character
                  ref={(h) => void (people.current[i] = h)}
                  shape={a.shape}
                  size="100%"
                  seed={i + 11}
                  mood={grabbed ? 'surprised' : 'idle'}
                />
                <span className={styles.chair} />
              </div>
            ))}
          </div>
          <div
            ref={bubble}
            className={cn(styles.bubble, grabbed && styles.bubbleHeld)}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
            data-cursor="drag"
          >
            <svg viewBox="0 0 100 100" aria-hidden="true">
              <path
                d="M50 6 C76 6 94 24 94 48 C94 72 76 88 50 88 C44 88 38 87 33 85 L14 96 L20 77 C11 69 6 59 6 48 C6 24 24 6 50 6 Z"
                fill="#3a6dc5"
              />
              <text
                x="50"
                y="66"
                textAnchor="middle"
                fontSize="52"
                fontWeight="900"
                fill="#fff"
                fontFamily="var(--font-display)"
              >
                ?
              </text>
            </svg>
          </div>
        </div>

        {/* Phones: the button sits below the visual, so the lecture room is seen first.
            Desktops: it lands right under the body text, in the copy column. */}
        <div className={styles.actions}>
          <Button onClick={throwAtSpeaker} size="lg" shape="circle" variant="accent">
            Ask the question
          </Button>
          <p className={styles.counter} aria-live="polite">
            <span className={styles.counterNum}>{count}</span>
            <span>
              {count === 1 ? 'good question' : 'good questions'}
              <span className="block text-ink-3">{line ?? 'Drag the bubble, then throw it.'}</span>
            </span>
          </p>
        </div>
      </div>
    </section>
  );
}
