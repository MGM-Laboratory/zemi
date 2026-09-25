/**
 * Zemi mark geometry. One 100x100 viewBox, four 46x46 cells with an 8px gap.
 * Every rendering of the logo (React, static SVG/PNG, email, 3D extrusion) uses these paths.
 */
export type ShapeName = 'circle' | 'triangle' | 'square' | 'arch';

export const SHAPE_COLORS: Record<ShapeName, string> = {
  circle: '#3a6dc5', // Q, the question
  triangle: '#f94141', // Hunch, the hypothesis
  square: '#f7bf33', // Block, the data
  arch: '#0f8657', // Bridge, the conversation
};

export const SHAPE_CHARACTER: Record<ShapeName, { name: string; meaning: string }> = {
  circle: { name: 'Q', meaning: 'the question' },
  triangle: { name: 'Hunch', meaning: 'the hypothesis' },
  square: { name: 'Block', meaning: 'the data' },
  arch: { name: 'Bridge', meaning: 'the conversation' },
};

/** Paths positioned in their home cells of the 100x100 mark. */
export const MARK_PATHS: Record<ShapeName, string> = {
  circle: 'M23 0 A23 23 0 1 1 22.99 0 Z',
  triangle: 'M73.76 7.2 Q77 1 80.24 7.2L96.76 38.8 Q100 45 93 45L61 45 Q54 45 57.24 38.8 Z',
  square: 'M10 54 H36 Q46 54 46 64 V90 Q46 100 36 100 H10 Q0 100 0 90 V64 Q0 54 10 54 Z',
  arch: 'M54 100 V77 A23 23 0 0 1 100 77 V100 Z',
};

/** Home cell origin (top-left) for each shape inside the mark. */
export const MARK_CELLS: Record<ShapeName, { x: number; y: number }> = {
  circle: { x: 0, y: 0 },
  triangle: { x: 54, y: 0 },
  square: { x: 0, y: 54 },
  arch: { x: 54, y: 54 },
};

/** Same shapes normalized to a 46x46 box at the origin (for icons, confetti, cursors, 3D). */
export const SHAPE_PATHS_46: Record<ShapeName, string> = {
  circle: 'M23 0 A23 23 0 1 1 22.99 0 Z',
  triangle: 'M19.76 7.2 Q23 1 26.24 7.2L42.76 38.8 Q46 45 39 45L7 45 Q0 45 3.24 38.8 Z',
  square: 'M10 0 H36 Q46 0 46 10 V36 Q46 46 36 46 H10 Q0 46 0 36 V10 Q0 0 10 0 Z',
  arch: 'M0 46 V23 A23 23 0 0 1 46 23 V46 Z',
};

export const SHAPE_ORDER: ShapeName[] = ['circle', 'triangle', 'square', 'arch'];

/** Static SVG string of the mark, for favicons, emails and server-side rendering. */
export function markSvg(opts: { tone?: 'color' | 'ink' | 'paper'; size?: number } = {}): string {
  const tone = opts.tone ?? 'color';
  const size = opts.size ?? 100;
  const fill = (s: ShapeName) => (tone === 'color' ? SHAPE_COLORS[s] : tone === 'ink' ? '#0e1116' : '#ffffff');
  const paths = SHAPE_ORDER.map((s) => `<path d="${MARK_PATHS[s]}" fill="${fill(s)}"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">${paths}</svg>`;
}
