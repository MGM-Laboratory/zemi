import { gsap } from '../../engine/gsap';
import { ACCENT_SHAPE, PAPER } from '../../engine/palette';
import { charAnim } from '../../parts/character';
import { character, div } from '../helpers';
import type { TransitionDef } from '../types';
import { clipHalf, cssPolygon, drive, easeFn, finish, H, lerp, RECT, sec, W } from './_tr-c-helpers';

const GRID = '#e4e9f1';
const SHADE = 'rgba(14,17,22,';

/**
 * Page turn: A peels off like a notebook page. A fold line starts at the bottom corner, sweeps
 * across and straightens as it goes, the lifted part flips over to show the page's back (graph
 * paper, a red margin and a doodled character) and slides off, landing B underneath. Drawn as a
 * fold (A clipped to the flat part, the back reflected across the fold) so the back is really
 * on screen; a rigid rotateY around the screen edge would hide it past 90 degrees.
 */
const pageTurn: TransitionDef = {
  key: 'page-turn',
  run(ctx) {
    const tl = gsap.timeline();
    const A = ctx.from?.root ?? null;
    const B = ctx.to.root!;
    const flip = ctx.dir === -1;
    // Work as if the page peels from the right, mirror x for backwards.
    const mx = (x: number) => (flip ? W - x : x);
    const turn = sec(ctx, 1.3);
    const calm = ctx.motion === 'calm';

    // B sits under A for the whole turn.
    if (A) gsap.set(A, { zIndex: 2 });
    gsap.set(B, { zIndex: 1 });
    tl.call(ctx.show, [], 0);

    // Cast shadow of the curl onto B, right next to the fold.
    const cast = div(ctx.overlay, { left: 0, top: 0, width: 4200, height: 150, transformOrigin: '0 0', background: `linear-gradient(to bottom, ${SHADE}0.26), ${SHADE}0.08) 45%, ${SHADE}0))`, willChange: 'transform' });
    // The page's hard shadow on what is left of A (the brand's offset shadow, soft ink).
    const drop = div(ctx.overlay, { left: 0, top: 0, width: W, height: H, transformOrigin: '0 0', background: `${SHADE}0.16)`, willChange: 'transform' });
    // The back of the page.
    const back = div(ctx.overlay, {
      left: 0,
      top: 0,
      width: W,
      height: H,
      transformOrigin: '0 0',
      overflow: 'hidden',
      background: PAPER,
      backgroundImage: `linear-gradient(to right, ${GRID} 2px, transparent 2px), linear-gradient(to bottom, ${GRID} 2px, transparent 2px)`,
      backgroundSize: '48px 48px',
      willChange: 'transform',
    });
    // Margin line near the outer edge (the first thing that shows when the corner lifts).
    div(back, { left: mx(W - 168), top: 0, width: 4, height: H, background: 'rgba(249,65,65,0.55)' });
    // A doodle in the corner: the incoming slide's character, a bit surprised to be turned over.
    const shape = ACCENT_SHAPE[ctx.toColors.accent];
    const doodle = character(back, shape, 190, { x: mx(W - 470) - (flip ? 190 : 0), y: H - 330, mood: 'surprised', lookX: flip ? 0.8 : -0.8, lookY: -0.4 });
    doodle.style.transform = `rotate(${flip ? 9 : -9}deg)`;
    // And a highlighter swipe under it, like someone underlined a thought.
    div(back, { left: mx(W - 560) - (flip ? 380 : 0), top: H - 120, width: 380, height: 14, borderRadius: 14, background: 'rgba(58,109,197,0.28)', transform: `rotate(${flip ? 2 : -2}deg)` });
    // Shade on the back near the fold (the curl), drawn in the page's own coordinates.
    const shade = div(back, { left: 0, top: 0, width: 4200, height: 340, transformOrigin: '0 0', background: `linear-gradient(to bottom, ${SHADE}0.2), ${SHADE}0.06) 35%, ${SHADE}0) 100%)` });

    const angleEase = easeFn('sine.inOut');
    const frame = (p: number) => {
      // Fold normal points from the flat part toward the lifted corner; it straightens as it goes.
      const deg = lerp(calm ? 26 : 34, 9, angleEase(p));
      const a = (deg * Math.PI) / 180;
      const nx0 = Math.cos(a);
      const ny = Math.sin(a);
      const far = W * nx0 + H * ny;
      const s0 = lerp(far, -40, p);
      // Mirrored normal and offset for backwards (x -> W - x).
      const nx = flip ? -nx0 : nx0;
      const s = flip ? s0 - W * nx0 : s0;
      const flat = clipHalf(RECT, nx, ny, s);
      const lifted = clipHalf(RECT, -nx, -ny, -s);
      if (A) A.style.clipPath = cssPolygon(flat);
      // Reflection across the fold: x' = x - 2 (n.x - s) n.
      const m = `matrix(${1 - 2 * nx * nx}, ${-2 * nx * ny}, ${-2 * nx * ny}, ${1 - 2 * ny * ny}, ${2 * s * nx}, ${2 * s * ny})`;
      back.style.transform = m;
      back.style.clipPath = cssPolygon(lifted);
      drop.style.transform = `translate(${(flip ? 1 : -1) * 18}px, 14px) ${m}`;
      drop.style.clipPath = cssPolygon(lifted);
      // Bands that start on the fold line: local +y points along n (toward the lifted side).
      const rot = deg - 90;
      const fx = s * nx;
      const fy = s * ny;
      const band = `translate(${fx}px, ${fy}px) rotate(${flip ? -rot : rot}deg) translate(-2100px, 0px)`;
      shade.style.transform = band;
      cast.style.transform = band;
      const fade = p < 0.06 ? p / 0.06 : p > 0.9 ? (1 - p) / 0.1 : 1;
      cast.style.opacity = String(fade);
      drop.style.opacity = String(fade);
    };
    frame(0);
    drive(tl, 0, turn, frame, 'power1.inOut');
    tl.add(charAnim.blink(doodle), turn * 0.42);
    tl.add(charAnim.look(doodle, flip ? -0.6 : 0.6, 0.5, sec(ctx, 0.3)), turn * 0.5);
    tl.addLabel('reveal', sec(ctx, 0.25));
    finish(tl, ctx, turn + sec(ctx, 0.02), () => gsap.set([back, drop, cast], { opacity: 0 }));
    return tl;
  },
};
export default pageTurn;
