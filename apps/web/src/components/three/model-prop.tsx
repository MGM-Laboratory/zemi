'use client';

import { RoundedBox, useGLTF } from '@react-three/drei';
import { Component, Suspense, useMemo, type ReactNode } from 'react';
import { Box3, Vector3, type Color, type Material, type Mesh, type Object3D } from 'three';
import { clayMaterial } from './clay';

/** Prop names the Blender teammate exports to apps/web/public/models/<name>.glb. */
export type PropName =
  | 'seminar-table'
  | 'stool'
  | 'coffee-cup'
  | 'paper-stack'
  | 'paper-plane'
  | 'microphone'
  | 'wall-clock'
  | 'laptop'
  | 'idea-bubble'
  | (string & {});

export interface ModelPropProps {
  name: PropName;
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: number | [number, number, number];
  /**
   * Fit the model so its largest side is this many world units (a character is ~2 wide).
   * The GLBs are authored in real meters (a cup is 0.15), so you almost always want this.
   */
  size?: number;
  /** Recolor every mesh with one brand color. Default: keep each mesh's own color, in clay. */
  color?: string;
  /** Keep the GLB's original materials instead of converting to clay. */
  keepMaterials?: boolean;
  /** Custom fallback while loading or when the file is missing. Default: a clay primitive. */
  fallback?: ReactNode;
  /**
   * Pass false when you know the GLB isn't there (see availableModels() in ./models-server) to
   * skip the request entirely: a missing file still logs a 404 in the browser console.
   */
  available?: boolean;
}

function toClay(scene: Object3D, color?: string): Object3D {
  const clone = scene.clone(true);
  clone.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    const src = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as Material & { color?: Color };
    const hex = color ?? (src?.color ? `#${src.color.getHexString()}` : '#f7f7f5');
    mesh.material = clayMaterial(hex);
  });
  return clone;
}

function Model({ url, color, keepMaterials, size }: { url: string; color?: string; keepMaterials?: boolean; size?: number }) {
  // useDraco=true loads the decoder only when the file needs it; meshopt is built in.
  const { scene } = useGLTF(url, true, true);
  const obj = useMemo(() => {
    const o = keepMaterials ? scene.clone(true) : toClay(scene, color);
    if (size) {
      const dims = new Box3().setFromObject(o).getSize(new Vector3());
      const max = Math.max(dims.x, dims.y, dims.z) || 1;
      o.scale.setScalar(size / max);
    }
    return o;
  }, [scene, color, keepMaterials, size]);
  return <primitive object={obj} />;
}

class PropBoundary extends Component<{ fallback: ReactNode; name: string; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    console.warn(`[zemi 3d] /models/${this.props.name}.glb is missing or broken, using a primitive.`);
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/** Primitive stand-ins so scenes still read when a GLB isn't there yet. */
export function PropFallback({ name, color }: { name: PropName; color?: string }) {
  const c = (hex: string) => clayMaterial(color ?? hex);
  switch (name) {
    case 'coffee-cup':
      return (
        <group>
          <mesh material={c('#ffffff')} position={[0, 0.35, 0]}>
            <cylinderGeometry args={[0.42, 0.34, 0.7, 40]} />
          </mesh>
          <mesh material={c('#ffffff')} position={[0.44, 0.38, 0]} rotation={[0, 0, Math.PI / 2]}>
            <torusGeometry args={[0.16, 0.055, 16, 32]} />
          </mesh>
          <mesh material={c('#6b4a33')} position={[0, 0.69, 0]}>
            <cylinderGeometry args={[0.37, 0.37, 0.02, 40]} />
          </mesh>
        </group>
      );
    case 'seminar-table':
      return (
        <group>
          <mesh material={c('#f7bf33')} position={[0, 0.9, 0]}>
            <cylinderGeometry args={[1.6, 1.6, 0.14, 64]} />
          </mesh>
          <mesh material={c('#0e1116')} position={[0, 0.45, 0]}>
            <cylinderGeometry args={[0.12, 0.2, 0.9, 24]} />
          </mesh>
        </group>
      );
    case 'stool':
      return (
        <group>
          <mesh material={c('#3a6dc5')} position={[0, 0.62, 0]}>
            <cylinderGeometry args={[0.42, 0.42, 0.12, 40]} />
          </mesh>
          <mesh material={c('#0e1116')} position={[0, 0.3, 0]}>
            <cylinderGeometry args={[0.06, 0.12, 0.6, 16]} />
          </mesh>
        </group>
      );
    case 'paper-stack':
      return (
        <group>
          {[0, 1, 2].map((i) => (
            <RoundedBox key={i} args={[1.1, 0.08, 0.8]} radius={0.03} position={[0, 0.05 + i * 0.09, 0]} rotation={[0, i * 0.12 - 0.1, 0]} material={c('#ffffff')} />
          ))}
        </group>
      );
    case 'paper-plane':
      return (
        <mesh material={c('#ffffff')} rotation={[0, 0, -Math.PI / 2]}>
          <coneGeometry args={[0.35, 1.2, 3]} />
        </mesh>
      );
    case 'microphone':
      return (
        <group>
          <mesh material={c('#0e1116')} position={[0, 0.9, 0]}>
            <sphereGeometry args={[0.22, 32, 24]} />
          </mesh>
          <mesh material={c('#0e1116')} position={[0, 0.4, 0]}>
            <cylinderGeometry args={[0.07, 0.09, 0.8, 16]} />
          </mesh>
        </group>
      );
    case 'wall-clock':
      return (
        <group rotation={[Math.PI / 2, 0, 0]}>
          <mesh material={c('#ffffff')}>
            <cylinderGeometry args={[0.8, 0.8, 0.14, 64]} />
          </mesh>
          <mesh material={c('#f94141')} position={[0, 0.08, 0]}>
            <cylinderGeometry args={[0.06, 0.06, 0.04, 16]} />
          </mesh>
        </group>
      );
    default:
      return <RoundedBox args={[1, 1, 1]} radius={0.18} smoothness={6} material={c('#f7f7f5')} />;
  }
}

/**
 * A prop GLB from /models/<name>.glb (meshopt/draco aware) in clay materials. Falls back to a
 * clay primitive while loading and when the file doesn't exist yet. Use inside <SceneCanvas>.
 *
 * @example <ModelProp name="coffee-cup" position={[1.5, -1.2, 0]} scale={0.8} />
 */
export function ModelProp({ name, position, rotation, scale, size, color, keepMaterials, fallback, available }: ModelPropProps) {
  const fb = fallback ?? (
    <group scale={size ? size / 1.4 : 1}>
      <PropFallback name={name} color={color} />
    </group>
  );
  if (available === false) {
    return (
      <group position={position} rotation={rotation} scale={scale}>
        {fb}
      </group>
    );
  }
  return (
    <group position={position} rotation={rotation} scale={scale}>
      <PropBoundary fallback={fb} name={name}>
        <Suspense fallback={fb}>
          <Model url={`/models/${encodeURIComponent(name)}.glb`} color={color} keepMaterials={keepMaterials} size={size} />
        </Suspense>
      </PropBoundary>
    </group>
  );
}

/** Warm the cache for props used further down the page. */
export const preloadProp = (name: PropName) => useGLTF.preload(`/models/${encodeURIComponent(name)}.glb`, true, true);

export default ModelProp;
