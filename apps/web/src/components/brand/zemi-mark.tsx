'use client';

import { useAnimate } from 'motion/react';
import { useCallback, useEffect, useRef, type CSSProperties } from 'react';
import { MARK_PATHS, SHAPE_COLORS, SHAPE_ORDER, type ShapeName } from '@zemi/shared';
import { prefersReducedMotion } from '@/lib/hooks/use-reduced-motion';
import { cn } from '@/lib/utils';
import styles from './brand.module.css';

export type MarkVariant = 'idle' | 'shuffle' | 'loading' | 'cheer' | 'sleep';
export type MarkTone = 'color' | 'ink' | 'paper';

export interface ZemiMarkProps {
  /**
   * - `idle`: still.
   * - `shuffle`: shapes hop clockwise through every cell and land home (one cycle, or forever with `loop`).
   * - `loading`: shapes tumble in one by one, then rotate 90deg in turn, forever.
   * - `cheer`: all four hop with a 60ms stagger.
   * - `sleep`: slow breathing.
   */
  variant?: MarkVariant;
  /** `color` brand shapes, `ink` monochrome (currentColor), `paper` white for dark backgrounds. */
  tone?: MarkTone;
  /** px number or CSS length. Default 40. */
  size?: number | string;
  /** Hover plays a shuffle, click plays a cheer. */
  interactive?: boolean;
  /** Repeat one-shot variants (shuffle, cheer) forever. */
  loop?: boolean;
  /** Change this value to replay the one-shot animation (for example on route change). */
  trigger?: unknown;
  /** Accessible name. Default "Zemi". Ignored when decorative. */
  title?: string;
  decorative?: boolean;
  className?: string;
  style?: CSSProperties;
}

/** Ring of cells, clockwise from top-left. */
const RING: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [54, 0],
  [54, 54],
  [0, 54],
];
const HOME: Record<ShapeName, number> = { circle: 0, triangle: 1, arch: 2, square: 3 };

function offset(shape: ShapeName, step: number) {
  const [hx, hy] = RING[HOME[shape]]!;
  const [cx, cy] = RING[(HOME[shape] + step) % 4]!;
  return { x: cx - hx, y: cy - hy };
}

const SPRING = { type: 'spring', stiffness: 320, damping: 22 } as const;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * The Zemi mark: a 2x2 grid of the four brand shapes. Each shape is its own <g> so it can move.
 *
 * @example <ZemiMark size={48} variant="loading" />
 * @example <ZemiMark interactive tone="paper" />
 */
export function ZemiMark({
  variant = 'idle',
  tone = 'color',
  size = 40,
  interactive = false,
  loop = false,
  trigger,
  title = 'Zemi',
  decorative = false,
  className,
  style,
}: ZemiMarkProps) {
  const [scope, animate] = useAnimate<SVGSVGElement>();
  const busy = useRef(false);
  const run = useRef(0);

  const els = useCallback(() => {
    const root = scope.current;
    const map = {} as Record<ShapeName, SVGGElement>;
    if (!root) return null;
    for (const s of SHAPE_ORDER) {
      const el = root.querySelector<SVGGElement>(`[data-shape="${s}"]`);
      if (!el) return null;
      map[s] = el;
    }
    return map;
  }, [scope]);

  const reset = useCallback(
    (instant = false) => {
      const e = els();
      if (!e) return;
      for (const s of SHAPE_ORDER) {
        animate(e[s], { x: 0, y: 0, rotate: 0, scale: 1, opacity: 1 }, instant ? { duration: 0 } : { duration: 0.25 });
      }
    },
    [animate, els],
  );

  const shuffle = useCallback(
    async (id: number) => {
      const e = els();
      if (!e) return;
      for (let step = 1; step <= 4; step++) {
        if (run.current !== id) return;
        // Race a timeout: a stopped animation never resolves, and the mark must not get stuck.
        await Promise.race([
          Promise.all(
            SHAPE_ORDER.map((s, i) => {
              const { x, y } = offset(s, step);
              animate(e[s], { scale: [1, 0.8, 1] }, { duration: 0.34, ease: 'easeInOut', delay: i * 0.025 });
              return animate(e[s], { x, y }, { ...SPRING, delay: i * 0.025 });
            }),
          ),
          sleep(650),
        ]);
        await sleep(40);
      }
      // Always land exactly home (ring step 4 is home; also recovers from interruptions).
      for (const s of SHAPE_ORDER) animate(e[s], { x: 0, y: 0, scale: 1 }, { duration: run.current === id ? 0 : 0.2 });
    },
    [animate, els],
  );

  const cheer = useCallback(
    async (id: number) => {
      const e = els();
      if (!e) return;
      await Promise.all(
        SHAPE_ORDER.map((s, i) =>
          animate(
            e[s],
            { y: [0, -16, 0, -5, 0], scale: [1, 1.06, 0.94, 1.02, 1], rotate: [0, i % 2 ? 8 : -8, 0, 0, 0] },
            { duration: 0.72, ease: 'easeOut', delay: i * 0.06, times: [0, 0.35, 0.6, 0.8, 1] },
          ),
        ),
      );
      void id;
    },
    [animate, els],
  );

  const loading = useCallback(
    async (id: number) => {
      const e = els();
      if (!e) return;
      await Promise.all(
        SHAPE_ORDER.map((s, i) =>
          animate(
            e[s],
            { y: [-40, 0], rotate: [-140, 0], scale: [0.5, 1], opacity: [0, 1] },
            { type: 'spring', stiffness: 300, damping: 17, delay: i * 0.09, opacity: { duration: 0.2, delay: i * 0.09 } },
          ),
        ),
      );
      const rot: Record<ShapeName, number> = { circle: 0, triangle: 0, square: 0, arch: 0 };
      while (run.current === id) {
        for (const s of SHAPE_ORDER) {
          if (run.current !== id) return;
          rot[s] += 90;
          if (s === 'circle') {
            // A circle turning looks like nothing, so it squashes instead.
            await animate(e[s], { scaleX: [1, 1.14, 1], scaleY: [1, 0.84, 1] }, { duration: 0.36, ease: 'easeInOut' });
          } else {
            await animate(e[s], { rotate: rot[s] }, { type: 'spring', stiffness: 260, damping: 16 });
          }
          await sleep(60);
        }
      }
    },
    [animate, els],
  );

  const sleepy = useCallback(
    (id: number) => {
      const e = els();
      if (!e) return;
      SHAPE_ORDER.forEach((s, i) => {
        if (run.current !== id) return;
        animate(
          e[s],
          { scale: [1, 0.93, 1], y: [0, 1.6, 0], opacity: [0.92, 0.78, 0.92] },
          { duration: 3.4, ease: 'easeInOut', repeat: Infinity, delay: i * 0.4 },
        );
      });
    },
    [animate, els],
  );

  const play = useCallback(
    async (v: MarkVariant) => {
      const id = ++run.current;
      if (prefersReducedMotion()) {
        reset(true);
        return;
      }
      busy.current = true;
      try {
        if (v === 'idle') reset();
        else if (v === 'loading') await loading(id);
        else if (v === 'sleep') sleepy(id);
        else {
          do {
            await (v === 'shuffle' ? shuffle(id) : cheer(id));
            if (loop) await sleep(v === 'shuffle' ? 900 : 600);
          } while (loop && run.current === id);
        }
      } finally {
        if (run.current === id) busy.current = false;
      }
    },
    [cheer, loading, loop, reset, shuffle, sleepy],
  );

  // Variant changes.
  useEffect(() => {
    if (variant === 'idle') return;
    void play(variant);
    return () => {
      // Bumping the run id cancels any async loop still in flight.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      run.current++;
      busy.current = false;
      reset(true);
    };
  }, [variant, play, reset]);

  // External replays (route change etc). Compare values, not "first run": StrictMode runs
  // effects twice on mount and must not start an animation.
  const lastTrigger = useRef(trigger);
  useEffect(() => {
    if (Object.is(lastTrigger.current, trigger)) return;
    lastTrigger.current = trigger;
    if (busy.current) return;
    void play(variant === 'idle' ? 'shuffle' : variant);
  }, [trigger]); // eslint-disable-line react-hooks/exhaustive-deps

  const onEnter = interactive
    ? () => {
        if (!busy.current && variant === 'idle') void play('shuffle');
      }
    : undefined;
  const onClick = interactive
    ? () => {
        if (variant === 'idle') {
          run.current++;
          busy.current = false;
          reset(true);
          void play('cheer');
        }
      }
    : undefined;

  const fill = (s: ShapeName) => (tone === 'color' ? SHAPE_COLORS[s] : tone === 'ink' ? 'currentColor' : '#ffffff');

  return (
    <svg
      ref={scope}
      viewBox="0 0 100 100"
      width={typeof size === 'number' ? size : undefined}
      height={typeof size === 'number' ? size : undefined}
      className={cn('zemi-mark', variant === 'loading' && styles.markLoading, className)}
      style={{ width: size, height: size, overflow: 'visible', flex: 'none', ...style }}
      role={decorative ? undefined : 'img'}
      aria-hidden={decorative ? true : undefined}
      aria-label={decorative ? undefined : title}
      aria-busy={variant === 'loading' ? true : undefined}
      onPointerEnter={onEnter}
      onClick={onClick}
      focusable="false"
    >
      {SHAPE_ORDER.map((s) => (
        <g key={s} data-shape={s} style={{ transformBox: 'fill-box', transformOrigin: '50% 50%' }}>
          <path d={MARK_PATHS[s]} fill={fill(s)} />
        </g>
      ))}
    </svg>
  );
}
