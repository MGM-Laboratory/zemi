import { gsap } from '../../engine/gsap';
import type { TransitionDef } from '../types';
import { BRAND } from '../helpers';
import { canvasSvg, clashes, eyesOf, finish, layer, look, outline, squash, svgCharacter, timing } from './_tr-a-helpers';

/** Q's radius while it rolls in, in canvas px. */
const ROLL_R = 118;
/** Scale (1 = the 46 px character box) at which Q covers the whole canvas from the center: 23 * 50 > 1101. */
const COVER = 50;

/**
 * Q iris: Q rolls in from the edge to the center, lands with a squash, winds up and grows until
 * the screen is blue with two giant eyes. It blinks, the slides swap while the eyes are shut,
 * then the circle spins down to a point and B is there. Mirrored for dir -1 (rolls in from the
 * right, spins the other way).
 */
const qIris: TransitionDef = {
  key: 'q-iris',
  run(ctx) {
    const T = timing(ctx);
    const d = ctx.dir;
    const cx = ctx.width / 2;
    const cy = ctx.height / 2;
    const tl = gsap.timeline();
    const root = layer(ctx);
    const s = canvasSvg(ctx, root);
    const q = svgCharacter(s, 'circle', { lookX: d, lookY: 0.1 });
    // On a blue slide Q gets a paper rim, so the roll and the iris still read.
    if (clashes(ctx, BRAND.circle)) outline(q, 1.4);
    const small = (ROLL_R * 2) / 46;
    // Roll exactly two turns so the eyes are upright when Q stops.
    const turns = 2;
    const x0 = cx - d * turns * 2 * Math.PI * ROLL_R;
    gsap.set(q, { x: x0, y: cy, scale: small, rotation: -d * 360 * turns, svgOrigin: '0 0' });

    // 1. Roll in (0.42 s), eyes forward, then at the room.
    tl.to(q, { x: cx, rotation: 0, duration: T(0.42), ease: 'power2.out' }, 0);
    tl.add(look(q, T, 0, 0.1, 0.16), T(0.32));
    tl.add(squash(q, T, 0.8), T(0.38));

    // 2. A quick wind-up, then it grows until it covers the screen (giant eyes).
    tl.to(q, { scale: small * 0.86, duration: T(0.1), ease: 'power2.out' }, T(0.48));
    tl.to(q, { scale: COVER, duration: T(0.42), ease: 'power2.in' }, T(0.58));

    // 3. One slow blink. The cut happens while the eyes are shut.
    const eyes = eyesOf(q);
    const shut = T(1.12);
    tl.to(eyes, { scaleY: 0.07, transformOrigin: '50% 50%', duration: T(0.09), ease: 'power2.in' }, shut - T(0.09));
    tl.call(ctx.hide, [], shut);
    tl.call(ctx.show, [], shut);
    tl.to(eyes, { scaleY: 1, transformOrigin: '50% 50%', duration: T(0.12), ease: 'power2.out' }, shut + T(0.04));

    // 4. Iris out: the circle spins down to a point, B opens around it.
    const out = T(1.26);
    tl.addLabel('reveal', out);
    tl.to(q, { scale: 0, rotation: d * 35, duration: T(0.56), ease: 'power3.inOut' }, out);
    tl.add(look(q, T, -d, -0.3, 0.26), out + T(0.08));

    finish(tl, ctx, [root]);
    return tl;
  },
};
export default qIris;
