import { SHAPE_ORDER, SHAPE_PATHS_46 } from '@zemi/shared';
import { gsap } from '../../engine/gsap';
import { INK, PAPER } from '../../engine/palette';
import { BRAND, div, svg } from '../helpers';
import type { TransitionDef } from '../types';
import { finish, layer, timing } from './_tr-a-helpers';

const COLS = 12;
const ROWS = 7;
const COLORS = [BRAND.circle, BRAND.triangle, BRAND.square, BRAND.arch];

/**
 * Mosaic: a 12x7 grid of brand-colored tiles flips in (rotateY, each with its own perspective)
 * as a diagonal wave from a seeded corner, each tile flashing a tiny shape, then the wave flips
 * them out the other way onto B. The corner mirrors horizontally for dir -1, and so does the
 * spin direction. Tiles overlap by a pixel so no seam shows at any stage scale.
 */
const gridMosaic: TransitionDef = {
  key: 'grid-mosaic',
  run(ctx) {
    const T = timing(ctx);
    const tl = gsap.timeline();
    const root = layer(ctx);
    const tw = ctx.width / COLS;
    const th = ctx.height / ROWS;

    const corner = Math.floor(ctx.rand() * 4);
    const right = (corner % 2 === 1) !== (ctx.dir === -1);
    const bottom = corner >= 2;
    const from = (bottom ? ROWS - 1 : 0) * COLS + (right ? COLS - 1 : 0);
    // Tiles turn away from the corner the wave starts in.
    const spin = right ? -1 : 1;

    const tiles: HTMLDivElement[] = [];
    const shades: HTMLDivElement[] = [];
    const marks: SVGSVGElement[] = [];
    // Diagonal bands of the four colors that run with the wave; each tile wears its own shape.
    const offset = Math.floor(ctx.rand() * 4);
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const dr = bottom ? ROWS - 1 - r : r;
        const dc = right ? COLS - 1 - c : c;
        const k = (dr + dc + offset) % COLORS.length;
        const fill = COLORS[k]!;
        const tile = div(root, { left: c * tw - 1, top: r * th - 1, width: tw + 2, height: th + 2, background: fill, backfaceVisibility: 'hidden' });
        const shape = SHAPE_ORDER[k]!;
        const size = Math.round(th * 0.36);
        const mark = svg('svg', { viewBox: '0 0 46 46', width: size, height: size }, tile);
        mark.style.position = 'absolute';
        mark.style.left = `${(tw + 2 - size) / 2}px`;
        mark.style.top = `${(th + 2 - size) / 2}px`;
        mark.style.overflow = 'visible';
        svg('path', { d: SHAPE_PATHS_46[shape], fill: fill === BRAND.square ? INK : PAPER }, mark);
        const shade = div(tile, { left: 0, top: 0, width: tw + 2, height: th + 2, background: INK, opacity: 0.4 });
        tiles.push(tile);
        marks.push(mark);
        shades.push(shade);
      }
    }
    gsap.set(tiles, { rotationY: spin * 90, transformPerspective: 700, transformOrigin: '50% 50%' });
    gsap.set(marks, { scale: 0, rotation: -spin * 90, transformOrigin: '50% 50%' });

    const wave = (amount: number) => ({ grid: [ROWS, COLS] as [number, number], from, amount: T(amount) });

    // 1. Flip in as a diagonal wave (flat by 0.72 s), each tile flashing its shape.
    tl.to(tiles, { rotationY: 0, duration: T(0.3), ease: 'power2.out', stagger: wave(0.42) }, 0);
    tl.to(shades, { opacity: 0, duration: T(0.28), ease: 'power1.out', stagger: wave(0.42) }, 0);
    tl.to(marks, { scale: 1, rotation: 0, duration: T(0.3), ease: 'back.out(2.4)', stagger: wave(0.42) }, T(0.1));

    // 2. Swap under the full grid, then the same wave flips them out the other side onto B.
    // The first tiles leave as the last ones settle (a few degrees to go, hidden by the 1 px
    // overlap), so the full grid only flashes by.
    const out = T(0.64);
    tl.call(ctx.hide, [], out);
    tl.call(ctx.show, [], out);
    tl.addLabel('reveal', out);
    tl.to(marks, { scale: 0.4, rotation: spin * 90, duration: T(0.22), ease: 'power2.in', stagger: wave(0.42) }, out);
    tl.to(shades, { opacity: 0.4, duration: T(0.28), ease: 'power1.in', stagger: wave(0.42) }, out);
    tl.to(tiles, { rotationY: -spin * 90, duration: T(0.32), ease: 'power1.in', stagger: wave(0.42) }, out);

    finish(tl, ctx, [root]);
    return tl;
  },
};
export default gridMosaic;
