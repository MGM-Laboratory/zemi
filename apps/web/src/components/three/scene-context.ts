'use client';

import { createContext, useContext } from 'react';

export interface SceneQuality {
  /** 'low' after PerformanceMonitor declines (drop shadows, fewer segments, no extras). */
  quality: 'high' | 'low';
  /** prefers-reduced-motion: render a still frame, skip idle animation. */
  reduced: boolean;
  /** The canvas is on screen (frameloop running). */
  visible: boolean;
}

export const SceneContext = createContext<SceneQuality>({ quality: 'high', reduced: false, visible: true });

/** Read scene quality flags inside a SceneCanvas. */
export function useSceneQuality(): SceneQuality {
  return useContext(SceneContext);
}
