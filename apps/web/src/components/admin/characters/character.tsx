'use client';

import { SHAPE_CHARACTER, SHAPE_COLORS, SHAPE_PATHS_46, type ShapeName } from '@zemi/shared';
import { motion, useReducedMotion, type Transition } from 'motion/react';
import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { cn } from '@/lib/admin/cn';

/**
 * The four Zemi characters (DESIGN.md section 1): Q (circle), Hunch (triangle),
 * Block (square), Bridge (arch). Two ink eyes with a glint, no mouths, no limbs.
 *
 * Moods:
 * - `idle`   eyes open, blink every 3 to 6 s, gentle sway
 * - `look`   eyes follow `lookAt` (normalized -1..1) or the cursor when `follow`
 * - `closed` eyes shut, calm curves (used when a passphrase is hidden)
 * - `happy`  "^ ^" eyes
 * - `cheer`  happy eyes + hop and spin (success)
 * - `oops`   small eyes looking down + a wobble (errors)
 * - `sleep`  closed eyes, slow breathing (empty or idle states)
 */
export type CharacterMood = 'idle' | 'look' | 'closed' | 'happy' | 'cheer' | 'oops' | 'sleep';

export interface CharacterProps {
  shape: ShapeName;
  mood?: CharacterMood;
  /** Rendered size in px (square). Default 64. */
  size?: number;
  /** Track the pointer with the eyes (only on fine pointers, never with reduced motion). */
  follow?: boolean;
  /** Explicit gaze, x and y in -1..1. Wins over `follow`. */
  lookAt?: { x: number; y: number } | null;
  /** Override the fill (defaults to the brand color of the shape). */
  color?: string;
  /** Change this number to replay the cheer/oops animation. */
  replayKey?: number;
  className?: string;
  style?: CSSProperties;
  /** Accessible name. Characters are decorative (aria-hidden) unless you pass a title. */
  title?: string;
}

/** Eye centers in the 46x46 shape box. */
const EYES: Record<ShapeName, { l: [number, number]; r: [number, number]; rx: number; ry: number }> = {
  circle: { l: [16.5, 20], r: [29.5, 20], rx: 3, ry: 3.6 },
  triangle: { l: [18.5, 31], r: [27.5, 31], rx: 2.6, ry: 3.1 },
  square: { l: [16.5, 21], r: [29.5, 21], rx: 3, ry: 3.6 },
  arch: { l: [16.5, 27], r: [29.5, 27], rx: 3, ry: 3.6 },
};

const PLAYFUL: Transition = { type: 'spring', stiffness: 320, damping: 22 };
const CALM: Transition = { type: 'spring', stiffness: 180, damping: 26 };

/* A single shared pointer listener for every character on the page. */
type PointerListener = (x: number, y: number) => void;
const pointerListeners = new Set<PointerListener>();
let pointerBound = false;
function subscribePointer(fn: PointerListener) {
  pointerListeners.add(fn);
  if (!pointerBound && typeof window !== 'undefined') {
    pointerBound = true;
    let frame = 0;
    let lx = 0;
    let ly = 0;
    window.addEventListener(
      'pointermove',
      (e) => {
        lx = e.clientX;
        ly = e.clientY;
        if (frame) return;
        frame = requestAnimationFrame(() => {
          frame = 0;
          pointerListeners.forEach((l) => l(lx, ly));
        });
      },
      { passive: true },
    );
  }
  return () => {
    pointerListeners.delete(fn);
  };
}

function useFinePointer() {
  const [fine, setFine] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia('(pointer: fine)');
    setFine(mql.matches);
    const on = () => setFine(mql.matches);
    mql.addEventListener('change', on);
    return () => mql.removeEventListener('change', on);
  }, []);
  return fine;
}

export function Character({
  shape,
  mood = 'idle',
  size = 64,
  follow = false,
  lookAt = null,
  color,
  replayKey = 0,
  className,
  style,
  title,
}: CharacterProps) {
  const reduce = useReducedMotion() ?? false;
  const finePointer = useFinePointer();
  const ref = useRef<SVGSVGElement>(null);
  const [gaze, setGaze] = useState({ x: 0, y: 0 });
  const [blink, setBlink] = useState(false);
  const titleId = useId();

  // Pointer follow.
  useEffect(() => {
    if (!follow || lookAt || reduce || !finePointer) return;
    return subscribePointer((px, py) => {
      const el = ref.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const dx = px - cx;
      const dy = py - cy;
      const dist = Math.hypot(dx, dy) || 1;
      const reach = Math.min(1, dist / 260);
      setGaze({ x: (dx / dist) * reach, y: (dy / dist) * reach });
    });
  }, [follow, lookAt, reduce, finePointer]);

  // Blink every 3 to 6 s while the eyes are open.
  const eyesOpen = mood === 'idle' || mood === 'look' || mood === 'oops';
  useEffect(() => {
    if (!eyesOpen || reduce) return;
    let t: ReturnType<typeof setTimeout>;
    let t2: ReturnType<typeof setTimeout>;
    const loop = () => {
      t = setTimeout(
        () => {
          setBlink(true);
          t2 = setTimeout(() => setBlink(false), 130);
          loop();
        },
        3000 + Math.random() * 3000,
      );
    };
    loop();
    return () => {
      clearTimeout(t);
      clearTimeout(t2);
    };
  }, [eyesOpen, reduce]);

  const eyes = EYES[shape];
  const target = lookAt ?? (mood === 'oops' ? { x: 0, y: 0.8 } : gaze);
  const gx = Math.max(-1, Math.min(1, target.x)) * 2.3;
  const gy = Math.max(-1, Math.min(1, target.y)) * 1.9;
  const fill = color ?? SHAPE_COLORS[shape];
  const eyeScale = mood === 'oops' ? 0.78 : 1;

  const bodyAnimate = reduce
    ? {}
    : mood === 'cheer'
      ? { y: [0, -9, 0, -5, 0], rotate: [0, -8, 360, 360, 360], scaleY: [1, 1.06, 0.92, 1.03, 1] }
      : mood === 'oops'
        ? { x: [0, -2.2, 2.2, -1.4, 1.4, 0], rotate: 0, y: 0 }
        : mood === 'sleep'
          ? { scaleY: [1, 0.965, 1], y: [0, 0.6, 0], rotate: 0, x: 0 }
          : { rotate: [0, -1.6, 0, 1.6, 0], y: 0, x: 0 };

  const bodyTransition: Transition = reduce
    ? { duration: 0 }
    : mood === 'cheer'
      ? { duration: 0.9, ease: [0.22, 1, 0.36, 1], times: [0, 0.3, 0.55, 0.78, 1] }
      : mood === 'oops'
        ? { duration: 0.45, ease: 'easeInOut' }
        : mood === 'sleep'
          ? { duration: 3.2, repeat: Infinity, ease: 'easeInOut' }
          : { duration: 6 + (shape.length % 3), repeat: Infinity, ease: 'easeInOut' };

  return (
    <svg
      ref={ref}
      viewBox="-6 -10 58 62"
      width={size}
      height={size}
      className={cn('shrink-0 overflow-visible select-none', className)}
      style={style}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-labelledby={title ? titleId : undefined}
      focusable="false"
    >
      {title ? <title id={titleId}>{title}</title> : null}
      <motion.g
        key={`${mood}-${replayKey}`}
        animate={bodyAnimate}
        transition={bodyTransition}
      >
        <path d={SHAPE_PATHS_46[shape]} fill={fill} />
        {(['l', 'r'] as const).map((side) => {
          const [cx, cy] = eyes[side];
          if (mood === 'closed' || mood === 'sleep') {
            return (
              <path
                key={side}
                d={`M${cx - eyes.rx} ${cy} Q${cx} ${cy + eyes.ry * 0.95} ${cx + eyes.rx} ${cy}`}
                fill="none"
                stroke="#0e1116"
                strokeWidth={1.7}
                strokeLinecap="round"
              />
            );
          }
          if (mood === 'happy' || mood === 'cheer') {
            return (
              <path
                key={side}
                d={`M${cx - eyes.rx} ${cy + 0.9} Q${cx} ${cy - eyes.ry * 1.05} ${cx + eyes.rx} ${cy + 0.9}`}
                fill="none"
                stroke="#0e1116"
                strokeWidth={1.8}
                strokeLinecap="round"
              />
            );
          }
          return (
            <motion.g key={side} animate={{ x: gx, y: gy }} transition={follow || lookAt ? CALM : PLAYFUL}>
              <motion.g
                animate={{ scaleY: blink ? 0.12 : eyeScale, scaleX: eyeScale }}
                transition={{ duration: blink ? 0.07 : 0.12 }}
              >
                <ellipse cx={cx} cy={cy} rx={eyes.rx} ry={eyes.ry} fill="#0e1116" />
                <circle cx={cx - eyes.rx * 0.36} cy={cy - eyes.ry * 0.38} r={eyes.rx * 0.34} fill="#ffffff" />
              </motion.g>
            </motion.g>
          );
        })}
      </motion.g>
    </svg>
  );
}

/** Character names and meanings, for alt text and captions. */
export function characterName(shape: ShapeName): string {
  return SHAPE_CHARACTER[shape].name;
}
