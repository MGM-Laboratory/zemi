'use client';

import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { useEffect, useImperativeHandle, useMemo, useRef, type Ref } from 'react';
import { MathUtils, SphereGeometry, type Group, type Mesh } from 'three';
import type { ShapeName } from '@zemi/shared';
import { pointer } from '@/lib/hooks/use-pointer';
import { clayMaterial, eyeMaterial, glintMaterial, shapeClay } from './clay';
import { useSceneQuality } from './scene-context';
import { EYES_3D, frontZ, shapeGeometry } from './shapes';

export type Character3DMood = 'idle' | 'happy' | 'sleepy' | 'surprised';

export interface Character3DHandle {
  cheer(): void;
  squash(): void;
}

export interface Character3DProps {
  shape: ShapeName;
  position?: [number, number, number];
  rotation?: [number, number, number];
  /** Uniform scale. The body is ~2 units wide at 1. */
  scale?: number;
  /** Override the brand color. */
  color?: string;
  mood?: Character3DMood;
  /** Eyes and body follow the page pointer. Default true. */
  track?: boolean;
  /** Idle bob and sway. Default true. */
  bob?: boolean;
  /** Squash on click, stretch on hover. Default true. */
  interactive?: boolean;
  /** Change the number to trigger a cheer (jump + spin). */
  cheer?: number;
  /** Desync neighbours. */
  seed?: number;
  onClick?: () => void;
  ref?: Ref<Character3DHandle>;
}

const TAU = Math.PI * 2;
const EYE_GEO = new SphereGeometry(1, 24, 16);

/**
 * A clay brand character in 3D: sphere for Q, extruded + beveled shapes for Hunch, Block and
 * Bridge. Ink eyes with a white glint look at the pointer and blink; the body bobs, sways,
 * squashes and stretches on a spring, and cheers on demand. Use inside <SceneCanvas>.
 *
 * @example <Character3D shape="triangle" position={[1.2, 0, 0]} seed={2} />
 */
export function Character3D({
  shape,
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  scale = 1,
  color,
  mood = 'idle',
  track = true,
  bob = true,
  interactive = true,
  cheer,
  seed = 0,
  onClick,
  ref,
}: Character3DProps) {
  const { reduced } = useSceneQuality();
  const gl = useThree((s) => s.gl);
  const invalidate = useThree((s) => s.invalidate);

  const root = useRef<Group>(null);
  const body = useRef<Group>(null);
  const squashG = useRef<Group>(null);
  const eyes = useRef<Group>(null);
  const eyeL = useRef<Mesh>(null);
  const eyeR = useRef<Mesh>(null);

  const geometry = useMemo(() => shapeGeometry(shape), [shape]);
  const material = useMemo(() => (color ? clayMaterial(color) : shapeClay(shape)), [color, shape]);
  const spec = EYES_3D[shape];

  // Spring state for squash and stretch (y scale; x/z preserve volume).
  const sim = useRef({ sy: 1, vy: 0, target: 1, blinkAt: 2 + seed * 0.7, blinkT: -1, cheerT: -1, look: { x: 0, y: 0 } });

  const squash = () => {
    sim.current.sy = 0.7;
    sim.current.vy = 0;
    invalidate();
  };
  const doCheer = () => {
    if (reduced) {
      squash();
      return;
    }
    sim.current.cheerT = 0;
  };
  useImperativeHandle(ref, () => ({ cheer: doCheer, squash }));

  const lastCheer = useRef(cheer);
  useEffect(() => {
    if (lastCheer.current === cheer) return;
    lastCheer.current = cheer;
    if (cheer !== undefined) doCheer();
  }, [cheer]); // eslint-disable-line react-hooks/exhaustive-deps

  useFrame((state, delta) => {
    const s = sim.current;
    const dt = Math.min(delta, 1 / 20);
    const t = state.clock.elapsedTime + seed * 1.37;

    // Look at the page pointer (relative to this canvas).
    if (track && !reduced && root.current && body.current) {
      const p = pointer.get();
      const r = gl.domElement.getBoundingClientRect();
      // Look straight ahead until a real (non-touch) pointer shows up.
      const live = p.active && p.type !== 'touch';
      const nx = live ? MathUtils.clamp((p.x - (r.left + r.width / 2)) / (window.innerWidth / 2), -1, 1) : 0;
      const ny = live ? MathUtils.clamp((p.y - (r.top + r.height / 2)) / (window.innerHeight / 2), -1, 1) : 0;
      s.look.x = MathUtils.damp(s.look.x, nx, 5, dt);
      s.look.y = MathUtils.damp(s.look.y, ny, 5, dt);
      body.current.rotation.y = s.look.x * 0.38;
      body.current.rotation.x = s.look.y * 0.22;
      if (eyes.current) {
        eyes.current.position.x = s.look.x * spec.size * 0.45;
        eyes.current.position.y = -s.look.y * spec.size * 0.35;
      }
    }

    // Idle bob and sway.
    if (bob && !reduced && root.current) {
      const slow = mood === 'sleepy' ? 0.45 : 1;
      root.current.position.y = position[1] + Math.sin(t * 1.6 * slow) * 0.07;
      root.current.rotation.z = rotation[2] + Math.sin(t * 1.1 * slow) * 0.05;
    }

    // Blink every 3 to 6 s.
    const open = mood === 'sleepy' ? 0.12 : mood === 'happy' ? 0.45 : mood === 'surprised' ? 1.25 : 1;
    let eyeY = open;
    if (!reduced && mood !== 'sleepy') {
      if (s.blinkT < 0 && state.clock.elapsedTime > s.blinkAt) s.blinkT = 0;
      if (s.blinkT >= 0) {
        s.blinkT += dt;
        const k = s.blinkT / 0.16;
        eyeY = open * (k < 0.5 ? 1 - k * 1.8 : 0.1 + (k - 0.5) * 1.8);
        if (k >= 1) {
          s.blinkT = -1;
          s.blinkAt = state.clock.elapsedTime + 3 + Math.random() * 3;
          eyeY = open;
        }
      }
    }
    for (const e of [eyeL.current, eyeR.current]) if (e) e.scale.y = spec.size * 1.12 * Math.max(0.08, eyeY);

    // Squash and stretch spring.
    const k = 190;
    const c = 11;
    const acc = -k * (s.sy - s.target) - c * s.vy;
    s.vy += acc * dt;
    s.sy += s.vy * dt;

    // Cheer: jump + spin, land with a squash.
    let jump = 0;
    let spin = 0;
    if (s.cheerT >= 0) {
      s.cheerT += dt;
      const u = Math.min(1, s.cheerT / 0.9);
      jump = 4 * 0.9 * u * (1 - u);
      spin = TAU * (u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2);
      if (u >= 1) {
        s.cheerT = -1;
        s.sy = 0.72;
        s.vy = 0;
      }
    }

    if (squashG.current) {
      const sy = MathUtils.clamp(s.sy, 0.5, 1.5);
      const sxz = 1 / Math.sqrt(sy);
      squashG.current.scale.set(sxz, sy, sxz);
      squashG.current.position.y = -1 + jump;
      squashG.current.rotation.y = spin;
    }

    if (reduced && Math.abs(s.vy) > 0.001) invalidate();
  });

  const onOver = (e: ThreeEvent<PointerEvent>) => {
    if (!interactive) return;
    e.stopPropagation();
    sim.current.target = 1.06;
    document.body.style.cursor = 'pointer';
  };
  const onOut = () => {
    sim.current.target = 1;
    document.body.style.cursor = '';
  };
  const onDown = (e: ThreeEvent<PointerEvent>) => {
    if (!interactive) return;
    e.stopPropagation();
    squash();
  };

  const eye = (at: [number, number], which: 'l' | 'r') => {
    const z = frontZ(shape, at[0], at[1]) - (shape === 'circle' ? 0.03 : -0.005);
    return (
      <group position={[at[0], at[1], z]}>
        <mesh ref={which === 'l' ? eyeL : eyeR} geometry={EYE_GEO} material={eyeMaterial()} scale={[spec.size, spec.size * 1.12, spec.size * 0.55]}>
          {/* Child of the eye so it squashes with the blink. Units are eye-local. */}
          <mesh geometry={EYE_GEO} material={glintMaterial()} position={[-0.32, 0.38, 0.78]} scale={0.3} />
        </mesh>
      </group>
    );
  };

  return (
    <group ref={root} position={position} rotation={rotation} scale={scale} onClick={onClick}>
      <group ref={body}>
        <group ref={squashG} position={[0, -1, 0]}>
          <group position={[0, 1, 0]}>
            <mesh
              geometry={geometry}
              material={material}
              onPointerOver={onOver}
              onPointerOut={onOut}
              onPointerDown={onDown}
            />
            <group ref={eyes}>
              {eye(spec.l, 'l')}
              {eye(spec.r, 'r')}
            </group>
          </group>
        </group>
      </group>
    </group>
  );
}

export default Character3D;
