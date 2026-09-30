'use client';

import { fromJakartaInput, jakartaDateInput, SHAPE_COLORS, type ShapeName } from '@zemi/shared';
import { useLayoutEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { useSlide } from '../engine/context';
import { fontStyle } from '../engine/fit-text';
import { BE, gsap } from '../engine/gsap';
import { ACCENT_SHAPE, INK, INK_2, LINE, PAPER, SHAPE_ACCENT } from '../engine/palette';
import type { BumperPerson, ResolveCtx } from '../engine/types';
import { BrandShape, BumperAvatar } from '../parts/shapes';

/**
 * Small shared pieces for the pre-show and opening templates: accent colors that never vanish
 * on the accent background, card plates, the highlighter, ticking digits, a clock face and a
 * progress ring. Hex colors only (OBS, the player and thumbnails must paint the same).
 */

/* ---------------------------------------------------------------- colors */

/** Accent for shapes, lines and fills: on the accent background it flips to the text color. */
export function accentFill(ctx: ResolveCtx): string {
  return ctx.background === 'accent' ? ctx.colors.onAccent : ctx.colors.accentHex;
}

/** Accent for text: yellow text on a light background fails contrast, so it becomes ink. */
export function accentText(ctx: ResolveCtx): string {
  if (ctx.background === 'accent') return ctx.colors.onAccent;
  if (ctx.accent === 'yellow' && !ctx.colors.dark) return INK;
  return ctx.colors.accentHex;
}

/**
 * Fill for a brand character: its own color, except on an accent background of the same color,
 * where it turns paper white so it never melts into the backdrop.
 */
export function charColor(ctx: ResolveCtx, shape: ShapeName): string | undefined {
  return ctx.background === 'accent' && SHAPE_ACCENT[shape] === ctx.accent ? PAPER : undefined;
}

/**
 * The offset shape behind a portrait: the accent, unless that is the same color the portrait's
 * own shape (or initials disc) uses, or the backdrop itself; then a color that separates.
 */
export function portraitBack(ctx: ResolveCtx, shape: ShapeName): string {
  if (ctx.background === 'accent') return ctx.accent === 'yellow' ? INK : PAPER;
  const own = SHAPE_COLORS[shape];
  if (own.toLowerCase() !== ctx.colors.accentHex.toLowerCase()) return ctx.colors.accentHex;
  return ctx.accent === 'yellow' ? SHAPE_COLORS.circle : SHAPE_COLORS.square;
}

/**
 * A portrait in the person's shape with an offset shape behind it (like the kit's Portrait),
 * but colors that never melt into the backdrop: the back shape follows `portraitBack`, and an
 * initials disc that would match an accent background turns ink.
 */
export function PersonPortrait({ person, size, shape, back = true }: { person: BumperPerson; size: number; shape?: ShapeName; back?: boolean }) {
  const ctx = useSlide();
  const s = shape ?? person.shape;
  const melts = !person.avatar && ctx.background === 'accent' && SHAPE_ACCENT[s] === ctx.accent;
  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      {back ? (
        <div data-portrait-back="" style={{ position: 'absolute', left: size * 0.09, top: size * 0.07, width: size, height: size }}>
          <BrandShape shape={s} color={melts ? PAPER : portraitBack(ctx, s)} />
        </div>
      ) : null}
      <div data-portrait="" style={{ position: 'relative' }}>
        <BumperAvatar image={person.avatar} name={person.name} clip={s} size={size} color={melts ? INK : undefined} />
      </div>
    </div>
  );
}

/** A soft tint that reads on this background (disc behind a portrait, halo behind an icon). */
export function softFill(ctx: ResolveCtx): string {
  if (ctx.background === 'accent') return ctx.accent === 'yellow' ? '#fde7a6' : '#ffffff26';
  if (ctx.colors.dark) return `${ctx.colors.accentHex}33`;
  return ctx.colors.accentSoft;
}

export interface Plate {
  bg: string;
  fg: string;
  fg2: string;
  border: string;
  line: string;
  /** Offset "sticker" shadow color. */
  shadow: string;
  dark: boolean;
}

/**
 * A card surface that works on every background: white with an ink outline and an accent
 * offset shadow on light backgrounds, white with an ink shadow on the accent color, a lifted
 * ink card with an accent shadow on dark ones.
 */
export function plate(ctx: ResolveCtx): Plate {
  if (ctx.colors.dark && ctx.background !== 'accent') {
    return { bg: '#181d26', fg: PAPER, fg2: '#f5f6f8b8', border: '#ffffff2e', line: '#ffffff1f', shadow: ctx.colors.accentHex, dark: true };
  }
  if (ctx.background === 'accent') return { bg: PAPER, fg: INK, fg2: INK_2, border: INK, line: LINE, shadow: INK, dark: false };
  return { bg: PAPER, fg: INK, fg2: INK_2, border: INK, line: LINE, shadow: ctx.accent === 'yellow' ? '#f7bf33' : ctx.colors.accentHex, dark: false };
}

export function plateStyle(p: Plate, { radius = 28, lift = 14, border = 4 }: { radius?: number; lift?: number; border?: number } = {}): CSSProperties {
  return {
    background: p.bg,
    color: p.fg,
    borderRadius: radius,
    border: `${p.dark ? Math.max(2, border - 1) : border}px solid ${p.border}`,
    boxShadow: lift ? `${lift}px ${lift}px 0 ${p.shadow}` : undefined,
  };
}

/** Highlighter swipe behind text. Yellow marker on light paper (multiply), tinted bands elsewhere. */
export function marker(ctx: ResolveCtx): { color: string; blend: CSSProperties['mixBlendMode'] } {
  if (ctx.background === 'accent') return { color: ctx.accent === 'yellow' ? '#ffffffb3' : '#0e11163d', blend: 'normal' };
  if (ctx.colors.dark) return { color: `${ctx.colors.accentHex}59`, blend: 'normal' };
  return { color: '#f7bf33', blend: 'multiply' };
}

/* ---------------------------------------------------------------- time */

/** HH:mm on today's date in Jakarta (the "time of day" meaning of a countdown field). */
export function todayAt(hhmm: string, now: number): number | null {
  if (!/^\d{1,2}:\d{2}$/.test(hhmm.trim())) return null;
  const [h, m] = hhmm.trim().split(':');
  return fromJakartaInput(jakartaDateInput(new Date(now)), `${h!.padStart(2, '0')}:${m}`).getTime();
}

export interface TimeLeft {
  d: number;
  h: number;
  m: number;
  s: number;
  /** Whole seconds left. */
  total: number;
}

export function timeLeft(ms: number): TimeLeft {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return { d: Math.floor(total / 86400), h: Math.floor((total % 86400) / 3600), m: Math.floor((total % 3600) / 60), s: total % 60, total };
}

export const two = (n: number) => String(n).padStart(2, '0');

/** Round SVG coordinates so the server render and the browser agree to the last digit (hydration). */
export const r2d = (n: number) => Math.round(n * 100) / 100;

/* ---------------------------------------------------------------- ticking digits */

/**
 * One digit that animates when its value changes (live mode only): `drop` slides the new digit
 * in from above, `flip` turns it over like a split-flap cell. Never animates on the first render.
 */
export function TickDigit({ value, kind = 'drop', live, calm, style }: { value: string; kind?: 'drop' | 'flip'; live: boolean; calm: boolean; style?: CSSProperties }) {
  const ref = useRef<HTMLSpanElement>(null);
  const prev = useRef(value);
  useLayoutEffect(() => {
    if (prev.current === value) return;
    prev.current = value;
    const el = ref.current;
    if (!live || !el) return;
    if (kind === 'flip') {
      gsap.fromTo(el, { rotationX: calm ? -50 : -95, transformPerspective: 600, transformOrigin: '50% 50%' }, { rotationX: 0, duration: calm ? 0.45 : 0.38, ease: BE.out, overwrite: true });
    } else {
      gsap.fromTo(el, { yPercent: calm ? -18 : -42, opacity: 0 }, { yPercent: 0, opacity: 1, duration: calm ? 0.5 : 0.36, ease: BE.out, overwrite: true });
    }
  }, [value, live, calm, kind]);
  return (
    <span ref={ref} data-tick-digit="" suppressHydrationWarning style={{ display: 'inline-block', willChange: live ? 'transform' : undefined, ...style }}>
      {value}
    </span>
  );
}

/** Mono glyph advance of Recursive MONO (em). Used to size digits without measuring every second. */
export const MONO_ADVANCE = 0.6;

/* ---------------------------------------------------------------- progress ring and pie */

/**
 * A progress ring (the "clock wipe"): the remaining time as an arc from 12 o'clock, clockwise.
 * React sets the arc every tick; animate the wrapping [data-ring] group, never the arc itself.
 */
export function ProgressRing({ frac, size, stroke, color, track }: { frac: number; size: number; stroke: number; color: string; track: string }) {
  const r = (size - stroke) / 2;
  const f = Math.max(0, Math.min(1, frac));
  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} style={{ display: 'block', overflow: 'visible' }} aria-hidden="true">
      <g data-ring="">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        {f > 0 ? (
          <circle
            data-ring-arc=""
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            pathLength={1000}
            strokeDasharray={`${Math.max(0.5, f * 1000)} 1000`}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        ) : null}
      </g>
    </svg>
  );
}

/** A filled pie sector (remaining fraction, clockwise from 12) for small clock wipes. */
export function piePath(cx: number, cy: number, r: number, frac: number): string {
  const f = Math.max(0, Math.min(1, frac));
  if (f >= 0.9999) return `M${cx} ${cy - r}A${r} ${r} 0 1 1 ${cx - 0.01} ${cy - r}Z`;
  if (f <= 0) return '';
  const a = f * Math.PI * 2 - Math.PI / 2;
  const x = r2d(cx + r * Math.cos(a));
  const y = r2d(cy + r * Math.sin(a));
  return `M${cx} ${cy}L${cx} ${cy - r}A${r} ${r} 0 ${f > 0.5 ? 1 : 0} 1 ${x} ${y}Z`;
}

/* ---------------------------------------------------------------- clock face */

/** Hand angles (degrees from 12 o'clock) for HH:mm. */
export function handAngles(hhmm: string | null): { hour: number; minute: number } | null {
  if (!hhmm || !/^\d{1,2}:\d{2}$/.test(hhmm)) return null;
  const [h, m] = hhmm.split(':').map(Number) as [number, number];
  return { hour: ((h % 12) + m / 60) * 30, minute: m * 6 };
}

/**
 * An analog clock face on a 200 unit viewBox. The hands sit in `[data-hand=hour|minute]`
 * groups inside a statically rotated parent, so an entrance can sweep them from any angle to 0
 * (use svgOrigin "100 100").
 */
export function ClockFace({ time, face, rim, ink, hand, pin }: { time: string | null; face: string; rim: string; ink: string; hand: string; pin: string }) {
  const a = handAngles(time) ?? { hour: 0, minute: 0 };
  return (
    <svg viewBox="0 0 200 200" style={{ display: 'block', width: '100%', height: '100%', overflow: 'visible' }} aria-hidden="true">
      <circle cx="100" cy="100" r="96" fill={face} stroke={rim} strokeWidth="5" />
      <g data-clock-ticks="">
        {Array.from({ length: 60 }, (_, i) => {
          const major = i % 5 === 0;
          const ang = (i * 6 * Math.PI) / 180;
          const r1 = major ? 76 : 82;
          const r2 = 88;
          return (
            <line
              key={i}
              x1={r2d(100 + r1 * Math.sin(ang))}
              y1={r2d(100 - r1 * Math.cos(ang))}
              x2={r2d(100 + r2 * Math.sin(ang))}
              y2={r2d(100 - r2 * Math.cos(ang))}
              stroke={ink}
              strokeOpacity={major ? 1 : 0.35}
              strokeWidth={major ? 4.2 : 1.8}
              strokeLinecap="round"
            />
          );
        })}
      </g>
      <g transform={`rotate(${a.hour} 100 100)`} suppressHydrationWarning>
        <g data-hand="hour">
          <path d="M100 108 L100 52" stroke={ink} strokeWidth="9" strokeLinecap="round" />
        </g>
      </g>
      <g transform={`rotate(${a.minute} 100 100)`} suppressHydrationWarning>
        <g data-hand="minute">
          <path d="M100 114 L100 30" stroke={hand} strokeWidth="6" strokeLinecap="round" />
        </g>
      </g>
      <circle cx="100" cy="100" r="8.5" fill={pin} stroke={ink} strokeWidth="3" />
    </svg>
  );
}

/* ---------------------------------------------------------------- small blocks */

/**
 * Mono uppercase label with a shape bullet, for labels that sit on plates (the kit's Eyebrow
 * recolors its bullet for the accent background, which would vanish on a white card).
 */
export function Label({ children, shape, color, bullet, size = 28, style }: { children: ReactNode; shape?: ShapeName; color: string; bullet: string; size?: number; style?: CSSProperties }) {
  const ctx = useSlide();
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: size * 0.5, ...fontStyle('mono', { weight: 700, tracking: 0.12 }), fontSize: size, textTransform: 'uppercase', color, lineHeight: 1, ...style }}>
      <span style={{ width: size * 0.8, height: size * 0.8, flex: 'none' }}>
        <BrandShape shape={shape ?? ACCENT_SHAPE[ctx.accent]} color={bullet} />
      </span>
      <span data-split-target="">{children}</span>
    </span>
  );
}

/** A pill chip (mode, tags, "Now"). */
export function Chip({ children, bg, fg, border, size = 26, style }: { children: ReactNode; bg: string; fg: string; border?: string; size?: number; style?: CSSProperties }) {
  return (
    <span
      style={{
        ...fontStyle('mono', { weight: 700, tracking: 0.08 }),
        display: 'inline-flex',
        alignItems: 'center',
        gap: size * 0.4,
        fontSize: size,
        lineHeight: 1,
        textTransform: 'uppercase',
        padding: `${size * 0.42}px ${size * 0.75}px`,
        borderRadius: 999,
        background: bg,
        color: fg,
        border: border ? `3px solid ${border}` : undefined,
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      {children}
    </span>
  );
}

/**
 * The largest display size at which the longest word of `text` still fits `width` (so FitText
 * shrinks names instead of breaking them mid-word). `em` is the average glyph width.
 */
export function wordSafeMax(text: string, width: number, max: number, em = 0.62): number {
  const longest = text.split(/\s+/).reduce((n, w) => Math.max(n, w.length), 1);
  return Math.max(12, Math.min(max, width / (longest * em)));
}

/** Stable small hash for picking layouts per record. */
export function hashOf(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

/** True when bespoke entrance tweens should run (the "still" motion level only fades). */
export function moves(ctx: ResolveCtx): boolean {
  return ctx.theme.motion !== 'still';
}

/** The slide context plus the flags every template here needs. */
export function useOpenCtx() {
  const ctx = useSlide();
  return { ctx, live: ctx.mode === 'live', calm: ctx.theme.motion !== 'full' };
}
