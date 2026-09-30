'use client';

import type { ShapeName } from '@zemi/shared';
import { useState, type CSSProperties, type ReactNode } from 'react';
import { useEnter, useSlide } from '../engine/context';
import { FitText, fontStyle } from '../engine/fit-text';
import { gsap } from '../engine/gsap';
import { INK, PAPER, SHAPE_ACCENT } from '../engine/palette';
import type { ResolveCtx } from '../engine/types';
import { BrandQr } from '../parts/qr';
import { Sticker } from '../parts/stickers';

/**
 * Small helpers shared by the interaction, break and closing templates (prompt, feedback,
 * register, break, brb, photo, awards, credits). Colors always come from the slide palette.
 */

/** The accent as a TEXT color that reads on this background (yellow never sits on paper as text). */
export function accentInk(ctx: ResolveCtx): string {
  const c = ctx.colors;
  if (ctx.background === 'accent') return c.fg;
  if (c.dark) return c.accentHex;
  return c.accent === 'yellow' ? INK : c.accentHex;
}

/** Soft shadow that keeps paper text readable over any camera picture. */
export const CAM_SHADOW = '0 2px 16px rgba(14,17,22,0.72)';

/**
 * Text colors for a slide. On a clear background (OBS over the camera) the palette's ink would
 * vanish into the picture, so text turns paper with a soft shadow, like a lower third.
 */
export function textInk(ctx: ResolveCtx): { cam: boolean; fg: string; fg2: string; accent: string; shadow: string | undefined } {
  const cam = ctx.background === 'transparent';
  if (!cam) return { cam, fg: ctx.colors.fg, fg2: ctx.colors.fg2, accent: accentInk(ctx), shadow: undefined };
  return { cam, fg: PAPER, fg2: 'rgba(255,255,255,0.88)', accent: PAPER, shadow: CAM_SHADOW };
}

/** A solid fill that stands out from the background, with the text color that goes on it. */
export function accentFill(ctx: ResolveCtx): { fill: string; text: string } {
  if (ctx.background === 'accent') return ctx.accent === 'yellow' ? { fill: INK, text: PAPER } : { fill: PAPER, text: INK };
  return { fill: ctx.colors.accentHex, text: ctx.colors.onAccent };
}

/** A character's body color: on the accent background a character of the same color turns paper so it never vanishes. */
export function charColor(ctx: ResolveCtx, shape: ShapeName): string | undefined {
  if (ctx.background !== 'accent' || SHAPE_ACCENT[shape] !== ctx.accent) return undefined;
  return PAPER;
}

/** Physical things on the slide (tickets, cards, QR plates) are always paper, so ink text always reads on them. */
export interface Surface {
  bg: string;
  border: string;
  shadow: string;
}

export function surface(ctx: ResolveCtx): Surface {
  const bg = ctx.background;
  if (bg === 'transparent') return { bg: PAPER, border: '0px solid transparent', shadow: '0 18px 50px rgba(14,17,22,0.35)' };
  if (bg === 'accent') return { bg: PAPER, border: `4px solid ${INK}`, shadow: `14px 14px 0 ${INK}` };
  if (ctx.colors.dark) return { bg: PAPER, border: '0px solid transparent', shadow: `14px 14px 0 ${ctx.colors.accentHex}` };
  return { bg: PAPER, border: `4px solid ${INK}`, shadow: `14px 14px 0 ${ctx.colors.accentHex}` };
}

/** "https://www.zemi.ac/q/" to "zemi.ac/q". */
export function shortUrl(url: string): string {
  return url.replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/+$/, '');
}

/** A big, framed QR code: the white plate gets an ink border and an offset block so it never melts into paper. */
export function QrCard({ value }: { value: string }) {
  const ctx = useSlide();
  const s = surface(ctx);
  return (
    <div data-qr-card="" style={{ width: '100%', height: '100%', boxSizing: 'border-box', borderRadius: 34, background: '#ffffff', border: s.border, boxShadow: s.shadow, padding: 10, overflow: 'hidden' }}>
      <BrandQr value={value} style={ctx.theme.qrStyle} color={INK} logo title={`QR code for ${shortUrl(value)}`} />
    </div>
  );
}

/** A pill with an optional sticker icon. */
export function Pill({ children, icon, bg, fg, size = 40, style }: { children: ReactNode; icon?: string; bg: string; fg: string; size?: number; style?: CSSProperties }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: size * 0.38,
        padding: `${size * 0.32}px ${size * 0.62}px ${size * 0.32}px ${icon ? size * 0.42 : size * 0.62}px`,
        borderRadius: 999,
        background: bg,
        color: fg,
        whiteSpace: 'nowrap',
        lineHeight: 1,
        ...fontStyle('display', { weight: 800, casl: 0.6, tracking: -0.01 }),
        fontSize: size,
        ...style,
      }}
    >
      {icon ? (
        <span data-pill-icon="" style={{ width: size * 1.25, height: size * 1.25, flex: 'none', display: 'block' }}>
          <Sticker name={icon} />
        </span>
      ) : null}
      <span>{children}</span>
    </span>
  );
}

/** A handwritten-looking note (display type at full CASL) with a squiggle underline that draws in. */
export function Note({ text, color, max = 48, shadow }: { text: string; color: string; max?: number; shadow?: string }) {
  let d = 'M4 14';
  for (let i = 0; i < 8; i++) d += ' q 9 -11 18 0 t 18 0';
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ flex: 1, minHeight: 0 }}>
        <FitText max={max} min={22} casl={1} weight={800} lineHeight={1} valign="end" style={{ color, textShadow: shadow }}>
          {text}
        </FitText>
      </div>
      <svg viewBox="0 0 300 24" style={{ display: 'block', overflow: 'visible', flex: 'none', width: '100%', height: 'auto', aspectRatio: '300 / 24', filter: shadow ? 'drop-shadow(0 2px 6px rgba(14,17,22,0.6))' : undefined }} aria-hidden="true">
        <path data-draw="" d={d} fill="none" stroke={color} strokeWidth={4.5} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

/**
 * Put characters back to rest before an entrance rebuilds. A replay calls enter() on the mounted
 * slide, so it can interrupt a half played entrance or an idle move (a hop across, a bonk);
 * `settle` only cleans the outer element boxes, so the wrappers and their parts reset here.
 */
export function restChars(chars: ArrayLike<Element>) {
  const list = Array.from(chars);
  const parts = list.flatMap((c) => Array.from(c.querySelectorAll('.bc-jump, .bc-body, .bc-sway, .bc-eye')));
  gsap.killTweensOf([...list, ...parts]);
  gsap.set(list, { x: 0, y: 0, rotation: 0, scale: 1 });
  gsap.set(parts, { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 });
}

/** Same idea for any other element an idle loop moves: stop its tweens and put it back to rest. */
export function rest(root: ParentNode, selector: string, vars: gsap.TweenVars = { x: 0, y: 0, rotation: 0, scale: 1 }) {
  const els = Array.from(root.querySelectorAll(selector));
  if (!els.length) return;
  gsap.killTweensOf(els);
  gsap.set(els, vars);
}

/** The time the entrance last started (a replay restarts it). For "N minutes from now" timers. */
export function useEntranceTime(): number {
  const ctx = useSlide();
  const [t0, setT0] = useState(() => ctx.now());
  useEnter((tl, _root, { at }) => {
    tl.call(() => setT0(ctx.now()), [], at(0.02));
  });
  // Live playback: the server's "on screen since" (reset by replay), identical on every screen.
  return ctx.liveSince() ?? t0;
}
