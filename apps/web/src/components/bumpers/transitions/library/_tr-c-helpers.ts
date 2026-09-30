'use client';

import { BUMPER_KIND_META } from '@zemi/shared';
import { gsap } from '../../engine/gsap';
import { INK, PAPER } from '../../engine/palette';
import { cleanRoots } from '../helpers';
import type { TransitionContext } from '../types';

/**
 * Small shared kit for page-turn, ribbon-sweep, scramble-cut, clock-wipe, ink-flood,
 * gravity-drop, halftone and word-wipe. Everything here is pure or builds overlay DOM, so the
 * transitions stay deterministic (seeded) and safe to finish early with tl.progress(1).
 */

export const W = 1920;
export const H = 1080;

/** Seconds at speed 1 to seconds at the context's speed. */
export const sec = (ctx: Pick<TransitionContext, 'speed'>, s: number) => s / ctx.speed;

export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** A named GSAP ease as a plain function (for per-frame math driven by one proxy tween). */
export function easeFn(name: string): (t: number) => number {
  return gsap.parseEase(name) ?? ((t: number) => t);
}

/**
 * One proxy tween from 0 to 1 whose onUpdate paints a frame. The frame function must be a pure
 * function of `p`, so jumping to the end (progress(1)) paints the final frame.
 */
export function drive(tl: gsap.core.Timeline, at: number, duration: number, frame: (p: number) => void, ease = 'none') {
  const o = { p: 0 };
  tl.fromTo(o, { p: 0 }, { p: 1, duration, ease, immediateRender: false, onUpdate: () => frame(o.p) }, at);
}

/** A seeded Fisher-Yates shuffle (returns a new array). */
export function shuffle<T>(list: readonly T[], rand: () => number): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/* ---------------------------------------------------------------- color */

function rgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const h = m[1]!.length === 3 ? m[1]!.replace(/./g, (c) => c + c) : m[1]!;
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/** WCAG relative luminance (0 black, 1 white); null for 'transparent' and friends. */
export function luminance(hex: string): number | null {
  const c = rgb(hex);
  if (!c) return null;
  const [r, g, b] = c.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  if (la === null || lb === null) return 21;
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** The painted backgrounds of both slides (transparent ones left out). */
export function slideBgs(ctx: Pick<TransitionContext, 'fromColors' | 'toColors'>): string[] {
  return [ctx.fromColors?.bg, ctx.toColors.bg].filter((c): c is string => !!c && luminance(c) !== null);
}

/**
 * The first candidate that reads against every background (contrast ratio above `min`), else the
 * candidate with the best worst case. Keeps curtains visible on paper, ink and accent slides.
 */
export function standOut(candidates: string[], against: string[], min = 1.45): string {
  let best = candidates[0] ?? INK;
  let bestScore = -1;
  for (const c of candidates) {
    const worst = against.length ? Math.min(...against.map((b) => contrast(c, b))) : 21;
    if (worst >= min) return c;
    if (worst > bestScore) {
      bestScore = worst;
      best = c;
    }
  }
  return best;
}

/** Ink or paper, whichever reads on `bg`. */
export function inkOn(bg: string): string {
  const l = luminance(bg);
  return l !== null && l < 0.4 ? PAPER : INK;
}

/* ---------------------------------------------------------------- text */

/**
 * The incoming slide's headline for word-wipe and scramble-cut, never empty: the template's
 * headline, else the kind's label ("Q and A"), clamped at a word boundary.
 */
export function headlineOf(ctx: Pick<TransitionContext, 'headline' | 'toSlide'>, max = 32): string {
  const raw = (ctx.headline || ctx.toSlide.label || BUMPER_KIND_META[ctx.toSlide.kind]?.label || '').replace(/\s+/g, ' ').trim();
  if (raw.length <= max) return raw;
  const cut = raw.slice(0, max + 1);
  const at = cut.lastIndexOf(' ');
  return (at > max * 0.5 ? cut.slice(0, at) : raw.slice(0, max)).replace(/[\s,.;:!?]+$/, '');
}

/* ---------------------------------------------------------------- geometry */

export type Pt = [number, number];

/** Clip a polygon to the half-plane n . x <= s (Sutherland-Hodgman, one edge). */
export function clipHalf(poly: Pt[], nx: number, ny: number, s: number): Pt[] {
  const out: Pt[] = [];
  const inside = (p: Pt) => p[0] * nx + p[1] * ny <= s;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    const ia = inside(a);
    const ib = inside(b);
    if (ia) out.push(a);
    if (ia !== ib) {
      const da = a[0] * nx + a[1] * ny - s;
      const db = b[0] * nx + b[1] * ny - s;
      const t = da / (da - db);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return out;
}

/** CSS polygon() for a list of points; an empty list gives a zero-area polygon (nothing shows). */
export function cssPolygon(poly: Pt[]): string {
  if (poly.length < 3) return 'polygon(0px 0px, 0px 0px, 0px 0px)';
  return `polygon(${poly.map(([x, y]) => `${x.toFixed(1)}px ${y.toFixed(1)}px`).join(', ')})`;
}

export const RECT: Pt[] = [
  [0, 0],
  [W, 0],
  [W, H],
  [0, H],
];

/**
 * Clip-path (in the element's own px) that keeps a transformed full-canvas element inside the
 * 1920x1080 canvas, so nothing paints into a player's letterbox bars. The transform is the 2D
 * affine screen = (a x + c y + e, b x + d y + f) in canvas px.
 */
export function canvasClip(a: number, b: number, c: number, d: number, e: number, f: number): string {
  let poly = RECT;
  // Canvas edges as n . screen <= s, pulled back into local space: (M^T n) . L <= s - n . t.
  poly = clipHalf(poly, -a, -c, e);
  poly = clipHalf(poly, a, c, W - e);
  poly = clipHalf(poly, -b, -d, f);
  poly = clipHalf(poly, b, d, H - f);
  return cssPolygon(poly);
}

/** canvasClip for `translate(tx, ty) rotate(deg) skewX(skew) scale(sx, sy)` around origin (ox, oy). */
export function canvasClipFor(t: { tx?: number; ty?: number; deg?: number; skew?: number; sx?: number; sy?: number; ox?: number; oy?: number }): string {
  const { tx = 0, ty = 0, deg = 0, skew = 0, sx = 1, sy = 1, ox = 0, oy = 0 } = t;
  const r = (deg * Math.PI) / 180;
  const k = Math.tan((skew * Math.PI) / 180);
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  // M = R . K . S
  const a = cos * sx;
  const b = sin * sx;
  const c = (cos * k - sin) * sy;
  const d = (sin * k + cos) * sy;
  return canvasClip(a, b, c, d, ox + tx - (a * ox + c * oy), oy + ty - (b * ox + d * oy));
}

/* ---------------------------------------------------------------- lifecycle */

/**
 * The last step of every transition: the old slide goes, the overlay is emptied and the slide
 * roots lose every inline transform. Inserted last, so it runs after every tween's end state.
 */
export function finish(tl: gsap.core.Timeline, ctx: TransitionContext, at: number, extra?: () => void) {
  tl.call(
    () => {
      ctx.hide();
      extra?.();
      cleanRoots(ctx);
      ctx.overlay.replaceChildren();
    },
    [],
    at,
  );
}

/** The layout offset of `el` inside `stop` (canvas px, unaffected by the stage's CSS scale). */
export function offsetWithin(el: HTMLElement, stop: HTMLElement): { x: number; y: number } {
  let x = 0;
  let y = 0;
  let cur: HTMLElement | null = el;
  while (cur && cur !== stop) {
    x += cur.offsetLeft;
    y += cur.offsetTop;
    cur = cur.offsetParent as HTMLElement | null;
  }
  return { x, y };
}
