import { SHAPE_COLORS } from '@zemi/shared';
import { gsap } from '../../engine/gsap';
import { INK } from '../../engine/palette';
import { charAnim } from '../../parts/character';
import { character, cleanRoots, overlaySvg, svg } from '../helpers';
import type { TransitionDef } from '../types';
import { secs } from './_tr-b-helpers';

/** Innermost first: an ink doorway, then blue, red, yellow and green on the outside. */
const BANDS = [INK, SHAPE_COLORS.circle, SHAPE_COLORS.triangle, SHAPE_COLORS.square, SHAPE_COLORS.arch];
const BAND = 256;
/** Share of the draw spent on each leg (the rest sweeps the arc), the same for every band so their fronts stay in step. */
const LEG = 0.14;

/**
 * Rainbow bridge: five concentric arches (the Bridge shape: a half disc on legs) build across
 * the screen from one side, legs first, then the arcs sweep over like a rainbow. Bridge pops up
 * in the doorway, looks ahead and hops; his landing knocks the arches down, and they fall away
 * one by one from the inside out, so the next bumper shows through the doorway first. Mirrored
 * going back.
 */
const bridgeArc: TransitionDef = {
  key: 'bridge-arc',
  run(ctx) {
    const t = (s: number) => secs(ctx, s);
    const { width: W, height: H, dir } = ctx;
    const cx = W / 2;
    const cy = H - BAND;
    const foot = H + 30;
    const leg = foot - cy;

    const sv = overlaySvg(ctx);
    const bands = BANDS.map((color, k) => ({ color, k, r: BAND * (k + 0.5) }))
      .reverse()
      .map(({ color, k, r }) => {
        const g = svg('g', {}, sv);
        const x0 = cx - dir * r;
        const x1 = cx + dir * r;
        const d = `M${x0} ${foot}V${cy}A${r} ${r} 0 0 ${dir === 1 ? 1 : 0} ${x1} ${cy}V${foot}`;
        const arc = Math.PI * r;
        const total = 2 * leg + arc;
        const path = svg('path', { d, fill: 'none', stroke: color, 'stroke-width': BAND + 4, 'stroke-dasharray': `0 ${total + 40}` }, g);
        return { g, path, k, leg, arc, total };
      })
      .sort((a, b) => a.k - b.k);

    // Bridge himself waits in the doorway (under the bottom edge until the arches are up).
    const size = 232;
    const buddy = character(ctx.overlay, 'arch', size, { mood: 'happy', x: cx - size / 2, y: H - size - 16 });

    const tl = gsap.timeline();
    const draw = t(0.58);
    const step = t(0.05);
    bands.forEach((b) => {
      const st = { a: 0 };
      const apply = () => {
        const a = st.a;
        const len = a <= LEG ? b.leg * (a / LEG) : a <= 1 - LEG ? b.leg + b.arc * ((a - LEG) / (1 - 2 * LEG)) : b.leg + b.arc + b.leg * ((a - (1 - LEG)) / LEG);
        b.path.setAttribute('stroke-dasharray', `${len.toFixed(1)} ${(b.total + 40).toFixed(1)}`);
      };
      tl.to(st, { a: 1, duration: draw, ease: 'power2.inOut', onUpdate: apply }, b.k * step);
    });
    const built = (bands.length - 1) * step + draw;
    tl.call(ctx.hide, [], built);
    tl.call(ctx.show, [], built);

    // He pops up, looks where we are going, hops, and the landing knocks the arches down.
    tl.fromTo(buddy, { y: size + 40 }, { y: 0, duration: t(0.34), ease: 'back.out(1.7)' }, built - t(0.24));
    tl.add(charAnim.look(buddy, dir, -0.2, t(0.14)), built);
    tl.add(charAnim.hop(buddy, { height: 84, duration: t(0.38) }), built + t(0.1));
    const fall = built + t(0.48);
    tl.add(charAnim.squash(buddy), fall);
    tl.addLabel('reveal', fall);
    const drop = t(0.62);
    const gap = t(0.07);
    bands.forEach((b) => {
      tl.to(b.g, { y: H + 520, x: dir * (180 + b.k * 40), rotation: dir * (10 + b.k * 3), svgOrigin: `${cx} ${cy}`, duration: drop, ease: 'power2.in' }, fall + b.k * gap);
    });
    tl.to(buddy, { y: H, x: dir * 150, rotation: dir * 16, duration: drop, ease: 'power2.in' }, fall);
    const end = fall + (bands.length - 1) * gap + drop;
    tl.set([sv, buddy], { autoAlpha: 0 }, end);
    tl.call(() => cleanRoots(ctx), [], end);
    return tl;
  },
};
export default bridgeArc;
