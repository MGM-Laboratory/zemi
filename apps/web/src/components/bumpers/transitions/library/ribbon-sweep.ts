import { SHAPE_ORDER } from '@zemi/shared';
import { gsap } from '../../engine/gsap';
import { charAnim } from '../../parts/character';
import { character, div, BRAND } from '../helpers';
import type { TransitionDef } from '../types';
import { canvasClipFor, drive, easeFn, finish, H, sec, shuffle, W } from './_tr-c-helpers';

const TILT = 20;
const RAD = (TILT * Math.PI) / 180;
// The screen measured in the tilted frame: along the ribbons and across them.
const ALONG = W * Math.cos(RAD) + H * Math.sin(RAD);
const ACROSS = W * Math.sin(RAD) + H * Math.cos(RAD);
const LANE = ACROSS / 4;
const THICK = Math.ceil(LANE + 40);
const BODY = Math.ceil(ALONG * 1.55 + THICK);

/**
 * Ribbons: the four characters zip across at 20 degrees, each stretched out like a streamer of
 * its own color (Q blue, Hunch red, Block yellow, Bridge green). Their ribbons cover the screen,
 * then the tails whip past and the last one tugs B into place (B settles from a slight zoom
 * anchored on the far edge, so no edge ever opens up).
 */
const ribbonSweep: TransitionDef = {
  key: 'ribbon-sweep',
  run(ctx) {
    const tl = gsap.timeline();
    const B = ctx.to.root!;
    const back = ctx.dir === -1;
    const calm = ctx.motion === 'calm';

    // Tilted frame centered on the canvas; mirrored for backwards (ribbons fly right to left).
    const frame = div(ctx.overlay, { left: 0, top: 0, width: W, height: H, transform: `${back ? 'scaleX(-1) ' : ''}rotate(${-TILT}deg)`, transformOrigin: '50% 50%' });
    // Lane order is seeded so different pairs stack the colors differently.
    const order = shuffle(SHAPE_ORDER, ctx.rand);
    // One continuous pass per ribbon: head in from off the left, tail out past the right.
    const startX = -ALONG / 2 - THICK * 0.8;
    const endX = ALONG / 2 + BODY + 20;
    // The ribbon is full thickness from its tail cap to the head's center.
    const coverFrom = ALONG / 2;
    const coverTo = BODY - THICK / 2 - ALONG / 2;
    const pass = easeFn('sine.inOut');

    const runs = order.map((shape, i) => {
      const color = BRAND[shape];
      const cy = H / 2 - ACROSS / 2 + LANE * (i + 0.5);
      // The ribbon: head centered at x = 0 of this element, body trailing to the left.
      const lane = div(frame, { left: W / 2, top: cy - THICK / 2, width: 0, height: THICK, willChange: 'transform' });
      div(lane, { left: -BODY, top: 0, width: BODY, height: THICK, borderRadius: `${THICK / 2}px 0 0 ${THICK / 2}px`, background: color });
      // A soft highlight along the ribbon, like satin.
      div(lane, { left: -BODY + THICK * 0.6, top: THICK * 0.2, width: BODY - THICK * 0.4, height: THICK * 0.07, borderRadius: THICK, background: 'rgba(255,255,255,0.22)' });
      const head = character(lane, shape, THICK, { x: -THICK * 0.5, y: 0, mood: 'idle', lookX: 1, lookY: -0.15 });
      const body = head.querySelector('.bc-body');
      const delay = sec(ctx, [0, 0.03, 0.055, 0.08][i]! + ctx.rand() * 0.02);
      const dur = sec(ctx, 0.9 + ctx.rand() * 0.08);
      tl.fromTo(lane, { x: startX }, { x: endX, duration: dur, ease: 'sine.inOut', immediateRender: true }, delay);
      // Stretched long while it zips (height stays, so the head never steps off its ribbon).
      if (body) tl.fromTo(body, { scaleX: calm ? 1.2 : 1.45 }, { scaleX: 1.08, duration: dur * 0.5, ease: 'power1.out', immediateRender: true }, delay);
      tl.add(charAnim.blink(head), delay + dur * 0.16);
      return { delay, dur };
    });

    // When every ribbon covers the screen at once: swap the slides right in the middle of it.
    const end = Math.max(...runs.map((r) => r.delay + r.dur));
    const margin = (t: number) =>
      Math.min(
        ...runs.map(({ delay, dur }) => {
          const x = startX + (endX - startX) * pass(Math.min(1, Math.max(0, (t - delay) / dur)));
          return Math.min(x - coverFrom, coverTo - x);
        }),
      );
    let best = end / 2;
    let bestMargin = -Infinity;
    let first = -1;
    let last = -1;
    for (let t = 0; t <= end; t += 0.002) {
      const m = margin(t);
      if (m >= 0) {
        if (first < 0) first = t;
        last = t;
      }
      if (m > bestMargin) {
        bestMargin = m;
        best = t;
      }
    }
    const swap = first >= 0 ? (first + last) / 2 : best;
    tl.call(ctx.show, [], swap);
    tl.call(ctx.hide, [], swap);
    // The tails pull B in: it settles from a zoom anchored on the far edge (never shows a gap).
    const settle = end - swap + sec(ctx, 0.3);
    // Driven by hand so B can be clipped to the canvas while it is zoomed (letterboxed players).
    const ox = back ? 0 : W;
    const settleEase = easeFn('power2.out');
    const zoom = (p: number) => {
      const k = 1 + 0.12 * (1 - settleEase(p));
      B.style.transformOrigin = `${ox}px 540px`;
      B.style.transform = `scale(${k.toFixed(4)})`;
      B.style.clipPath = canvasClipFor({ sx: k, sy: k, ox, oy: H / 2 });
    };
    zoom(0);
    drive(tl, swap, settle, zoom);
    tl.addLabel('reveal', swap + sec(ctx, 0.08));
    finish(tl, ctx, swap + settle + sec(ctx, 0.01));
    return tl;
  },
};
export default ribbonSweep;
