'use client';

import { SHAPE_COLORS, type ShapeName } from '@zemi/shared';
import type { CSSProperties } from 'react';
import { useEnter, useIdle, useSlide } from '../engine/context';
import { fontStyle } from '../engine/fit-text';
import { gsap } from '../engine/gsap';
import { ACCENT_HEX, INK, PAPER } from '../engine/palette';
import type { BumperPerson, ResolveCtx } from '../engine/types';
import { charAnim } from '../parts/character';
import { BrandQr, QR_TONES } from '../parts/qr';

/**
 * Small helpers shared by the talk and question templates (keynote, paper, talk title, panel,
 * lineup, thanks, quote, Q and A, featured question). Colors are always hex from the palette.
 */

type Ctx = Pick<ResolveCtx, 'background' | 'accent' | 'colors'>;

const YELLOW = ACCENT_HEX.yellow;

/** The accent as a text or stroke color that reads on this background (yellow never sits on white as text). */
export function accentInk(ctx: Ctx): string {
  if (ctx.background === 'accent') return ctx.colors.fg;
  if (!ctx.colors.dark && ctx.accent === 'yellow') return INK;
  return ctx.colors.accentHex;
}

/** Mix a hex color toward white (0..1), as hex (slides never use color-mix). */
function lift(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (shift: number) => Math.round(((n >> shift) & 255) + (255 - ((n >> shift) & 255)) * k);
  return `#${[16, 8, 0].map((s) => ch(s).toString(16).padStart(2, '0')).join('')}`;
}

const LIFT: Record<ResolveCtx['accent'], number> = { blue: 0.42, green: 0.42, red: 0.16, yellow: 0 };

/**
 * The accent for small text (labels, times, footers): readable on every background. Dark slides
 * get a lifted tint (brand blue and green are too dark for small type on ink or a photo), light
 * slides get the deeper red, accent slides use their own text color.
 */
export function accentLabel(ctx: Ctx): string {
  if (ctx.background === 'accent') return ctx.colors.fg;
  if (ctx.colors.dark) return lift(ctx.colors.accentHex, LIFT[ctx.accent]);
  if (ctx.accent === 'yellow') return INK;
  return ctx.accent === 'red' ? ctx.colors.accentDeep : ctx.colors.accentHex;
}

/** A fill that pops off the background (chips, badges) and the text that reads on it. */
export function popSwatch(ctx: Ctx): { fill: string; text: string } {
  if (ctx.background === 'accent') return ctx.accent === 'yellow' ? { fill: INK, text: YELLOW } : { fill: PAPER, text: INK };
  return { fill: ctx.colors.accentHex, text: ctx.colors.onAccent };
}

/** The highlighter: yellow with ink text, except on a yellow slide where it flips to ink. */
export function highlighter(ctx: Ctx): { fill: string; text: string } {
  if (ctx.background === 'accent' && ctx.accent === 'yellow') return { fill: INK, text: YELLOW };
  return { fill: YELLOW, text: INK };
}

/**
 * A card that sits on the slide. Light slides get white cards with an ink outline and an offset
 * accent shadow (like the speaker talk card); dark slides get a soft glass card; colored slides
 * get a white card so the text inside stays ink.
 */
export function cardSurface(ctx: Ctx): { bg: string; fg: string; fg2: string; border: string; shadow: string | undefined; label: string } {
  if (ctx.colors.dark && ctx.background !== 'accent') {
    return { bg: '#ffffff0f', fg: PAPER, fg2: ctx.colors.fg2, border: '#ffffff29', shadow: undefined, label: ctx.colors.accentHex };
  }
  if (ctx.background === 'accent') {
    return { bg: PAPER, fg: INK, fg2: '#3b4150', border: INK, shadow: `10px 10px 0 ${INK}`, label: ctx.accent === 'yellow' ? INK : ctx.colors.accentDeep };
  }
  return { bg: PAPER, fg: INK, fg2: '#3b4150', border: INK, shadow: `10px 10px 0 ${ctx.colors.accentHex}`, label: ctx.accent === 'yellow' ? INK : ctx.colors.accentHex };
}

/** A shape color that stays visible on this background (the accent shape vanishes on an accent slide). */
export function shapeOn(ctx: Ctx, shape: ShapeName): string {
  const c = SHAPE_COLORS[shape];
  if (ctx.background === 'accent' && c === ctx.colors.accentHex) return ctx.colors.fg;
  return c;
}

/**
 * A sticker outline for a character whose body color matches the slide (Q on a blue slide).
 * Four hard drop shadows follow the squash and stretch, unlike a separate outline shape.
 */
export function charOutline(ctx: Ctx, shape: ShapeName, px = 4): CSSProperties | undefined {
  if (ctx.background !== 'accent' || SHAPE_COLORS[shape] !== ctx.colors.accentHex) return undefined;
  const c = ctx.colors.fg;
  return { filter: `drop-shadow(${px}px 0 0 ${c}) drop-shadow(-${px}px 0 0 ${c}) drop-shadow(0 ${px}px 0 ${c}) drop-shadow(0 -${px}px 0 ${c})` };
}

/**
 * The offset shape behind a portrait. It is the accent by default; when the portrait is an
 * initials shape of the same color (or the slide itself is the accent) it switches to a soft tint
 * so the two never melt into one blob.
 */
export function portraitBack(ctx: Ctx, person: Pick<BumperPerson, 'avatar' | 'shape'>): string | undefined {
  if (ctx.background === 'accent') return ctx.colors.fg === PAPER ? '#ffffff47' : '#0e111633';
  if (!person.avatar && SHAPE_COLORS[person.shape] === ctx.colors.accentHex) return ctx.colors.dark ? '#ffffff2e' : ctx.colors.accentSoft;
  return undefined;
}

/** An initials portrait the same color as an accent slide gets a sticker outline so it does not vanish. */
export function faceOutline(ctx: Ctx, person: Pick<BumperPerson, 'avatar' | 'shape'>, px = 5): CSSProperties | undefined {
  if (person.avatar) return undefined;
  return charOutline(ctx, person.shape, px);
}

/** A soft fill for placeholder shapes (missing photo, empty seat). */
export function ghostFill(ctx: Ctx): string {
  return ctx.colors.dark || ctx.background === 'accent' ? (ctx.colors.fg === INK ? '#0e11161f' : '#ffffff24') : '#0e11161a';
}

const CHAR_ORIGINS: Array<[string, string]> = [
  ['.bc-sway', '50% 100%'],
  ['.bc-jump', '50% 50%'],
  ['.bc-body', '50% 100%'],
  ['.bc-eye', '50% 50%'],
];

/**
 * The character markup pivots its groups with CSS `transform-box: fill-box`, but GSAP bakes SVG
 * origins into the transform attribute and resets the CSS origin to 0 0, which fill-box turns
 * into the group's top-left corner: blinks drop the eyes below the body and squashes sink. Hand
 * the origins to GSAP once instead (it keeps them in data-svg-origin for every later tween,
 * charAnim included) and drop the CSS ones. Safe to call again: primed characters are skipped.
 */
export function primeCharacters(root: ParentNode) {
  root.querySelectorAll<SVGGElement>('svg.bc .bc-sway:not([data-primed])').forEach((sway) => {
    sway.setAttribute('data-primed', '');
    for (const [sel, origin] of CHAR_ORIGINS) {
      const groups = sel === '.bc-sway' ? [sway] : Array.from(sway.querySelectorAll<SVGGElement>(sel));
      groups.forEach((g) => {
        g.style.removeProperty('transform-box');
        g.style.removeProperty('transform-origin');
        gsap.set(g, { transformOrigin: origin });
      });
    }
  });
}

/** Prime the slide's characters before any entrance or idle tween moves them. Call it first in Render. */
export function usePrimedCast() {
  useEnter((_tl, root) => primeCharacters(root));
  useIdle((root) => {
    primeCharacters(root);
  });
}

/** Blink and sway every character inside `els`. Returns one cleanup. */
export function castIdle(els: Element[], calm: boolean, seed = 0): () => void {
  els.forEach((c) => primeCharacters(c));
  const stops = els.map((c) => charAnim.blinkLoop(c));
  const anims = els.flatMap((c, i) => charAnim.idle(c, { calm, seed: seed + i * 3 }));
  return () => {
    stops.forEach((s) => s());
    anims.forEach((a) => a.kill());
  };
}

/** Kill a list of animations and delayed calls. */
export function killAll(list: Array<gsap.core.Animation | null | undefined>) {
  list.forEach((a) => a?.kill());
}

/**
 * Fire-and-forget animations an idle loop keeps starting (a clap burst, a hop, a confetti
 * drizzle): tracked while they run so the cleanup can stop them, forgotten once they finish, so
 * a slide that stays on screen for an hour never piles them up.
 */
export function oneShots() {
  const live = new Set<gsap.core.Animation>();
  return {
    add<T extends gsap.core.Animation>(a: T): T {
      live.forEach((x) => {
        if (x.progress() >= 1) live.delete(x);
      });
      live.add(a);
      return a;
    },
    kill() {
      live.forEach((x) => x.kill());
      live.clear();
    },
  };
}

/** A repeating delayed call (gsap, so it pauses with the global timeline and never uses setTimeout). */
export function every(seconds: number, fn: (n: number) => void, first = seconds): gsap.core.Tween {
  let n = 0;
  const call: gsap.core.Tween = gsap.delayedCall(first, function loop() {
    fn(n++);
    call.delay(seconds);
    call.restart(true);
  });
  return call;
}

/**
 * A QR code on its white plate, framed like a card (ink outline and offset shadow on light
 * slides, a clean plate on dark ones), with an optional label under it. Keep `size` at 380 or more.
 */
export function QrCard({ value, size, label, tilt = 0 }: { value: string; size: number; label?: string; tilt?: number }) {
  const ctx = useSlide();
  const onDark = ctx.colors.dark && ctx.background !== 'accent';
  const labelSize = Math.max(22, Math.round(size * 0.06));
  return (
    <div
      data-qr-card=""
      style={{
        width: size,
        background: PAPER,
        borderRadius: Math.round(size * 0.07),
        border: onDark ? undefined : `4px solid ${INK}`,
        boxShadow: onDark ? `0 24px 60px #00000059` : `12px 12px 0 ${ctx.background === 'accent' ? INK : ctx.colors.accentHex}`,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        rotate: tilt ? `${tilt}deg` : undefined,
      }}
    >
      <div style={{ width: '100%', aspectRatio: '1 / 1' }}>
        <BrandQr value={value} style={ctx.theme.qrStyle} color={QR_TONES.ink} logo title={label || 'QR code'} />
      </div>
      {label ? (
        <span style={{ ...fontStyle('mono', { weight: 700, tracking: 0.1 }), fontSize: labelSize, textTransform: 'uppercase', color: INK, textAlign: 'center', padding: `0 16px ${Math.round(labelSize * 0.9)}px`, marginTop: -Math.round(labelSize * 0.3), lineHeight: 1.1 }}>{label}</span>
      ) : null}
    </div>
  );
}

/** Height of a QrCard of `size` with or without a label (for El boxes). */
export function qrCardHeight(size: number, label: boolean): number {
  const labelSize = Math.max(22, Math.round(size * 0.06));
  return size + 8 + (label ? Math.round(labelSize * 1.1 + labelSize * 0.9 - labelSize * 0.3) : 0);
}
