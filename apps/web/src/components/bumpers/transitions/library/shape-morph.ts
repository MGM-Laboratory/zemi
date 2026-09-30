import { SHAPE_PATHS_46, type ShapeName } from '@zemi/shared';
import { gsap } from '../../engine/gsap';
import { INK, PAPER } from '../../engine/palette';
import { BRAND, div, svg } from '../helpers';
import type { TransitionDef } from '../types';
import { canvasSvg, finish, isBg, layer, timing } from './_tr-a-helpers';

interface Pose {
  shape: ShapeName;
  /** Scale of the 46 px shape. */
  scale: number;
  /** Degrees, multiplied by dir. */
  rotation: number;
  /** When this pose is reached (s at speed 1). */
  at: number;
}

/** 23 * 52 = 1196 > the 1101 px from the center to a corner, so the arch covers the canvas. */
const COVER = 52;

/**
 * Shape morph: one shape grows from the center as Q's circle, then morphs (MorphSVG) through
 * Hunch's triangle and Block's square to Bridge's arch, turning and changing color as it grows,
 * each step leaving an outline echo that ripples out. The arch covers the screen, then splits
 * down the middle and its halves swing open away from us like doors (real 3D, clip-path
 * halves) onto B. Mirrored for dir -1 (turns the other way, the other door leads).
 */
const shapeMorph: TransitionDef = {
  key: 'shape-morph',
  run(ctx) {
    const T = timing(ctx);
    const d = ctx.dir;
    const W = ctx.width;
    const H = ctx.height;
    const cx = W / 2;
    const cy = H / 2;
    const tl = gsap.timeline();
    const root = layer(ctx);
    const s = canvasSvg(ctx, root);
    const echoes = svg('g', {}, s);
    const wrap = svg('g', {}, s);
    const path = svg('path', { d: SHAPE_PATHS_46.circle, transform: 'translate(-23 -23)' }, wrap);
    // A shape the color of the slide under it would vanish: the growing shapes turn paper on an A
    // of their color (ink on yellow), the arch doors turn ink when they open on a green B.
    const tone = (shape: ShapeName) => {
      if (shape === 'arch') return isBg(ctx.toColors, BRAND.arch) ? INK : BRAND.arch;
      if (!isBg(ctx.fromColors, BRAND[shape])) return BRAND[shape];
      return shape === 'square' ? INK : PAPER;
    };
    path.style.fill = tone('circle');
    gsap.set(wrap, { x: cx, y: cy, scale: 0, rotation: 0, svgOrigin: '0 0' });

    const poses: Pose[] = [
      { shape: 'circle', scale: 8.5, rotation: 0, at: 0.34 },
      { shape: 'triangle', scale: 15, rotation: 120, at: 0.62 },
      { shape: 'square', scale: 27, rotation: 270, at: 0.9 },
      { shape: 'arch', scale: COVER, rotation: 360, at: 1.2 },
    ];

    // 1. Q's circle pops out of the center.
    tl.to(wrap, { scale: poses[0]!.scale, duration: T(0.34), ease: 'back.out(1.7)' }, 0);

    // 2. Morph through the cast, turning and growing, each step leaving an echo.
    for (let i = 1; i < poses.length; i++) {
      const prev = poses[i - 1]!;
      const p = poses[i]!;
      const dur = T(p.at - prev.at);
      tl.to(path, { morphSVG: SHAPE_PATHS_46[p.shape], duration: dur, ease: 'power2.inOut' }, T(prev.at));
      // A quick color change (a long one would pass through muddy in-betweens).
      tl.to(path, { fill: tone(p.shape), duration: T(0.06), ease: 'power1.inOut' }, T(prev.at + 0.05));
      tl.to(wrap, { scale: p.scale, rotation: d * p.rotation, duration: dur, ease: i === poses.length - 1 ? 'power2.in' : 'power1.inOut' }, T(prev.at));

      const echoG = svg('g', { opacity: 0 }, echoes);
      svg('path', { d: SHAPE_PATHS_46[prev.shape], transform: 'translate(-23 -23)', fill: 'none', stroke: tone(prev.shape), 'stroke-width': 10, 'vector-effect': 'non-scaling-stroke' }, echoG);
      gsap.set(echoG, { x: cx, y: cy, scale: prev.scale, rotation: d * prev.rotation, svgOrigin: '0 0' });
      tl.fromTo(echoG, { opacity: 0.95, scale: prev.scale }, { opacity: 0, scale: prev.scale * 1.55, rotation: d * (prev.rotation - 20), duration: T(0.5), ease: 'power2.out', immediateRender: false }, T(prev.at));
    }

    // 3. The arch covers the screen. Hand off to two DOM halves that can swing in 3D.
    const k = COVER;
    const r = 23 * k;
    const top = cy - r;
    const doorH = 46 * k;
    const doors = [-1, 1].map((side) => {
      const left = side < 0 ? cx - r : cx;
      const el = div(root, { left, top, width: r, height: doorH, background: tone('arch'), opacity: 0 });
      el.style.clipPath = side < 0 ? `path('M0 ${doorH}V${r}A${r} ${r} 0 0 1 ${r} 0V${doorH}Z')` : `path('M0 ${doorH}V0A${r} ${r} 0 0 1 ${r} ${r}V${doorH}Z')`;
      const shade = div(el, { left: 0, top: 0, width: r, height: doorH, background: INK, opacity: 0 });
      gsap.set(el, { transformPerspective: 2600, transformOrigin: side < 0 ? '0% 50%' : '100% 50%' });
      return { el, shade, side };
    });

    const split = T(1.22);
    tl.call(ctx.hide, [], split);
    tl.call(ctx.show, [], split);
    tl.set(doors.map((x) => x.el), { opacity: 1 }, split);
    tl.set(wrap, { opacity: 0 }, split);
    tl.addLabel('reveal', split);
    for (const door of doors) {
      // The door on the side we are heading to leads by a hair.
      const at = split + (door.side === d ? 0 : T(0.06));
      tl.to(door.el, { rotationY: -door.side * 96, duration: T(0.6), ease: 'power2.inOut' }, at);
      tl.to(door.shade, { opacity: 0.45, duration: T(0.6), ease: 'power1.in' }, at);
    }

    finish(tl, ctx, [root]);
    return tl;
  },
};
export default shapeMorph;
