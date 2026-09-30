import { gsap } from '../../engine/gsap';
import { INK, PAPER } from '../../engine/palette';
import { overlaySvg, svg } from '../helpers';
import type { TransitionDef } from '../types';
import { clamp01, drive, easeFn, finish, H, sec, slideBgs, standOut, W } from './_tr-c-helpers';

const PITCH = 48;
// Half the cell diagonal is 33.9 px: past that the dots overlap into a solid sheet.
const COVER = (PITCH * Math.SQRT2) / 2 + 0.4;
const R_MAX = 35.5;
// Seconds at speed 1: the ripple crossing the screen and one dot's swell. The second
// (shrinking) ripple sets off as soon as the first leaves a solid ring RING px thick.
const WAVE = 0.55;
const DOT = 0.26;
const RING = 120;

/** Where an eased 0..1 curve first reaches `v` (bisection). */
function reach(ease: (t: number) => number, v: number): number {
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (ease(mid) >= v) hi = mid;
    else lo = mid;
  }
  return hi;
}

/**
 * Halftone: a 48 px grid of dots (the same pitch as the graph paper) swells in a ripple from
 * near the center in B's accent. A second ripple follows right behind it, shrinking the dots
 * away on B, so a thick ring of solid color sweeps out across the screen: A shows through the
 * dots ahead of it, B through the dots behind it. B is clipped to a circle that rides inside the
 * solid part of the ring, so the swap never shows. One proxy tween sets every radius (~900
 * dots) and lands exactly on the end state with progress(1).
 */
const halftone: TransitionDef = {
  key: 'halftone',
  run(ctx) {
    const tl = gsap.timeline();
    const B = ctx.to.root!;
    const color = standOut([ctx.toColors.accentHex, ctx.toColors.accentDeep, INK, PAPER], slideBgs(ctx), 1.5);
    const layer = overlaySvg(ctx);
    const g = svg('g', { fill: color }, layer);
    // The ripple starts near the center, nudged by the seed so pairs differ a little.
    const ox = W / 2 + (ctx.rand() - 0.5) * 240;
    const oy = H / 2 + (ctx.rand() - 0.5) * 140;
    const far = Math.max(Math.hypot(ox, oy), Math.hypot(W - ox, oy), Math.hypot(ox, H - oy), Math.hypot(W - ox, H - oy));
    const dots: Array<{ el: SVGCircleElement; k: number; r: number }> = [];
    for (let y = PITCH / 2; y < H + PITCH / 2; y += PITCH) {
      for (let x = PITCH / 2; x < W + PITCH / 2; x += PITCH) {
        dots.push({ el: svg('circle', { cx: x, cy: y, r: 0 }, g), k: Math.hypot(x - ox, y - oy) / far, r: -1 });
      }
    }
    const grow = easeFn('power2.out');
    const shrink = easeFn('power1.in');
    // How far out the dots are solid (first ripple) and how far out they have opened again
    // (second ripple), in px from the origin; B's clip circle sits halfway between.
    const solidAfter = DOT * reach(grow, COVER / R_MAX);
    const openAfter = DOT * reach(shrink, 1 - COVER / R_MAX);
    const BACK = solidAfter - openAfter + (RING * WAVE) / far;
    const total = BACK + WAVE + DOT;
    const frame = (p: number) => {
      const t = p * total;
      for (const d of dots) {
        const r1 = grow(clamp01((t - d.k * WAVE) / DOT));
        const r2 = 1 - shrink(clamp01((t - BACK - d.k * WAVE) / DOT));
        const r = Math.max(0, Math.round(R_MAX * Math.min(r1, r2) * 10) / 10);
        if (r !== d.r) {
          d.r = r;
          d.el.setAttribute('r', String(r));
        }
      }
      const outer = (far * (t - solidAfter)) / WAVE;
      const inner = (far * (t - BACK - openAfter)) / WAVE;
      const rB = Math.max(0, (outer + inner) / 2);
      B.style.clipPath = p >= 1 ? '' : `circle(${rB.toFixed(1)}px at ${ox.toFixed(1)}px ${oy.toFixed(1)}px)`;
    };
    frame(0);
    tl.call(ctx.show, [], 0);
    drive(tl, 0, sec(ctx, total), frame);
    tl.addLabel('reveal', sec(ctx, BACK + openAfter + 0.12));
    finish(tl, ctx, sec(ctx, total) + sec(ctx, 0.01));
    return tl;
  },
};
export default halftone;
