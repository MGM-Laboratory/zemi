import { BUMPER_KIND_META, formatJakarta, SHAPE_ORDER, SHAPE_PATHS_46 } from '@zemi/shared';
import { gsap } from '../../engine/gsap';
import { FONT_DISPLAY } from '../../engine/fit-text';
import { eventNumberLabel } from '../../engine/resolve';
import { cleanRoots, div, svg } from '../helpers';
import type { TransitionDef } from '../types';
import { outgoingColors, readableOn, secs, solidBg } from './_tr-b-helpers';

const MAX_W = 1240;
const BASE = 206;

/** Break a long headline into two lines of similar width. */
function twoLines(text: string): string {
  const words = text.split(/\s+/);
  let best = text;
  let score = Infinity;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(' ');
    const b = words.slice(i).join(' ');
    const s = Math.abs(a.length - b.length);
    if (s < score) {
      score = s;
      best = `${a}\n${b}`;
    }
  }
  return best;
}

/**
 * Stamp: a big rubber stamp with the new bumper's headline slams onto the old one from high up,
 * the screen shakes, ink splashes out of the rim, then the stamp lifts off and the new bumper is
 * there underneath.
 */
const stamp: TransitionDef = {
  key: 'stamp',
  run(ctx) {
    const t = (s: number) => secs(ctx, s);
    const { width: W, height: H, dir } = ctx;
    const from = ctx.from?.root ?? null;
    const to = ctx.to.root!;
    const page = solidBg(outgoingColors(ctx));
    const ink = readableOn(page, ctx.toColors.accentHex, 2.6);
    const headline = (ctx.headline || BUMPER_KIND_META[ctx.toSlide.kind].label).replace(/\s+/g, ' ').trim().slice(0, 64);
    const event = ctx.to.ctx.event;
    const meta = ['Zemi', event ? eventNumberLabel(event) : '', event ? `· ${formatJakarta(event.startsAt, 'date')}` : ''].filter(Boolean).join(' ');
    const tilt = -6 * dir;

    const wrap = div(ctx.overlay, { left: 0, top: 0, width: W, height: H });
    const shadow = div(wrap, { left: W / 2 - 760, top: H / 2 - 330, width: 1520, height: 660, borderRadius: '50%', background: 'radial-gradient(closest-side, rgba(14,17,22,0.34), rgba(14,17,22,0.12) 55%, rgba(14,17,22,0))', opacity: 0 });
    const card = div(wrap, { left: W / 2, top: H / 2, padding: '46px 96px 52px', border: `18px solid ${ink}`, borderRadius: '60px', background: page, color: ink, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 22, whiteSpace: 'nowrap' });
    div(card, { left: 12, top: 12, right: 12, bottom: 12, border: `5px solid ${ink}`, borderRadius: '38px', opacity: 0.85 });
    const row = svg('svg', { viewBox: '0 0 214 46', width: 150, height: 32 }, card);
    SHAPE_ORDER.forEach((s, i) => svg('path', { d: SHAPE_PATHS_46[s], fill: ink, transform: `translate(${i * 56} 0)` }, row));
    const word = document.createElement('div');
    word.textContent = headline;
    Object.assign(word.style, { fontFamily: FONT_DISPLAY, fontWeight: '900', fontVariationSettings: '"MONO" 0, "CASL" 0.45', letterSpacing: '-0.01em', textTransform: 'uppercase', lineHeight: '0.92', textAlign: 'center', fontSize: `${BASE}px`, whiteSpace: 'pre' });
    card.appendChild(word);
    const label = document.createElement('div');
    label.textContent = meta;
    Object.assign(label.style, { fontFamily: FONT_DISPLAY, fontWeight: '700', fontVariationSettings: '"MONO" 1, "CASL" 0', letterSpacing: '0.14em', textTransform: 'uppercase', fontSize: '30px', lineHeight: '1' });
    card.appendChild(label);

    // Fit the headline: one line when it fits, two balanced lines when it is long.
    let w = word.offsetWidth;
    if (w > MAX_W && headline.includes(' ')) {
      word.textContent = twoLines(headline);
      w = word.offsetWidth;
    }
    if (w > MAX_W) word.style.fontSize = `${Math.max(72, Math.floor((BASE * MAX_W) / w))}px`;
    const cw = card.offsetWidth;
    const ch = card.offsetHeight;

    // Worn rubber: knocked-out specks on the two rims (never on the words), so it reads as ink, not
    // a sticker. Positions are from the inside of the outer rim; the inner rim is 12 px further in.
    const pw = cw - 36;
    const ph = ch - 36;
    for (let i = 0; i < 18; i++) {
      const inner = i % 3 === 2;
      const mid = inner ? 14.5 : -9;
      const s = inner ? 3 + ctx.rand() * 4 : 4 + ctx.rand() * 8;
      const side = Math.floor(ctx.rand() * 4);
      const along = 0.16 + ctx.rand() * 0.68;
      const off = mid + (ctx.rand() - 0.5) * (inner ? 2 : 8);
      const x = side === 0 || side === 2 ? along * pw : side === 1 ? pw - off : off;
      const y = side === 1 || side === 3 ? along * ph : side === 2 ? ph - off : off;
      div(card, { left: x - s / 2, top: y - s / 2, width: s, height: s, borderRadius: '50%', background: page, opacity: 0.6 + ctx.rand() * 0.4 });
    }

    // The stamp is tilted: turn a point of its own (unrotated) space into canvas space.
    const rad = (tilt * Math.PI) / 180;
    const spin = (x: number, y: number): [number, number] => [x * Math.cos(rad) - y * Math.sin(rad), x * Math.sin(rad) + y * Math.cos(rad)];

    // Ink splash: blobs thrown off the rim, each with a couple of smaller drops further out.
    const splash: Array<{ el: HTMLDivElement; dx: number; dy: number }> = [];
    const hw = cw / 2 - 12;
    const hh = ch / 2 - 12;
    const blobs = 9;
    for (let n = 0; n < blobs; n++) {
      const a = ((n + ctx.rand() * 0.7) / blobs) * Math.PI * 2;
      const ex = Math.cos(a);
      const ey = Math.sin(a);
      const k = 1 / Math.max(Math.abs(ex) / hw, Math.abs(ey) / hh);
      const [ox, oy] = spin(ex * k, ey * k);
      const [dx, dy] = spin(ex, ey);
      for (let j = 0; j < 3; j++) {
        const size = j === 0 ? 30 + ctx.rand() * 34 : 10 + ctx.rand() * 14;
        const reach = j === 0 ? 24 + ctx.rand() * 30 : 70 + j * 52 + ctx.rand() * 50;
        const el = div(wrap, { left: W / 2 + ox - size / 2, top: H / 2 + oy - size / 2, width: size, height: size, borderRadius: '50%', background: ink });
        gsap.set(el, { scale: 0, scaleX: 0, rotation: (Math.atan2(dy, dx) * 180) / Math.PI });
        splash.push({ el, dx: dx * reach, dy: dy * reach });
      }
    }

    // The new bumper shows through the stamp's own shape (a tilted rounded rectangle), then that
    // window grows past the corners.
    const round = 44;
    const reach = Math.max(...[[-W / 2, -H / 2], [W / 2, -H / 2], [W / 2, H / 2], [-W / 2, H / 2]].map(([x, y]) => {
      const u = x! * Math.cos(-rad) - y! * Math.sin(-rad);
      const v = x! * Math.sin(-rad) + y! * Math.cos(-rad);
      return Math.max(Math.abs(u) / hw, Math.abs(v) / hh);
    })) * 1.08;
    const win = { s: 1 };
    const opening = () => {
      const k = win.s;
      const p = (x: number, y: number) => {
        const [u, v] = spin(x * k, y * k);
        return `${(W / 2 + u).toFixed(1)} ${(H / 2 + v).toFixed(1)}`;
      };
      const r = (round * k).toFixed(1);
      const c = round;
      const arc = (x: number, y: number) => `A${r} ${r} 0 0 1 ${p(x, y)}`;
      to.style.clipPath = `path('M${p(-hw + c, -hh)}L${p(hw - c, -hh)}${arc(hw, -hh + c)}L${p(hw, hh - c)}${arc(hw - c, hh)}L${p(-hw + c, hh)}${arc(-hw, hh - c)}L${p(-hw, -hh + c)}${arc(-hw + c, -hh)}Z')`;
    };

    const hit = t(0.24);
    const lift = t(0.74);
    const fade = t(0.34);
    const grow = t(0.42);
    const tl = gsap.timeline();
    gsap.set(card, { xPercent: -50, yPercent: -50, scale: 3.2, rotation: tilt - 16 * dir, opacity: 0, transformOrigin: '50% 50%' });

    // Slam.
    tl.to(card, { scale: 1, rotation: tilt, duration: hit, ease: 'power3.in' }, 0);
    tl.to(card, { opacity: 1, duration: t(0.1), ease: 'power1.out' }, 0);
    tl.fromTo(shadow, { scale: 1.6, x: 90 * dir, y: 120, opacity: 0 }, { scale: 0.86, x: 0, y: 16, opacity: 1, duration: hit, ease: 'power3.in' }, 0);
    tl.to(shadow, { opacity: 0, duration: t(0.12) }, hit);
    tl.to(card, { scaleX: 1.045, scaleY: 0.93, duration: t(0.06), ease: 'power2.out' }, hit);
    tl.to(card, { scaleX: 1, scaleY: 1, duration: t(0.42), ease: 'elastic.out(1, 0.5)' }, hit + t(0.06));

    // Shake twice, 3 px.
    const shake = from ? [wrap, from] : [wrap];
    // A hair of zoom on the old bumper so the shake never shows its edges.
    if (from) tl.set(from, { scale: 1.008, transformOrigin: '50% 50%' }, hit);
    const kick = t(0.04);
    [3, -3, 3, -3, 0].forEach((v, i) => tl.to(shake, { x: v, y: i % 2 ? 1.5 : -1.5, duration: kick, ease: 'sine.inOut' }, hit + i * kick));
    tl.set(shake, { y: 0 }, hit + 5 * kick);

    // Ink splash.
    splash.forEach(({ el, dx, dy }, i) => {
      tl.to(el, { scaleX: 1.35, scaleY: 1, x: dx, y: dy, duration: t(0.24), ease: 'expo.out' }, hit + t(0.012) * (i % 3));
      tl.to(el, { scaleX: 1, duration: t(0.3), ease: 'power2.out' }, hit + t(0.2));
    });

    // Lift off, the new bumper is underneath.
    tl.addLabel('reveal', lift);
    tl.call(opening, [], lift);
    tl.call(ctx.show, [], lift);
    tl.to(win, { s: reach, duration: grow, ease: 'power2.in', onUpdate: opening }, lift);
    tl.to(card, { scale: 1.12, opacity: 0, duration: t(0.24), ease: 'power1.in' }, lift);
    tl.fromTo(shadow, { scale: 0.9, opacity: 0.8 }, { scale: 1.35, x: 40 * dir, y: 90, opacity: 0, duration: fade, ease: 'power1.out', immediateRender: false }, lift);
    tl.to(splash.map((s) => s.el), { opacity: 0, duration: t(0.2), ease: 'power1.in' }, lift + t(0.06));
    const end = lift + Math.max(fade, grow);
    tl.call(ctx.hide, [], end);
    tl.set(wrap, { autoAlpha: 0 }, end);
    tl.call(() => cleanRoots(ctx), [], end);
    return tl;
  },
};
export default stamp;
