import { gsap } from '../../engine/gsap';
import { INK, PAPER } from '../../engine/palette';
import { BRAND, svg } from '../helpers';
import type { TransitionDef } from '../types';
import { canvasSvg, finish, layer, timing } from './_tr-a-helpers';

/** A wavy liquid body: the top edge is a smooth wave at local y = 0, the body goes `depth` px down. */
function waveD(x0: number, x1: number, wl: number, amp: number, depth: number): string {
  let d = `M${x0} 0`;
  for (let x = x0; x < x1; x += wl) d += `q${wl / 4} ${-amp} ${wl / 2} 0t${wl / 2} 0`;
  return `${d}V${depth}H${x0}Z`;
}

/** Cup geometry from the coffee sticker (64 grid), centered on the cup body. */
const CUP = { cx: 29, cy: 39, lipX: 44, lipY: 26 };
const CUP_SCALE = 7.4;
const TIP = 112;

/**
 * Coffee pour: a big coffee cup (the house sticker) swings in from the top and tips over, its
 * stream pours down, and the coffee rises as two wavy layers drifting sideways at different
 * speeds (ink behind, or milk on a dark slide, brand yellow in front) until the screen is full.
 * A few bubbles rise and pop, then it drains away in two steps (yellow, then ink) with a little
 * slosh, and B is there. The cup, the drift and the slosh mirror for dir -1.
 */
const coffeePour: TransitionDef = {
  key: 'coffee-pour',
  run(ctx) {
    const T = timing(ctx);
    const W = ctx.width;
    const H = ctx.height;
    const d = ctx.dir;
    const tl = gsap.timeline();
    const root = layer(ctx);
    const s = canvasSvg(ctx, root);

    const wl = 440;
    const amp = 30;
    const drift = wl * 2;
    const low = H + amp + 40;
    const full = -amp - 30;

    // Where the lip ends up once the cup is tipped (rotation around the cup body's center).
    const a = (TIP * Math.PI) / 180;
    const vx = CUP.lipX - CUP.cx;
    const vy = CUP.lipY - CUP.cy;
    const lipDx = (vx * Math.cos(a) - vy * Math.sin(a)) * CUP_SCALE;
    const lipDy = (vx * Math.sin(a) + vy * Math.cos(a)) * CUP_SCALE;
    const pourX = W / 2 + d * 250;
    const cupX = pourX - d * lipDx;
    const cupY = 110;
    const lipY = cupY + lipDy;

    // Ink coffee vanishes on a dark slide: pour milk there instead.
    const coffee = ctx.fromColors?.dark ? PAPER : INK;
    // The stream sits behind both layers, so the rising coffee swallows it.
    const stream = svg('rect', { x: pourX - 34, y: lipY - 20, width: 68, height: 0, rx: 34, fill: coffee }, s);

    const backG = svg('g', {}, s);
    svg('path', { d: waveD(-drift - wl, W + drift + wl, wl, amp, H + 400), fill: coffee }, backG);
    const frontG = svg('g', {}, s);
    svg('path', { d: waveD(-drift - wl, W + drift + wl, wl * 0.8, amp * 0.85, H + 400), fill: BRAND.square }, frontG);
    gsap.set([backG, frontG], { y: low, svgOrigin: `${W / 2} 0` });

    // The cup: body, handle and a little coffee at the lip, drawn around its body center.
    const cup = svg('g', {}, s);
    const cupInner = svg('g', { transform: `scale(${d} 1) translate(${-CUP.cx} ${-CUP.cy})` }, cup);
    const line = { stroke: INK, 'stroke-width': 3, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' };
    svg('path', { d: 'M44 30h4a6 6 0 0 1 0 12h-5', fill: 'none', ...line }, cupInner);
    svg('path', { d: 'M14 26h30v14a12 12 0 0 1-12 12h-6a12 12 0 0 1-12-12Z', fill: BRAND.square, ...line }, cupInner);
    svg('path', { d: 'M16.5 28.5h25', stroke: INK, 'stroke-width': 4.5, 'stroke-linecap': 'round' }, cupInner);
    gsap.set(cup, { x: cupX - d * 120, y: -420, scale: CUP_SCALE, rotation: -d * 18, svgOrigin: '0 0' });

    // 1. The cup swings in and tips, the stream pours, the coffee rises (cover at 0.8 s).
    tl.to(cup, { x: cupX, y: cupY, rotation: d * TIP, duration: T(0.34), ease: 'back.out(1.3)' }, 0);
    tl.to(stream, { attr: { height: H - lipY + 80 }, duration: T(0.2), ease: 'power2.in' }, T(0.2));
    tl.to(backG, { y: full, duration: T(0.56), ease: 'power2.inOut' }, T(0.14));
    tl.to(frontG, { y: full, duration: T(0.54), ease: 'power2.inOut' }, T(0.26));
    tl.to(stream, { attr: { y: H, height: 0 }, duration: T(0.24), ease: 'power2.in' }, T(0.56));
    tl.to(cup, { rotation: -d * 10, y: -460, x: cupX + d * 140, duration: T(0.32), ease: 'power2.in' }, T(0.58));
    // Sideways drift for the whole pour, the front layer faster and the other way.
    tl.fromTo(backG, { x: 0 }, { x: d * drift * 0.55, duration: T(1.6), ease: 'none', immediateRender: false }, 0);
    tl.fromTo(frontG, { x: d * wl * 0.4 }, { x: d * wl * 0.4 - d * drift, duration: T(1.6), ease: 'none' }, 0);

    // 2. Bubbles rise through the yellow and pop.
    const bubbles = Array.from({ length: 6 }, (_, i) => {
      const r = 38 + ctx.rand() * 46;
      const x = 200 + (i + 0.15 + ctx.rand() * 0.7) * ((W - 400) / 6);
      const y = 250 + ctx.rand() * (H - 500);
      const g = svg('g', {}, s);
      svg('circle', { cx: 0, cy: 0, r, fill: PAPER, 'fill-opacity': 0.55, stroke: INK, 'stroke-width': 7 }, g);
      svg('path', { d: `M${-r * 0.55} ${-r * 0.1}A${r * 0.55} ${r * 0.55} 0 0 1 ${-r * 0.1} ${-r * 0.55}`, fill: 'none', stroke: PAPER, 'stroke-width': 8, 'stroke-linecap': 'round' }, g);
      const ring = svg('circle', { cx: 0, cy: 0, r, fill: 'none', stroke: INK, 'stroke-width': 6, opacity: 0 }, s);
      gsap.set(g, { x, y: y + 120, scale: 0, svgOrigin: '0 0' });
      gsap.set(ring, { x, y, svgOrigin: '0 0' });
      return { g, ring, y, at: 0.6 + ctx.rand() * 0.1, pop: 0.8 + i * 0.022 + ctx.rand() * 0.03 };
    });
    for (const b of bubbles) {
      tl.to(b.g, { y: b.y, scale: 1, duration: T(0.22), ease: 'back.out(2)' }, T(b.at));
      tl.to(b.g, { scale: 1.25, opacity: 0, duration: T(0.07), ease: 'power2.out' }, T(b.pop));
      tl.fromTo(b.ring, { scale: 1, opacity: 1 }, { scale: 1.8, opacity: 0, duration: T(0.2), ease: 'power2.out', immediateRender: false }, T(b.pop));
    }

    // 3. Drain in two steps with a little slosh. B shows up behind it.
    const drain = T(0.96);
    tl.call(ctx.hide, [], drain);
    tl.call(ctx.show, [], drain);
    tl.to(frontG, { y: low, rotation: -d * 3, duration: T(0.44), ease: 'power1.in' }, drain);
    tl.addLabel('reveal', drain + T(0.1));
    tl.to(backG, { y: low, rotation: -d * 4, duration: T(0.48), ease: 'power1.in' }, drain + T(0.1));

    finish(tl, ctx, [root]);
    return tl;
  },
};
export default coffeePour;
