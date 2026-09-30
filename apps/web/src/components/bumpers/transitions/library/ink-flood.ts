import { gsap } from '../../engine/gsap';
import { INK } from '../../engine/palette';
import { BRAND, overlaySvg, svg } from '../helpers';
import type { TransitionDef } from '../types';
import { clamp01, drive, easeFn, finish, H, lerp, sec, shuffle, slideBgs, standOut, W, type Pt } from './_tr-c-helpers';

// Timings at speed 1 (seconds). The whole piece is one proxy tween, so every frame is a pure
// function of time and progress(1) lands exactly on the last one.
const SPREAD = 0.6;
const STAGGER = 0.11;
const SHRINK = 0.55;
const FALL = 0.36;
const DROP_R = 58;

/**
 * Ink flood: five blobs of ink bloom from seeded spots, melt into each other (a goo filter:
 * blur plus an alpha threshold, clipped to the canvas so it stays cheap) and flood the screen.
 * Then the ink pulls back into a single drop that stretches and falls off the bottom, leaving B.
 */
const inkFlood: TransitionDef = {
  key: 'ink-flood',
  run(ctx) {
    const tl = gsap.timeline();
    // Fountain-pen ink in B's accent; real ink black when the accent would vanish on a slide.
    const color = standOut([ctx.toColors.accentHex, INK, BRAND.triangle], slideBgs(ctx), 1.6);
    const layer = overlaySvg(ctx);
    const id = `trc-goo-${ctx.seed.toString(36)}`;
    const defs = svg('defs', {}, layer);
    const filter = svg('filter', { id, filterUnits: 'userSpaceOnUse', x: -20, y: -20, width: W + 40, height: H + 40, 'color-interpolation-filters': 'sRGB' }, defs);
    svg('feGaussianBlur', { in: 'SourceGraphic', stdDeviation: 22, result: 'b' }, filter);
    svg('feColorMatrix', { in: 'b', values: '1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 28 -11' }, filter);
    const goo = svg('g', { filter: `url(#${id})`, fill: color }, layer);

    // Five spots, one per region, jittered by the seed; the bloom order is seeded too.
    const layout: Pt[] = [
      [0.17, 0.24],
      [0.8, 0.19],
      [0.5, 0.54],
      [0.22, 0.8],
      [0.83, 0.79],
    ];
    const centers: Pt[] = layout.map(([x, y]) => [x * W + (ctx.rand() - 0.5) * 220, y * H + (ctx.rand() - 0.5) * 160]);
    // Radius that covers the canvas once every blob is full grown (checked on a coarse grid).
    let cover = 0;
    for (let x = 0; x <= W; x += 60) {
      for (let y = 0; y <= H; y += 60) {
        let best = Infinity;
        for (const [cx, cy] of centers) best = Math.min(best, Math.hypot(x - cx, y - cy));
        cover = Math.max(cover, best);
      }
    }
    const R = cover + 40;
    const order = shuffle(centers.map((_, i) => i), ctx.rand);
    const drop: Pt = [W * (0.38 + ctx.rand() * 0.24), H * 0.56];
    const blobs = centers.map((c, i) => ({
      c,
      start: (order.indexOf(i) / (centers.length - 1)) * STAGGER * 0.8 + ctx.rand() * STAGGER * 0.2,
      drift: [(ctx.rand() - 0.5) * 70, (ctx.rand() - 0.5) * 50] as Pt,
      // The blob nearest the drop point becomes the drop; the rest drain into it.
      shrinkDelay: 0,
      el: svg('circle', { cx: c[0], cy: c[1], r: 0 }, goo),
    }));
    const byDist = blobs.map((b, i) => ({ i, d: Math.hypot(b.c[0] - drop[0], b.c[1] - drop[1]) })).sort((a, b) => b.d - a.d);
    byDist.forEach(({ i }, k) => (blobs[i]!.shrinkDelay = k * 0.045));
    const keeper = byDist[byDist.length - 1]!.i;
    // Droplets: splashes that pop out near each blob early on, then get swallowed.
    const drops = centers.flatMap((c) =>
      Array.from({ length: 3 }, () => {
        const a = ctx.rand() * Math.PI * 2;
        const d = 180 + ctx.rand() * 260;
        return { p: [c[0] + Math.cos(a) * d, c[1] + Math.sin(a) * d] as Pt, r: 34 + ctx.rand() * 34, at: 0.04 + ctx.rand() * 0.22, el: svg('circle', { cx: 0, cy: 0, r: 0 }, goo) };
      }),
    );
    // The falling drop's tail (the goo turns two circles into a teardrop).
    const tail = svg('circle', { cx: drop[0], cy: drop[1], r: 0 }, goo);

    const bloom = easeFn('sine.inOut');
    // The first moment the grown blobs cover every point of the canvas (coarse grid, a small
    // margin for the goo edge): swap there, and start draining right after, so the solid ink
    // only holds for a beat.
    const grid: Pt[] = [];
    for (let x = 0; x <= W; x += 60) for (let y = 0; y <= H; y += 60) grid.push([x, y]);
    let coveredAt = STAGGER + SPREAD;
    for (let t = 0.2; t <= STAGGER + SPREAD; t += 0.01) {
      const discs = blobs.map((b) => {
        const g = bloom(clamp01((t - b.start) / SPREAD));
        return [b.c[0] + b.drift[0] * g, b.c[1] + b.drift[1] * g, R * g - 8] as const;
      });
      if (grid.every(([x, y]) => discs.some(([cx, cy, r]) => Math.hypot(x - cx, y - cy) <= r))) {
        coveredAt = t;
        break;
      }
    }
    const SHRINK_AT = coveredAt + 0.05;
    const TOTAL = SHRINK_AT + SHRINK + FALL + 0.02;
    const out = easeFn('power3.out');
    const drain = easeFn('power2.out');
    const inOut = easeFn('power2.inOut');
    const inn = easeFn('power2.in');
    const set = (el: SVGCircleElement, x: number, y: number, r: number) => {
      el.setAttribute('cx', x.toFixed(1));
      el.setAttribute('cy', y.toFixed(1));
      el.setAttribute('r', Math.max(0, r).toFixed(1));
    };
    const frame = (p: number) => {
      const t = p * TOTAL;
      const fall = clamp01((t - SHRINK_AT - SHRINK) / FALL);
      const fy = drop[1] + (H + 260 - drop[1]) * inn(fall);
      blobs.forEach((b, i) => {
        const g = bloom(clamp01((t - b.start) / SPREAD));
        const u = clamp01((t - SHRINK_AT - b.shrinkDelay) / (SHRINK - b.shrinkDelay));
        const k = inOut(u);
        const x0 = b.c[0] + b.drift[0] * g;
        const y0 = b.c[1] + b.drift[1] * g;
        const x = lerp(x0, drop[0], k);
        const y = i === keeper && fall > 0 ? fy : lerp(y0, drop[1], k);
        // The radius drains fast at first, so B shows up at the edges right away.
        const r = lerp(R * g, i === keeper ? DROP_R : 0, drain(u));
        set(b.el, x, y, r);
      });
      for (const d of drops) {
        const g = out(clamp01((t - d.at) / 0.3));
        const k = clamp01((t - 0.3 - d.at) / 0.3);
        set(d.el, d.p[0], d.p[1], d.r * g * (1 - k));
      }
      // Tail: stretches up behind the drop while it falls.
      const tr = fall > 0 ? DROP_R * 0.62 * (1 - fall * 0.35) : 0;
      set(tail, drop[0], fy - DROP_R * (0.7 + fall * 1.1), tr);
    };
    frame(0);
    drive(tl, 0, sec(ctx, TOTAL), frame);

    tl.call(ctx.show, [], sec(ctx, coveredAt + 0.01));
    tl.call(ctx.hide, [], sec(ctx, coveredAt + 0.01));
    tl.addLabel('reveal', sec(ctx, SHRINK_AT + 0.08));
    finish(tl, ctx, sec(ctx, TOTAL) + sec(ctx, 0.01));
    return tl;
  },
};
export default inkFlood;
