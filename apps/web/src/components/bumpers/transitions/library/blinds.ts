import { gsap } from '../../engine/gsap';
import { INK } from '../../engine/palette';
import { cleanRoots, div } from '../helpers';
import type { TransitionDef } from '../types';
import crossfade from './crossfade';
import { brandOn, cloneSlide, outgoingColors, secs, solidBg } from './_tr-b-helpers';

const SLATS = 10;
const THICK = 16;

/**
 * Blinds: the old bumper hangs on ten vertical slats that turn edge-on one after another (left
 * to right, or right to left going back), each flashing the new accent on its edge as it turns,
 * and the new bumper is waiting behind them.
 */
const blinds: TransitionDef = {
  key: 'blinds',
  run(ctx) {
    const from = ctx.from?.root;
    if (!from) return crossfade.run(ctx);
    const t = (s: number) => secs(ctx, s);
    const { width: W, height: H, dir } = ctx;
    const sw = W / SLATS;
    // The edges flash against the old bumper's faces, so a slide painted in the accent gets another brand color.
    const accent = brandOn(solidBg(outgoingColors(ctx)), ctx.toColors.accentHex);
    const tl = gsap.timeline();
    const stage = div(ctx.overlay, { left: 0, top: 0, width: W, height: H });
    const turn = t(0.56);
    const step = t(0.036);
    let end = 0;

    for (let i = 0; i < SLATS; i++) {
      const order = dir === 1 ? i : SLATS - 1 - i;
      // Each slat has its own vanishing point, so edge-on really is edge-on (no slivers).
      // Slats overlap by a pixel so no hairline of the next bumper shows between them at rest.
      const x = i * sw - 1;
      const w = sw + 2;
      const slat = div(stage, { left: x, top: 0, width: w, height: H, transformStyle: 'preserve-3d', willChange: 'transform' });
      gsap.set(slat, { transformPerspective: 1500 });
      const face = div(slat, { left: 0, top: 0, width: w, height: H, overflow: 'hidden', backfaceVisibility: 'hidden' });
      const copy = cloneSlide(from, `bl${i}`);
      copy.style.left = `${-x}px`;
      face.appendChild(copy);
      const shade = div(face, { left: 0, top: 0, width: w, height: H, background: INK, opacity: 0 });
      // The slat's thickness, on the edge that swings toward the viewer.
      const side = div(slat, { left: dir === 1 ? 0 : w - THICK, top: 0, width: THICK, height: H, background: accent, opacity: 0 });
      gsap.set(side, { transformOrigin: dir === 1 ? '0% 50%' : '100% 50%', rotationY: dir === 1 ? -90 : 90 });
      const start = order * step;
      tl.to(slat, { rotationY: 90 * dir, duration: turn, ease: 'power2.inOut' }, start);
      tl.to(shade, { opacity: 0.26, duration: turn, ease: 'power2.in' }, start);
      // The accent edge flashes by mid-turn and is gone by the time the slat is edge-on.
      tl.to(side, { opacity: 1, duration: turn * 0.35, ease: 'power1.out' }, start);
      tl.to(side, { opacity: 0, duration: turn * 0.3, ease: 'power1.in' }, start + turn * 0.62);
      tl.set(slat, { autoAlpha: 0 }, start + turn);
      end = Math.max(end, start + turn);
    }

    tl.call(ctx.show, [], 0);
    tl.call(ctx.hide, [], 0);
    tl.addLabel('reveal', ((SLATS - 1) * step + turn) / 2);
    tl.set(stage, { autoAlpha: 0 }, end);
    tl.call(() => cleanRoots(ctx), [], end);
    return tl;
  },
};
export default blinds;
