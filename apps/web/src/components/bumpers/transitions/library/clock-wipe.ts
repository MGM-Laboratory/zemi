import { gsap } from '../../engine/gsap';
import { fontStyle } from '../../engine/fit-text';
import { INK, PAPER } from '../../engine/palette';
import { charAnim } from '../../parts/character';
import { BRAND, character, div, svg } from '../helpers';
import type { TransitionDef } from '../types';
import { cssPolygon, drive, finish, H, inkOn, sec, slideBgs, standOut, W, type Pt } from './_tr-c-helpers';

const CX = W / 2;
const CY = H / 2;
const R = 1320;
const HAND = 1340;
const FACE = 330;

/** The swept sector from 12 o'clock, as polygon points (arc far outside the canvas). */
function sector(angle: number): Pt[] {
  const pts: Pt[] = [[CX, CY]];
  const steps = Math.max(2, Math.ceil(Math.abs(angle) / (Math.PI / 18)));
  for (let i = 0; i <= steps; i++) {
    const t = (angle * i) / steps;
    pts.push([CX + R * Math.sin(t), CY - R * Math.cos(t)]);
  }
  return pts;
}

/**
 * Clock wipe: a clock hand sweeps once around from 12 o'clock and B fills in behind it like a
 * pie. Q sits in the hub on a little clock face, eyes chasing the hand, and the mono digits
 * tick 13:14 to 13:15 (doors open) as the hand comes home. Backwards, the hand runs
 * counterclockwise and the clock rolls back a minute.
 */
const clockWipe: TransitionDef = {
  key: 'clock-wipe',
  run(ctx) {
    const tl = gsap.timeline();
    const B = ctx.to.root!;
    const ccw = ctx.dir === -1;
    const calm = ctx.motion === 'calm';
    const start = sec(ctx, 0.1);
    const sweep = sec(ctx, 0.92);
    const home = start + sweep;
    const handColor = standOut([ctx.toColors.accentHex, BRAND.triangle, INK, PAPER], slideBgs(ctx), 2);

    // B starts as an empty sector, then shows.
    B.style.clipPath = cssPolygon([]);
    tl.call(ctx.show, [], start);

    // The hand: pivots on the hub, long enough to reach past every corner.
    const pivot = div(ctx.overlay, { left: CX, top: CY, width: 0, height: 0, willChange: 'transform' });
    const hand = div(pivot, { left: -10, top: -HAND, width: 20, height: HAND + 44, borderRadius: 20, background: handColor, transformOrigin: `50% ${(HAND / (HAND + 44)) * 100}%` });

    // The hub: a small clock face with Q in the middle.
    const hub = div(ctx.overlay, { left: CX - FACE / 2, top: CY - FACE / 2, width: FACE, height: FACE, transformOrigin: '50% 50%' });
    const face = svg('svg', { viewBox: '0 0 100 100', width: FACE, height: FACE }, hub);
    face.style.position = 'absolute';
    face.style.overflow = 'visible';
    svg('circle', { cx: 50, cy: 50, r: 47, fill: PAPER, stroke: INK, 'stroke-width': 3.2 }, face);
    for (let i = 0; i < 12; i++) {
      const a = (i * Math.PI) / 6;
      const r1 = i % 3 === 0 ? 34 : 38.5;
      svg('line', { x1: 50 + r1 * Math.sin(a), y1: 50 - r1 * Math.cos(a), x2: 50 + 42.5 * Math.sin(a), y2: 50 - 42.5 * Math.cos(a), stroke: INK, 'stroke-width': i % 3 === 0 ? 3.4 : 2, 'stroke-linecap': 'round' }, face);
    }
    const q = character(hub, 'circle', FACE * 0.56, { x: FACE * 0.22, y: FACE * 0.21, mood: 'idle' });
    const look = q.querySelector<SVGGElement>('.bc-look');

    // 13:14 -> 13:15 in mono, the last digit rolling, on a pill in the hand's color.
    const pill = div(ctx.overlay, { left: CX - 140, top: CY + FACE / 2 + 24, width: 280, height: 92, borderRadius: 999, background: handColor, color: inkOn(handColor), display: 'flex', alignItems: 'center', justifyContent: 'center', transformOrigin: '50% 0%', fontSize: 56, lineHeight: '1' });
    Object.assign(pill.style, fontStyle('mono', { weight: 700, tracking: 0.04 }));
    const fixed = document.createElement('span');
    fixed.textContent = '13:1';
    const roll = document.createElement('span');
    roll.style.cssText = 'display:inline-block;height:1em;overflow:hidden;vertical-align:top';
    const col = document.createElement('span');
    col.style.cssText = 'display:flex;flex-direction:column;line-height:1';
    for (const d of ['4', '5']) {
      const s = document.createElement('span');
      s.textContent = d;
      col.appendChild(s);
    }
    roll.appendChild(col);
    pill.append(fixed, roll);

    // Arrive.
    tl.fromTo(hub, { scale: 0, rotation: ccw ? 30 : -30 }, { scale: 1, rotation: 0, duration: sec(ctx, 0.42), ease: calm ? 'back.out(1.2)' : 'back.out(2)', immediateRender: true }, 0);
    tl.fromTo(hand, { scaleY: 0 }, { scaleY: 1, duration: sec(ctx, 0.3), ease: 'power3.out', immediateRender: true }, sec(ctx, 0.02));
    tl.fromTo(pill, { scale: 0, autoAlpha: 0 }, { scale: 1, autoAlpha: 1, duration: sec(ctx, 0.3), ease: 'back.out(1.8)', immediateRender: true }, sec(ctx, 0.1));
    gsap.set(col, { yPercent: ccw ? -50 : 0 });

    // Sweep: B fills in behind the hand, Q's eyes follow it round.
    const frame = (p: number) => {
      const a = (ccw ? -1 : 1) * p * Math.PI * 2;
      B.style.clipPath = p >= 1 ? '' : cssPolygon(sector(a));
      pivot.style.transform = `rotate(${(a * 180) / Math.PI}deg)`;
      if (look) look.style.transform = `translate(${(Math.sin(a) * 2.4).toFixed(2)}px, ${(-Math.cos(a) * 1.8).toFixed(2)}px)`;
    };
    drive(tl, start, sweep, frame, 'sine.inOut');
    tl.addLabel('reveal', start);

    // Home: the minute ticks over, Q gives a little squash and a blink.
    tl.to(col, { yPercent: ccw ? 0 : -50, duration: sec(ctx, 0.22), ease: 'back.out(2.2)' }, home - sec(ctx, 0.04));
    tl.add(charAnim.squash(q), home - sec(ctx, 0.02));
    tl.add(charAnim.blink(q), home + sec(ctx, 0.12));

    // Leave.
    const out = home + sec(ctx, 0.16);
    tl.to(hand, { scaleY: 0, duration: sec(ctx, 0.24), ease: 'power3.in' }, out - sec(ctx, 0.06));
    tl.to(hub, { scale: 0, rotation: ccw ? -40 : 40, duration: sec(ctx, 0.28), ease: 'back.in(1.8)' }, out);
    tl.to(pill, { scale: 0, autoAlpha: 0, duration: sec(ctx, 0.2), ease: 'power2.in' }, out);
    finish(tl, ctx, out + sec(ctx, 0.3));
    return tl;
  },
};
export default clockWipe;
