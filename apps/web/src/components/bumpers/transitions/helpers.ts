'use client';

import { SHAPE_COLORS, SHAPE_ORDER, SHAPE_PATHS_46, type ShapeName } from '@zemi/shared';
import { characterMarkup, type CharacterOpts } from '../parts/character';
import { gsap } from '../engine/gsap';
import { INK, PAPER } from '../engine/palette';
import type { TransitionContext } from './types';

/** Seeded PRNG (mulberry32). */
export function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Create an absolutely positioned div in the overlay. */
export function div(parent: HTMLElement, style: Record<string, string | number> = {}, className?: string): HTMLDivElement {
  const el = document.createElement('div');
  el.style.position = 'absolute';
  for (const [k, v] of Object.entries(style)) (el.style as unknown as Record<string, string>)[k] = typeof v === 'number' && !/opacity|zIndex|flex|order/i.test(k) ? `${v}px` : String(v);
  if (className) el.className = className;
  parent.appendChild(el);
  return el;
}

const SVGNS = 'http://www.w3.org/2000/svg';

/** Create an SVG element with attributes. */
export function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}, parent?: Element): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  parent?.appendChild(el);
  return el;
}

/** A full-canvas SVG in the overlay (viewBox 0 0 1920 1080). */
export function overlaySvg(ctx: Pick<TransitionContext, 'overlay' | 'width' | 'height'>): SVGSVGElement {
  const s = svg('svg', { viewBox: `0 0 ${ctx.width} ${ctx.height}`, width: ctx.width, height: ctx.height, preserveAspectRatio: 'none' }, ctx.overlay);
  s.style.position = 'absolute';
  s.style.left = '0';
  s.style.top = '0';
  s.style.overflow = 'visible';
  return s;
}

/**
 * A brand shape <path> placed in a box on an overlay SVG. The geometry stays in the 46x46 space
 * (transform does the placing), so MorphSVG can tween `d` between any two shapes of the same box.
 */
export function shapePath(parent: SVGElement, shape: ShapeName, x: number, y: number, size: number, fill: string = SHAPE_COLORS[shape]): SVGPathElement {
  const k = size / 46;
  return svg('path', { d: SHAPE_PATHS_46[shape], fill, transform: `translate(${x} ${y}) scale(${k})` }, parent);
}

/** A character (as DOM) inside the overlay. Returns the wrapper (animate it) and the svg. */
export function character(parent: HTMLElement, shape: ShapeName, size: number, opts: CharacterOpts & { x?: number; y?: number } = {}): HTMLDivElement {
  const wrap = div(parent, { left: opts.x ?? 0, top: opts.y ?? 0, width: size, height: size });
  wrap.innerHTML = characterMarkup(shape, size, opts);
  wrap.dataset.char = shape;
  return wrap;
}

export const BRAND = { ...SHAPE_COLORS, ink: INK, paper: PAPER };
export { SHAPE_ORDER, SHAPE_PATHS_46 };

/** Reset slide roots to a clean state (end of every transition). */
export function cleanRoots(ctx: TransitionContext) {
  const roots = [ctx.from?.root, ctx.to.root].filter(Boolean) as HTMLElement[];
  gsap.set(roots, { clearProps: 'transform,opacity,clipPath,filter,zIndex,transformOrigin' });
}

/** Mirror an x coordinate/direction for backward navigation. */
export const mirror = (ctx: Pick<TransitionContext, 'dir'>, v: number) => (ctx.dir === 1 ? v : -v);
