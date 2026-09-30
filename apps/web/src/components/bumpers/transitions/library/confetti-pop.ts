import { SHAPE_COLORS, SHAPE_ORDER, SHAPE_PATHS_46 } from '@zemi/shared';
import { gsap } from '../../engine/gsap';
import { PAPER } from '../../engine/palette';
import { cleanRoots, div, overlaySvg, svg } from '../helpers';
import type { TransitionDef } from '../types';
import { readableOn, secs, solidBg } from './_tr-b-helpers';

const PIECES = 90;

/**
 * Confetti pop: a soft white-to-accent flash swells from the center and covers the screen, then
 * pops. Shape confetti bursts out past the edges and flutters down, and the new bumper bounces in
 * underneath with a little squash.
 */
const confettiPop: TransitionDef = {
  key: 'confetti-pop',
  run(ctx) {
    const t = (s: number) => secs(ctx, s);
    const { width: W, height: H, speed } = ctx;
    const to = ctx.to.root!;
    const c = ctx.toColors;
    const cx = W / 2;
    const cy = H / 2;
    const R = Math.hypot(cx, cy) + 40;
    const calm = ctx.motion === 'calm';

    // White at the heart, the new accent at the rim. Onto a dark bumper the white core stays small,
    // so the pop never flares.
    const glow = c.dark ? `${PAPER} 0%, ${c.accentSoft} 22%, ${c.accentHex} 62%, ${c.accentDeep} 100%` : `${PAPER} 0%, ${PAPER} 34%, ${c.accentSoft} 64%, ${c.accentHex} 100%`;
    const disc = div(ctx.overlay, { left: cx - R, top: cy - R, width: 2 * R, height: 2 * R, borderRadius: '50%', background: `radial-gradient(closest-side, ${glow})`, willChange: 'transform, opacity' });
    const page = solidBg(c);
    const rings = overlaySvg(ctx);
    const wave = svg('circle', { cx, cy, r: 60, fill: 'none', stroke: readableOn(page, c.accentHex, 1.6), 'stroke-width': 36, opacity: 0 }, rings);
    // Pieces the color of the new page would vanish into it: those go out in white.
    const tint = (hex: string) => (hex.toLowerCase() === page.toLowerCase() ? PAPER : hex);
    const burst = div(ctx.overlay, { left: 0, top: 0, width: W, height: H });

    const pop = t(0.36);
    const tl = gsap.timeline();
    gsap.set(disc, { scale: 0, transformOrigin: '50% 50%' });

    // Swell, then pop.
    tl.to(disc, { scale: 1, duration: pop, ease: 'power2.out' }, 0);
    tl.call(ctx.show, [], pop);
    tl.call(ctx.hide, [], pop);
    tl.addLabel('reveal', pop);
    tl.to(disc, { scale: 1.14, opacity: 0, duration: t(0.46), ease: 'power1.out' }, pop);
    tl.fromTo(wave, { attr: { r: 60, 'stroke-width': 36 }, opacity: 1 }, { attr: { r: R * 0.95, 'stroke-width': 4 }, opacity: 0, duration: t(0.7), ease: 'power2.out', immediateRender: false }, pop);
    // The new bumper lands with a squash (never below full size, so no edge ever shows).
    tl.fromTo(to, { scaleX: 1.1, scaleY: 1.03, transformOrigin: '50% 60%' }, { scaleX: 1, scaleY: 1.045, duration: t(0.16), ease: 'power2.out', immediateRender: false }, pop);
    tl.to(to, { scaleY: 1, duration: t(0.14), ease: 'power2.inOut' }, pop + t(0.16));
    tl.to(to, { scaleX: 1.008, scaleY: 1.016, duration: t(0.14), ease: 'sine.out' }, pop + t(0.3));
    tl.to(to, { scaleX: 1, scaleY: 1, duration: t(0.24), ease: 'sine.inOut' }, pop + t(0.44));

    // Confetti: a few big pieces close to the camera that fly past the edges, lots of small ones
    // that flutter and drift down.
    const life = t(1.3);
    const count = calm ? Math.round(PIECES * 0.6) : PIECES;
    for (let i = 0; i < count; i++) {
      const shape = SHAPE_ORDER[i % 4]!;
      const near = i % 9 === 0;
      const size = near ? 90 + ctx.rand() * 60 : 16 + ctx.rand() * 40;
      const piece = svg('svg', { viewBox: '0 0 46 46', width: size, height: size }, burst);
      piece.style.cssText = `position:absolute;left:${cx - size / 2}px;top:${cy - size / 2}px;overflow:visible`;
      svg('path', { d: SHAPE_PATHS_46[shape], fill: tint(SHAPE_COLORS[shape]) }, piece);
      gsap.set(piece, { scale: 0 });
      const angle = ctx.rand() * 360;
      const velocity = (near ? 2600 + ctx.rand() * 900 : 800 + ctx.rand() * 1700) * speed;
      const delay = ctx.rand() * t(0.06);
      const at = pop + delay;
      tl.to(piece, { scale: 1, duration: t(0.14), ease: 'back.out(2)' }, at);
      tl.to(piece, { physics2D: { velocity, angle, gravity: (near ? 900 : 1250) * speed * speed, friction: near ? 0.02 : 0.055 }, rotation: (ctx.rand() < 0.5 ? -1 : 1) * (180 + ctx.rand() * 420), duration: life, ease: 'none' }, at);
      if (!near) tl.to(piece, { scaleY: -1, duration: t(0.2 + ctx.rand() * 0.14), ease: 'sine.inOut', yoyo: true, repeat: 3 }, at + t(0.2));
      tl.to(piece, { opacity: 0, duration: t(0.32), ease: 'power1.in' }, at + life - t(0.32));
    }

    const end = pop + life + t(0.06);
    tl.set([burst, disc, rings], { autoAlpha: 0 }, end);
    tl.call(() => cleanRoots(ctx), [], end);
    return tl;
  },
};
export default confettiPop;
