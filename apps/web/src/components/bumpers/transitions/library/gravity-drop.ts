import { SHAPE_ORDER } from '@zemi/shared';
import { gsap } from '../../engine/gsap';
import { INK } from '../../engine/palette';
import { BRAND, overlaySvg, shapePath, svg } from '../helpers';
import type { TransitionDef } from '../types';
import { canvasClipFor, clamp01, drive, easeFn, finish, H, sec, slideBgs, standOut, W, type Pt } from './_tr-c-helpers';

// Seconds at speed 1.
const TILT = 0.17;
const FALL = 0.6;
const SETTLE = 0.62;

/**
 * Gravity: A loses a pin, sags on one corner and drops off the bottom with real acceleration,
 * B riding down right on top of it; B lands with a thud (its content squashes wide, stretches
 * tall, wobbles to rest) and a puff of shape dust kicks out of the corners. Whatever briefly
 * shows between the two cards is painted (B's accent), never the empty stage.
 */
const gravityDrop: TransitionDef = {
  key: 'gravity-drop',
  run(ctx) {
    const tl = gsap.timeline();
    const A = ctx.from?.root ?? null;
    const B = ctx.to.root!;
    const sgn = ctx.dir === -1 ? -1 : 1;
    const calm = ctx.motion === 'calm';
    const tilt0 = calm ? 1.2 : 2.2;
    const tilt1 = calm ? 3.2 : 6.5;
    const drop = H + 320;
    // B rides a painted seam above A, so the two cards read apart even when they share a color.
    const seam = calm ? 22 : 34;
    // yA(t) = drop * u^2; B (seam above A) is home when yA = H + seam.
    const land = TILT + FALL * Math.sqrt((H + seam) / drop);
    const total = land + SETTLE;
    const squash = calm ? 0.035 : 0.07;
    const stretch = calm ? 0.02 : 0.04;

    const bgs = slideBgs(ctx);
    const gapColor = standOut([ctx.toColors.accentHex, INK, BRAND.circle], bgs, 1.3);
    const layer = overlaySvg(ctx);
    const gap = svg('path', { d: '', fill: gapColor, 'fill-rule': 'evenodd' }, layer);

    // Both cards move every frame: give them their own layers for the ride (cleared at the end).
    const roots = [A, B].filter((r): r is HTMLDivElement => !!r);
    for (const r of roots) r.style.willChange = 'transform';
    if (A) A.style.transformOrigin = sgn === 1 ? '0 0' : '100% 0';
    B.style.transformOrigin = '50% 100%';
    const back = easeFn('back.out(3)');
    const quad = (pts: Pt[]) => `M${pts.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(' L')} Z`;
    const ox = sgn === 1 ? 0 : W;
    const frame = (p: number) => {
      const t = p * total;
      const u = clamp01((t - TILT) / FALL);
      const deg = (tilt0 * back(clamp01(t / TILT)) + (tilt1 - tilt0) * u * u) * sgn;
      const yA = drop * u * u;
      const yB = Math.min(0, yA - H - seam);
      if (A) {
        A.style.transform = `translate(0px, ${yA.toFixed(2)}px) rotate(${deg.toFixed(3)}deg)`;
        // Keep the falling card inside the canvas (players letterbox the stage).
        A.style.clipPath = canvasClipFor({ ty: yA, deg, ox, oy: 0 });
      }
      // After landing: squash wide, stretch tall, a small wobble. Both scales stay >= 1 so the
      // card always covers the canvas.
      const s = clamp01((t - land) / SETTLE);
      let sx = 1;
      let sy = 1;
      if (s > 0) {
        if (s < 0.14) sx = 1 + squash * Math.sin((s / 0.14) * (Math.PI / 2));
        else if (s < 0.42) {
          const k = (s - 0.14) / 0.28;
          sx = 1 + squash * (1 - k);
          sy = 1 + stretch * Math.sin(k * Math.PI);
        } else {
          const k = (s - 0.42) / 0.58;
          const wob = Math.sin(k * Math.PI * 3) * (1 - k) * (1 - k);
          sx = 1 + Math.max(0, wob) * squash * 0.3;
          sy = 1 + Math.max(0, -wob) * stretch * 0.4;
        }
      }
      if (s > 0) {
        B.style.transform = `translate(0px, 0px) scale(${sx.toFixed(4)}, ${sy.toFixed(4)})`;
        B.style.clipPath = canvasClipFor({ sx, sy, ox: W / 2, oy: H });
      } else {
        B.style.transform = `translate(0px, ${yB.toFixed(2)}px)`;
        B.style.clipPath = canvasClipFor({ ty: yB });
      }
      // Paint whatever the two cards leave uncovered (only while A is still on screen).
      if (A && t < land) {
        const r = (deg * Math.PI) / 180;
        const c = Math.cos(r);
        const sn = Math.sin(r);
        const corner = ([x, y]: Pt): Pt => [ox + (x - ox) * c - y * sn, yA + (x - ox) * sn + y * c];
        const aq = [corner([0, 0]), corner([W, 0]), corner([W, H]), corner([0, H])];
        const bq: Pt[] = [
          [0, yB],
          [W, yB],
          [W, yB + H],
          [0, yB + H],
        ];
        gap.setAttribute('d', `M0 0 H${W} V${H} H0 Z ${quad(aq)} ${quad(bq)}`);
      } else gap.setAttribute('d', '');
    };
    frame(0);
    drive(tl, 0, sec(ctx, total), frame);
    tl.call(ctx.show, [], sec(ctx, TILT));
    tl.call(ctx.hide, [], sec(ctx, land));
    tl.addLabel('reveal', sec(ctx, land - 0.04));

    // Dust: little shapes puff out of both bottom corners on impact.
    if (!calm) {
      const dust = svg('g', {}, layer);
      for (let i = 0; i < 14; i++) {
        const side = i % 2 ? 1 : -1;
        const shape = SHAPE_ORDER[Math.floor(ctx.rand() * 4)]!;
        const size = 30 + ctx.rand() * 34;
        const x0 = side === -1 ? 90 + ctx.rand() * 420 : W - 90 - ctx.rand() * 420;
        const puff = svg('g', {}, dust);
        shapePath(puff, shape, x0 - size / 2, H - 8 - size / 2, size, BRAND[shape]);
        const at = sec(ctx, land + ctx.rand() * 0.05);
        const dx = side * (40 + ctx.rand() * 190);
        const dy = -(110 + ctx.rand() * 190);
        const spin = side * (120 + ctx.rand() * 200);
        // Out in 0.28 s, then drift down and fade, all done before the settle ends.
        tl.fromTo(puff, { x: 0, y: 0, scale: 0.3, rotation: 0, opacity: 0, svgOrigin: `${x0} ${H - 8}` }, { x: dx, y: dy, scale: 1, rotation: spin * 0.6, opacity: 1, duration: sec(ctx, 0.28), ease: 'power3.out', immediateRender: true }, at);
        tl.to(puff, { y: dy + 50, rotation: spin, opacity: 0, duration: sec(ctx, 0.24), ease: 'power1.in' }, at + sec(ctx, 0.28));
      }
    }
    finish(tl, ctx, sec(ctx, total) + sec(ctx, 0.02), () => gsap.set(roots, { clearProps: 'willChange' }));
    return tl;
  },
};
export default gravityDrop;
