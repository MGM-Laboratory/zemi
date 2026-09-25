'use client';

import { useCallback, useEffect, useImperativeHandle, useRef, type CSSProperties, type Ref } from 'react';
import { SHAPE_CHARACTER, SHAPE_COLORS, SHAPE_PATHS_46, type ShapeName } from '@zemi/shared';
import { pointer } from '@/lib/hooks/use-pointer';
import { prefersReducedMotion } from '@/lib/hooks/use-reduced-motion';
import { cn } from '@/lib/utils';
import styles from './brand.module.css';

export type CharacterMood = 'idle' | 'happy' | 'sleepy' | 'surprised' | 'thinking';

export interface CharacterHandle {
  /** Jump + spin, then land with a squash. */
  cheer(): void;
  squash(): void;
  blink(): void;
}

export interface CharacterProps {
  shape: ShapeName;
  mood?: CharacterMood;
  /** px number or CSS length. Default 64. */
  size?: number | string;
  /** Eyes follow the pointer (or wander on touch devices). Default true. */
  track?: boolean;
  /** Squash on click/tap. Default true. */
  interactive?: boolean;
  /** Change the number to trigger a cheer (for example after a successful form). */
  cheer?: number;
  /** Body color override. Default: the shape's brand color. */
  color?: string;
  /** Accessible name. Default: decorative (aria-hidden). Pass `true` to use "Q, the question" etc. */
  label?: string | true;
  /** Desync idle sway between neighbours. */
  seed?: number;
  className?: string;
  style?: CSSProperties;
  ref?: Ref<CharacterHandle>;
  onClick?: () => void;
}

interface EyeSpec {
  l: [number, number];
  r: [number, number];
  s: number;
}

const EYES: Record<ShapeName, EyeSpec> = {
  circle: { l: [16.2, 20.5], r: [29.8, 20.5], s: 3.5 },
  triangle: { l: [18.4, 31.2], r: [27.6, 31.2], s: 2.9 },
  square: { l: [15.6, 21], r: [30.4, 21], s: 3.7 },
  arch: { l: [15.6, 23.5], r: [30.4, 23.5], s: 3.6 },
};

const INK = '#0e1116';
const EASE_OUT = 'cubic-bezier(0.22, 1, 0.36, 1)';

function Eye({ cx, cy, s, mood }: { cx: number; cy: number; s: number; mood: CharacterMood }) {
  if (mood === 'happy') {
    return (
      <path
        d={`M${cx - s} ${cy + s * 0.35} Q${cx} ${cy - s * 1.25} ${cx + s} ${cy + s * 0.35}`}
        fill="none"
        stroke={INK}
        strokeWidth={s * 0.62}
        strokeLinecap="round"
      />
    );
  }
  if (mood === 'sleepy') {
    return (
      <path
        d={`M${cx - s} ${cy - s * 0.1} Q${cx} ${cy + s * 0.95} ${cx + s} ${cy - s * 0.1}`}
        fill="none"
        stroke={INK}
        strokeWidth={s * 0.55}
        strokeLinecap="round"
      />
    );
  }
  const k = mood === 'surprised' ? 1.3 : 1;
  const rx = s * k;
  const ry = s * 1.12 * k;
  return (
    <g>
      <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill={INK} />
      <circle cx={cx - rx * 0.32} cy={cy - ry * 0.38} r={rx * 0.36} fill="#fff" />
    </g>
  );
}

/**
 * A 2D brand character: one shape with two ink eyes. Eyes follow the pointer, blink every 3 to
 * 6s, squash on click and cheer on demand. No mouths, no limbs.
 *
 * @example <Character shape="circle" mood="happy" size={96} />
 * @example const ref = useRef<CharacterHandle>(null); ... ref.current?.cheer()
 */
export function Character({
  shape,
  mood = 'idle',
  size = 64,
  track = true,
  interactive = true,
  cheer,
  color,
  label,
  seed = 0,
  className,
  style,
  ref,
  onClick,
}: CharacterProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const lookRef = useRef<SVGGElement>(null);
  const blinkRef = useRef<SVGGElement>(null);
  const jumpRef = useRef<SVGGElement>(null);
  const bodyRef = useRef<SVGGElement>(null);
  const spec = EYES[shape];
  const eyesOpen = mood !== 'happy' && mood !== 'sleepy';

  const blink = useCallback(() => {
    const el = blinkRef.current;
    if (!el || typeof el.animate !== 'function') return;
    el.animate(
      [{ transform: 'scaleY(1)' }, { transform: 'scaleY(0.08)', offset: 0.45 }, { transform: 'scaleY(1)' }],
      { duration: 180, easing: 'ease-in-out' },
    );
  }, []);

  const squash = useCallback(() => {
    const el = bodyRef.current;
    if (!el || typeof el.animate !== 'function') return;
    const reduced = prefersReducedMotion();
    el.animate(
      reduced
        ? [{ transform: 'scale(1)' }, { transform: 'scale(0.94)' }, { transform: 'scale(1)' }]
        : [
            { transform: 'scale(1, 1)' },
            { transform: 'scale(1.16, 0.8)', offset: 0.22 },
            { transform: 'scale(0.92, 1.1)', offset: 0.5 },
            { transform: 'scale(1.03, 0.97)', offset: 0.75 },
            { transform: 'scale(1, 1)' },
          ],
      { duration: reduced ? 200 : 540, easing: EASE_OUT },
    );
  }, []);

  const doCheer = useCallback(() => {
    const el = jumpRef.current;
    if (!el || typeof el.animate !== 'function') return;
    if (prefersReducedMotion()) {
      squash();
      return;
    }
    el.animate(
      [
        { transform: 'translateY(0) rotate(0deg)', easing: 'cubic-bezier(0.2, 0.7, 0.3, 1)' },
        { transform: 'translateY(-20px) rotate(180deg)', offset: 0.42, easing: 'cubic-bezier(0.6, 0, 0.8, 0.4)' },
        { transform: 'translateY(0) rotate(360deg)', offset: 0.78 },
        { transform: 'translateY(0) rotate(360deg)' },
      ],
      { duration: 780 },
    );
    setTimeout(squash, 600);
  }, [squash]);

  useImperativeHandle(ref, () => ({ cheer: doCheer, squash, blink }), [doCheer, squash, blink]);

  // Cheer on prop change (not on mount; value compare survives StrictMode).
  const lastCheer = useRef(cheer);
  useEffect(() => {
    if (lastCheer.current === cheer) return;
    lastCheer.current = cheer;
    if (cheer !== undefined) doCheer();
  }, [cheer, doCheer]);

  // Blink every 3 to 6s (sometimes twice).
  useEffect(() => {
    if (!eyesOpen || mood === 'surprised') return;
    let t: ReturnType<typeof setTimeout>;
    const loop = () => {
      t = setTimeout(
        () => {
          blink();
          if (Math.random() < 0.2) setTimeout(blink, 240);
          loop();
        },
        3000 + Math.random() * 3000,
      );
    };
    loop();
    return () => clearTimeout(t);
  }, [blink, eyesOpen, mood]);

  // Eye tracking: pointer on fine devices, a lazy wander on touch.
  useEffect(() => {
    const svg = svgRef.current;
    const look = lookRef.current;
    if (!svg || !look || !track || prefersReducedMotion()) return;
    const maxX = spec.s * (mood === 'thinking' ? 0.2 : 0.55);
    const maxY = spec.s * (mood === 'thinking' ? 0.2 : 0.45);
    const base = mood === 'thinking' ? { x: spec.s * 0.55, y: -spec.s * 0.5 } : { x: 0, y: 0 };
    const cur = { x: 0, y: 0 };
    const target = { x: 0, y: 0 };
    let raf = 0;
    let visible = true;
    let wander: ReturnType<typeof setTimeout> | null = null;

    const apply = () => {
      look.style.transform = `translate(${(base.x + cur.x).toFixed(3)}px, ${(base.y + cur.y).toFixed(3)}px)`;
    };
    const frame = () => {
      raf = 0;
      cur.x += (target.x - cur.x) * 0.18;
      cur.y += (target.y - cur.y) * 0.18;
      apply();
      if (Math.abs(target.x - cur.x) > 0.01 || Math.abs(target.y - cur.y) > 0.01) raf = requestAnimationFrame(frame);
    };
    const kick = () => {
      if (!raf && visible) raf = requestAnimationFrame(frame);
    };
    const aim = (px: number, py: number) => {
      const r = svg.getBoundingClientRect();
      const dx = px - (r.left + r.width / 2);
      const dy = py - (r.top + r.height / 2);
      const d = Math.hypot(dx, dy) || 1;
      const f = Math.min(1, d / 260);
      target.x = (dx / d) * f * maxX;
      target.y = (dy / d) * f * maxY;
      kick();
    };

    const unsub = pointer.subscribe((p) => {
      if (p.type === 'touch') return;
      if (wander) {
        clearTimeout(wander);
        wander = null;
      }
      aim(p.x, p.y);
    });

    const startWander = () => {
      const step = () => {
        const a = Math.random() * Math.PI * 2;
        const m = Math.random() < 0.3 ? 0 : 1;
        target.x = Math.cos(a) * maxX * m;
        target.y = Math.sin(a) * maxY * m;
        kick();
        wander = setTimeout(step, 1800 + Math.random() * 2600);
      };
      wander = setTimeout(step, 800 + seed * 300);
    };
    const fine = window.matchMedia?.('(hover: hover) and (pointer: fine)').matches;
    if (!fine) startWander();

    const io =
      typeof IntersectionObserver !== 'undefined'
        ? new IntersectionObserver(([e]) => {
            visible = !!e?.isIntersecting;
            if (visible) kick();
          })
        : null;
    io?.observe(svg);
    apply();

    return () => {
      unsub();
      io?.disconnect();
      if (raf) cancelAnimationFrame(raf);
      if (wander) clearTimeout(wander);
    };
  }, [track, mood, spec.s, seed]);

  const fill = color ?? SHAPE_COLORS[shape];
  const name = label === true ? `${SHAPE_CHARACTER[shape].name}, ${SHAPE_CHARACTER[shape].meaning}` : label;
  const swayVars = {
    '--sway-delay': `${-((seed * 0.73) % 3.8).toFixed(2)}s`,
    '--sway-duration': `${(3.4 + ((seed * 0.37) % 1)).toFixed(2)}s`,
  } as CSSProperties;

  return (
    <svg
      ref={svgRef}
      viewBox="0 0 46 46"
      width={typeof size === 'number' ? size : undefined}
      height={typeof size === 'number' ? size : undefined}
      className={cn(styles.character, styles[mood], className)}
      style={{ width: size, height: size, ...swayVars, ...style }}
      data-interactive={interactive}
      role={name ? 'img' : undefined}
      aria-label={name || undefined}
      aria-hidden={name ? undefined : true}
      focusable="false"
      onPointerDown={interactive ? squash : undefined}
      onClick={onClick}
    >
      <g className={styles.sway}>
        <g ref={jumpRef} style={{ transformBox: 'fill-box', transformOrigin: '50% 50%' }}>
          <g ref={bodyRef} className={styles.body}>
            <path d={SHAPE_PATHS_46[shape]} fill={fill} />
            <g ref={lookRef}>
              <g ref={blinkRef} className={styles.eyes}>
                <Eye cx={spec.l[0]} cy={spec.l[1]} s={spec.s} mood={mood} />
                <Eye cx={spec.r[0]} cy={spec.r[1]} s={spec.s} mood={mood} />
              </g>
            </g>
          </g>
        </g>
      </g>
      {mood === 'sleepy' ? (
        <g aria-hidden="true" style={{ color: INK }}>
          <text x="38" y="6" fontSize="9" className={styles.zzz}>
            z
          </text>
          <text x="43" y="-2" fontSize="7" className={styles.zzz}>
            z
          </text>
        </g>
      ) : null}
      {mood === 'thinking' ? (
        <g aria-hidden="true" fill={INK}>
          <circle cx="41" cy="3" r="1.3" className={styles.thought} />
          <circle cx="45.5" cy="-2" r="1.8" className={styles.thought} />
          <circle cx="51" cy="-8.5" r="2.4" className={styles.thought} />
        </g>
      ) : null}
    </svg>
  );
}
