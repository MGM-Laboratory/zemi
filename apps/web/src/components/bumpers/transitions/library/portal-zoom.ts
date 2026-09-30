import { SHAPE_COLORS, SHAPE_ORDER, SHAPE_PATHS_46 } from '@zemi/shared';
import { BE, gsap } from '../../engine/gsap';
import { INK, PAPER } from '../../engine/palette';
import { cleanRoots, overlaySvg, svg } from '../helpers';
import type { TransitionContext, TransitionDef } from '../types';
import { brandOn, canvasCenter, outgoingColors, secs, solidBg } from './_tr-b-helpers';

/** The element the portal opens from: the new bumper's main subject (photo, QR, title), else a seeded spot. */
function portalOrigin(ctx: TransitionContext): { x: number; y: number } {
  const root = ctx.to.root;
  const targets = ctx.to.morphTargets();
  const keys = [...targets.keys()];
  const main = keys.find((k) => k.endsWith(':photo')) ?? keys.find((k) => k.startsWith('qr:')) ?? keys.find((k) => k.endsWith(':title')) ?? keys[0];
  const el = main ? targets.get(main) : undefined;
  const hit = root && el ? canvasCenter(root, el, ctx.width) : null;
  const x = hit?.x ?? ctx.width * (0.3 + 0.4 * ctx.rand());
  const y = hit?.y ?? ctx.height * (0.34 + 0.32 * ctx.rand());
  return { x: Math.min(ctx.width - 140, Math.max(140, x)), y: Math.min(ctx.height - 140, Math.max(140, y)) };
}

const RING = 30;
const DOT = 60;

/**
 * Portal: a circle opens from the new bumper's main subject and swallows the screen. An accent
 * ring rides the edge with the four shapes orbiting on it, the old bumper leans in and dims, the
 * new one settles from a slight zoom.
 */
const portalZoom: TransitionDef = {
  key: 'portal-zoom',
  run(ctx) {
    const t = (s: number) => secs(ctx, s);
    const { width: W, height: H, dir } = ctx;
    const to = ctx.to.root!;
    const from = ctx.from?.root ?? null;
    const { x, y } = portalOrigin(ctx);
    const far = Math.max(Math.hypot(x, y), Math.hypot(W - x, y), Math.hypot(x, H - y), Math.hypot(W - x, H - y)) + RING + DOT;
    // The ring rides over the old bumper: on a slide painted in the same accent it takes the brand
    // color that stands out instead.
    const accent = brandOn(solidBg(outgoingColors(ctx)), ctx.toColors.accentHex);
    const rim = ctx.toColors.dark ? PAPER : INK;
    const spin0 = ctx.rand() * 360;

    const sv = overlaySvg(ctx);
    const dim = svg('path', { fill: INK, 'fill-rule': 'evenodd', opacity: 0 }, sv);
    const echo = svg('circle', { cx: x, cy: y, r: 0, fill: 'none', stroke: accent, 'stroke-width': 8, opacity: 0 }, sv);
    const ring = svg('circle', { cx: x, cy: y, r: 0, fill: 'none', stroke: accent, 'stroke-width': RING }, sv);
    const line = svg('circle', { cx: x, cy: y, r: 0, fill: 'none', stroke: rim, 'stroke-width': 4, opacity: 0 }, sv);
    const dots = SHAPE_ORDER.map((s) => svg('path', { d: SHAPE_PATHS_46[s], fill: SHAPE_COLORS[s], stroke: PAPER, 'stroke-width': 3.2, 'stroke-linejoin': 'round', 'paint-order': 'stroke' }, sv));

    const st = { p: 0 };
    const zoom = 0.1;
    const apply = () => {
      const p = st.p;
      const r = Math.max(0.001, p * far);
      const s = 1 + zoom * (1 - p);
      to.style.clipPath = `circle(${(r / s).toFixed(2)}px at ${x.toFixed(1)}px ${y.toFixed(1)}px)`;
      to.style.transform = `scale(${s.toFixed(4)})`;
      dim.setAttribute('d', `M0 0H${W}V${H}H0Z M${x - r} ${y}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`);
      dim.setAttribute('opacity', String(Math.min(0.3, p * 0.7)));
      const w = RING * (1 - 0.35 * p) * Math.min(1, p * 6);
      ring.setAttribute('r', String(r));
      ring.setAttribute('stroke-width', String(w));
      line.setAttribute('r', String(Math.max(0, r - w / 2 - 6)));
      line.setAttribute('opacity', String(Math.min(0.85, p * 5)));
      echo.setAttribute('r', String(r * 1.12 + 56));
      echo.setAttribute('opacity', String(Math.min(1, p * 8) * 0.6 * (1 - p)));
      const k = (DOT / 46) * Math.min(1, p * 5) * (1 + p * 0.8);
      dots.forEach((d, i) => {
        const a = ((spin0 + i * 90 + dir * p * 150) * Math.PI) / 180;
        const px = x + Math.cos(a) * r;
        const py = y + Math.sin(a) * r;
        d.setAttribute('transform', `translate(${px} ${py}) rotate(${(dir * p * 220 + i * 90).toFixed(1)}) scale(${k.toFixed(3)}) translate(-23 -23)`);
      });
    };
    to.style.transformOrigin = `${x}px ${y}px`;
    apply();

    const dur = t(0.95);
    const tl = gsap.timeline();
    tl.call(ctx.show, [], 0);
    tl.to(st, { p: 1, duration: dur, ease: BE.inOut, onUpdate: apply }, 0);
    if (from) tl.fromTo(from, { scale: 1 }, { scale: 1.08, transformOrigin: `${x}px ${y}px`, duration: dur, ease: 'power2.in' }, 0);
    tl.addLabel('reveal', t(0.15));
    tl.set(sv, { autoAlpha: 0 }, dur);
    tl.call(ctx.hide, [], dur);
    tl.call(() => cleanRoots(ctx), [], dur);
    return tl;
  },
};
export default portalZoom;
