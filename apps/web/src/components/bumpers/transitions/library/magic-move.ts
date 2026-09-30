import { FONT_BODY } from '../../engine/fit-text';
import { BE, gsap } from '../../engine/gsap';
import { div } from '../helpers';
import type { TransitionContext, TransitionDef } from '../types';
import { canvasRect, cloneStatic, finish, layer, textRect, timing, type CanvasRect } from './_tr-a-helpers';

interface Pair {
  a: HTMLElement;
  b: HTMLElement;
  ra: CanvasRect;
  rb: CanvasRect;
  /** What visually moves: the text itself for text elements, else the element box. */
  ca: CanvasRect;
  cb: CanvasRect;
  /** Text on both sides, set text on at least one: they swap quickly mid-flight instead of crossfading. */
  text: boolean;
}

const center = (r: CanvasRect) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
/** Set text (FitText) rather than a picture that happens to contain text (initials). */
const fitted = (el: HTMLElement) => el.hasAttribute('data-fit') || !!el.querySelector('[data-fit]');

/** Elements both slides mark with the same data-morph key (outermost ones only, no zero-size boxes). */
function sharedPairs(ctx: TransitionContext): Pair[] {
  if (!ctx.from?.root) return [];
  const as = ctx.from.morphTargets();
  const bs = ctx.to.morphTargets();
  const out: Pair[] = [];
  as.forEach((a, key) => {
    const b = bs.get(key);
    if (!b) return;
    const ra = canvasRect(ctx, a);
    const rb = canvasRect(ctx, b);
    if (ra.w < 2 || ra.h < 2 || rb.w < 2 || rb.h < 2) return;
    const ta = textRect(ctx, a);
    const tb = textRect(ctx, b);
    out.push({ a, b, ra, rb, ca: ta ?? ra, cb: tb ?? rb, text: !!ta && !!tb && (fitted(a) || fitted(b)) });
  });
  return out.filter((p) => !out.some((q) => q !== p && (q.a.contains(p.a) || q.b.contains(p.b))));
}

/**
 * A static copy of a slide element on a full-canvas flight layer, drawn exactly over the
 * original (whatever the stage or safe-area scale), in the slide's text color.
 */
function flyer(ctx: TransitionContext, parent: HTMLElement, el: HTMLElement, rect: CanvasRect, color: string): HTMLDivElement {
  const wrap = div(parent, { left: 0, top: 0, width: ctx.width, height: ctx.height, color, fontFamily: FONT_BODY });
  const copy = cloneStatic(el);
  // The incoming slide is prepared for its entrance (entering elements at opacity 0): undo that on the copy.
  const src = [el, ...Array.from(el.querySelectorAll<HTMLElement>('*'))];
  const dst = [copy, ...Array.from(copy.querySelectorAll<HTMLElement>('*'))];
  src.forEach((n, i) => {
    if (n.hasAttribute('data-enter') && dst[i]) dst[i]!.style.opacity = '';
  });
  const lw = el.offsetWidth || rect.w;
  const lh = el.offsetHeight || rect.h;
  Object.assign(copy.style, { position: 'absolute', left: `${rect.x}px`, top: `${rect.y}px`, width: `${lw}px`, height: `${lh}px`, margin: '0', visibility: 'visible', transformOrigin: '0 0', transform: `scale(${rect.w / lw}, ${rect.h / lh})` });
  wrap.appendChild(copy);
  return wrap;
}

/**
 * Magic move: whatever both bumpers share (the same data-morph key: a speaker's photo and name,
 * the event title, a rundown row, the Q and A code) flies from its old box to its new one
 * (FLIP on overlay copies, 0.8 s zemiInOut, text crossfading on the way) while the rest of A
 * fades and drifts up, B's background crossfades in and everything else on B plays its own
 * entrance. With nothing shared it is a crossfade with a slight zoom. Direction-free.
 */
const magicMove: TransitionDef = {
  key: 'magic-move',
  run(ctx) {
    const T = timing(ctx);
    const tl = gsap.timeline();
    const toRoot = ctx.to.root!;
    const fromRoot = ctx.from?.root ?? null;
    const reveal = T(0.1);
    const pairs = sharedPairs(ctx);

    tl.call(ctx.show, [], 0);
    tl.addLabel('reveal', reveal);

    if (!pairs.length) {
      // Nothing in common: B fades in over A with a slight zoom (A keeps painting underneath, so no dip).
      tl.fromTo(toRoot, { opacity: 0, scale: 0.97 }, { opacity: 1, scale: 1, transformOrigin: '50% 50%', duration: T(0.8), ease: BE.out }, 0);
      if (fromRoot) tl.to(fromRoot, { scale: 1.04, transformOrigin: '50% 50%', duration: T(0.8), ease: 'power1.inOut' }, 0);
      finish(tl, ctx, []);
      return tl;
    }

    const dur = T(0.8);
    const root = layer(ctx);
    const shared = new Set<HTMLElement>(pairs.flatMap((p) => [p.a, p.b]));
    const related = (el: HTMLElement) => pairs.some((p) => el === p.a || el.contains(p.a) || p.a.contains(el));
    const drift = fromRoot ? Array.from(fromRoot.querySelectorAll<HTMLElement>('[data-el]')).filter((el) => !related(el)) : [];
    const saved = new Map<HTMLElement, string>();
    shared.forEach((el) => saved.set(el, el.style.visibility));

    // 1. B's background crossfades in over A; the rest of A drifts up and fades.
    tl.fromTo(toRoot, { opacity: 0 }, { opacity: 1, duration: T(0.55), ease: 'power1.inOut' }, T(0.05));
    if (drift.length) tl.to(drift, { yPercent: -12, opacity: 0, duration: T(0.42), ease: 'power2.in', stagger: T(0.02) }, 0);

    // 2. Shared elements fly as copies, the originals wait hidden.
    for (const p of pairs) {
      const fa = flyer(ctx, root, p.a, p.ra, ctx.fromColors?.fg ?? ctx.toColors.fg);
      const fb = flyer(ctx, root, p.b, p.rb, ctx.toColors.fg);
      const a = center(p.ca);
      const b = center(p.cb);
      const k = Math.sqrt((p.cb.w * p.cb.h) / (p.ca.w * p.ca.h)) || 1;
      gsap.set(fa, { transformOrigin: `${a.x}px ${a.y}px` });
      gsap.set(fb, { transformOrigin: `${b.x}px ${b.y}px`, x: a.x - b.x, y: a.y - b.y, scale: 1 / k, opacity: 0 });
      tl.to(fa, { x: b.x - a.x, y: b.y - a.y, scale: k, duration: dur, ease: BE.inOut }, 0);
      tl.to(fb, { x: 0, y: 0, scale: 1, duration: dur, ease: BE.inOut }, 0);
      // Text swaps in a blink at full speed mid-flight (two different line breaks at half opacity
      // read as mud); pictures of the same thing crossfade over most of the flight.
      if (p.text) {
        tl.to(fb, { opacity: 1, duration: dur * 0.07, ease: 'power1.inOut' }, dur * 0.42);
        tl.to(fa, { opacity: 0, duration: dur * 0.07, ease: 'power1.inOut' }, dur * 0.46);
      } else {
        tl.to(fb, { opacity: 1, duration: dur * 0.4, ease: 'power1.inOut' }, dur * 0.2);
        tl.to(fa, { opacity: 0, duration: dur * 0.4, ease: 'power1.inOut' }, dur * 0.3);
      }
    }
    shared.forEach((el) => (el.style.visibility = 'hidden'));

    // B's entrance starts at 'reveal' and resets its elements: finish it at once for the shared
    // ones (they arrive by air) and keep them hidden until the copies land.
    tl.call(
      () => {
        for (const p of pairs) {
          const targets: Element[] = [p.b, ...Array.from(p.b.querySelectorAll('*'))];
          for (let n = p.b.parentElement; n && n !== toRoot; n = n.parentElement) targets.push(n);
          gsap.getTweensOf(targets).forEach((t) => {
            t.progress(1);
            t.kill();
          });
          p.b.style.visibility = 'hidden';
        }
      },
      [],
      reveal + 0.001,
    );
    tl.call(
      () => {
        for (const p of pairs) p.b.style.visibility = saved.get(p.b) ?? '';
        root.remove();
      },
      [],
      dur + T(0.02),
    );

    finish(tl, ctx, [root], () => {
      for (const p of pairs) p.a.style.visibility = saved.get(p.a) ?? '';
      if (drift.length) gsap.set(drift, { clearProps: 'opacity,transform' });
    });
    return tl;
  },
};
export default magicMove;
