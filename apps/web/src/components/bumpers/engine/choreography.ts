'use client';

import type { BumperMotionLevel } from '@zemi/shared';
import { BE, gsap, SplitText } from './gsap';
import type { EnterFn, IdleFn } from './context';
import type { EnterKind, IdleKind } from './types';

/**
 * The choreographer. Elements declare `data-enter`, `data-order`, `data-delay` and `data-idle`
 * (see <El>); templates add bespoke tweens with useEnter/useIdle. Everything is GSAP (never CSS
 * keyframes) so an operator machine with "reduce motion" on can't flatten a broadcast, and so
 * transitions can scrub, speed up or finish the entrance.
 */

export interface ChoreoOpts {
  motion: BumperMotionLevel;
  /** 1 = normal. Transitions pass their own speed. */
  speed?: number;
}

const STEP = 0.09;
const splits = new WeakMap<Element, SplitText>();
const scrambleText = new WeakMap<Element, string>();

function targets(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>('[data-enter]')).filter((el) => el.dataset.enter && el.dataset.enter !== 'none');
}

function textTarget(el: HTMLElement): HTMLElement {
  return el.querySelector<HTMLElement>('[data-split-target]') ?? el;
}

function revertSplit(el: Element) {
  const s = splits.get(el);
  if (s) {
    s.revert();
    splits.delete(el);
  }
}

/** Remove every inline style the entrance left behind and undo splits (builder, thumbnails, replay). */
export function settle(root: HTMLElement | null) {
  if (!root) return;
  for (const el of targets(root)) {
    gsap.killTweensOf(el);
    const t = textTarget(el);
    revertSplit(t);
    const orig = scrambleText.get(t);
    if (orig !== undefined) {
      t.textContent = orig;
      scrambleText.delete(t);
    }
    gsap.set(el, { clearProps: 'opacity,transform,clipPath,visibility,filter,rotate,scale,translate' });
  }
  root.querySelectorAll<SVGElement>('[data-draw]').forEach((p) => gsap.set(p, { clearProps: 'strokeDasharray,strokeDashoffset' }));
}

/** Hide everything that will animate in, so the first painted frame is the "before" state. */
export function prepareEntrance(root: HTMLElement | null) {
  if (!root) return;
  for (const el of targets(root)) gsap.set(el, { opacity: 0 });
}

function fromVars(kind: EnterKind, calm: boolean): gsap.TweenVars | null {
  const k = calm ? 0.5 : 1;
  switch (kind) {
    case 'rise':
      return { y: 70 * k, opacity: 0 };
    case 'fade':
      return { opacity: 0 };
    case 'pop':
      return { scale: calm ? 0.85 : 0.4, opacity: 0 };
    case 'drop':
      return { y: -160 * k, opacity: 0 };
    case 'wipe':
      return { clipPath: 'inset(0% 100% 0% 0%)', opacity: 1 };
    case 'wipe-up':
      return { clipPath: 'inset(100% 0% 0% 0%)', opacity: 1 };
    case 'slide-left':
      return { x: 180 * k, opacity: 0 };
    case 'slide-right':
      return { x: -180 * k, opacity: 0 };
    case 'zoom':
      return { scale: calm ? 1.08 : 1.28, opacity: 0 };
    case 'tilt':
      return { rotationX: calm ? -30 : -75, y: 40 * k, transformPerspective: 1400, transformOrigin: '50% 100%', opacity: 0 };
    case 'spin':
      return { rotation: calm ? -20 : -110, scale: 0.3, opacity: 0 };
    default:
      return null;
  }
}

const DURATION: Partial<Record<EnterKind, number>> = {
  rise: 0.95,
  fade: 0.7,
  pop: 0.85,
  drop: 1.05,
  wipe: 0.9,
  'wipe-up': 0.9,
  'slide-left': 0.95,
  'slide-right': 0.95,
  zoom: 1.2,
  tilt: 1.1,
  spin: 0.95,
};
const EASE: Partial<Record<EnterKind, string>> = {
  pop: BE.back,
  drop: 'back.out(1.5)',
  wipe: BE.inOut,
  'wipe-up': BE.inOut,
  spin: BE.back,
};

/**
 * Build (and return, paused) the entrance timeline. `extra` are the template's useEnter
 * contributions. The timeline sets the "from" state at time 0 itself, so calling
 * prepareEntrance first is only needed to avoid a flash before play.
 */
export function buildEntrance(root: HTMLElement, opts: ChoreoOpts, extra: Iterable<{ current: EnterFn }> = []): gsap.core.Timeline {
  const speed = opts.speed ?? 1;
  const calm = opts.motion !== 'full';
  const still = opts.motion === 'still';
  const tl = gsap.timeline({ paused: true });
  const list = targets(root)
    .map((el, i) => ({ el, i, order: Number(el.dataset.order ?? 0) || 0, delay: Number(el.dataset.delay ?? 0) || 0 }))
    .sort((a, b) => a.order - b.order || a.i - b.i);
  const at = (t: number) => t / speed;

  for (const { el, order, delay } of list) {
    const kind = (el.dataset.enter as EnterKind) || 'rise';
    const start = at(order * STEP * (calm ? 0.8 : 1) + delay);
    if (still) {
      tl.fromTo(el, { opacity: 0 }, { opacity: 1, duration: 0.45, ease: 'power1.out' }, start);
      continue;
    }
    // Undo prepareEntrance's opacity 0 right now (same frame, no paint); each `from` tween below
    // then renders its own "before" state immediately, so late-starting elements stay hidden.
    gsap.set(el, { opacity: 1 });
    if (kind === 'split-lines' || kind === 'split-words' || kind === 'split-chars') {
      const t = textTarget(el);
      revertSplit(t);
      const type = kind === 'split-chars' ? 'chars,words,lines' : kind === 'split-words' ? 'words,lines' : 'lines';
      const split = SplitText.create(t, { type, mask: kind === 'split-chars' ? undefined : 'lines', linesClass: 'b-line', wordsClass: 'b-word', charsClass: 'b-char', aria: 'hidden' });
      splits.set(t, split);
      const parts = kind === 'split-chars' ? split.chars : kind === 'split-words' ? split.words : split.lines;
      tl.from(
        parts,
        kind === 'split-chars'
          ? { yPercent: 90, rotate: 10, opacity: 0, duration: at(0.7), ease: BE.back, stagger: at(calm ? 0.012 : 0.022) }
          : { yPercent: 115, rotate: kind === 'split-words' ? 4 : 0, duration: at(0.95), ease: BE.out, stagger: at(kind === 'split-words' ? 0.045 : 0.08) },
        start,
      );
      continue;
    }
    if (kind === 'scramble') {
      const t = textTarget(el);
      const text = scrambleText.get(t) ?? t.textContent ?? '';
      scrambleText.set(t, text);
      tl.fromTo(el, { opacity: 0 }, { opacity: 1, duration: at(0.2) }, start);
      tl.to(t, { duration: at(calm ? 0.8 : 1.2), scrambleText: { text, chars: 'upperCase', speed: 0.6, revealDelay: 0.25 }, ease: 'none' }, start);
      continue;
    }
    if (kind === 'draw') {
      const paths = el.querySelectorAll<SVGGeometryElement>('[data-draw], path, line, polyline, circle');
      tl.fromTo(el, { opacity: 0 }, { opacity: 1, duration: at(0.2) }, start);
      tl.from(paths, { drawSVG: '0%', duration: at(1.1), ease: BE.inOut, stagger: at(0.06) }, start);
      continue;
    }
    if (kind === 'count') {
      const t = textTarget(el);
      const to = Number(el.dataset.countTo ?? t.textContent ?? 0) || 0;
      const obj = { v: 0 };
      tl.fromTo(el, { opacity: 0 }, { opacity: 1, duration: at(0.3) }, start);
      tl.to(obj, { v: to, duration: at(1.4), ease: BE.out, onUpdate: () => (t.textContent = String(Math.round(obj.v))) }, start);
      continue;
    }
    const from = fromVars(kind, calm);
    if (!from) continue;
    const to: gsap.TweenVars = { duration: at((DURATION[kind] ?? 0.9) * (calm ? 1.15 : 1)), ease: EASE[kind] ?? BE.out, immediateRender: true };
    if ('clipPath' in from) to.clipPath = 'inset(0% 0% 0% 0%)';
    tl.from(el, { ...from, ...to }, start);
  }
  for (const fn of extra) {
    try {
      fn.current(tl, root, { at, speed, calm });
    } catch (err) {
      console.warn('[bumpers] a template entrance failed', err);
    }
  }
  return tl;
}

/** Generic idle loops from data-idle plus the template's useIdle contributions. Returns a stop function. */
export function startIdle(root: HTMLElement, opts: ChoreoOpts, extra: Iterable<{ current: IdleFn }> = []): () => void {
  if (opts.motion === 'still') return () => {};
  const calm = opts.motion === 'calm';
  const anims: gsap.core.Animation[] = [];
  const cleanups: Array<() => void> = [];
  root.querySelectorAll<HTMLElement>('[data-idle]').forEach((el, i) => {
    const kind = el.dataset.idle as IdleKind;
    const amp = calm ? 0.5 : 1;
    const d = 0.3 * (i % 5);
    switch (kind) {
      case 'float':
        anims.push(gsap.to(el, { y: `+=${14 * amp}`, duration: 3.2 + (i % 3) * 0.4, ease: 'sine.inOut', yoyo: true, repeat: -1, delay: d }));
        break;
      case 'bob':
        anims.push(gsap.to(el, { y: `+=${7 * amp}`, duration: 1.4, ease: 'sine.inOut', yoyo: true, repeat: -1, delay: d }));
        break;
      case 'sway':
        anims.push(gsap.to(el, { rotation: 3 * amp, duration: 3.6, ease: 'sine.inOut', yoyo: true, repeat: -1, delay: d }));
        break;
      case 'pulse':
        anims.push(gsap.to(el, { scale: 1 + 0.035 * amp, duration: 1.8, ease: 'sine.inOut', yoyo: true, repeat: -1, delay: d }));
        break;
      case 'spin-slow':
        anims.push(gsap.to(el, { rotation: '+=360', duration: 60, ease: 'none', repeat: -1 }));
        break;
      case 'breathe':
        anims.push(gsap.to(el, { opacity: 0.72, duration: 2.4, ease: 'sine.inOut', yoyo: true, repeat: -1, delay: d }));
        break;
      default:
        break;
    }
  });
  for (const fn of extra) {
    try {
      const out = fn.current(root, { calm });
      if (typeof out === 'function') cleanups.push(out);
      else if (Array.isArray(out)) anims.push(...out);
      else if (out) anims.push(out);
    } catch (err) {
      console.warn('[bumpers] a template idle loop failed', err);
    }
  }
  return () => {
    anims.forEach((a) => a.kill());
    cleanups.forEach((c) => c());
  };
}

/** A quick generic exit some transitions use before covering the screen. */
export function buildExit(root: HTMLElement, opts: ChoreoOpts): gsap.core.Timeline {
  const tl = gsap.timeline({ paused: true });
  if (opts.motion === 'still') return tl.to(root, { opacity: 0, duration: 0.3 });
  const els = targets(root).reverse();
  tl.to(els, { y: -30, opacity: 0, duration: 0.35, ease: 'power2.in', stagger: 0.025 });
  return tl;
}
