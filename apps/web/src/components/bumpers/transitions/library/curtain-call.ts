import type { ShapeName } from '@zemi/shared';
import { gsap } from '../../engine/gsap';
import { BRAND, svg } from '../helpers';
import type { TransitionDef } from '../types';
import { blink, canvasSvg, clashes, EYE_SPOTS, finish, layer, look, outline, roundRectD, shapeD, squash, svgCharacter, svgEyes, timing } from './_tr-a-helpers';

const SIZE = 190;
const K = SIZE / 46;
const GROUND = 940;

interface Actor {
  shape: ShapeName;
  col: number;
  /** When it lands in its column (s at speed 1). */
  land: number;
}

/**
 * Curtain call: the four characters come on stage from both sides (Q rolls, Hunch hops over
 * Q, Block tumbles, Bridge bunny-hops), each lands in its column with a squash and stretches
 * into a tall panel of its color, so the four panels close like a curtain with their eyes on
 * it. A beat: they blink along the line and glance at each other. Then the panels peel away
 * upward one by one, their hems rounding as they lift, and B is behind them. Mirrored for
 * dir -1 (entrances swap sides and the peel runs the other way).
 */
const curtainCall: TransitionDef = {
  key: 'curtain-call',
  run(ctx) {
    const T = timing(ctx);
    const W = ctx.width;
    const H = ctx.height;
    const d = ctx.dir;
    const mx = (x: number) => (d === 1 ? x : W - x);
    const colW = W / 4;
    const tl = gsap.timeline();
    const root = layer(ctx);
    const s = canvasSvg(ctx, root);
    const panelsG = svg('g', {}, s);
    const charsG = svg('g', {}, s);
    const cy = GROUND - SIZE / 2;

    const actors: Actor[] = [
      { shape: 'circle', col: 0, land: 0.5 },
      { shape: 'triangle', col: 1, land: 0.78 },
      { shape: 'square', col: 2, land: 0.74 },
      { shape: 'arch', col: 3, land: 0.56 },
    ];
    // Screen column (mirrored for dir -1) and its center.
    const colOf = (a: Actor) => (d === 1 ? a.col : 3 - a.col);
    const centerOf = (a: Actor) => colOf(a) * colW + colW / 2;

    const panels: Array<{ g: SVGGElement; path: SVGPathElement; eyes: SVGGElement; x0: number; a: Actor }> = [];
    for (const a of actors) {
      const cx = centerOf(a);
      const ch = svgCharacter(charsG, a.shape, { lookX: a.col < 2 ? d : -d });
      gsap.set(ch, { x: -400, y: cy, scale: K, svgOrigin: '0 0' });
      if (clashes(ctx, BRAND[a.shape])) outline(ch);

      // The panel starts as the exact character silhouette, hidden until the hand-off.
      const g = svg('g', { opacity: 0 }, panelsG);
      const x0 = colOf(a) * colW;
      const path = svg('path', { d: shapeD(a.shape, cx - SIZE / 2, cy - SIZE / 2, SIZE), fill: BRAND[a.shape] }, g);
      const spot = EYE_SPOTS[a.shape];
      const eyes = svgEyes(g, spot.s * K, (spot.rx - spot.lx) * K);
      gsap.set(eyes, { x: cx - SIZE / 2 + ((spot.lx + spot.rx) / 2) * K, y: cy - SIZE / 2 + spot.y * K, svgOrigin: '0 0' });
      panels.push({ g, path, eyes, x0, a });

      // 1. Entrances. Positions are written for dir 1 and mirrored with mx().
      if (a.shape === 'circle') {
        // Q rolls in: one full turn over one circumference.
        const from = cx - d * 2 * Math.PI * (SIZE / 2);
        tl.fromTo(ch, { x: from, rotation: -d * 360 }, { x: cx, rotation: 0, duration: T(a.land), ease: 'power2.out' }, 0);
      } else if (a.shape === 'triangle') {
        // Hunch hops in over Q: three hops, the middle one the biggest.
        const start = mx(-260);
        const hops = [0.2, 0.26, 0.22];
        const heights = [150, 260, 120];
        const t0 = a.land - hops.reduce((x, y) => x + y, 0);
        tl.set(ch, { x: start }, 0);
        let t = t0;
        hops.forEach((dur, i) => {
          tl.to(ch, { x: start + ((cx - start) * (i + 1)) / hops.length, duration: T(dur), ease: 'none' }, T(t));
          tl.to(ch, { y: cy - heights[i]!, rotation: d * (i === 1 ? 20 : -10), duration: T(dur / 2), ease: 'power2.out' }, T(t));
          tl.to(ch, { y: cy, rotation: 0, duration: T(dur / 2), ease: 'power2.in' }, T(t + dur / 2));
          t += dur;
        });
      } else if (a.shape === 'square') {
        // Block tumbles in from the other side: four flips, a quarter turn each.
        const start = mx(W + 260);
        const flips = 4;
        const dur = 0.15;
        const t0 = a.land - flips * dur;
        tl.set(ch, { x: start }, 0);
        for (let i = 0; i < flips; i++) {
          const nx = start + ((cx - start) * (i + 1)) / flips;
          const t = t0 + i * dur;
          tl.to(ch, { x: nx, rotation: `-=${d * 90}`, duration: T(dur), ease: 'power1.inOut' }, T(t));
          tl.to(ch, { y: cy - 70, duration: T(dur / 2), ease: 'power2.out' }, T(t));
          tl.to(ch, { y: cy, duration: T(dur / 2), ease: 'power2.in' }, T(t + dur / 2));
        }
      } else {
        // Bridge bunny-hops: lots of small quick hops.
        const start = mx(W + 240);
        const n = 6;
        const dur = 0.085;
        const t0 = a.land - n * dur;
        tl.set(ch, { x: start }, 0);
        for (let i = 0; i < n; i++) {
          const t = t0 + i * dur;
          tl.to(ch, { x: start + ((cx - start) * (i + 1)) / n, duration: T(dur), ease: 'none' }, T(t));
          tl.to(ch, { y: cy - 46, duration: T(dur / 2), ease: 'power2.out' }, T(t));
          tl.to(ch, { y: cy, duration: T(dur / 2), ease: 'power2.in' }, T(t + dur / 2));
        }
      }
      tl.add(look(ch, T, 0, 0, 0.1), T(a.land - 0.06));
      tl.add(squash(ch, T, 0.9), T(a.land));

      // 2. Hand-off to the panel, then stretch into a tall column (the curtain closes).
      const off = T(a.land + 0.1);
      tl.set(ch, { opacity: 0 }, off);
      tl.set(g, { opacity: 1 }, off);
      tl.to(path, { morphSVG: roundRectD(x0 - 4, -80, colW + 8, H + 160, 0, 0), duration: T(0.36), ease: 'power3.inOut' }, off);
      tl.to(eyes, { x: cx, y: 430, scale: 2.7, duration: T(0.36), ease: 'power3.inOut' }, off);
    }

    // 3. The beat: a blink running along the curtain, then a glance at each other.
    const ordered = [...panels].sort((p, q) => (d === 1 ? p.x0 - q.x0 : q.x0 - p.x0));
    const beat = T(1.12);
    ordered.forEach((p, i) => {
      tl.add(blink(p.eyes, T, { close: 0.06, hold: 0.02, open: 0.08 }), beat + T(i * 0.05));
      const toward = p.x0 < W / 2 ? 1 : -1;
      tl.to(p.eyes, { x: `+=${toward * 14}`, duration: T(0.12), ease: 'power2.out' }, beat + T(0.24));
    });

    // 4. Peel away upward, one by one, hems rounding as they lift. Reveal at the first peel.
    const peel = T(1.46);
    tl.call(ctx.hide, [], peel);
    tl.call(ctx.show, [], peel);
    tl.addLabel('reveal', peel);
    ordered.forEach((p, i) => {
      const at = peel + T(i * 0.075);
      tl.to(p.g, { y: 26, duration: T(0.08), ease: 'power2.out' }, at);
      tl.to(p.eyes, { y: '-=8', duration: T(0.08), ease: 'power2.out' }, at);
      tl.to(p.path, { morphSVG: roundRectD(p.x0 - 4, -80, colW + 8, H + 160, 0, (colW + 8) / 2), duration: T(0.36), ease: 'power2.in' }, at + T(0.06));
      tl.to(p.g, { y: -H - 380, duration: T(0.4), ease: 'power3.in' }, at + T(0.08));
    });

    finish(tl, ctx, [root]);
    return tl;
  },
};
export default curtainCall;
