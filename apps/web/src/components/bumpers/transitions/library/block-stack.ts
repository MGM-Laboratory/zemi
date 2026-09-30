import { SHAPE_COLORS, SHAPE_PATHS_46, type ShapeName } from '@zemi/shared';
import { gsap } from '../../engine/gsap';
import { ACCENT_600, PAPER, SHAPE_ACCENT } from '../../engine/palette';
import { characterMarkup, charAnim } from '../../parts/character';
import { cleanRoots, div } from '../helpers';
import type { TransitionDef } from '../types';
import { secs } from './_tr-b-helpers';

const COLS = 9;
const ROWS = 5;
/** Blocks are a bit bigger than their cell so the rounded corners overlap and the stack is solid. */
const SIZE = 252;
/** The darker bottom and right lip (toy block depth), in 46-unit block space. */
const LIP = 3.2;
const SIDE = 1.6;
const OTHERS: ShapeName[] = ['circle', 'triangle', 'arch'];

function blockMarkup(shape: ShapeName, face: boolean): string {
  const deep = ACCENT_600[SHAPE_ACCENT[shape]];
  const glyph = shape === 'square' ? '' : `<path d="${SHAPE_PATHS_46[shape]}" fill="${PAPER}" opacity="0.92" transform="translate(${12.4 - SIDE} ${12 - LIP}) scale(0.46)"/>`;
  const top = face ? `<path d="${SHAPE_PATHS_46.square}" fill="${SHAPE_COLORS[shape]}" transform="translate(${-SIDE} ${-LIP})"/>${glyph}` : '';
  return `<svg viewBox="0 0 46 46" width="${SIZE}" height="${SIZE}" style="position:absolute;left:0;top:0;overflow:visible;display:block" aria-hidden="true"><path d="${SHAPE_PATHS_46.square}" fill="${deep}"/>${top}</svg>`;
}

/**
 * Block stack: toy blocks (mostly yellow Blocks, a few blue, red and green ones stamped with their
 * shape) rain down and stack up column by column until the screen is solid. A few of them are
 * Block himself, looking up at what is coming. Then the whole stack tips over and tumbles off to
 * the side, and the next bumper is behind it.
 */
const blockStack: TransitionDef = {
  key: 'block-stack',
  run(ctx) {
    const t = (s: number) => secs(ctx, s);
    const { width: W, height: H, dir, speed } = ctx;
    const px = W / COLS;
    const py = H / ROWS;
    const layer = div(ctx.overlay, { left: 0, top: 0, width: W, height: H });
    const tl = gsap.timeline();

    // Which cells are Block characters: three yellow ones away from the edges.
    const faces = new Set<string>();
    while (faces.size < 3) faces.add(`${1 + Math.floor(ctx.rand() * (COLS - 2))}:${1 + Math.floor(ctx.rand() * (ROWS - 2))}`);

    const blocks: Array<{ el: HTMLDivElement; body: HTMLDivElement; row: number; col: number; top: number; face: HTMLElement | null }> = [];
    const landed: number[] = Array.from({ length: COLS }, () => 0);
    let full = 0;
    for (let row = 0; row < ROWS; row++) {
      const order = Array.from({ length: COLS }, (_, c) => c);
      for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(ctx.rand() * (i + 1));
        [order[i], order[j]] = [order[j]!, order[i]!];
      }
      order.forEach((col, n) => {
        const isFace = faces.has(`${col}:${row}`);
        const shape: ShapeName = isFace || ctx.rand() < 0.7 ? 'square' : OTHERS[Math.floor(ctx.rand() * OTHERS.length)]!;
        const left = col * px - (SIZE - px) / 2;
        const top = H - (row + 1) * py - (SIZE - py) / 2;
        const el = div(layer, { left, top, width: SIZE, height: SIZE, willChange: 'transform' });
        const body = div(el, { left: 0, top: 0, width: SIZE, height: SIZE });
        body.innerHTML = blockMarkup(shape, !isFace);
        let face: HTMLElement | null = null;
        if (isFace) {
          face = div(body, { left: -(SIDE / 46) * SIZE, top: -(LIP / 46) * SIZE, width: SIZE, height: SIZE });
          face.innerHTML = characterMarkup('square', SIZE, { mood: n % 2 ? 'idle' : 'happy', lookY: -0.8, lookX: (ctx.rand() - 0.5) * 1.2 });
        }
        gsap.set(body, { transformOrigin: '50% 100%' });
        // Rows land bottom up, and a block never lands before the one under it.
        const land = Math.max(t(0.3 + row * 0.13 + ctx.rand() * 0.1 + n * 0.004), landed[col]! + t(0.07));
        landed[col] = land;
        const drop = top + SIZE + 60 + ctx.rand() * 160;
        const fall = t(0.2 + 0.18 * (drop / (H + SIZE)));
        tl.fromTo(el, { y: -drop }, { y: 0, duration: fall, ease: 'power2.in' }, land - fall);
        tl.to(body, { scaleX: 1.1, scaleY: 0.84, duration: t(0.06), ease: 'power2.out' }, land);
        tl.to(body, { scaleX: 1, scaleY: 1, duration: t(0.34), ease: 'elastic.out(1, 0.42)' }, land + t(0.06));
        full = Math.max(full, land + t(0.08));
        blocks.push({ el, body, row, col, top, face });
      });
    }

    // Stack complete: the Blocks blink at each other.
    blocks.forEach((b) => {
      if (b.face) tl.add(charAnim.blink(b.face), full + t(0.02));
    });

    // Tip over: the stack leans on its far corner, then the blocks tumble off toward `dir`, top
    // rows first, and fall out of the bottom of the screen.
    const tumble = full + t(0.12);
    tl.call(ctx.hide, [], tumble);
    tl.call(ctx.show, [], tumble);
    tl.addLabel('reveal', tumble);
    tl.to(layer, { rotation: dir * 6, transformOrigin: dir === 1 ? '100% 100%' : '0% 100%', duration: t(0.24), ease: 'power2.in' }, tumble);
    const D = t(0.6);
    let end = tumble;
    blocks.forEach((b) => {
      const height = b.row / (ROWS - 1);
      const delay = t(0.08 + (1 - height) * 0.1 + ctx.rand() * 0.05);
      // Mostly sideways, a little down: a tipped tower spills, it does not jump.
      const tip = -10 + ctx.rand() * 34;
      const angle = dir === 1 ? tip : 180 - tip;
      const velocity = (520 + height * 760 + ctx.rand() * 220) * speed;
      const vy = velocity * Math.sin((angle * Math.PI) / 180);
      // Enough gravity that every block has left the screen when its tumble ends.
      const gravity = Math.max(3000 * speed * speed, (2 * (H + SIZE * 0.9 - b.top - vy * D)) / (D * D));
      tl.to(b.el, { physics2D: { velocity, angle, gravity }, rotation: dir * (80 + ctx.rand() * 160), duration: D, ease: 'none' }, tumble + delay);
      if (b.face) tl.add(charAnim.look(b.face, dir, -0.2, t(0.2)), tumble + delay);
      end = Math.max(end, tumble + delay + D);
    });
    tl.set(layer, { autoAlpha: 0 }, end);
    tl.call(() => cleanRoots(ctx), [], end);
    return tl;
  },
};
export default blockStack;

