import { SHAPE_COLORS, SHAPE_PATHS_46 } from '@zemi/shared';
import { gsap } from '../../engine/gsap';
import { ACCENT_600, PAPER } from '../../engine/palette';
import { cleanRoots, overlaySvg, svg } from '../helpers';
import type { TransitionDef } from '../types';
import { secs, uid } from './_tr-b-helpers';

const BLADES = 8;
/** Canvas px per unit of the 46-unit Hunch triangle: tall enough to reach the far corners. */
const K = 30;
/** How far each tip crosses the center when shut (the rounded tip must clear it). */
const OVER = 7 * K;
/** Tips start just past the far corners, so the blades are in view almost at once. */
const OUT = 1140;
/** Fully open again: every blade clear of the corners. */
const GONE = 1320;
const SWIRL = 62;

/**
 * Shutter: eight rounded red triangles (Hunch, the spark) spin in from the edges and snap shut
 * at the center like a camera, a soft white flash goes off once, and they spin open on the new
 * bumper.
 */
const hunchShutter: TransitionDef = {
  key: 'hunch-shutter',
  run(ctx) {
    const t = (s: number) => secs(ctx, s);
    const { width: W, height: H, dir } = ctx;
    const red = SHAPE_COLORS.triangle;
    const edge = ACCENT_600.red;

    const sv = overlaySvg(ctx);
    // The flash sits under the blades: they open onto a white frame that settles into the new bumper.
    const flash = svg('rect', { x: -20, y: -20, width: W + 40, height: H + 40, fill: PAPER, opacity: 0 }, sv);
    // Every blade tucks under the next one. Its visible edge gets a deep band that fades inward, and
    // the first blade goes on top once more (its right half only) so the last one tucks under it too:
    // the shut iris reads as a pinwheel of eight equal blades, not a flat red card.
    const defs = svg('defs', {}, sv);
    const shade = uid('blade');
    // Blade space: the tip at (23, 1), the right edge runs to (45, 45); the band is 4 units wide.
    const grad = svg('linearGradient', { id: shade, gradientUnits: 'userSpaceOnUse', x1: 34, y1: 23, x2: 30.4, y2: 24.8 }, defs);
    svg('stop', { offset: 0, 'stop-color': edge }, grad);
    svg('stop', { offset: 1, 'stop-color': red }, grad);
    const half = uid('half');
    svg('rect', { x: 23, y: -20, width: 60, height: 90 }, svg('clipPath', { id: half, clipPathUnits: 'userSpaceOnUse' }, defs));
    const hub = svg('g', { transform: `translate(${W / 2} ${H / 2})` }, sv);
    const blades = Array.from({ length: BLADES + 1 }, (_, i) => {
      const g = svg('g', {}, hub);
      // Local space: the sharp tip at the origin, the base 44 units down the +y axis.
      const blade = svg('path', { d: SHAPE_PATHS_46.triangle, fill: `url(#${shade})`, stroke: edge, 'stroke-width': 0.16, 'stroke-linejoin': 'round', transform: `scale(${K}) translate(-23 -1)` }, g);
      if (i === BLADES) blade.setAttribute('clip-path', `url(#${half})`);
      return g;
    });

    const st = { swirl: SWIRL, out: OUT };
    const apply = () => {
      blades.forEach((g, i) => {
        const a = (i % BLADES) * (360 / BLADES) + dir * st.swirl;
        g.setAttribute('transform', `rotate(${a.toFixed(2)}) translate(0 ${st.out.toFixed(1)})`);
      });
    };
    apply();

    const shut = t(0.34);
    const hold = t(0.1);
    const open = t(0.42);
    const tl = gsap.timeline();
    tl.to(st, { swirl: 0, out: -OVER, duration: shut, ease: 'sine.in', onUpdate: apply }, 0);
    tl.call(ctx.hide, [], shut);
    tl.call(ctx.show, [], shut);
    // Onto a dark bumper the flash burns off faster, so it reads as a flash and not a grey fog.
    const dark = ctx.toColors.dark;
    tl.set(flash, { attr: { opacity: dark ? 0.9 : 1 } }, shut);
    tl.to(flash, { attr: { opacity: 0 }, duration: t(dark ? 0.26 : 0.42), ease: dark ? 'power3.out' : 'power2.out' }, shut + hold + t(dark ? 0.02 : 0.06));
    tl.addLabel('reveal', shut + hold);
    tl.to(st, { swirl: -SWIRL, out: GONE, duration: open, ease: 'power2.out', onUpdate: apply }, shut + hold);
    const end = shut + hold + open;
    const done = Math.max(end, shut + hold + t(0.48));
    tl.set(sv, { autoAlpha: 0 }, done);
    tl.call(() => cleanRoots(ctx), [], done);
    return tl;
  },
};
export default hunchShutter;
