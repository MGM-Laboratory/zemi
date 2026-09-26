'use client';

import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { SHAPE_CHARACTER, SHAPE_ORDER, type ShapeName } from '@zemi/shared';
import { Character, type CharacterHandle, type CharacterMood } from '@/components/brand/character';
import { ShapeIcon } from '@/components/brand/shape-icon';
import { prefersReducedMotion } from '@/lib/hooks/use-reduced-motion';
import { cn } from '@/lib/utils';
import styles from './lost.module.css';

/* ------------------------------------------------------------------ tuning */

const GRAVITY = 2.4; // x planet radius per s², toward the planet center
const BOUNCE_PLANET = 0.34;
const BOUNCE_BODY = 0.45;
const BOUNCE_WALL = 0.55;
const GROUND_FRICTION = 7; // 1/s on tangential speed while touching the planet
const AIR_DRAG = 0.12; // 1/s
const MAX_THROW = 2600; // px/s
const UPRIGHT_K = 60;
const UPRIGHT_C = 9;
const STEP = 1 / 15; // wandering decisions step at 15 fps (stop-motion clay)

/** Each character's resting mood (they're lost) and a line they mutter now and then. */
const CAST: Array<{ shape: ShapeName; mood: CharacterMood; start: number; lines: string[] }> = [
  { shape: 'circle', mood: 'thinking', start: -0.62, lines: ['Is this room 404?', 'Who booked this planet?'] },
  { shape: 'triangle', mood: 'surprised', start: -0.2, lines: ['I had a hunch this was wrong.', 'Wrong building?'] },
  { shape: 'square', mood: 'sleepy', start: 0.22, lines: ['Wake me at 13:15.', 'The data says: lost.'] },
  { shape: 'arch', mood: 'idle', start: 0.64, lines: ['Anyone seen the coffee?', 'Maybe take the links?'] },
];

interface Body {
  x: number;
  y: number;
  vx: number;
  vy: number;
  a: number;
  va: number;
  r: number;
  grabbed: boolean;
  /** Seconds since the last planet contact. */
  air: number;
  /** Next time (s) it decides to wander. */
  wanderAt: number;
  hist: Array<{ x: number; y: number; t: number }>;
  gx: number;
  gy: number;
}

interface World {
  w: number;
  h: number;
  cx: number;
  cy: number;
  R: number;
  size: number;
}

function measure(el: HTMLElement): World {
  const w = el.clientWidth;
  const h = el.clientHeight;
  const R = Math.max(70, Math.min(w * 0.3, h * 0.3));
  const size = Math.round(Math.max(52, Math.min(R * 0.52, 132)));
  return { w, h, cx: w / 2, cy: h * 0.56, R, size };
}

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
/** -0.5..0.5, for the event handlers (never called while rendering). */
const jitter = () => Math.random() - 0.5;

/**
 * The 404 playground: a tiny planet with central gravity and the four characters, lost on it.
 * Drag them, throw them, watch them tumble back and stand up again. Keyboard: each character
 * is a button (Enter/Space tosses it, arrow keys walk it along the planet).
 * DOM + rAF only (no WebGL); still under prefers-reduced-motion.
 */
export function LostPlanet({ className }: { className?: string }) {
  const root = useRef<HTMLDivElement>(null);
  const els = useRef<Array<HTMLButtonElement | null>>([]);
  const chars = useRef<Array<CharacterHandle | null>>([]);
  const bodies = useRef<Body[]>([]);
  const world = useRef<World | null>(null);
  const raf = useRef(0);
  const visible = useRef(true);
  const [moods, setMoods] = useState<CharacterMood[]>(() => CAST.map((c) => c.mood));
  const [ready, setReady] = useState(false);
  const [touched, setTouched] = useState(false);
  const [bubble, setBubble] = useState<{ i: number; text: string } | null>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const planetRef = useRef<HTMLDivElement>(null);
  const moodTimers = useRef<Array<ReturnType<typeof setTimeout> | undefined>>([]);

  const setMood = useCallback((i: number, mood: CharacterMood, revertMs?: number) => {
    const apply = (next: CharacterMood) => setMoods((m) => (m[i] === next ? m : m.map((v, k) => (k === i ? next : v))));
    apply(mood);
    clearTimeout(moodTimers.current[i]);
    if (revertMs) moodTimers.current[i] = setTimeout(() => apply(CAST[i]!.mood), revertMs);
  }, []);

  /** Put everyone back on the surface, standing. */
  const place = useCallback(() => {
    const el = root.current;
    if (!el) return;
    const wd = measure(el);
    world.current = wd;
    // The planet art's circle (r=100 in a -120 -150 240 270 viewBox) sits exactly on the physics planet.
    const art = planetRef.current;
    if (art) {
      const k = wd.R / 100;
      art.style.width = `${240 * k}px`;
      art.style.height = `${270 * k}px`;
      art.style.left = `${wd.cx - 120 * k}px`;
      art.style.top = `${wd.cy - 150 * k}px`;
    }
    els.current.forEach((b) => {
      if (!b) return;
      b.style.width = `${wd.size}px`;
      b.style.height = `${wd.size}px`;
    });
    bodies.current = CAST.map((c, i) => {
      const prev = bodies.current[i];
      const ang = -Math.PI / 2 + c.start;
      const r = wd.size / 2;
      const dist = wd.R + r;
      return {
        x: wd.cx + Math.cos(ang) * dist,
        y: wd.cy + Math.sin(ang) * dist,
        vx: 0,
        vy: 0,
        a: ang + Math.PI / 2,
        va: 0,
        r,
        grabbed: false,
        air: 0,
        wanderAt: (prev?.wanderAt ?? 0) || 1.5 + i * 0.9,
        hist: [],
        gx: 0,
        gy: 0,
      };
    });
  }, []);

  const paint = useCallback(() => {
    const wd = world.current;
    if (!wd) return;
    bodies.current.forEach((b, i) => {
      const el = els.current[i];
      if (el)
        el.style.transform = `translate3d(${(b.x - b.r).toFixed(2)}px, ${(b.y - b.r).toFixed(2)}px, 0) rotate(${b.a.toFixed(4)}rad)`;
    });
    const bub = bubbleRef.current;
    const who = bub?.dataset.i ? bodies.current[Number(bub.dataset.i)] : undefined;
    if (bub && who) {
      // Keep the bubble inside the box; the tail may drift off-center near the edges.
      const half = ((bub.firstElementChild as HTMLElement | null)?.offsetWidth ?? 0) / 2;
      const x = Math.min(Math.max(who.x, half + 8), wd.w - half - 8);
      const y = Math.max(who.y - who.r * 1.25, 52);
      bub.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
    }
  }, []);

  // Layout, resize, visibility.
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    place();
    paint();
    setReady(true);
    const ro = new ResizeObserver(() => {
      const prev = world.current;
      const next = measure(el);
      if (!prev || Math.abs(prev.w - next.w) > 1 || Math.abs(prev.h - next.h) > 1) {
        place();
        paint();
      }
    });
    ro.observe(el);
    const io = new IntersectionObserver(([e]) => {
      visible.current = !!e?.isIntersecting;
    });
    io.observe(el);
    const timers = moodTimers.current;
    return () => {
      ro.disconnect();
      io.disconnect();
      timers.forEach((t) => clearTimeout(t));
    };
  }, [place, paint]);

  // The simulation.
  useEffect(() => {
    if (prefersReducedMotion()) return;
    let last = performance.now();
    let clock = 0;
    let stepAcc = 0;
    const loop = (now: number) => {
      raf.current = requestAnimationFrame(loop);
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;
      const wd = world.current;
      if (!wd || !visible.current) return;
      clock += dt;
      stepAcc += dt;
      const decide = stepAcc >= STEP;
      if (decide) stepAcc %= STEP;
      const bs = bodies.current;
      const g = GRAVITY * wd.R;

      for (let i = 0; i < bs.length; i++) {
        const b = bs[i]!;
        if (b.grabbed) {
          // Follow the finger with a stiff spring so throws keep their momentum.
          const k = 1 - Math.exp(-28 * dt);
          const nx = b.x + (b.gx - b.x) * k;
          const ny = b.y + (b.gy - b.y) * k;
          b.vx = (nx - b.x) / Math.max(dt, 1e-3);
          b.vy = (ny - b.y) / Math.max(dt, 1e-3);
          b.x = nx;
          b.y = ny;
          b.a += b.va * dt;
          b.va *= Math.exp(-3 * dt);
          continue;
        }
        const dx = b.x - wd.cx;
        const dy = b.y - wd.cy;
        const d = Math.hypot(dx, dy) || 1;
        const nx = dx / d;
        const ny = dy / d;
        b.vx -= nx * g * dt;
        b.vy -= ny * g * dt;
        const drag = Math.exp(-AIR_DRAG * dt);
        b.vx *= drag;
        b.vy *= drag;
        b.x += b.vx * dt;
        b.y += b.vy * dt;

        // Planet surface.
        const dx2 = b.x - wd.cx;
        const dy2 = b.y - wd.cy;
        const d2 = Math.hypot(dx2, dy2) || 1;
        const n2x = dx2 / d2;
        const n2y = dy2 / d2;
        const min = wd.R + b.r * 0.94;
        if (d2 < min) {
          b.x = wd.cx + n2x * min;
          b.y = wd.cy + n2y * min;
          const vn = b.vx * n2x + b.vy * n2y;
          if (vn < 0) {
            b.vx -= (1 + BOUNCE_PLANET) * vn * n2x;
            b.vy -= (1 + BOUNCE_PLANET) * vn * n2y;
            if (vn < -520 && b.air > 0.25) {
              chars.current[i]?.squash();
            }
          }
          const vt = b.vx * -n2y + b.vy * n2x;
          const f = Math.exp(-GROUND_FRICTION * dt);
          const vt2 = vt * f;
          b.vx += (vt2 - vt) * -n2y;
          b.vy += (vt2 - vt) * n2x;
          b.air = 0;
        } else {
          b.air += dt;
        }

        // Stand up on the planet (spring toward the surface normal), tumble freely in the air.
        const target = Math.atan2(n2x, -n2y);
        if (b.air < 0.12) {
          const err = wrap(target - b.a);
          b.va += (UPRIGHT_K * err - UPRIGHT_C * b.va) * dt;
        } else {
          b.va *= Math.exp(-0.6 * dt);
        }
        b.a += b.va * dt;

        // Walls: keep everyone in the box.
        if (b.x < b.r) {
          b.x = b.r;
          b.vx = Math.abs(b.vx) * BOUNCE_WALL;
        } else if (b.x > wd.w - b.r) {
          b.x = wd.w - b.r;
          b.vx = -Math.abs(b.vx) * BOUNCE_WALL;
        }
        if (b.y < b.r) {
          b.y = b.r;
          b.vy = Math.abs(b.vy) * BOUNCE_WALL;
        } else if (b.y > wd.h - b.r) {
          b.y = wd.h - b.r;
          b.vy = -Math.abs(b.vy) * BOUNCE_WALL;
        }

        // Wander: a little hop along the surface every few seconds (decided at 15 fps).
        if (decide && b.air === 0 && clock > b.wanderAt) {
          b.wanderAt = clock + 2.4 + Math.random() * 3.6;
          const dir = Math.random() < 0.5 ? -1 : 1;
          const hop = wd.R * (0.9 + Math.random() * 0.6);
          b.vx += n2x * hop + -n2y * dir * hop * 0.55;
          b.vy += n2y * hop + n2x * dir * hop * 0.55;
          b.va += dir * 1.2;
        }
      }

      // Characters bump into each other.
      for (let i = 0; i < bs.length; i++) {
        for (let j = i + 1; j < bs.length; j++) {
          const a = bs[i]!;
          const c = bs[j]!;
          const dx = c.x - a.x;
          const dy = c.y - a.y;
          const d = Math.hypot(dx, dy) || 1;
          const min = (a.r + c.r) * 0.9;
          if (d >= min) continue;
          const nx = dx / d;
          const ny = dy / d;
          const push = (min - d) / 2;
          if (!a.grabbed) {
            a.x -= nx * push;
            a.y -= ny * push;
          }
          if (!c.grabbed) {
            c.x += nx * push;
            c.y += ny * push;
          }
          const rel = (c.vx - a.vx) * nx + (c.vy - a.vy) * ny;
          if (rel < 0) {
            const imp = (-(1 + BOUNCE_BODY) * rel) / 2;
            if (!a.grabbed) {
              a.vx -= imp * nx;
              a.vy -= imp * ny;
              a.va -= imp * 0.004;
            }
            if (!c.grabbed) {
              c.vx += imp * nx;
              c.vy += imp * ny;
              c.va += imp * 0.004;
            }
          }
        }
      }
      paint();
    };
    raf.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf.current);
  }, [paint]);

  // Somebody mutters something every so often.
  useEffect(() => {
    if (prefersReducedMotion()) return;
    let t: ReturnType<typeof setTimeout>;
    let n = 0;
    const next = (delay: number) => {
      t = setTimeout(() => {
        if (visible.current) {
          const i = n % CAST.length;
          const lines = CAST[i]!.lines;
          setBubble({ i, text: lines[Math.floor(n / CAST.length) % lines.length]! });
          n += 1;
          t = setTimeout(() => {
            setBubble(null);
            next(3200 + Math.random() * 2400);
          }, 2600);
        } else next(2000);
      }, delay);
    };
    next(2200);
    return () => clearTimeout(t);
  }, []);

  /* ------------------------------------------------------------------ input */

  const local = (e: PointerEvent) => {
    const r = root.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const onDown = (i: number) => (e: PointerEvent<HTMLButtonElement>) => {
    const b = bodies.current[i];
    if (!b || e.button > 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = local(e);
    b.grabbed = true;
    b.gx = p.x;
    b.gy = p.y;
    b.hist = [{ ...p, t: performance.now() }];
    setTouched(true);
    setMood(i, 'surprised');
    if (prefersReducedMotion()) {
      chars.current[i]?.squash();
      b.grabbed = false;
    }
  };

  const onMove = (i: number) => (e: PointerEvent<HTMLButtonElement>) => {
    const b = bodies.current[i];
    if (!b?.grabbed) return;
    const p = local(e);
    b.gx = p.x;
    b.gy = p.y;
    const now = performance.now();
    b.hist.push({ ...p, t: now });
    while (b.hist.length > 2 && now - b.hist[0]!.t > 90) b.hist.shift();
  };

  const onUp = (i: number) => (e: PointerEvent<HTMLButtonElement>) => {
    const b = bodies.current[i];
    if (!b?.grabbed) return;
    b.grabbed = false;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    const h = b.hist;
    const first = h[0];
    const lastP = h[h.length - 1];
    if (first && lastP && lastP.t - first.t > 8) {
      const s = 1000 / (lastP.t - first.t);
      let vx = (lastP.x - first.x) * s;
      let vy = (lastP.y - first.y) * s;
      const sp = Math.hypot(vx, vy);
      if (sp > MAX_THROW) {
        vx *= MAX_THROW / sp;
        vy *= MAX_THROW / sp;
      }
      b.vx = vx;
      b.vy = vy;
      b.va = vx * 0.006;
      if (sp > 900) setMood(i, 'happy', 1800);
      else setMood(i, CAST[i]!.mood);
    } else {
      // A tap: a little jump.
      chars.current[i]?.squash();
      toss(i, 0.8);
      setMood(i, 'happy', 1400);
    }
  };

  const toss = (i: number, strength = 1) => {
    const b = bodies.current[i];
    const wd = world.current;
    if (!b || !wd) return;
    if (prefersReducedMotion()) {
      chars.current[i]?.cheer();
      return;
    }
    const dx = b.x - wd.cx;
    const dy = b.y - wd.cy;
    const d = Math.hypot(dx, dy) || 1;
    const up = wd.R * 3.2 * strength;
    const side = jitter() * wd.R * 2.4 * strength;
    b.vx += (dx / d) * up + (-dy / d) * side;
    b.vy += (dy / d) * up + (dx / d) * side;
    b.va += jitter() * 12 * strength;
  };

  const walk = (i: number, dir: -1 | 1) => {
    const b = bodies.current[i];
    const wd = world.current;
    if (!b || !wd) return;
    if (prefersReducedMotion()) {
      chars.current[i]?.squash();
      return;
    }
    const dx = b.x - wd.cx;
    const dy = b.y - wd.cy;
    const d = Math.hypot(dx, dy) || 1;
    const hop = wd.R * 1.1;
    b.vx += (dx / d) * hop * 0.8 + (-dy / d) * dir * hop;
    b.vy += (dy / d) * hop * 0.8 + (dx / d) * dir * hop;
  };

  const onKey = (i: number) => (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      walk(i, e.key === 'ArrowLeft' ? -1 : 1);
    }
  };

  const shuffleAll = () => {
    setTouched(true);
    CAST.forEach((_, i) => setTimeout(() => toss(i, 1.1 + jitter() * 0.4), i * 90));
  };

  return (
    <div
      ref={root}
      className={cn(styles.stage, ready && styles.ready, className)}
      role="group"
      aria-label="A tiny planet with four lost characters. Drag or throw them. Each one is a button: Enter tosses it, arrow keys walk it around."
    >
      <div ref={planetRef} className={styles.planetWrap} aria-hidden="true">
        <PlanetArt />
      </div>

      {SHAPE_ORDER.map((shape, i) => {
        const c = SHAPE_CHARACTER[shape];
        return (
          <button
            key={shape}
            ref={(el) => void (els.current[i] = el)}
            type="button"
            className={styles.body}
            aria-label={`Toss ${c.name}, ${c.meaning}`}
            data-cursor="drag"
            onPointerDown={onDown(i)}
            onPointerMove={onMove(i)}
            onPointerUp={onUp(i)}
            onPointerCancel={onUp(i)}
            onKeyDown={onKey(i)}
            onClick={(e) => {
              // Pointer taps are handled on pointerup; this is Enter / Space.
              if (e.detail === 0) {
                toss(i);
                setMood(i, 'happy', 1400);
              }
            }}
          >
            <Character
              ref={(h) => void (chars.current[i] = h)}
              shape={shape}
              mood={moods[i]}
              size="100%"
              seed={i}
              interactive={false}
            />
          </button>
        );
      })}

      <div ref={bubbleRef} data-i={bubble?.i ?? ''} className={cn(styles.bubble, bubble && styles.bubbleOn)} aria-hidden="true">
        <span>{bubble?.text}</span>
      </div>

      <div className={styles.hint}>
        <p className={cn('label text-ink-3 transition-opacity duration-500', touched && 'opacity-0')} aria-hidden="true">
          <ShapeIcon shape="triangle" size="0.9em" className="mr-1.5 inline-block rotate-180 align-[-0.1em]" />
          Drag us. We bounce.
        </p>
        <button type="button" className={styles.shake} onClick={shuffleAll}>
          <ShapeIcon shape="circle" size="0.85em" />
          Shake the planet
        </button>
      </div>
    </div>
  );
}

/** The planet itself: soft clay disc, a few shape craters, a "404" flag and a slow orbit ring. */
function PlanetArt() {
  return (
    <svg viewBox="-120 -150 240 270" className={styles.planet} focusable="false">
      <defs>
        <radialGradient id="lost-planet-fill" cx="38%" cy="30%" r="80%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="62%" stopColor="#f3f3ef" />
          <stop offset="100%" stopColor="#e4e4de" />
        </radialGradient>
      </defs>
      <g className={styles.orbit}>
        <ellipse
          cx="0"
          cy="0"
          rx="112"
          ry="112"
          fill="none"
          stroke="#d8d8d2"
          strokeWidth="1"
          strokeDasharray="2 7"
          strokeLinecap="round"
        />
        <circle cx="112" cy="0" r="3.2" fill="#3a6dc5" />
        <circle cx="-79" cy="79" r="2.4" fill="#f7bf33" />
      </g>
      <circle cx="0" cy="0" r="100" fill="url(#lost-planet-fill)" />
      <circle cx="0" cy="0" r="100" fill="none" stroke="#d8d8d2" strokeWidth="1.2" />
      {/* craters shaped like the brand */}
      <g opacity="0.9">
        <g transform="translate(-44 12) scale(0.42)">
          <path d="M23 0 A23 23 0 1 1 22.99 0 Z" fill="#ecf1fa" />
        </g>
        <g transform="translate(18 34) scale(0.36)">
          <path d="M10 0 H36 Q46 0 46 10 V36 Q46 46 36 46 H10 Q0 46 0 36 V10 Q0 0 10 0 Z" fill="#fef6e0" />
        </g>
        <g transform="translate(26 -28) scale(0.3)">
          <path d="M0 46 V23 A23 23 0 0 1 46 23 V46 Z" fill="#e2f1ea" />
        </g>
        <g transform="translate(-26 -52) scale(0.26)">
          <path d="M19.76 7.2 Q23 1 26.24 7.2L42.76 38.8 Q46 45 39 45L7 45 Q0 45 3.24 38.8 Z" fill="#fee5e5" />
        </g>
      </g>
      {/* the flag, planted slightly off the top */}
      <g transform="rotate(14) translate(0 -100)">
        <rect x="-1.2" y="-44" width="2.4" height="46" rx="1.2" fill="#0e1116" />
        <path d="M1 -44 H34 Q37 -44 36 -41 L32 -34 L36 -27 Q37 -24 34 -24 H1 Z" fill="#f94141" />
        <text x="16" y="-30.5" textAnchor="middle" fontSize="10" fontWeight="900" fill="#ffffff" className={styles.flagText}>
          404
        </text>
      </g>
    </svg>
  );
}
