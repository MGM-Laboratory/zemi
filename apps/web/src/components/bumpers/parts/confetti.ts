'use client';

import { SHAPE_COLORS, SHAPE_ORDER, SHAPE_PATHS_46 } from '@zemi/shared';
import { gsap } from '../engine/gsap';

export interface StageConfettiOpts {
  /** Burst origin in canvas px. */
  x: number;
  y: number;
  count?: number;
  /** Degrees, -90 = straight up. */
  angle?: number;
  spread?: number;
  velocity?: number;
  gravity?: number;
  size?: number;
  /** Seconds before pieces fade. */
  life?: number;
  colors?: string[];
}

const SVGNS = 'http://www.w3.org/2000/svg';

/**
 * Brand-shape confetti drawn inside a slide (so it scales with the stage and shows up in OBS),
 * driven by GSAP Physics2D. Returns a timeline you can place on the entrance; pieces remove
 * themselves at the end.
 *
 * @example useEnter((tl, root, { at }) => tl.add(stageConfetti(root, { x: 960, y: 700 }), at(1.2)))
 */
export function stageConfetti(root: HTMLElement, { x, y, count = 60, angle = -90, spread = 70, velocity = 1300, gravity = 1500, size = 26, life = 2.4, colors }: StageConfettiOpts): gsap.core.Timeline {
  const layer = document.createElement('div');
  layer.setAttribute('data-confetti', '');
  layer.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden;z-index:45';
  const tl = gsap.timeline({ onComplete: () => layer.remove() });
  tl.call(() => root.appendChild(layer), [], 0);
  const pieces: SVGSVGElement[] = [];
  for (let i = 0; i < count; i++) {
    const shape = SHAPE_ORDER[i % 4]!;
    const s = document.createElementNS(SVGNS, 'svg');
    s.setAttribute('viewBox', '0 0 46 46');
    const k = size * (0.6 + ((i * 37) % 10) / 14);
    s.setAttribute('width', String(k));
    s.setAttribute('height', String(k));
    s.style.cssText = `position:absolute;left:${x - k / 2}px;top:${y - k / 2}px;overflow:visible`;
    const p = document.createElementNS(SVGNS, 'path');
    p.setAttribute('d', SHAPE_PATHS_46[shape]);
    p.setAttribute('fill', colors?.[i % colors.length] ?? SHAPE_COLORS[shape]);
    s.appendChild(p);
    layer.appendChild(s);
    pieces.push(s);
  }
  pieces.forEach((el, i) => {
    const a = angle + (((i * 53) % 100) / 100 - 0.5) * spread * 2;
    const v = velocity * (0.55 + ((i * 29) % 100) / 220);
    tl.to(el, { duration: life, physics2D: { velocity: v, angle: a, gravity }, rotation: (i % 2 ? 1 : -1) * (180 + ((i * 71) % 540)), ease: 'none' }, 0);
    tl.to(el, { opacity: 0, duration: 0.5 }, life - 0.5);
  });
  return tl;
}
