'use client';

import { SHAPE_COLORS, SHAPE_PATHS_46, type ShapeName } from '@zemi/shared';
import type { CSSProperties } from 'react';
import { gsap } from '../engine/gsap';
import { INK } from '../engine/palette';

/**
 * Bumper characters: the four brand shapes with two ink eyes (DESIGN.md: no mouths, no limbs).
 * The SVG has addressable groups so GSAP can drive them from templates and transitions:
 *
 *   svg.bc > g.bc-sway > g.bc-jump > g.bc-body > path.bc-shape + g.bc-look > g.bc-eyes > g.bc-eye x2
 *
 * `characterMarkup()` returns the same structure as a string for transitions that build DOM
 * imperatively. `charAnim` has the moves (blink loop, cheer, squash, hop, roll, look).
 */

export type CharMood = 'idle' | 'happy' | 'closed' | 'sleepy' | 'surprised' | 'wink' | 'determined';

const EYES: Record<ShapeName, { l: [number, number]; r: [number, number]; s: number }> = {
  circle: { l: [16.2, 20.5], r: [29.8, 20.5], s: 3.5 },
  triangle: { l: [18.4, 31.2], r: [27.6, 31.2], s: 2.9 },
  square: { l: [15.6, 21], r: [30.4, 21], s: 3.7 },
  arch: { l: [15.6, 23.5], r: [30.4, 23.5], s: 3.6 },
};

function eyeMarkup(cx: number, cy: number, s: number, mood: CharMood, side: 'l' | 'r'): string {
  const m = mood === 'wink' && side === 'r' ? 'happy' : mood === 'wink' ? 'idle' : mood;
  if (m === 'happy') return `<path d="M${cx - s} ${cy + s * 0.35} Q${cx} ${cy - s * 1.25} ${cx + s} ${cy + s * 0.35}" fill="none" stroke="${INK}" stroke-width="${s * 0.62}" stroke-linecap="round"/>`;
  if (m === 'sleepy') return `<path d="M${cx - s} ${cy - s * 0.1} Q${cx} ${cy + s * 0.95} ${cx + s} ${cy - s * 0.1}" fill="none" stroke="${INK}" stroke-width="${s * 0.55}" stroke-linecap="round"/>`;
  if (m === 'closed') return `<path d="M${cx - s} ${cy} L${cx + s} ${cy}" fill="none" stroke="${INK}" stroke-width="${s * 0.55}" stroke-linecap="round"/>`;
  const k = m === 'surprised' ? 1.3 : 1;
  const rx = s * k;
  const ry = s * 1.12 * k;
  const brow = m === 'determined' ? `<path d="M${cx - s * 1.1} ${cy - ry * 1.55 + (side === 'l' ? -s * 0.3 : s * 0.3)} L${cx + s * 1.1} ${cy - ry * 1.55 + (side === 'l' ? s * 0.3 : -s * 0.3)}" stroke="${INK}" stroke-width="${s * 0.45}" stroke-linecap="round"/>` : '';
  return `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${INK}"/><circle cx="${cx - rx * 0.32}" cy="${cy - ry * 0.38}" r="${rx * 0.36}" fill="#fff"/>${brow}`;
}

export interface CharacterOpts {
  mood?: CharMood;
  color?: string;
  /** -1..1 gaze. */
  lookX?: number;
  lookY?: number;
  /** Adds a soft ground shadow ellipse. */
  shadow?: boolean;
}

const MOODS: ReadonlySet<string> = new Set(['idle', 'happy', 'closed', 'sleepy', 'surprised', 'wink', 'determined']);

export function characterInner(shape: ShapeName, { mood: rawMood = 'idle', color, lookX = 0, lookY = 0, shadow }: CharacterOpts = {}): string {
  const mood: CharMood = MOODS.has(rawMood) ? rawMood : 'idle';
  const e = EYES[shape] ?? EYES.circle;
  // Markup is injected as HTML, so only hex colors (or currentColor) get through.
  const fill = color && (/^#[0-9a-f]{3,8}$/i.test(color) || color === 'currentColor') ? color : SHAPE_COLORS[shape] ?? SHAPE_COLORS.circle;
  const dx = (Number.isFinite(lookX) ? Math.max(-1, Math.min(1, lookX)) : 0) * 2.4;
  const dy = (Number.isFinite(lookY) ? Math.max(-1, Math.min(1, lookY)) : 0) * 1.8;
  const box = 'transform-box:fill-box;transform-origin:50% 50%';
  return (
    (shadow ? `<ellipse class="bc-shadow" cx="23" cy="49" rx="17" ry="2.6" fill="${INK}" opacity="0.14" style="${box}"/>` : '') +
    `<g class="bc-sway" style="transform-box:fill-box;transform-origin:50% 100%">` +
    `<g class="bc-jump" style="${box}">` +
    `<g class="bc-body" style="transform-box:fill-box;transform-origin:50% 100%">` +
    `<path class="bc-shape" d="${SHAPE_PATHS_46[shape]}" fill="${fill}"/>` +
    `<g class="bc-look" style="transform:translate(${dx}px,${dy}px)">` +
    `<g class="bc-eyes" data-mood="${mood}">` +
    `<g class="bc-eye" style="${box}">${eyeMarkup(e.l[0], e.l[1], e.s, mood, 'l')}</g>` +
    `<g class="bc-eye" style="${box}">${eyeMarkup(e.r[0], e.r[1], e.s, mood, 'r')}</g>` +
    `</g></g></g></g></g>`
  );
}

/** Full SVG markup for imperative use (transitions). Width and height are CSS lengths. */
export function characterMarkup(shape: ShapeName, size: number | string, opts: CharacterOpts = {}): string {
  const s = typeof size === 'number' ? `${size}px` : size;
  return `<svg class="bc" data-shape="${shape}" viewBox="0 0 46 46" width="${s}" height="${s}" style="overflow:visible;display:block" aria-hidden="true">${characterInner(shape, opts)}</svg>`;
}

export interface BumperCharacterProps extends CharacterOpts {
  shape: ShapeName;
  /** Width in canvas px (or any CSS length). Default: fill the parent width. */
  size?: number | string;
  className?: string;
  style?: CSSProperties;
  /** Marks this character for charAnim.* via [data-char]. */
  name?: string;
}

/** React version (same markup). Use inside an <El> box; animate it with charAnim in useEnter/useIdle. */
export function BumperCharacter({ shape, size = '100%', className, style, name, ...opts }: BumperCharacterProps) {
  const s = typeof size === 'number' ? `${size}px` : size;
  return (
    <svg
      className={['bc', className].filter(Boolean).join(' ')}
      data-shape={shape}
      data-char={name ?? shape}
      viewBox="0 0 46 46"
      width={s}
      height={s}
      style={{ overflow: 'visible', display: 'block', ...style }}
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: characterInner(shape, opts) }}
    />
  );
}

type Target = Element | null | undefined;
const q = (root: Target, sel: string) => (root ? root.querySelector(sel) : null);

/** GSAP moves for a `.bc` svg (or any element containing one). All return animations you can place on a timeline. */
export const charAnim = {
  /** Random blinking forever. Returns a stop function. */
  blinkLoop(root: Target, { min = 2.4, max = 5.6 }: { min?: number; max?: number } = {}): () => void {
    const eyes = root ? Array.from(root.querySelectorAll('.bc-eye')) : [];
    if (!eyes.length) return () => {};
    let call: gsap.core.Tween | null = null;
    let alive = true;
    const blink = () => {
      if (!alive) return;
      gsap.to(eyes, { scaleY: 0.08, duration: 0.07, yoyo: true, repeat: Math.random() < 0.2 ? 3 : 1, ease: 'power1.inOut' });
      call = gsap.delayedCall(min + Math.random() * (max - min), blink);
    };
    call = gsap.delayedCall(0.6 + Math.random() * max, blink);
    return () => {
      alive = false;
      call?.kill();
      gsap.killTweensOf(eyes);
    };
  },
  blink(root: Target) {
    const eyes = root ? root.querySelectorAll('.bc-eye') : [];
    return gsap.to(eyes, { scaleY: 0.08, duration: 0.08, yoyo: true, repeat: 1, ease: 'power1.inOut' });
  },
  /** Jump, spin, land with a squash. */
  cheer(root: Target, { height = 26, spin = true }: { height?: number; spin?: boolean } = {}) {
    const jump = q(root, '.bc-jump');
    const body = q(root, '.bc-body');
    const tl = gsap.timeline();
    if (!jump || !body) return tl;
    tl.to(body, { scaleX: 1.14, scaleY: 0.82, duration: 0.12, ease: 'power2.out' })
      .to(jump, { y: -height, duration: 0.32, ease: 'power2.out' }, '>')
      .to(body, { scaleX: 0.9, scaleY: 1.12, duration: 0.16 }, '<')
      .to(jump, { rotation: spin ? 360 : 0, duration: 0.5, ease: 'power2.inOut' }, '<')
      .to(jump, { y: 0, duration: 0.28, ease: 'power2.in' }, '>-0.18')
      .to(body, { scaleX: 1.16, scaleY: 0.8, duration: 0.1 }, '>')
      .to(body, { scaleX: 1, scaleY: 1, duration: 0.5, ease: 'elastic.out(1, 0.45)' }, '>')
      .set(jump, { rotation: 0 });
    return tl;
  },
  squash(root: Target) {
    const body = q(root, '.bc-body');
    const tl = gsap.timeline();
    if (!body) return tl;
    return tl.to(body, { scaleX: 1.16, scaleY: 0.8, duration: 0.12, ease: 'power2.out' }).to(body, { scaleX: 1, scaleY: 1, duration: 0.6, ease: 'elastic.out(1, 0.4)' });
  },
  /** A small hop in place (or `x` px sideways). */
  hop(root: Target, { height = 14, x = 0, duration = 0.42 }: { height?: number; x?: number; duration?: number } = {}) {
    const jump = q(root, '.bc-jump');
    const tl = gsap.timeline();
    if (!jump) return tl;
    tl.to(jump, { y: -height, duration: duration / 2, ease: 'power2.out' }).to(jump, { y: 0, duration: duration / 2, ease: 'power2.in' });
    if (x) tl.to(root!, { x: `+=${x}`, duration, ease: 'none' }, 0);
    return tl;
  },
  /** Gentle sway + bob forever (use in useIdle). */
  idle(root: Target, { calm = false, seed = 0 }: { calm?: boolean; seed?: number } = {}): gsap.core.Animation[] {
    const sway = q(root, '.bc-sway');
    const jump = q(root, '.bc-jump');
    const out: gsap.core.Animation[] = [];
    const k = calm ? 0.5 : 1;
    if (sway) out.push(gsap.to(sway, { rotation: 4 * k, duration: 1.8 + (seed % 5) * 0.23, ease: 'sine.inOut', yoyo: true, repeat: -1, delay: -(seed % 7) * 0.3 }));
    if (jump) out.push(gsap.to(jump, { y: -3 * k, duration: 1.2 + (seed % 3) * 0.2, ease: 'sine.inOut', yoyo: true, repeat: -1, delay: -(seed % 4) * 0.25 }));
    return out;
  },
  /** Move the eyes (-1..1). */
  look(root: Target, x: number, y = 0, duration = 0.35) {
    const look = q(root, '.bc-look');
    return gsap.to(look, { x: Math.max(-1, Math.min(1, x)) * 2.4, y: Math.max(-1, Math.min(1, y)) * 1.8, duration, ease: 'power2.out' });
  },
  /** Roll in from `fromX` px (circles roll, other shapes tumble). */
  rollIn(root: Target, fromX: number, { duration = 0.9, shape }: { duration?: number; shape?: ShapeName } = {}) {
    const jump = q(root, '.bc-jump');
    const tl = gsap.timeline();
    if (!root) return tl;
    const turns = shape === 'circle' ? fromX / 150 : Math.round(fromX / 300) * 0.25;
    tl.from(root, { x: fromX, duration, ease: 'power3.out' }, 0);
    if (jump) tl.from(jump, { rotation: -turns * 360, duration, ease: 'power3.out' }, 0);
    return tl;
  },
};
