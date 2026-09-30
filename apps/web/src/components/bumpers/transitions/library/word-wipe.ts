import { gsap } from '../../engine/gsap';
import { FONT_DISPLAY } from '../../engine/fit-text';
import { INK, ON_ACCENT, PAPER } from '../../engine/palette';
import { BRAND, div } from '../helpers';
import type { TransitionDef } from '../types';
import { drive, easeFn, finish, H, headlineOf, inkOn, lerp, sec, standOut, W } from './_tr-c-helpers';

const SIZE = 300;
const PAD = 260;
const SLANT = 180;
const LEAD = 38;
const TRAIL = [96, 44];

/**
 * Word train: B's headline in giant loosened-up type rides across on a solid accent band with
 * slanted ends and a brand-striped caboose. The band's nose wipes A away, its tail leaves B
 * behind (B is clipped to exactly the slanted tail edge). The word drifts slower than the band,
 * so it stays readable while the band rushes. Right to left going forward, mirrored backwards.
 */
const wordWipe: TransitionDef = {
  key: 'word-wipe',
  run(ctx) {
    const tl = gsap.timeline();
    const B = ctx.to.root!;
    const fwd = ctx.dir !== -1;
    const word = headlineOf(ctx, 40);
    // The band is B's accent, unless A is painted in that same color (then the next brand color,
    // so the wipe still reads). The nose stripe and the caboose mark both edges.
    const fromBg = ctx.fromColors?.bg && ctx.fromColors.bg !== 'transparent' ? [ctx.fromColors.bg] : [];
    const band = standOut([ctx.toColors.accentHex, BRAND.triangle, BRAND.arch, INK], fromBg, 1.3);
    const ink = band === ctx.toColors.accentHex ? ON_ACCENT[ctx.toColors.accent] : inkOn(band);
    const leadColor = standOut([INK, PAPER], [band, ctx.fromColors?.bg ?? PAPER].filter((c) => c !== 'transparent'), 1.6);
    const trailColors = [BRAND.square, BRAND.triangle, BRAND.arch, BRAND.circle].filter((c) => c.toLowerCase() !== band.toLowerCase()).slice(0, 2);

    // Measure the word once, at its real size, to size the band.
    const train = div(ctx.overlay, { left: 0, top: 0, width: 10, height: H, willChange: 'transform' });
    const text = div(train, { left: 0, top: 0, height: H, display: 'flex', alignItems: 'center', whiteSpace: 'nowrap', fontFamily: FONT_DISPLAY, fontWeight: '900', fontSize: SIZE, lineHeight: '1', letterSpacing: '-0.035em', color: ink, fontVariationSettings: '"MONO" 0, "CASL" var(--casl, 0)', paddingBottom: 30, willChange: 'transform' });
    text.textContent = word;
    const wordW = word ? text.offsetWidth : 0;
    const bodyW = Math.max(W * 0.9, wordW + PAD * 2);
    const tailW = TRAIL[0]! + TRAIL[1]! + 40;
    const total = LEAD + bodyW + tailW;
    train.style.width = `${total}px`;

    // Stripes, nose to tail (drawn left to right for the forward direction, mirrored otherwise).
    const parts: Array<{ w: number; color: string }> = [{ w: LEAD, color: leadColor }, { w: bodyW, color: band }, { w: 20, color: band }, { w: TRAIL[0]!, color: trailColors[0] ?? INK }, { w: 20, color: band }, { w: TRAIL[1]!, color: trailColors[1] ?? PAPER }];
    let x = 0;
    for (const { w, color } of parts) {
      div(train, { left: fwd ? x : total - x - w, top: -20, width: w + 1, height: H + 40, background: color });
      x += w;
    }
    train.appendChild(text);
    // Slanted ends: the whole train is one parallelogram.
    train.style.clipPath = fwd ? `polygon(${SLANT}px 0px, ${total}px 0px, ${total - SLANT}px ${H}px, 0px ${H}px)` : `polygon(0px 0px, ${total - SLANT}px 0px, ${total}px ${H}px, ${SLANT}px ${H}px)`;

    // Travel: nose enters at the far edge, tail leaves past the near edge.
    const startX = fwd ? W : -total;
    const endX = fwd ? -total - 40 : W + 40;
    const dur = sec(ctx, 1.05 + Math.min(0.5, Math.max(0, (total - 2400) / 6000)));
    // Rush in, ease off while the word is on screen, rush out: part linear, part out-in.
    const travel = (p: number) => {
      const u = 2 * p - 1;
      return 0.45 * p + 0.55 * (0.5 + 0.5 * Math.sign(u) * Math.abs(u) ** 2.2);
    };
    const drift = easeFn('sine.inOut');
    // The word moves inside the band so its screen speed stays low.
    const wordStart = fwd ? LEAD + PAD * 0.4 : total - LEAD - PAD * 0.4 - wordW;
    const wordEnd = fwd ? LEAD + bodyW - PAD * 0.4 - wordW : total - LEAD - bodyW + PAD * 0.4;
    // The tail edge of the train, on screen: B shows beyond it.
    let revealAt = dur * 0.6;
    for (let i = 0; i <= 200; i++) {
      const p = i / 200;
      const tx = lerp(startX, endX, travel(p));
      const tailMid = fwd ? tx + total - SLANT / 2 : tx + SLANT / 2;
      if (fwd ? tailMid <= W / 2 : tailMid >= W / 2) {
        revealAt = p * dur;
        break;
      }
    }
    // Screen x of the word, and its top speed (per 0.02 of progress), for the lean.
    const wordX = (p: number) => lerp(startX, endX, travel(p)) + lerp(wordStart, wordEnd, drift(p));
    let peak = 1;
    for (let i = 1; i < 100; i++) peak = Math.max(peak, Math.abs(wordX((i + 1) / 100) - wordX((i - 1) / 100)));
    B.style.clipPath = 'polygon(0px 0px, 0px 0px, 0px 0px)';
    const frame = (p: number) => {
      const tx = lerp(startX, endX, travel(p));
      train.style.transform = `translate3d(${tx.toFixed(1)}px, 0px, 0px)`;
      // The word leans into its speed and loosens up (CASL 0 to 1) on the way in.
      const lean = ((wordX(Math.min(1, p + 0.01)) - wordX(Math.max(0, p - 0.01))) / peak) * -11;
      text.style.transform = `translate3d(${lerp(wordStart, wordEnd, drift(p)).toFixed(1)}px, 0px, 0px) skewX(${lean.toFixed(2)}deg)`;
      text.style.setProperty('--casl', Math.min(1, p * 2.4).toFixed(3));
      // B lives right of the tail (forward) or left of it (backwards), slant included.
      if (fwd) {
        const top = tx + total;
        const bot = tx + total - SLANT;
        B.style.clipPath = p >= 1 ? '' : `polygon(${top.toFixed(1)}px 0px, ${W + 10}px 0px, ${W + 10}px ${H}px, ${bot.toFixed(1)}px ${H}px)`;
      } else {
        const top = tx;
        const bot = tx + SLANT;
        B.style.clipPath = p >= 1 ? '' : `polygon(-10px 0px, ${top.toFixed(1)}px 0px, ${bot.toFixed(1)}px ${H}px, -10px ${H}px)`;
      }
    };
    frame(0);
    tl.call(ctx.show, [], 0);
    drive(tl, 0, dur, frame);
    tl.addLabel('reveal', revealAt);
    finish(tl, ctx, dur + sec(ctx, 0.02));
    return tl;
  },
};
export default wordWipe;
