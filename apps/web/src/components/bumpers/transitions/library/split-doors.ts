import { gsap } from '../../engine/gsap';
import { cleanRoots, div } from '../helpers';
import type { TransitionDef } from '../types';
import crossfade from './crossfade';
import { cloneSlide, outgoingColors, readableOn, secs, solidBg } from './_tr-b-helpers';

const BANDS = 6;
const EDGE = 14;
const CUT = 6;
const BLEED = 64;
const SHADOW = 90;

/**
 * Sliding doors: thin accent cuts slice the screen into six bands, then the bands lean back and
 * shoot off alternately left and right (middle ones first), shearing with the speed, carrying the
 * old bumper away and uncovering the new one. An accent edge rides the tail of every band.
 */
const splitDoors: TransitionDef = {
  key: 'split-doors',
  run(ctx) {
    const from = ctx.from?.root;
    if (!from) return crossfade.run(ctx);
    const t = (s: number) => secs(ctx, s);
    const { width: W, height: H } = ctx;
    const bh = H / BANDS;
    const accent = ctx.toColors.accentHex;
    const out = outgoingColors(ctx);
    const cutColor = readableOn(solidBg(out), accent, 1.6);
    const tl = gsap.timeline();
    const layer = div(ctx.overlay, { left: 0, top: 0, width: W, height: H });
    let end = 0;

    for (let i = 0; i < BANDS; i++) {
      const side = (i % 2 === 0 ? 1 : -1) * ctx.dir;
      const band = div(layer, { left: 0, top: i * bh, width: W, height: bh, willChange: 'transform' });
      // The band runs a little past both screen edges in the page color, so the lean back and the
      // shear never open a gap at the sides.
      const clip = div(band, { left: -BLEED, top: 0, width: W + 2 * BLEED, height: bh, overflow: 'hidden', background: out.bg });
      const copy = cloneSlide(from, `sd${i}`);
      copy.style.left = `${BLEED}px`;
      copy.style.top = `${-i * bh}px`;
      clip.appendChild(copy);
      // The tail of each door: a soft shadow on the new bumper, then the accent edge.
      const tail = side > 0 ? -BLEED - EDGE : W + BLEED;
      div(band, { left: side > 0 ? tail - SHADOW : tail + EDGE, top: 0, width: SHADOW, height: bh, background: `linear-gradient(${side > 0 ? 'to left' : 'to right'}, rgba(14,17,22,0.16), rgba(14,17,22,0))` });
      div(band, { left: tail, top: 0, width: EDGE, height: bh, background: accent });
      if (i < BANDS - 1) {
        const cut = div(band, { left: 0, top: bh - CUT, width: W, height: CUT, background: cutColor });
        gsap.set(cut, { scaleX: 0, transformOrigin: side > 0 ? '0% 50%' : '100% 50%' });
        tl.to(cut, { scaleX: 1, duration: t(0.22), ease: 'power3.out' }, t(0.02 + i * 0.03));
      }
      // Middle bands go first, the outer ones follow. Each one leans back, then shoots off and
      // shears with the speed.
      const order = Math.floor(Math.abs(i - (BANDS - 1) / 2));
      const start = t(0.1 + order * 0.05 + (i % 2) * 0.02);
      const nudge = t(0.1);
      const dash = t(0.52);
      tl.to(band, { x: -side * 18, skewX: side * 2.5, duration: nudge, ease: 'power2.out' }, start);
      tl.to(band, { x: side * (W + BLEED + EDGE + SHADOW + 200), duration: dash, ease: 'power2.in' }, start + nudge);
      tl.to(band, { skewX: -side * 14, duration: dash, ease: 'power2.in' }, start + nudge);
      end = Math.max(end, start + nudge + dash);
    }

    tl.call(ctx.show, [], 0);
    tl.call(ctx.hide, [], 0);
    tl.addLabel('reveal', t(0.3));
    tl.set(layer, { autoAlpha: 0 }, end);
    tl.call(() => cleanRoots(ctx), [], end);
    return tl;
  },
};
export default splitDoors;
