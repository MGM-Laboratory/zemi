'use client';

import type { Options, Shape } from 'canvas-confetti';
import { SHAPE_COLORS, SHAPE_ORDER, SHAPE_PATHS_46, type ShapeName } from '@zemi/shared';
import { prefersReducedMotion } from '@/lib/hooks/use-reduced-motion';

type ConfettiFn = typeof import('canvas-confetti');

let lib: ConfettiFn | null = null;
let shapes: Record<ShapeName, Shape> | null = null;

async function load() {
  if (!lib) {
    const mod = await import('canvas-confetti');
    lib = (mod.default ?? mod) as ConfettiFn;
  }
  if (!shapes) {
    const make = (s: ShapeName) => lib!.shapeFromPath({ path: SHAPE_PATHS_46[s] });
    shapes = { circle: make('circle'), triangle: make('triangle'), square: make('square'), arch: make('arch') };
  }
  return { confetti: lib, shapes };
}

export interface ShapeConfettiOptions {
  /** Burst from the center of this element. */
  from?: Element | null;
  /** Or an origin in viewport fractions (0..1). Default: lower middle. */
  origin?: { x: number; y: number };
  /** Total particles across the four shapes. Default 120. */
  count?: number;
  spread?: number;
  /** Degrees, 90 = straight up. */
  angle?: number;
  startVelocity?: number;
  /** Particle size multiplier. Default 1.4. */
  scalar?: number;
}

/**
 * Celebrate with the four brand shapes in their own colors (registration success, check-in,
 * publish). Lazy-loads canvas-confetti on first use. Reduced motion gets a short, static puff.
 *
 * @example await shapeConfetti({ from: buttonRef.current })
 */
export async function shapeConfetti(opts: ShapeConfettiOptions = {}): Promise<void> {
  if (typeof window === 'undefined') return;
  const { confetti, shapes: s } = await load();
  let origin = opts.origin ?? { x: 0.5, y: 0.7 };
  if (opts.from) {
    const r = opts.from.getBoundingClientRect();
    origin = { x: (r.left + r.width / 2) / window.innerWidth, y: (r.top + r.height / 2) / window.innerHeight };
  }
  const reduced = prefersReducedMotion();
  const per = Math.max(4, Math.round((opts.count ?? 120) / 4));
  const base: Options = reduced
    ? { particleCount: Math.ceil(per / 3), spread: 70, startVelocity: 14, gravity: 0, decay: 0.82, ticks: 70, scalar: opts.scalar ?? 1.4 }
    : {
        particleCount: per,
        spread: opts.spread ?? 80,
        angle: opts.angle ?? 90,
        startVelocity: opts.startVelocity ?? 42,
        gravity: 0.9,
        decay: 0.92,
        ticks: 220,
        scalar: opts.scalar ?? 1.4,
        drift: 0,
      };
  await Promise.all(
    SHAPE_ORDER.map((name) =>
      confetti({
        ...base,
        origin,
        shapes: [s[name]],
        colors: [SHAPE_COLORS[name]],
        zIndex: 300,
        disableForReducedMotion: false,
      }),
    ),
  );
}

/** Two side cannons, for the big moments (a ticket is born). */
export async function shapeConfettiCannons(): Promise<void> {
  await Promise.all([
    shapeConfetti({ origin: { x: 0, y: 0.75 }, angle: 60, spread: 60, count: 90, startVelocity: 55 }),
    shapeConfetti({ origin: { x: 1, y: 0.75 }, angle: 120, spread: 60, count: 90, startVelocity: 55 }),
  ]);
}
