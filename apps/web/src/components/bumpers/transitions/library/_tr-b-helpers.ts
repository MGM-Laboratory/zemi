import { SHAPE_COLORS } from '@zemi/shared';
import { INK, PAPER, type SlideColors } from '../../engine/palette';
import type { TransitionContext } from '../types';

/**
 * Shared bits for the bridge-arc, block-stack, hunch-shutter, confetti-pop, split-doors,
 * portal-zoom, stamp and blinds transitions.
 */

/** Seconds at speed 1 to seconds at the context's speed. */
export const secs = (ctx: Pick<TransitionContext, 'speed'>, t: number) => t / ctx.speed;

let uidCounter = 0;
/** A document-unique id for gradients and clip paths a transition builds. */
export function uid(prefix: string): string {
  uidCounter = (uidCounter + 1) % 1_000_000;
  return `trb-${prefix}-${uidCounter.toString(36)}`;
}

/** The outgoing slide's colors (the incoming ones when there is no outgoing slide). */
export const outgoingColors = (ctx: Pick<TransitionContext, 'fromColors' | 'toColors'>): SlideColors => ctx.fromColors ?? ctx.toColors;

/** A solid page color for a slide ('transparent' overlay slides read as paper). */
export const solidBg = (c: SlideColors) => (c.bg.startsWith('#') ? c.bg : c.dark ? INK : PAPER);

function luminance(hex: string): number {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.replace(/./g, (c) => c + c) : h.slice(0, 6);
  const [r, g, b] = [0, 2, 4].map((i) => {
    const v = parseInt(full.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

/** WCAG contrast ratio between two hex colors. */
export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** `preferred` when it stands out on `bg`, else ink or paper, whichever reads better. */
export function readableOn(bg: string, preferred: string, min = 2.4): string {
  if (contrast(preferred, bg) >= min) return preferred;
  return contrast(INK, bg) >= contrast(PAPER, bg) ? INK : PAPER;
}

/**
 * `preferred` when it stands out on `bg`, else the brand color that stands out most (a blue ring
 * on a blue slide turns yellow, never grey).
 */
export function brandOn(bg: string, preferred: string, min = 1.6): string {
  if (contrast(preferred, bg) >= min) return preferred;
  return Object.values(SHAPE_COLORS).reduce((best, c) => (contrast(c, bg) > contrast(best, bg) ? c : best), preferred);
}

const URL_REF = /url\(\s*(['"]?)#([^'")\s]+)\1\s*\)/g;
const URL_ATTRS = ['clip-path', 'mask', 'fill', 'stroke', 'filter', 'marker-start', 'marker-mid', 'marker-end', 'style'];

/**
 * A static deep copy of a slide root, for transitions that cut the outgoing slide into pieces
 * (bands, slats). SVG ids get a suffix and every reference follows, so a copy never borrows a
 * clipPath from the original (which is hidden, and hidden clip paths clip everything away).
 */
export function cloneSlide(root: HTMLElement, tag: string): HTMLElement {
  const copy = root.cloneNode(true) as HTMLElement;
  const ids = new Map<string, string>();
  copy.querySelectorAll('[id]').forEach((el) => {
    const next = `${el.id}-${tag}`;
    ids.set(el.id, next);
    el.id = next;
  });
  if (ids.size) {
    copy.querySelectorAll('*').forEach((el) => {
      for (const name of URL_ATTRS) {
        const v = el.getAttribute(name);
        if (v && v.includes('url(')) el.setAttribute(name, v.replace(URL_REF, (m, _q: string, id: string) => (ids.has(id) ? `url(#${ids.get(id)})` : m)));
      }
      for (const name of ['href', 'xlink:href']) {
        const v = el.getAttribute(name);
        if (v && v.startsWith('#') && ids.has(v.slice(1))) el.setAttribute(name, `#${ids.get(v.slice(1))}`);
      }
    });
  }
  copy.querySelectorAll('img').forEach((img) => {
    img.decoding = 'sync';
    img.loading = 'eager';
  });
  copy.removeAttribute('data-bumper-slide');
  copy.querySelectorAll('[data-morph]').forEach((el) => el.removeAttribute('data-morph'));
  copy.setAttribute('aria-hidden', 'true');
  copy.style.visibility = 'visible';
  copy.style.transform = '';
  copy.style.opacity = '';
  copy.style.clipPath = '';
  return copy;
}

/** Where an element's center sits on the 1920x1080 canvas of `root` (null when it has no box). */
export function canvasCenter(root: HTMLElement, el: HTMLElement, width: number): { x: number; y: number } | null {
  const r = root.getBoundingClientRect();
  const e = el.getBoundingClientRect();
  if (!r.width || !e.width || !e.height) return null;
  const k = r.width / width;
  return { x: (e.left + e.width / 2 - r.left) / k, y: (e.top + e.height / 2 - r.top) / k };
}
