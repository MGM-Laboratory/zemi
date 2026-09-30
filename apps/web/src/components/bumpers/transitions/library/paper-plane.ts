import { gsap } from '../../engine/gsap';
import { INK, PAPER } from '../../engine/palette';
import { BRAND, div, svg } from '../helpers';
import type { TransitionDef } from '../types';
import { canvasSvg, cloneStatic, finish, layer, timing, uid } from './_tr-a-helpers';

/** How small the page gets before it folds (it reads as a sheet on the desk). */
const SHEET = 0.42;
/** Plane sticker (64 grid, parts/stickers.tsx) drawn at this scale around its center. */
const PLANE = 4.4;
const DESK = '#e4e9f1';
const DESK_LINE = '#d3dae6';

/**
 * Paper plane: A shrinks to a sheet on a graph-paper desk, folds in half (a real 3D fold of
 * two copies of the page), folds again, and the folded sheet morphs into the house paper-plane
 * sticker. It swoops, loops the loop and zips off screen, leaving a trail of ringed dots, while the
 * desk is wiped away behind it with a slanted edge and B is underneath. Mirrored for dir -1
 * (the other half folds, the plane flies the other way).
 */
const paperPlane: TransitionDef = {
  key: 'paper-plane',
  run(ctx) {
    const T = timing(ctx);
    const d = ctx.dir;
    const W = ctx.width;
    const H = ctx.height;
    const mx = (x: number) => (d === 1 ? x : W - x);
    const tl = gsap.timeline();
    const root = layer(ctx);
    const fromRoot = ctx.from?.root ?? null;

    // The desk: graph paper, wiped away later with a slanted edge that trails the plane.
    const desk = div(root, { left: 0, top: 0, width: W, height: H, background: DESK, backgroundImage: `linear-gradient(to right, ${DESK_LINE} 2px, transparent 2px), linear-gradient(to bottom, ${DESK_LINE} 2px, transparent 2px)`, backgroundSize: '48px 48px' });
    const edge = (e: number) => {
      const top = e + 150;
      const bottom = e - 150;
      return d === 1 ? `polygon(${top}px 0px, ${W + 600}px 0px, ${W + 600}px ${H}px, ${bottom}px ${H}px)` : `polygon(-600px 0px, ${W - top}px 0px, ${W - bottom}px ${H}px, -600px ${H}px)`;
    };
    desk.style.clipPath = edge(-400);

    // The sheet: two copies of A (the half that stays, and the flap that folds over it).
    const sheet = div(root, { left: 0, top: 0, width: W, height: H, perspective: '2600px' });
    const shadow = div(sheet, { left: 0, top: 0, width: W, height: H, boxShadow: '26px 30px 0 rgba(14,17,22,0.16)', opacity: 0 });
    const page = (clip: string) => {
      const el = fromRoot ? cloneStatic(fromRoot) : document.createElement('div');
      Object.assign(el.style, { position: 'absolute', left: '0', top: '0', width: `${W}px`, height: `${H}px`, visibility: 'visible', clipPath: clip, backfaceVisibility: 'hidden' });
      if (!fromRoot) el.style.background = PAPER;
      return el;
    };
    const stayLeft = d === 1;
    const stay = page(stayLeft ? 'inset(0 50% 0 0)' : 'inset(0 0 0 50%)');
    sheet.appendChild(stay);
    const flap = div(sheet, { left: 0, top: 0, width: W, height: H, transformStyle: 'preserve-3d' });
    flap.appendChild(page(stayLeft ? 'inset(0 0 0 50%)' : 'inset(0 50% 0 0)'));
    const back = div(flap, { left: stayLeft ? W / 2 : 0, top: 0, width: W / 2, height: H, background: PAPER, backfaceVisibility: 'hidden', transform: 'rotateY(180deg) translateZ(1px)' });
    div(back, { left: 0, top: 0, width: W / 2, height: H, background: `linear-gradient(${stayLeft ? 'to left' : 'to right'}, rgba(14,17,22,0.1), rgba(14,17,22,0) 40%)` });
    gsap.set(sheet, { transformOrigin: '50% 50%' });
    gsap.set(flap, { transformOrigin: '50% 50%' });

    // Second fold: plain paper from here on (the back of the first fold is what we see).
    const x0 = stayLeft ? 0 : W / 2;
    const fold2 = div(sheet, { left: x0, top: 0, width: W / 2, height: H, opacity: 0, perspective: '2600px' });
    div(fold2, { left: 0, top: H / 2, width: W / 2, height: H / 2, background: PAPER });
    const topFlap = div(fold2, { left: 0, top: 0, width: W / 2, height: H / 2, background: PAPER });
    const topShade = div(topFlap, { left: 0, top: 0, width: W / 2, height: H / 2, background: INK, opacity: 0 });
    gsap.set(topFlap, { transformOrigin: '50% 100%' });

    // 1. Shrink to a sheet (0.36 s). The copies stand in for A from the first frame.
    tl.call(ctx.hide, [], 0);
    tl.call(ctx.show, [], 0);
    tl.to(sheet, { scale: SHEET, duration: T(0.34), ease: 'power3.inOut' }, 0);
    tl.to(shadow, { opacity: 1, duration: T(0.3), ease: 'power1.out' }, 0);

    // 2. Fold in half, then in half again.
    tl.to(flap, { rotationY: -d * 180, duration: T(0.28), ease: 'power2.inOut' }, T(0.34));
    tl.to(shadow, { opacity: 0, duration: T(0.2), ease: 'power1.in' }, T(0.38));
    const f2 = T(0.63);
    tl.set([stay, flap], { visibility: 'hidden' }, f2);
    tl.set(fold2, { opacity: 1 }, f2);
    tl.to(topFlap, { rotationX: -180, duration: T(0.22), ease: 'power2.inOut' }, f2);
    tl.to(topShade, { opacity: 0.12, duration: T(0.11), ease: 'power1.in', yoyo: true, repeat: 1 }, f2);

    // 3. The folded sheet (a quarter page on screen) morphs into the plane sticker.
    const qw = (W / 2) * SHEET;
    const qh = (H / 2) * SHEET;
    const qx = W / 2 + (x0 - W / 2) * SHEET + qw / 2;
    const qy = H / 2 + qh / 2;
    const s = canvasSvg(ctx, root);
    const trailId = uid('trail');
    const flight = d === 1 ? `M${qx} ${qy}C${qx + 120} ${qy + 80} ${1030} ${720} ${1150} ${710}A190 190 0 0 0 1150 330A190 190 0 0 0 1150 710C1400 720 1700 520 ${W + 330} 170` : `M${qx} ${qy}C${qx - 120} ${qy + 80} ${mx(1030)} ${720} ${mx(1150)} ${710}A190 190 0 0 1 ${mx(1150)} 330A190 190 0 0 1 ${mx(1150)} 710C${mx(1400)} 720 ${mx(1700)} 520 ${-330} 170`;
    const mask = svg('mask', { id: trailId, maskUnits: 'userSpaceOnUse', x: -600, y: -600, width: W + 1200, height: H + 1200 }, svg('defs', {}, s));
    const reveal = svg('path', { d: flight, fill: 'none', stroke: '#fff', 'stroke-width': 44, 'stroke-linecap': 'round' }, mask);
    // Ringed dots read on the light desk and on B alike: yellow in ink on a dark B, the accent in paper on a light one.
    const dot = ctx.toColors.dark ? BRAND.square : ctx.toColors.accent === 'yellow' ? INK : ctx.toColors.accentHex;
    const ring = ctx.toColors.dark ? INK : PAPER;
    const trail = svg('g', { mask: `url(#${trailId})` }, s);
    svg('path', { d: flight, fill: 'none', stroke: ring, 'stroke-width': 16, 'stroke-linecap': 'round', 'stroke-dasharray': '2 24' }, trail);
    svg('path', { d: flight, fill: 'none', stroke: dot, 'stroke-width': 9, 'stroke-linecap': 'round', 'stroke-dasharray': '2 24' }, trail);

    const plane = svg('g', {}, s);
    const inner = svg('g', { transform: `scale(${d * PLANE} ${PLANE}) translate(-32 -32)` }, plane);
    const sheetD = `M${32 - qw / (2 * PLANE)} ${32 - qh / (2 * PLANE)}h${qw / PLANE}v${qh / PLANE}h${-qw / PLANE}Z`;
    const body = svg('path', { d: sheetD, fill: PAPER, stroke: INK, 'stroke-width': 0, 'stroke-linejoin': 'round' }, inner);
    const wing = svg('path', { d: 'M58 8 32 38l-2 14 10-10', fill: BRAND.circle, stroke: INK, 'stroke-width': 3, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', opacity: 0 }, inner);
    gsap.set(plane, { x: qx, y: qy, svgOrigin: '0 0', opacity: 0 });

    // The plane's nose sits at -42.7 degrees in the sticker; line it up with the path.
    const nose = d === 1 ? 42.7 : 137.3;
    const heading = (Math.atan2(80, d * 120) * 180) / Math.PI;
    const morph = T(0.86);
    tl.set(plane, { opacity: 1 }, morph);
    tl.set(sheet, { opacity: 0 }, morph);
    tl.to(body, { morphSVG: 'M6 30 58 8 44 56 32 38Z', attr: { 'stroke-width': 3 }, duration: T(0.2), ease: 'power2.out' }, morph);
    tl.to(wing, { opacity: 1, duration: T(0.1), ease: 'power1.out' }, morph + T(0.12));
    tl.to(plane, { rotation: heading + nose, duration: T(0.2), ease: 'power2.out' }, morph);

    // 4. Loop the loop and zip off, drawing the trail; the desk is wiped away behind it.
    // Constant speed along the path (MotionPath and DrawSVG both go by length, so they stay in
    // step); the long exit leg makes the zip-off fast on its own. The wipe keys follow the
    // path's legs: swoop (to 14%), loop (to 55%), exit.
    const fly = morph + T(0.2);
    const fd = T(0.92);
    tl.to(plane, { motionPath: { path: flight, autoRotate: nose }, duration: fd, ease: 'none' }, fly);
    tl.fromTo(reveal, { drawSVG: '0% 0%' }, { drawSVG: '0% 100%', duration: fd, ease: 'none', immediateRender: true }, fly);
    tl.to(desk, { clipPath: edge(160), duration: fd * 0.14, ease: 'power1.in' }, fly);
    tl.to(desk, { clipPath: edge(880), duration: fd * 0.41, ease: 'none' }, fly + fd * 0.14);
    tl.addLabel('reveal', fly + fd * 0.3);
    tl.to(desk, { clipPath: edge(W + 420), duration: fd * 0.45, ease: 'power1.in' }, fly + fd * 0.55);
    tl.to(trail, { opacity: 0, duration: T(0.28), ease: 'power1.in' }, fly + fd - T(0.1));

    finish(tl, ctx, [root]);
    return tl;
  },
};
export default paperPlane;
