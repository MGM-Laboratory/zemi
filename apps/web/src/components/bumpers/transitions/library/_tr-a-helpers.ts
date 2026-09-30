'use client';

import type { ShapeName } from '@zemi/shared';
import { characterInner, type CharacterOpts } from '../../parts/character';
import { gsap, MorphSVGPlugin } from '../../engine/gsap';
import { INK, PAPER, type SlideColors } from '../../engine/palette';
import { cleanRoots, div, SHAPE_PATHS_46, svg } from '../helpers';
import type { TransitionContext } from '../types';

/**
 * Shared bits for curtain-call, q-iris, eyelids, shape-morph, grid-mosaic, magic-move,
 * paper-plane and coffee-pour: timing, a private overlay layer that removes itself, absolute
 * brand shape paths for MorphSVG, SVG characters and eyes, measuring and cloning slide DOM.
 */

/** Seconds at speed 1 to timeline seconds. */
export function timing(ctx: Pick<TransitionContext, 'speed'>) {
  const k = 1 / (ctx.speed || 1);
  return (s: number) => s * k;
}

let uidCounter = 0;
/** A document-unique id for masks and clip paths built by a transition. */
export function uid(prefix: string): string {
  uidCounter = (uidCounter + 1) % 1_000_000;
  return `tra-${prefix}-${uidCounter.toString(36)}`;
}

/** A full-canvas layer inside the overlay. Everything the transition builds goes in here. */
export function layer(ctx: TransitionContext, style: Record<string, string | number> = {}): HTMLDivElement {
  return div(ctx.overlay, { left: 0, top: 0, width: ctx.width, height: ctx.height, pointerEvents: 'none', ...style });
}

/** A full-canvas SVG (viewBox in canvas px) inside `parent`. */
export function canvasSvg(ctx: Pick<TransitionContext, 'width' | 'height'>, parent: Element): SVGSVGElement {
  const s = svg('svg', { viewBox: `0 0 ${ctx.width} ${ctx.height}`, width: ctx.width, height: ctx.height }, parent);
  s.style.position = 'absolute';
  s.style.left = '0';
  s.style.top = '0';
  s.style.overflow = 'visible';
  return s;
}

/**
 * The last step of every timeline here: the incoming slide is visible, the outgoing one hidden,
 * the overlay nodes are gone and the slide roots carry no inline transforms. It sits at the very
 * end of the timeline, so `tl.progress(1)` always reaches it.
 */
export function finish(tl: gsap.core.Timeline, ctx: TransitionContext, nodes: Element[], extra?: () => void) {
  tl.call(
    () => {
      extra?.();
      ctx.show();
      ctx.hide();
      for (const n of nodes) n.remove();
      cleanRoots(ctx);
    },
    [],
    tl.duration(),
  );
}

/* ---------------------------------------------------------------- paths */

type RawPath = number[][];

/** A brand shape as an absolute path: the 46x46 geometry scaled to `w` x `h` at (x, y). */
export function shapeD(shape: ShapeName, x: number, y: number, w: number, h: number = w): string {
  const raw = MorphSVGPlugin.stringToRawPath(SHAPE_PATHS_46[shape]) as unknown as RawPath;
  const kx = w / 46;
  const ky = h / 46;
  for (const seg of raw) {
    for (let i = 0; i < seg.length; i += 2) {
      seg[i] = x + seg[i]! * kx;
      seg[i + 1] = y + seg[i + 1]! * ky;
    }
  }
  return MorphSVGPlugin.rawPathToString(raw as never);
}

/** A rounded rectangle path with separate top and bottom radii (clamped to the box). */
export function roundRectD(x: number, y: number, w: number, h: number, rTop: number, rBottom: number = rTop): string {
  const t = Math.max(0, Math.min(rTop, w / 2, h / 2));
  const b = Math.max(0, Math.min(rBottom, w / 2, h / 2));
  return (
    `M${x + t} ${y}H${x + w - t}` +
    (t ? `A${t} ${t} 0 0 1 ${x + w} ${y + t}` : '') +
    `V${y + h - b}` +
    (b ? `A${b} ${b} 0 0 1 ${x + w - b} ${y + h}` : '') +
    `H${x + b}` +
    (b ? `A${b} ${b} 0 0 1 ${x} ${y + h - b}` : '') +
    `V${y + t}` +
    (t ? `A${t} ${t} 0 0 1 ${x + t} ${y}` : '') +
    'Z'
  );
}

/* ---------------------------------------------------------------- characters and eyes */

/**
 * A character drawn inside an overlay SVG (vector crisp at any scale). The returned wrapper is
 * centered on its own origin: move it with x/y, scale it with scale (1 = 46 px). The inner
 * markup is parts/character.tsx's, normalized for GSAP's SVG transforms: GSAP writes transform
 * attributes around user-space origins, so the markup's CSS `transform-box: fill-box` origins
 * and the inline CSS gaze translate are turned into plain attributes. Move its parts with the
 * helpers below (they pass explicit origins), not charAnim.
 */
export function svgCharacter(parent: SVGElement, shape: ShapeName, opts: CharacterOpts = {}): SVGGElement {
  const wrap = svg('g', {}, parent);
  const inner = svg('g', { transform: 'translate(-23 -23)' }, wrap);
  inner.innerHTML = characterInner(shape, opts);
  inner.querySelectorAll<SVGElement>('[style]').forEach((el) => {
    const m = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)/.exec(el.style.transform);
    if (m) el.setAttribute('transform', `translate(${m[1]} ${m[2]})`);
    el.removeAttribute('style');
  });
  wrap.dataset.char = shape;
  return wrap;
}

const part = (root: Element, cls: string) => root.querySelector(`.${cls}`);

/** True when a slide's background is exactly `fill`. */
export function isBg(colors: SlideColors | null | undefined, fill: string): boolean {
  return !!colors && colors.bg.toLowerCase() === fill.toLowerCase();
}

/** True when `fill` is the background of either slide (a blue Q on a blue slide disappears). */
export function clashes(ctx: Pick<TransitionContext, 'fromColors' | 'toColors'>, fill: string): boolean {
  return isBg(ctx.fromColors, fill) || isBg(ctx.toColors, fill);
}

/** Give a character a paper outline (in its own 46 px units) so it reads on a slide of its own color. */
export function outline(root: Element, width = 1.6, color: string = PAPER) {
  const body = part(root, 'bc-shape');
  if (!body) return;
  body.setAttribute('stroke', color);
  body.setAttribute('stroke-width', String(width));
  body.setAttribute('stroke-linejoin', 'round');
  body.setAttribute('paint-order', 'stroke');
}

/** Squash on landing, then spring back (origin: the character's feet). */
export function squash(root: Element, T: (s: number) => number, amount = 1): gsap.core.Timeline {
  const body = part(root, 'bc-body');
  const tl = gsap.timeline();
  if (!body) return tl;
  tl.to(body, { scaleX: 1 + 0.16 * amount, scaleY: 1 - 0.2 * amount, transformOrigin: '50% 100%', duration: T(0.1), ease: 'power2.out' });
  tl.to(body, { scaleX: 1, scaleY: 1, transformOrigin: '50% 100%', duration: T(0.45), ease: 'elastic.out(1, 0.45)' });
  return tl;
}

/** Gaze (-1..1), like charAnim.look. */
export function look(root: Element, T: (s: number) => number, x: number, y = 0, duration = 0.25): gsap.core.Timeline {
  const el = part(root, 'bc-look');
  const tl = gsap.timeline();
  if (el) tl.to(el, { x: Math.max(-1, Math.min(1, x)) * 2.4, y: Math.max(-1, Math.min(1, y)) * 1.8, duration: T(duration), ease: 'power2.out' });
  return tl;
}

/** Eye placement inside the 46 box, per shape (matches parts/character.tsx). */
export const EYE_SPOTS: Record<ShapeName, { lx: number; rx: number; y: number; s: number }> = {
  circle: { lx: 16.2, rx: 29.8, y: 20.5, s: 3.5 },
  triangle: { lx: 18.4, rx: 27.6, y: 31.2, s: 2.9 },
  square: { lx: 15.6, rx: 30.4, y: 21, s: 3.7 },
  arch: { lx: 15.6, rx: 30.4, y: 23.5, s: 3.6 },
};

/**
 * Two eyes (ink ovals with a white glint) as SVG, drawn around (0, 0) with the eye radius `s`
 * and the distance `gap` between their centers. Each eye is its own group (class `tra-eye`)
 * so it can blink with scaleY.
 */
export function svgEyes(parent: SVGElement, s: number, gap: number, color: string = INK, glint = '#ffffff'): SVGGElement {
  const g = svg('g', {}, parent);
  for (const side of [-1, 1]) {
    const eye = svg('g', { class: 'tra-eye' }, g);
    const cx = (side * gap) / 2;
    svg('ellipse', { cx, cy: 0, rx: s, ry: s * 1.12, fill: color }, eye);
    svg('circle', { cx: cx - s * 0.32, cy: -s * 1.12 * 0.38, r: s * 0.36, fill: glint }, eye);
  }
  return g;
}

/** The eye groups of a character or an svgEyes pair. */
export function eyesOf(root: Element): Element[] {
  return Array.from(root.querySelectorAll('.tra-eye, .bc-eye'));
}

/** Close the eyes (to a thin line) and open them again. */
export function blink(root: Element | Element[], T: (s: number) => number, { close = 0.07, hold = 0.03, open = 0.09 } = {}): gsap.core.Timeline {
  const eyes = Array.isArray(root) ? root : eyesOf(root);
  const tl = gsap.timeline();
  if (!eyes.length) return tl;
  tl.to(eyes, { scaleY: 0.08, transformOrigin: '50% 50%', duration: T(close), ease: 'power2.in' });
  tl.to(eyes, { scaleY: 1, transformOrigin: '50% 50%', duration: T(open), ease: 'power2.out' }, `>${T(hold)}`);
  return tl;
}

/* ---------------------------------------------------------------- slide DOM */

export interface CanvasRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Canvas px per screen px of the overlay (the stage is CSS scaled). */
function stageScale(ctx: TransitionContext): { left: number; top: number; k: number } {
  const o = ctx.overlay.getBoundingClientRect();
  return { left: o.left, top: o.top, k: o.width / ctx.width || 1 };
}

/** An element's box in canvas px (0..1920, 0..1080), whatever the stage scale. */
export function canvasRect(ctx: TransitionContext, el: Element): CanvasRect {
  const { left, top, k } = stageScale(ctx);
  const r = el.getBoundingClientRect();
  return { x: (r.left - left) / k, y: (r.top - top) / k, w: r.width / k, h: r.height / k };
}

/** The tight box of the text inside an element (a text range), or null when it has no text. */
export function textRect(ctx: TransitionContext, el: Element): CanvasRect | null {
  const target = el.querySelector('[data-fit]') ?? el;
  if (!target.textContent?.trim()) return null;
  const range = document.createRange();
  range.selectNodeContents(target);
  const r = range.getBoundingClientRect();
  if (!r.width || !r.height) return null;
  const { left, top, k } = stageScale(ctx);
  return { x: (r.left - left) / k, y: (r.top - top) / k, w: r.width / k, h: r.height / k };
}

const REF_ATTRS = ['clip-path', 'mask', 'fill', 'stroke', 'filter', 'href', 'xlink:href', 'marker-start', 'marker-mid', 'marker-end', 'style'];
const STRIP_ATTRS = ['data-bumper-slide', 'data-el', 'data-el-label', 'data-morph', 'data-enter', 'data-idle', 'data-order', 'data-delay', 'data-box', 'data-default-box', 'data-lock-aspect', 'data-locked', 'data-char', 'data-split-target', 'data-fit', 'id', 'aria-label', 'role', 'tabindex'];

/**
 * A static copy of slide DOM for the overlay: ids made unique (and every url(#id) / #id
 * reference rewritten, so clipped avatars keep their clip), every data attribute the engine or
 * the builder queries removed (nothing finds the copy by mistake), inert and hidden from AT.
 */
export function cloneStatic<T extends HTMLElement>(el: T): T {
  const copy = el.cloneNode(true) as T;
  const suffix = uid('c');
  const ids = new Map<string, string>();
  copy.querySelectorAll('[id]').forEach((n) => ids.set(n.id, `${n.id}-${suffix}`));
  const all = [copy, ...Array.from(copy.querySelectorAll('*'))];
  for (const n of all) {
    if (ids.size) {
      for (const a of REF_ATTRS) {
        const v = n.getAttribute(a);
        if (!v || !v.includes('#')) continue;
        let out = v;
        ids.forEach((to, from) => {
          out = out.split(`url(#${from})`).join(`url(#${to})`).split(`url("#${from}")`).join(`url("#${to}")`);
          if ((a === 'href' || a === 'xlink:href') && out === `#${from}`) out = `#${to}`;
        });
        if (out !== v) n.setAttribute(a, out);
      }
      if (n.id && ids.has(n.id)) n.id = ids.get(n.id)!;
    }
    for (const a of STRIP_ATTRS) if (a !== 'id' && n.hasAttribute(a)) n.removeAttribute(a);
  }
  copy.setAttribute('aria-hidden', 'true');
  copy.setAttribute('inert', '');
  return copy;
}
