'use client';

/**
 * 3D entry point. Everything heavy is code-split: three.js and R3F download only when a
 * SceneCanvas nears the viewport.
 *
 * Build scenes in a client file:
 *   'use client';
 *   import { SceneCanvas, Character3D, ModelProp } from '@/components/three';
 *   <SceneCanvas className="h-[60vh]" fallback={<Character shape="circle" size={160} />}>
 *     <Character3D shape="circle" position={[-1.2, 0, 0]} />
 *     <ModelProp name="coffee-cup" position={[1.4, -1.2, 0]} />
 *   </SceneCanvas>
 *
 * For custom R3F code (useFrame etc.), put the scene in its own file and lazy() it the same way.
 */
import { lazy } from 'react';

export { SceneCanvas, type SceneCanvasProps } from './scene-canvas';
export { ShaderBackdrop, type ShaderBackdropProps } from './shader-backdrop';
export { DistortImage, type DistortImageProps } from './distort-image';
export { hasWebGL } from './webgl';
export { useSceneQuality, type SceneQuality } from './scene-context';
export type { Character3DProps, Character3DHandle, Character3DMood } from './character-3d';
export type { ModelPropProps, PropName } from './model-prop';
export type { StudioLightsProps } from './studio';

/** Clay brand character (lazy). Use inside SceneCanvas. */
export const Character3D = lazy(() => import('./character-3d'));
/** GLB prop from /models/<name>.glb with a primitive fallback (lazy). Use inside SceneCanvas. */
export const ModelProp = lazy(() => import('./model-prop'));
/** Scales children to fit narrow canvases (lazy). Use inside SceneCanvas. */
export const Fit = lazy(() => import('./fit'));
export type { FitProps } from './fit';
/** Lighting rig (lazy). SceneCanvas already includes it unless studio={false}. */
export const StudioLights = lazy(() => import('./studio').then((m) => ({ default: m.StudioLights })));
