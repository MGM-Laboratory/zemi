import { gsap } from '../../engine/gsap';
import { FONT_BODY, FONT_DISPLAY } from '../../engine/fit-text';
import { INK } from '../../engine/palette';
import { BRAND, div } from '../helpers';
import type { TransitionDef } from '../types';
import { canvasClipFor, drive, finish, H, headlineOf, inkOn, offsetWithin, sec, standOut, W } from './_tr-c-helpers';

const NOISE = '#%&*+=?!/<>[]{}01XZ$@';
const TABLE = 101;

/** Text nodes worth scrambling inside an element (skips whitespace-only nodes). */
function textNodes(root: Node): Text[] {
  const out: Text[] = [];
  const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walk.nextNode(); n; n = walk.nextNode()) if (n.nodeValue && n.nodeValue.trim()) out.push(n as Text);
  return out;
}

/** A's visible text blocks: top-level builder elements with text and no photos. */
function textElements(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>('[data-el]'))
    .filter((el) => !el.parentElement?.closest('[data-el]'))
    .filter((el) => (el.textContent ?? '').trim().length > 0 && !el.querySelector('img, picture, image, canvas, video') && el.offsetWidth > 0)
    .slice(0, 24);
}

/**
 * Scramble: A's words dissolve into noise (seeded, so A to B always glitches the same way),
 * thin brand-colored glitch bars tear across, a hard cut, and B's headline resolves out of the
 * same noise on a bar with a red and blue ghost, then snaps shut. Short and loud: about 0.9 s.
 */
const scrambleCut: TransitionDef = {
  key: 'scramble-cut',
  run(ctx) {
    const tl = gsap.timeline();
    const A = ctx.from?.root ?? null;
    const B = ctx.to.root!;
    const sgn = ctx.dir === -1 ? -1 : 1;
    const cut = sec(ctx, 0.34);
    const table = Array.from({ length: TABLE }, () => Math.floor(ctx.rand() * 1e6));
    const noise = (i: number, tick: number) => NOISE[table[(i * 31 + tick * 17) % TABLE]! % NOISE.length]!;

    /* A: ghost copies of its text on the overlay (A itself is never rewritten), scrambled. */
    let hideOriginals: HTMLElement[] = [];
    if (A) {
      const content = A.querySelector<HTMLElement>('[data-content]') ?? A;
      // wrap twitches with A; layer copies A's content box (the safe-area scale, if any).
      const wrap = div(ctx.overlay, { left: 0, top: 0, width: W, height: H });
      const layer = div(wrap, { left: 0, top: 0, width: W, height: H, transform: content.style.transform || 'none', transformOrigin: '50% 50%', color: ctx.fromColors?.fg ?? INK, fontFamily: FONT_BODY });
      const els = textElements(A);
      const nodes: Array<{ node: Text; text: string; starts: number[]; salt: number }> = [];
      for (const el of els) {
        const clone = el.cloneNode(true) as HTMLElement;
        const at = offsetWithin(el, content);
        clone.style.left = `${at.x}px`;
        clone.style.top = `${at.y}px`;
        clone.style.color = getComputedStyle(el).color;
        for (const n of [clone, ...Array.from(clone.querySelectorAll<HTMLElement>('*'))]) {
          for (const attr of ['data-el', 'data-enter', 'data-idle', 'data-morph', 'data-el-label', 'id']) n.removeAttribute(attr);
        }
        layer.appendChild(clone);
        for (const node of textNodes(clone)) {
          const text = node.nodeValue ?? '';
          const salt = nodes.length * 13;
          nodes.push({ node, text, salt, starts: Array.from(text, (_, j) => 0.05 + (table[(salt + j * 7) % TABLE]! % 1000) / 1000 * 0.6) });
        }
      }
      hideOriginals = els;
      gsap.set(els, { visibility: 'hidden' });
      drive(tl, 0, cut, (p) => {
        const tick = Math.floor(p * 12);
        for (const n of nodes) {
          let s = '';
          for (let j = 0; j < n.text.length; j++) {
            const c = n.text[j]!;
            s += c.trim() && p >= n.starts[j]! ? noise(n.salt + j, tick) : c;
          }
          if (n.node.nodeValue !== s) n.node.nodeValue = s;
        }
      });
      tl.set(wrap, { autoAlpha: 0 }, cut);
      // The whole slide twitches, scaled up a hair so no edge ever shows, and clipped to the
      // canvas so nothing spills into a player's letterbox. The ghost copies twitch along.
      const jitter: Array<[number, number, number]> = [
        [0.05, 0, 0],
        [0.07, 14, 0],
        [0.13, -10, -1.5],
        [0.2, 7, 0],
        [0.27, -17, 1.5],
      ];
      const twitch = (p: number) => {
        const t = p * cut;
        let x = 0;
        let skew = 0;
        let on = false;
        for (const [at, dx, k] of jitter) {
          if (t >= sec(ctx, at)) {
            on = true;
            x = dx * sgn;
            skew = k * sgn;
          }
        }
        if (!on || p >= 1) {
          A.style.transform = '';
          A.style.clipPath = '';
          wrap.style.transform = '';
          return;
        }
        const tf = `translate(${x}px, 0px) skewX(${skew}deg) scale(1.035)`;
        A.style.transformOrigin = '50% 50%';
        A.style.transform = tf;
        A.style.clipPath = canvasClipFor({ tx: x, skew, sx: 1.035, sy: 1.035, ox: W / 2, oy: H / 2 });
        wrap.style.transformOrigin = '50% 50%';
        wrap.style.transform = tf;
      };
      drive(tl, 0, cut, twitch);
    }

    /* Glitch bars in brand colors. */
    const barColors = [BRAND.circle, BRAND.triangle, BRAND.square, BRAND.arch, ctx.fromColors?.fg ?? INK];
    for (let i = 0; i < 18; i++) {
      const h = Math.round(4 + ctx.rand() ** 2 * 40);
      const w = Math.round(180 + ctx.rand() * 1100);
      const y = Math.round(ctx.rand() * (H - h));
      const bar = div(ctx.overlay, { left: 0, top: y, width: w, height: h, background: barColors[i % barColors.length]!, willChange: 'transform' });
      const land = ctx.rand() * (W - w * 0.4) - w * 0.3;
      const off = sgn === 1 ? -w - 40 : W + 40;
      const exit = sgn === 1 ? W + 40 : -w - 40;
      const tIn = sec(ctx, 0.02 + ctx.rand() * 0.26);
      tl.fromTo(bar, { x: off }, { x: land, duration: sec(ctx, 0.1), ease: 'steps(3)', immediateRender: true }, tIn);
      tl.to(bar, { x: land + sgn * (30 + ctx.rand() * 90), duration: sec(ctx, 0.12), ease: 'steps(2)' }, tIn + sec(ctx, 0.1));
      tl.to(bar, { x: exit, duration: sec(ctx, 0.16 + ctx.rand() * 0.14), ease: 'power3.in' }, cut + sec(ctx, 0.03 + ctx.rand() * 0.3));
    }

    /* The cut. */
    tl.call(ctx.hide, [], cut);
    tl.call(ctx.show, [], cut);
    tl.addLabel('reveal', cut);
    // B lands with two last twitches of its own, then sits still.
    const settleB = (p: number) => {
      const step = Math.min(2, Math.floor(p * 3));
      const x = [-20, 9, 0][step]! * sgn;
      const k = [1.035, 1.015, 1][step]!;
      if (p >= 1 || step === 2) {
        B.style.transform = '';
        B.style.clipPath = '';
        return;
      }
      B.style.transformOrigin = '50% 50%';
      B.style.transform = `translate(${x}px, 0px) scale(${k})`;
      B.style.clipPath = canvasClipFor({ tx: x, sx: k, sy: k, ox: W / 2, oy: H / 2 });
    };
    drive(tl, cut, sec(ctx, 0.18), settleB);

    /* B's headline resolves out of the noise on a bar. */
    const word = headlineOf(ctx, 26);
    if (word) {
      const plateColor = standOut([INK, ctx.toColors.accentHex, BRAND.circle], [ctx.toColors.bg].filter((c) => c !== 'transparent'), 2.2);
      const textColor = inkOn(plateColor);
      const size = Math.round(Math.max(96, Math.min(210, 1640 / Math.max(4, word.length * 0.58))));
      const ph = Math.round(size * 1.3);
      const plate = div(ctx.overlay, { left: 0, top: H / 2 - ph / 2, width: W, height: ph, background: plateColor, clipPath: 'inset(50% 0% 50% 0%)', overflow: 'hidden' });
      const ghostColors = [BRAND.triangle, BRAND.circle, BRAND.square].filter((c) => c.toLowerCase() !== plateColor.toLowerCase()).slice(0, 2);
      const mk = (color: string) =>
        div(plate, {
          left: 0,
          top: 0,
          width: W,
          height: ph,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: FONT_DISPLAY,
          fontWeight: '900',
          fontVariationSettings: '"MONO" 0, "CASL" 1',
          letterSpacing: '-0.03em',
          fontSize: size,
          lineHeight: '1',
          whiteSpace: 'nowrap',
          color,
        });
      const ghosts = ghostColors.map((c) => mk(c));
      const main = mk(textColor);
      const all = [...ghosts, main];
      const resolveAt = Array.from(word, (_, j) => 0.12 + (j / Math.max(1, word.length - 1)) * 0.5 + ((table[(j * 11 + 5) % TABLE]! % 1000) / 1000) * 0.28);
      const paint = (q: number) => {
        const tick = Math.floor(q * 14);
        let s = '';
        for (let j = 0; j < word.length; j++) {
          const c = word[j]!;
          s += !c.trim() || q >= resolveAt[j]! ? c : noise(j + 50, tick);
        }
        for (const el of all) if (el.textContent !== s) el.textContent = s;
      };
      paint(0);
      const open = cut + sec(ctx, 0.02);
      tl.to(plate, { clipPath: 'inset(0% 0% 0% 0%)', duration: sec(ctx, 0.09), ease: 'power4.out' }, open);
      drive(tl, open, sec(ctx, 0.32), paint);
      ghosts.forEach((g, i) => {
        const dx = (i ? -1 : 1) * 16 * sgn;
        tl.fromTo(g, { x: dx, y: i ? 3 : -3 }, { x: 0, y: 0, duration: sec(ctx, 0.34), ease: 'steps(4)', immediateRender: true }, open);
      });
      tl.to(plate, { clipPath: 'inset(50% 0% 50% 0%)', duration: sec(ctx, 0.1), ease: 'power3.in' }, open + sec(ctx, 0.44));
    }

    finish(tl, ctx, cut + sec(ctx, 0.62), () => {
      if (hideOriginals.length) gsap.set(hideOriginals, { clearProps: 'visibility' });
    });
    return tl;
  },
};
export default scrambleCut;
