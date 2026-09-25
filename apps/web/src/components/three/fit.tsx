'use client';

import { useThree } from '@react-three/fiber';
import type { ReactNode } from 'react';

export interface FitProps {
  children: ReactNode;
  /** Width (world units) the content needs, measured at z = 0. */
  width: number;
  /** Optional height it needs too. */
  height?: number;
  /** Never scale above this. Default 1. */
  max?: number;
  /** Fraction of the viewport to fill. Default 0.92. */
  fill?: number;
}

/**
 * Scales its children down so a row of characters fits narrow (portrait) canvases.
 * Use inside SceneCanvas.
 *
 * @example <Fit width={9.5}>{four characters in a row}</Fit>
 */
export function Fit({ children, width, height, max = 1, fill = 0.92 }: FitProps) {
  const viewport = useThree((s) => s.viewport);
  const sx = (viewport.width * fill) / width;
  const sy = height ? (viewport.height * fill) / height : Infinity;
  const s = Math.min(max, sx, sy);
  return <group scale={s}>{children}</group>;
}

export default Fit;
