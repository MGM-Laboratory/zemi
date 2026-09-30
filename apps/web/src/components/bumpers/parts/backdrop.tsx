'use client';

import { SHAPE_COLORS, SHAPE_ORDER, type ImageRef, type ShapeName } from '@zemi/shared';
import { useIdle } from '../engine/context';
import { gsap } from '../engine/gsap';
import { GRAPH, INK, PAPER, type SlideColors } from '../engine/palette';
import { BrandShape, BumperImage } from './shapes';

export type BackdropKind = 'paper' | 'ink' | 'accent' | 'graph' | 'image' | 'transparent';

interface Floater {
  shape: ShapeName;
  x: number;
  y: number;
  size: number;
  rot: number;
}

/** Default drifting shapes: big, soft, tucked into the corners so content stays clear. */
export const DEFAULT_FLOATERS: Floater[] = [
  { shape: 'circle', x: -140, y: -160, size: 520, rot: 0 },
  { shape: 'triangle', x: 1600, y: -120, size: 380, rot: 14 },
  { shape: 'square', x: 1640, y: 760, size: 420, rot: -10 },
  { shape: 'arch', x: -120, y: 800, size: 400, rot: 0 },
];

/**
 * The layer under every template: paper, graph paper, ink, the accent color, a darkened photo, or
 * nothing (OBS overlay). Floaters drift slowly in live mode.
 */
export function Backdrop({ kind, colors, image, dim = 0.4, floaters = DEFAULT_FLOATERS, floaterOpacity }: { kind: BackdropKind; colors: SlideColors; image?: ImageRef | null; dim?: number; floaters?: Floater[] | false; floaterOpacity?: number }) {
  useIdle((root, { calm }) => {
    const els = root.querySelectorAll<HTMLElement>('[data-floater]');
    return Array.from(els).map((el, i) =>
      gsap.to(el, {
        x: `+=${(i % 2 ? -1 : 1) * (calm ? 14 : 34)}`,
        y: `+=${(i % 3 ? 1 : -1) * (calm ? 10 : 26)}`,
        rotation: `+=${(i % 2 ? 1 : -1) * (calm ? 3 : 9)}`,
        duration: 9 + i * 1.7,
        ease: 'sine.inOut',
        yoyo: true,
        repeat: -1,
      }),
    );
  });
  if (kind === 'transparent') return null;
  const op = floaterOpacity ?? (kind === 'paper' || kind === 'graph' ? 0.1 : kind === 'accent' ? 0.16 : 0.12);
  const floaterColor = (s: ShapeName) => (kind === 'accent' ? PAPER : kind === 'ink' || kind === 'image' ? SHAPE_COLORS[s] : SHAPE_COLORS[s]);
  return (
    <div data-backdrop={kind} style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: colors.bg, zIndex: 0 }} aria-hidden="true">
      {kind === 'graph' ? (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: `linear-gradient(to right, ${GRAPH} 2px, transparent 2px), linear-gradient(to bottom, ${GRAPH} 2px, transparent 2px)`,
            backgroundSize: '48px 48px',
          }}
        />
      ) : null}
      {kind === 'image' && image ? (
        <>
          <div data-backdrop-image="" style={{ position: 'absolute', inset: -20 }}>
            <BumperImage image={image} width={1960} />
          </div>
          <div style={{ position: 'absolute', inset: 0, background: `rgba(14,17,22,${dim})` }} />
          <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 50% 40%, transparent 40%, rgba(14,17,22,0.55) 100%)' }} />
        </>
      ) : null}
      {kind === 'ink' ? (
        <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(900px 600px at 18% 20%, ${colors.accentHex}33, transparent 70%), radial-gradient(800px 700px at 85% 90%, ${colors.accentHex}22, transparent 70%)` }} />
      ) : null}
      {floaters
        ? floaters.map((f, i) => (
            <div key={i} data-floater="" style={{ position: 'absolute', left: f.x, top: f.y, width: f.size, height: f.size, rotate: `${f.rot}deg`, opacity: op }}>
              <BrandShape shape={f.shape} color={floaterColor(f.shape)} />
            </div>
          ))
        : null}
    </div>
  );
}

/** Four shapes in a row, in order (handy decorative strip). */
export function ShapeRow({ size, gap, colors }: { size: number; gap: number; colors?: Partial<Record<ShapeName, string>> }) {
  return (
    <div style={{ display: 'flex', gap }} aria-hidden="true">
      {SHAPE_ORDER.map((s) => (
        <div key={s} data-shape-row={s} style={{ width: size, height: size }}>
          <BrandShape shape={s} color={colors?.[s]} />
        </div>
      ))}
    </div>
  );
}

export { INK };
