'use client';

import { useGLTF } from '@react-three/drei';

/**
 * Every GLB in public/models (see models/manifest.json), story scenes first.
 * Preloading warms the drei `useGLTF` cache, which every scene (`ModelProp`, `Stool`,
 * `Laptop`, `TableScene`, `CoffeeScene`) reads from. The browser also caches the bytes,
 * so a second visit parses locally.
 */
const MODEL_FILES = [
  'seminar-table',
  'stool',
  'laptop',
  'microphone',
  'coffee-cup',
  'paper-stack',
  'paper-plane',
  'wall-clock',
  'idea-bubble',
];

let promise: Promise<void> | null = null;

/**
 * Download and parse every 3D model once per page load. Safe to call repeatedly (runs once)
 * and safe outside a Canvas: it only warms the shared loader cache.
 *
 * The first-visit loader holds its curtain until this resolves, so the pinned 3D scenes never
 * wait for a download mid-scroll. Failures settle quietly: each scene has its own 2D fallback.
 */
export function preloadModels(): Promise<void> {
  if (!promise) {
    promise = Promise.allSettled(
      MODEL_FILES.map((name) => useGLTF.preload(`/models/${name}.glb`, true, true)),
    ).then((results) => {
      const failed = results.filter((r) => r.status === 'rejected').length;
      if (failed) console.warn(`[zemi] ${failed} model${failed === 1 ? '' : 's'} failed to preload`);
    });
  }
  return promise;
}
