import { gsap } from '../../engine/gsap';
import { INK, PAPER } from '../../engine/palette';
import { BRAND, svg } from '../helpers';
import type { TransitionDef } from '../types';
import { canvasSvg, finish, layer, svgEyes, timing } from './_tr-a-helpers';

/** One lid pose: the edge's y at the screen sides and the curve's control point y at the center. */
interface Lid {
  side: number;
  ctrl: number;
}

/**
 * Wake up: the screen gets sleepy. Two ink lids droop from the top and bottom, flutter, and
 * shut with a soft curve (an accent lash line rides the top lid, so it reads on dark slides
 * too). In the dark, two little closed eyes glint, pop open, glance around, and the lids snap
 * open on the next bumper with a tiny squash. Symmetric, so it plays the same both ways except
 * for the glance, which looks the way we are going.
 */
const eyelids: TransitionDef = {
  key: 'eyelids',
  run(ctx) {
    const T = timing(ctx);
    const W = ctx.width;
    const H = ctx.height;
    const cx = W / 2;
    const cy = H / 2;
    const d = ctx.dir;
    const tl = gsap.timeline();
    const root = layer(ctx);
    const s = canvasSvg(ctx, root);
    const lash = ctx.fromColors?.accentHex ?? ctx.toColors.accentHex;

    const topD = ({ side, ctrl }: Lid) => `M-80 -700H${W + 80}V${side}Q${cx} ${ctrl} -80 ${side}Z`;
    const edgeD = ({ side, ctrl }: Lid) => `M-80 ${side}Q${cx} ${ctrl} ${W + 80} ${side}`;
    const botD = ({ side, ctrl }: Lid) => `M-80 ${H + 700}H${W + 80}V${side}Q${cx} ${ctrl} -80 ${side}Z`;

    // Poses. The visible edge's middle sits halfway between `side` and `ctrl`.
    const topOpen: Lid = { side: -160, ctrl: -560 };
    const botOpen: Lid = { side: H + 160, ctrl: H + 560 };
    const topDroop: Lid = { side: 360, ctrl: 10 };
    const botDroop: Lid = { side: 720, ctrl: 1090 };
    const topFlutter: Lid = { side: 230, ctrl: -150 };
    const botFlutter: Lid = { side: 850, ctrl: 1230 };
    // Shut: the top lid's edge sags a little (a closed eye), the bottom lid tucks under it.
    const topShut: Lid = { side: 598, ctrl: 650 };
    const botShut: Lid = { side: 480, ctrl: 500 };

    const bottom = svg('path', { d: botD(botOpen), fill: INK }, s);
    const top = svg('path', { d: topD(topOpen), fill: INK }, s);
    const rim = svg('path', { d: edgeD(topOpen), fill: 'none', stroke: lash, 'stroke-width': 12, 'stroke-linecap': 'round' }, s);

    const lids = (t: Lid, b: Lid, at: number, duration: number, ease: string) => {
      tl.to(top, { attr: { d: topD(t) }, duration: T(duration), ease }, at);
      tl.to(rim, { attr: { d: edgeD(t) }, duration: T(duration), ease }, at);
      tl.to(bottom, { attr: { d: botD(b) }, duration: T(duration), ease }, at);
    };

    // 1. Sleepy: droop, flutter, shut (0.55 s).
    lids(topDroop, botDroop, 0, 0.26, 'power2.inOut');
    lids(topFlutter, botFlutter, T(0.26), 0.12, 'power1.out');
    lids(topShut, botShut, T(0.38), 0.18, 'power3.in');
    const shut = T(0.56);
    tl.call(ctx.hide, [], shut);
    tl.call(ctx.show, [], shut);
    tl.to(rim, { opacity: 0.3, duration: T(0.3), ease: 'power1.out' }, shut);

    // 2. In the dark: two little closed eyes glint, pop open and glance around.
    const eyeY = cy - 30;
    const gap = 372;
    const er = 74;
    const closed = svg('g', { opacity: 0 }, s);
    for (const side of [-1, 1]) {
      const x = cx + (side * gap) / 2;
      svg('path', { d: `M${x - er} ${eyeY - 4}Q${x} ${eyeY + er * 0.95} ${x + er} ${eyeY - 4}`, fill: 'none', stroke: PAPER, 'stroke-width': 27, 'stroke-linecap': 'round' }, closed);
    }
    const sparkles = [-1, 1].map((side) => {
      const g = svg('g', {}, s);
      const r = side < 0 ? 38 : 27;
      svg('path', { d: `M0 ${-r}Q0 0 ${r} 0Q0 0 0 ${r}Q0 0 ${-r} 0Q0 0 0 ${-r}Z`, fill: side < 0 ? PAPER : BRAND.square }, g);
      gsap.set(g, { x: cx + (side * gap) / 2 + side * 110, y: eyeY - 98 - (side < 0 ? 16 : 0), scale: 0, svgOrigin: '0 0' });
      return g;
    });
    const open = svgEyes(s, er * 0.8, gap, BRAND.square, PAPER);
    gsap.set(open, { x: cx, y: eyeY, svgOrigin: '0 0' });
    const openEyes = Array.from(open.querySelectorAll('.tra-eye'));
    gsap.set(openEyes, { scaleY: 0, transformOrigin: '50% 50%' });

    tl.to(closed, { opacity: 1, duration: T(0.12), ease: 'power1.out' }, T(0.58));
    sparkles.forEach((g, i) => {
      const at = T(0.62 + i * 0.06);
      tl.to(g, { scale: 1, rotation: 45, duration: T(0.12), ease: 'back.out(3)' }, at);
      tl.to(g, { scale: 0, rotation: 90, duration: T(0.12), ease: 'power2.in' }, at + T(0.13));
    });
    const pop = T(0.8);
    tl.to(closed, { opacity: 0, duration: T(0.05), ease: 'none' }, pop);
    tl.to(openEyes, { scaleY: 1, transformOrigin: '50% 50%', duration: T(0.15), ease: 'back.out(2.6)' }, pop);
    tl.to(open, { x: cx + d * 64, duration: T(0.1), ease: 'power2.out' }, pop + T(0.12));
    tl.to(open, { x: cx - d * 40, duration: T(0.1), ease: 'power2.inOut' }, pop + T(0.25));
    tl.to(open, { x: cx, duration: T(0.07), ease: 'power2.out' }, pop + T(0.36));

    // 3. Snap open on B with a tiny squash (0.45 s). Reveal on the open.
    const wake = T(1.24);
    tl.addLabel('reveal', wake);
    // The little eyes blink shut, and the big ones (the lids) open.
    tl.to(openEyes, { scaleY: 1.2, transformOrigin: '50% 50%', duration: T(0.06), ease: 'power2.out' }, wake - T(0.16));
    tl.to(openEyes, { scaleY: 0, transformOrigin: '50% 50%', duration: T(0.08), ease: 'power2.in' }, wake - T(0.1));
    lids(topOpen, botOpen, wake, 0.45, 'power4.out');
    tl.to(rim, { opacity: 0, duration: T(0.2), ease: 'power1.in' }, wake);
    tl.fromTo(ctx.to.root, { scaleX: 1.035, scaleY: 0.93 }, { scaleX: 1, scaleY: 1, transformOrigin: '50% 50%', duration: T(0.62), ease: 'elastic.out(1, 0.5)', immediateRender: false }, wake);

    finish(tl, ctx, [root]);
    return tl;
  },
};
export default eyelids;
